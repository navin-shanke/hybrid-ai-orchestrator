import { Subscription } from './Subscription.js';
import { Event } from './Event.js';
import { TopicPattern } from '../value-objects/TopicPattern.js';

export interface SubscriberInfo {
  subscriberId: string;
  subscriptions: Map<string, Subscription>;
}

export class SubscriberRegistry {
  // Note: This implementation uses Map/Set for pattern matching.
  // The MDD mentions a "trie/prefix-index structure" - this implementation
  // uses Map/Set with linear scan over pattern keys. For small-to-medium
  // scale this is efficient; for high cardinality a true trie would be better.
  private readonly subscriptions: Map<string, Subscription> = new Map();
  private readonly subscriberIndex: Map<string, SubscriberInfo> = new Map();
  private readonly topicIndex: Map<string, Set<string>> = new Map();

  register(subscription: Subscription): void {
    if (this.subscriptions.has(subscription.subscriptionId)) {
      throw new Error(`Subscription ${subscription.subscriptionId} already exists`);
    }

    this.subscriptions.set(subscription.subscriptionId, subscription);

    const subscriberInfo = this.subscriberIndex.get(subscription.subscriberId) ?? {
      subscriberId: subscription.subscriberId,
      subscriptions: new Map(),
    };
    subscriberInfo.subscriptions.set(subscription.subscriptionId, subscription);
    this.subscriberIndex.set(subscription.subscriberId, subscriberInfo);

    const patternKey = this.getPatternKey(subscription.pattern);
    if (!this.topicIndex.has(patternKey)) {
      this.topicIndex.set(patternKey, new Set());
    }
    this.topicIndex.get(patternKey)!.add(subscription.subscriptionId);
  }

  unregister(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    this.subscriptions.delete(subscriptionId);

    const subscriberInfo = this.subscriberIndex.get(subscription.subscriberId);
    if (subscriberInfo) {
      subscriberInfo.subscriptions.delete(subscriptionId);
      if (subscriberInfo.subscriptions.size === 0) {
        this.subscriberIndex.delete(subscription.subscriberId);
      }
    }

    const patternKey = this.getPatternKey(subscription.pattern);
    const subscriptionIds = this.topicIndex.get(patternKey);
    if (subscriptionIds) {
      subscriptionIds.delete(subscriptionId);
      if (subscriptionIds.size === 0) {
        this.topicIndex.delete(patternKey);
      }
    }
  }

  findMatchingSubscriptions(event: Event): Subscription[] {
    const matching: Subscription[] = [];

    for (const [patternKey, subscriptionIds] of this.topicIndex.entries()) {
      const pattern = TopicPattern.fromString(patternKey);
      if (pattern.matches(event.eventName)) {
        for (const subscriptionId of subscriptionIds) {
          const subscription = this.subscriptions.get(subscriptionId);
          if (subscription && subscription.matches(event)) {
            matching.push(subscription);
          }
        }
      }
    }

    matching.sort((a, b) => b.priority - a.priority);
    return matching;
  }

  getSubscription(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  getSubscriberSubscriptions(subscriberId: string): Subscription[] {
    const info = this.subscriberIndex.get(subscriberId);
    return info ? Array.from(info.subscriptions.values()) : [];
  }

  getAllSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  hasSubscriber(subscriberId: string): boolean {
    return this.subscriberIndex.has(subscriberId);
  }

  getSubscriberCount(): number {
    return this.subscriberIndex.size;
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  private getPatternKey(pattern: TopicPattern): string {
    return pattern.toString();
  }
}