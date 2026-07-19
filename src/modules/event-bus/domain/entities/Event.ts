import { EventStatus } from '../value-objects/EventStatus.js';
import { randomUUID } from 'crypto';
import { Result, ok, err } from '@shared/domain/Result.js';

export enum EventType {
  COMMAND = 'COMMAND',
  NOTIFICATION = 'NOTIFICATION',
  QUERY_RESULT = 'QUERY_RESULT',
}

export enum EventPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface EventMetadata {
  [key: string]: unknown;
}

export interface EventPayload {
  [key: string]: unknown;
}

export interface EventEnvelope {
  eventId: string;
  eventName: string;
  category: string;
  version: string;
  timestamp: string;
  correlationId: string;
  requestId: string | null;
  sessionId: string | null;
  projectId: string | null;
  sourceModule: string;
  targetModule: string | null;
  priority: EventPriority;
  status: EventStatus;
  payload: EventPayload;
  metadata: EventMetadata;
  retryCount: number;
  ttl: number | null;
  expiration: string | null;
  eventType: EventType;
  persistenceFlag: boolean;
}

export interface EventCreationOptions {
  eventName: string;
  category: string;
  payload: EventPayload;
  sourceModule: string;
  version?: string;
  correlationId?: string;
  requestId?: string | null;
  sessionId?: string | null;
  projectId?: string | null;
  targetModule?: string | null;
  priority?: EventPriority;
  eventType?: EventType;
  ttl?: number;
  persistenceFlag?: boolean;
  metadata?: EventMetadata;
}

export class Event {
  private readonly envelope: EventEnvelope;

  constructor(envelope: EventEnvelope) {
    this.envelope = envelope;
  }

  get envelopeData(): EventEnvelope {
    return { ...this.envelope };
  }

  get eventId(): string {
    return this.envelope.eventId;
  }

  get eventName(): string {
    return this.envelope.eventName;
  }

  get category(): string {
    return this.envelope.category;
  }

  get version(): string {
    return this.envelope.version;
  }

  get timestamp(): string {
    return this.envelope.timestamp;
  }

  get correlationId(): string {
    return this.envelope.correlationId;
  }

  get sourceModule(): string {
    return this.envelope.sourceModule;
  }

  get status(): EventStatus {
    return this.envelope.status;
  }

  get payload(): EventPayload {
    return this.envelope.payload;
  }

  get priority(): EventPriority {
    return this.envelope.priority;
  }

  get eventType(): EventType {
    return this.envelope.eventType;
  }

  setStatus(status: EventStatus): void {
    this.envelope.status = status;
  }

  incrementRetryCount(): void {
    this.envelope.retryCount++;
  }

  toJSON(): EventEnvelope {
    return { ...this.envelope };
  }

  static create(options: EventCreationOptions): Result<Event, Error> {
    const now = new Date().toISOString();
    const correlationId = options.correlationId ?? randomUUID();
    const requestId = options.requestId ?? null;
    const sessionId = options.sessionId ?? null;
    const projectId = options.projectId ?? null;
    const version = options.version ?? '1.0.0';
    const priority = options.priority ?? EventPriority.NORMAL;
    const eventType = options.eventType ?? EventType.NOTIFICATION;
    const ttl = options.ttl ?? null;
    const expiration = ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null;
    const persistenceFlag = options.persistenceFlag ?? false;
    const metadata = options.metadata ?? {};

    if (!options.eventName || options.eventName.trim() === '') {
      return err(new Error('eventName is required'));
    }
    if (!options.category || options.category.trim() === '') {
      return err(new Error('category is required'));
    }
    if (!options.sourceModule || options.sourceModule.trim() === '') {
      return err(new Error('sourceModule is required'));
    }
    if (options.payload === undefined || options.payload === null) {
      return err(new Error('payload is required'));
    }

    const envelope: EventEnvelope = {
      eventId: randomUUID(),
      eventName: options.eventName,
      category: options.category,
      version,
      timestamp: now,
      correlationId,
      requestId,
      sessionId,
      projectId,
      sourceModule: options.sourceModule,
      targetModule: options.targetModule ?? null,
      priority,
      status: EventStatus.CREATED,
      payload: options.payload,
      metadata,
      retryCount: 0,
      ttl,
      expiration,
      eventType,
      persistenceFlag,
    };

    return ok(new Event(envelope));
  }

  static fromEnvelope(envelope: EventEnvelope): Event {
    return new Event(envelope);
  }
}