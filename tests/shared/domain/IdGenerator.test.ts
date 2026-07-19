import { describe, it, expect } from 'vitest';
import { UuidIdGenerator, TestIdGenerator, getDefaultIdGenerator, setDefaultIdGenerator } from '../../../shared/domain/IdGenerator';

describe('IdGenerator', () => {
  describe('UuidIdGenerator', () => {
    it('generates valid UUID v4 strings', () => {
      const generator = new UuidIdGenerator();
      const id = generator.generate();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('generates unique IDs on each call', () => {
      const generator = new UuidIdGenerator();
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generator.generate());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('TestIdGenerator', () => {
    it('generates sequential IDs with prefix', () => {
      const generator = new TestIdGenerator('test');
      expect(generator.generate()).toBe('test-1');
      expect(generator.generate()).toBe('test-2');
      expect(generator.generate()).toBe('test-3');
    });

    it('resets counter when reset() is called', () => {
      const generator = new TestIdGenerator('test');
      generator.generate();
      generator.generate();
      generator.reset();
      expect(generator.generate()).toBe('test-1');
    });

    it('uses default prefix when none provided', () => {
      const generator = new TestIdGenerator();
      expect(generator.generate()).toBe('test-1');
    });
  });

  describe('default generator management', () => {
    it('returns default UuidIdGenerator', () => {
      const generator = getDefaultIdGenerator();
      expect(generator).toBeInstanceOf(UuidIdGenerator);
    });

    it('allows setting custom default generator', () => {
      const custom = new TestIdGenerator('custom');
      setDefaultIdGenerator(custom);
      expect(getDefaultIdGenerator()).toBe(custom);
      // Restore
      setDefaultIdGenerator(new UuidIdGenerator());
    });
  });
});