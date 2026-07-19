import { TopicPattern } from '../value-objects/TopicPattern.js';
import { Event } from '../entities/Event.js';

export type EventHandler = (event: Event) => Promise<void> | void;

export interface SubscriptionOptions {
  priority?: number;
  filter?: (event: Event) => boolean;
  deliveryMode?: 'SYNC' | 'ASYNC';
  subscriberId?: string;
}

export class Subscription {
  public readonly subscriptionId: string;
  public readonly pattern: TopicPattern;
  public readonly handler: EventHandler;
  public readonly priority: number;
  public readonly filter: (event: Event) => boolean;
  public readonly deliveryMode: 'SYNC' | 'ASYNC';
  public readonly subscriberId: string;
  public readonly registeredAt: string;

  constructor(
    subscriptionId: string,
    pattern: TopicPattern,
    handler: EventHandler,
    options: SubscriptionOptions = {}
  ) {
    this.subscriptionId = subscriptionId;
    this.pattern = pattern;
    this.handler = handler;
    this.priority = options.priority ?? 0;
    this.filter = options.filter ?? (() => true);
    this.deliveryMode = options.deliveryMode ?? 'ASYNC';
    this.subscriberId = options.subscriberId ?? `sub-${crypto.randomUUID?.() ?? Math.random().toString(36).substring(2, 9)}`;
    this.registeredAt = new Date().toISOString();
  }

  matches(event: Event): boolean {
    return this.pattern.matches(event.eventName) && this.filter(event);
  }

  async handle(event: Event): Promise<void> {
    await this.handler(event);
  }
}