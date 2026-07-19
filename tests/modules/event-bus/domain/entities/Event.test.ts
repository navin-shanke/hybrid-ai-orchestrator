import { Event } from '@src/modules/event-bus/domain/entities/Event.js';
import { EventPriority, EventType, EventStatus } from '@src/modules/event-bus/domain/entities/Event.js';
import { TopicPattern } from '@src/modules/event-bus/domain/value-objects/TopicPattern.js';
import { EventStatus } from '@src/modules/event-bus/domain/value-objects/EventStatus.js';
import { EventPriority } from '@src/modules/event-bus/domain/entities/Event.js';
import { Result, ok, err } from '@shared/domain/Result.js';

describe('Event', () => {
  describe('create', () => {
    it('creates an event with all required fields', () => {
      const result = Event.create({
        eventName: 'TaskCreated',
        category: 'Task Events',
        payload: { taskId: '123', planId: '456' },
        sourceModule: 'OrchestratorCore',
      });

      expect(result.isOk()).toBe(true);
      const event = result.unwrap();
      expect(event.eventId).toBeDefined();
      expect(event.eventName).toBe('TaskCreated');
      expect(event.category).toBe('Task Events');
      expect(event.payload).toEqual({ taskId: '123', planId: '456' });
      expect(event.sourceModule).toBe('OrchestratorCore');
      expect(event.envelopeData.status).toBe('CREATED');
      expect(event.envelopeData.correlationId).toBeDefined();
    });

    it('sets correlationId when provided', () => {
      const result = Event.create({
        eventName: 'TestEvent',
        category: 'Test',
        payload: {},
        sourceModule: 'TestModule',
        correlationId: 'custom-correlation-id',
      });

      expect(result.isOk()).toBe(true);
      expect(result.unwrap().correlationId).toBe('custom-correlation-id');
    });

    it('sets default priority to NORMAL', () => {
      const result = Event.create({
        eventName: 'TestEvent',
        category: 'Test',
        payload: {},
        sourceModule: 'TestModule',
      });

      expect(result.unwrap().priority).toBe('NORMAL');
    });

    it('accepts custom priority', () => {
      const result = Event.create({
        eventName: 'TestEvent',
        category: 'Test',
        payload: {},
        sourceModule: 'TestModule',
        priority: EventPriority.HIGH,
      });

      expect(result.unwrap().priority).toBe('HIGH');
    });

    it('generates unique eventIds', () => {
      const event1 = Event.create({
        eventName: 'Test',
        category: 'Test',
        payload: {},
        sourceModule: 'Test',
      }).unwrap();

      const event2 = Event.create({
        eventName: 'Test',
        category: 'Test',
        payload: {},
        sourceModule: 'Test',
      }).unwrap();

      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('sets payload correctly', () => {
      const payload = { taskId: '123', data: { nested: true } };
      const result = Event.create({
        eventName: 'Test',
        category: 'Test',
        payload,
        sourceModule: 'Test',
      });

      expect(result.unwrap().payload).toEqual(payload);
    });
  });

  describe('status transitions', () => {
    it('starts with CREATED status', () => {
      const event = Event.create({
        eventName: 'Test',
        category: 'Test',
        payload: {},
        sourceModule: 'Test',
      }).unwrap();

      expect(event.envelopeData.status).toBe('CREATED');
    });

    it('transitions status correctly', () => {
      const event = Event.create({
        eventName: 'Test',
        category: 'Test',
        payload: {},
        sourceModule: 'Test',
      }).unwrap();

      event.setStatus('VALIDATED');
      expect(event.status).toBe('VALIDATED');

      event.setStatus('QUEUED');
      expect(event.status).toBe('QUEUED');
    });
  });

  describe('retry count', () => {
    it('starts at 0', () => {
      const event = Event.create({
        eventName: 'Test',
        category: 'Test',
        payload: {},
        sourceModule: 'Test',
      }).unwrap();

      expect(event.envelopeData.retryCount).toBe(0);
    });

    it('increments retry count', () => {
      const event = Event.create({
        eventName: 'Test',
        category: 'Test',
        payload: {},
        sourceModule: 'Test',
      }).unwrap();

      event.incrementRetryCount();
      expect(event.envelopeData.retryCount).toBe(1);
    });
  });

  describe('toJSON', () => {
    it('returns serializable envelope', () => {
      const event = Event.create({
        eventName: 'TestEvent',
        category: 'Test',
        payload: { key: 'value' },
        sourceModule: 'TestModule',
      }).unwrap();

      const json = event.toJSON();

      expect(json.eventId).toBeDefined();
      expect(json.eventName).toBe('TestEvent');
      expect(json.payload).toEqual({ key: 'value' });
      expect(json.timestamp).toBeDefined();
    });
  });
});