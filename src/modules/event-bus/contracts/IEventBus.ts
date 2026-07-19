import { Event } from '../domain/entities/Event.js';

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

export interface Metrics {
  published: number;
  delivered: number;
  failed: number;
  deadLettered: number;
  filtered: number;
  retries: number;
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

export type EventHandler = (event: Event) => Promise<void> | void;

export type Middleware = (event: Event, next: () => Promise<void>) => Promise<void>;

export interface EventBusPlugin {
  name: string;
  version: string;
  middleware?: Array<(event: Event, next: () => Promise<void>) => Promise<void>>;
  onInit?: (bus: IEventBus) => void | Promise<void>;
  onShutdown?: (bus: IEventBus) => void | Promise<void>;
}

export interface IEventBus {
  publish(event: Event): Promise<PublishResult>;
  publishAsync(event: Event): Promise<PublishResult>;
  publishSync(event: Event, timeoutMs?: number): Promise<HandlerResult[]>;
  publishBatch(events: Event[]): Promise<PublishResult[]>;
  subscribe(topicPattern: string, handler: EventHandler, options?: SubscriptionOptions): SubscriptionHandle;
  unsubscribe(subscriptionId: string): void;
  registerMiddleware(middleware: Middleware, position?: number): void;
  registerPlugin(plugin: EventBusPlugin): void;
  healthCheck(): Promise<HealthStatus>;
  getMetrics(): Metrics;
  shutdown(graceful?: boolean): Promise<void>;
}

export interface HandlerResult {
  subscriberId: string;
  status: 'SUCCESS' | 'ERROR' | 'TIMEOUT';
  resultRef?: unknown;
  errorRef?: Error;
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