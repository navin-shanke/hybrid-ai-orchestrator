import { TopicPattern } from '@src/modules/event-bus/domain/value-objects/TopicPattern.js';
import { Result, ok, err } from '@shared/domain/Result.js';

describe('TopicPattern', () => {
  describe('constructor', () => {
    it('creates a pattern from a valid string', () => {
      const pattern = new TopicPattern('task.task.created');
      expect(pattern.value).toBe('task.task.created');
    });

    it('throws on empty pattern', () => {
      expect(() => new TopicPattern('')).toThrow();
      expect(() => new TopicPattern('   ')).toThrow();
    });
  });

  describe('matches', () => {
    it('matches exact pattern', () => {
      const pattern = new TopicPattern('task.task.created');
      expect(pattern.matches('task.task.created')).toBe(true);
      expect(pattern.matches('task.task.updated')).toBe(false);
    });

    it('matches single segment wildcard (*)', () => {
      const pattern = new TopicPattern('task.*.created');
      expect(pattern.matches('task.task.created')).toBe(true);
      expect(pattern.matches('task.subtask.created')).toBe(true);
      expect(pattern.matches('task.created')).toBe(false);
    });

    it('matches multi-segment wildcard (#)', () => {
      const pattern = new TopicPattern('task.#');
      expect(pattern.matches('task.task.created')).toBe(true);
      expect(pattern.matches('task.subtask.item.created')).toBe(true);
      expect(pattern.matches('task')).toBe(true);
    });

    it('combines wildcards', () => {
      const pattern = new TopicPattern('task.*.#');
      expect(pattern.matches('task.task.created')).toBe(true);
      expect(pattern.matches('task.subtask.item.updated')).toBe(true);
    });

    it('matches exact segments with wildcards', () => {
      const pattern = new TopicPattern('task.task.#');
      expect(pattern.matches('task.task.created')).toBe(true);
      expect(pattern.matches('task.other.created')).toBe(false);
    });

    it('handles edge cases', () => {
      const pattern = new TopicPattern('#');
      expect(pattern.matches('anything')).toBe(true);
      expect(pattern.matches('a.b.c.d')).toBe(true);
    });
  });

  describe('isValid', () => {
    it('returns true for valid patterns', () => {
      expect(TopicPattern.isValid('task.task.created')).toBe(true);
      expect(TopicPattern.isValid('task.*.created')).toBe(true);
      expect(TopicPattern.isValid('task.#')).toBe(true);
    });

    it('returns false for invalid patterns', () => {
      expect(TopicPattern.isValid('')).toBe(false);
      expect(TopicPattern.isValid('   ')).toBe(false);
    });
  });

  describe('equals', () => {
    it('returns true for equal patterns', () => {
      const p1 = new TopicPattern('task.task.created');
      const p2 = new TopicPattern('task.task.created');
      expect(p1.equals(p2)).toBe(true);
    });

    it('returns false for different patterns', () => {
      const p1 = new TopicPattern('task.task.created');
      const p2 = new TopicPattern('task.task.updated');
      expect(p1.equals(p2)).toBe(false);
    });
  });
});