import { Event } from '../domain/entities/Event.js';
import { Subscription } from '../domain/entities/Subscription.js';
import { SubscriberRegistry } from '../domain/entities/SubscriberRegistry.js';
import { TopicPattern } from '../domain/value-objects/TopicPattern.js';
import { EventPriority, EventType } from '../domain/entities/Event.js';
import { EventStatus } from '../domain/value-objects/EventStatus.js';
import { Result, ok, err } from '@shared/domain/Result.js';

export interface PublishResult {
  eventId: string;
  status: 'QUEUED' | 'SYNC_COMPLETED' | 'REJECTED';
  handlerResults?: HandlerResult[];
}

export interface HandlerResult {
  subscriberId: string;
  status: 'SUCCESS' | 'ERROR' | 'TIMEOUT';
  resultRef?: unknown;
  errorRef?: Error;
}

export interface EventHandler {
  (event: Event): Promise<void> | void;
}

export interface SubscriptionOptions {
  priority?: number;
  filter?: (event: Event) => boolean;
  deliveryMode?: 'SYNC' | 'ASYNC';
  subscriberId?: string;
}

export interface SubscriptionHandle {
  subscriptionId: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  queueDepth: number;
  dlqSize: number;
  dispatcherLiveness: boolean;
}

export interface EventBusConfig {
  maxQueueSize?: number;
  defaultTimeoutMs?: number;
  defaultRetryAttempts?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  retryJitterPercent?: number;
  enablePersistence?: boolean;
}

export class EventBus {
  private readonly registry: SubscriberRegistry;
  private readonly config: Required<EventBusConfig>;
  private readonly eventQueue: Event[] = [];
  private readonly priorityQueue: Event[] = [];
  private readonly deadLetterQueue: Event[] = [];
  private readonly middleware: Array<(event: Event, next: () => Promise<void>) => Promise<void>> = [];
  private isProcessing = false;
  private isShuttingDown = false;
  private readonly activeDispatches: Map<string, Promise<void>> = new Map();
  private readonly metrics = {
    published: 0,
    delivered: 0,
    failed: 0,
    deadLettered: 0,
    filtered: 0,
    retries: 0,
  };

  constructor(config: EventBusConfig = {}) {
    this.registry = new SubscriberRegistry();
    this.config = {
      maxQueueSize: config.maxQueueSize ?? 10000,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 30000,
      defaultRetryAttempts: config.defaultRetryAttempts ?? 3,
      baseRetryDelayMs: config.baseRetryDelayMs ?? 1000,
      maxRetryDelayMs: config.maxRetryDelayMs ?? 60000,
      retryJitterPercent: config.retryJitterPercent ?? 0.1,
      enablePersistence: config.enablePersistence ?? false,
    };
  }

  publish(event: Event): Promise<Result<PublishResult, Error>> {
    const validationResult = this.validateEvent(event);
    if (validationResult.isErr()) {
      this.metrics.published++;
      return Promise.resolve(err(validationResult.error));
    }

    if (this.isQueueFull()) {
      this.metrics.published++;
      return Promise.resolve(err(new Error('Queue overflow: max queue size exceeded')));
    }

    event.setStatus(EventStatus.VALIDATED);
    event.setStatus(EventStatus.QUEUED);

    if (event.envelopeData.priority === EventPriority.CRITICAL || event.envelopeData.priority === EventPriority.HIGH) {
      this.priorityQueue.push(event);
    } else {
      this.eventQueue.push(event);
    }

    this.metrics.published++;

    if (!this.isProcessing && !this.isShuttingDown) {
      void this.processQueue();
    }

    return Promise.resolve(ok({ eventId: event.eventId, status: 'QUEUED' }));
  }

  async publishAsync(event: Event): Promise<Result<PublishResult, Error>> {
    return this.publish(event);
  }

  async publishSync(event: Event, timeoutMs?: number): Promise<Result<HandlerResult[], Error>> {
    const validationResult = this.validateEvent(event);
    if (validationResult.isErr()) {
      return err(validationResult.error);
    }

    const matchingSubscriptions = this.registry.findMatchingSubscriptions(event);
    if (matchingSubscriptions.length === 0) {
      if (event.envelopeData.eventType === EventType.COMMAND) {
        return err(new Error('No subscriber registered for COMMAND event'));
      }
      return ok([]);
    }

    const timeout = timeoutMs ?? this.config.defaultTimeoutMs;
    const results: HandlerResult[] = [];

    for (const subscription of matchingSubscriptions) {
      const result = await this.deliverToHandler(event, subscription, true, timeout);
      results.push(result);
    }

    return ok(results);
  }

  async publishBatch(events: Event[]): Promise<Result<PublishResult[], Error>> {
    const results: PublishResult[] = [];
    for (const event of events) {
      const result = await this.publish(event);
      results.push(result.unwrap());
    }
    return ok(results);
  }

  subscribe(
    topicPattern: string,
    handler: EventHandler,
    options: SubscriptionOptions = {}
  ): Result<SubscriptionHandle, Error> {
    const patternResult = TopicPattern.isValid(topicPattern) ? ok(topicPattern) : err(new Error('Invalid topic pattern'));
    if (patternResult.isErr()) {
      return err(patternResult.error);
    }

    const pattern = new TopicPattern(topicPattern);
    const subscriptionId = crypto.randomUUID();
    const subscription = new Subscription(
      subscriptionId,
      pattern,
      handler,
      {
        priority: options.priority ?? 0,
        filter: options.filter,
        deliveryMode: options.deliveryMode ?? 'ASYNC',
        subscriberId: options.subscriberId,
      },
    );

    this.registry.register(subscription);

    return ok({ subscriptionId: subscription.subscriptionId });
  }

  unsubscribe(subscriptionId: string): Result<void, Error> {
    this.registry.unregister(subscriptionId);
    return ok(undefined);
  }

  registerMiddleware(
    middleware: (event: Event, next: () => Promise<void>) => Promise<void>,
    position?: number
  ): void {
    if (position !== undefined && position >= 0 && position <= this.middleware.length) {
      this.middleware.splice(position, 0, middleware);
    } else {
      this.middleware.push(middleware);
    }
  }

  registerPlugin(plugin: EventBusPlugin): void {
    if (plugin.onInit) {
      void plugin.onInit(this);
    }
    if (plugin.middleware) {
      for (const middleware of plugin.middleware) {
        this.registerMiddleware(middleware);
      }
    }
  }

  healthCheck(): Promise<HealthStatus> {
    return Promise.resolve({
      status: this.isShuttingDown ? 'unhealthy' : this.eventQueue.length > this.config.maxQueueSize * 0.9 ? 'degraded' : 'healthy',
      queueDepth: this.eventQueue.length + this.priorityQueue.length,
      dlqSize: this.deadLetterQueue.length,
      dispatcherLiveness: !this.isShuttingDown,
    });
  }

  getMetrics() {
    return { ...this.metrics };
  }

  async shutdown(graceful = true): Promise<void> {
    this.isShuttingDown = true;
    if (!graceful) {
      return;
    }
    while (this.eventQueue.length > 0 || this.priorityQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    for (const dispatch of this.activeDispatches.values()) {
      await dispatch;
    }
  }

  private validateEvent(event: Event): Result<void, Error> {
    if (!event.eventId || !event.eventName || !event.category || !event.sourceModule) {
      return err(new Error('Event missing required fields'));
    }
    if (event.envelopeData.payload === undefined || event.envelopeData.payload === null) {
      return err(new Error('Event payload cannot be null or undefined'));
    }
    return ok(undefined);
  }

  private isQueueFull(): boolean {
    return this.eventQueue.length + this.priorityQueue.length >= this.config.maxQueueSize;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.isShuttingDown) return;
    this.isProcessing = true;

    while (!this.isShuttingDown && (this.priorityQueue.length > 0 || this.eventQueue.length > 0)) {
      const event = this.priorityQueue.length > 0 ? this.priorityQueue.shift()! : this.eventQueue.shift()!;
      await this.dispatchEvent(event);
    }
    this.isProcessing = false;
  }

  private async dispatchEvent(event: Event): Promise<void> {
    event.setStatus(EventStatus.DISPATCHED);
    const matchingSubscriptions = this.registry.findMatchingSubscriptions(event);

    if (matchingSubscriptions.length === 0) {
      event.setStatus(EventStatus.COMPLETED);
      this.metrics.delivered++;
      return;
    }

    const dispatchPromise = this.dispatchToSubscriptions(event, matchingSubscriptions);
    this.activeDispatches.set(event.envelopeData.eventId, dispatchPromise);

    try {
      await dispatchPromise;
      event.setStatus(EventStatus.COMPLETED);
      this.metrics.delivered++;
    } catch (error) {
      event.setStatus(EventStatus.FAILED);
      this.metrics.failed++;
      await this.handleFailure(event);
    } finally {
      this.activeDispatches.delete(event.envelopeData.eventId);
    }
  }

  private async dispatchToSubscriptions(event: Event, subscriptions: Subscription[]): Promise<void> {
    const promises = subscriptions.map(sub => this.deliverToHandler(event, sub, false, this.config.defaultTimeoutMs));
    await Promise.allSettled(promises);
  }

private async deliverToHandler(
    event: Event,
    subscription: Subscription,
    sync: boolean,
    timeoutMs: number
  ): Promise<HandlerResult> {
    const subscriberId = subscription.subscriberId;

    try {
      event.setStatus(EventStatus.PROCESSING);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Handler timeout')), timeoutMs)
      );
      await Promise.race([subscription.handle(event), timeoutPromise]);
      event.setStatus(EventStatus.ACKNOWLEDGED);
      return { subscriberId, status: 'SUCCESS' };
    } catch (error) {
      event.setStatus(EventStatus.FAILED);
      return {
        subscriberId,
        status: 'ERROR',
        errorRef: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  private async handleFailure(event: Event): Promise<void> {
    if (event.envelopeData.retryCount >= this.config.defaultRetryAttempts) {
      event.setStatus(EventStatus.DEAD_LETTERED);
      this.deadLetterQueue.push(event);
      this.metrics.deadLettered++;
      return;
    }

    event.incrementRetryCount();
    event.setStatus(EventStatus.RETRYING);
    this.metrics.retries++;

    const delay = this.calculateRetryDelay(event.envelopeData.retryCount);
    await new Promise(resolve => setTimeout(resolve, delay));

    if (event.envelopeData.priority === EventPriority.CRITICAL || event.envelopeData.priority === EventPriority.HIGH) {
      this.priorityQueue.unshift(event);
    } else {
      this.eventQueue.unshift(event);
    }
  }

  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = this.config.baseRetryDelayMs * Math.pow(2, retryCount - 1);
    const jitter = baseDelay * this.config.retryJitterPercent * (Math.random() * 2 - 1);
    return Math.min(baseDelay + jitter, this.config.maxRetryDelayMs);
  }
}

export interface EventBusPlugin {
  name: string;
  version: string;
  middleware?: Array<(event: Event, next: () => Promise<void>) => Promise<void>>;
  onInit?: (bus: EventBus) => void | Promise<void>;
  onShutdown?: (bus: EventBus) => void | Promise<void>;
}