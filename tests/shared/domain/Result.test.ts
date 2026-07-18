import { Result, ok, err } from '../../../shared/domain/Result';

describe('Result', () => {
  describe('ok', () => {
    it('wraps a success value', () => {
      const result = ok(42);
      expect(result.isOk()).toBe(true);
      expect(result.isErr()).toBe(false);
      expect(result.unwrap()).toBe(42);
    });

    it('maps over success value', () => {
      const result = ok(2).map(x => x * 3);
      expect(result.unwrap()).toBe(6);
    });

    it('flatMaps over success value', () => {
      const result = ok(2).flatMap(x => ok(x * 5));
      expect(result.unwrap()).toBe(10);
    });

    it('mapErr does nothing on Ok', () => {
      const result = ok(42).mapErr(e => e + '!');
      expect(result.unwrap()).toBe(42);
    });
  });

  describe('err', () => {
    it('wraps an error value', () => {
      const result = err('not found');
      expect(result.isErr()).toBe(true);
      expect(result.isOk()).toBe(false);
      expect(() => result.unwrap()).toThrow('not found');
    });

    it('maps over error value', () => {
      const result = err(404).mapErr(code => `Error ${code}`);
      expect(result.isErr()).toBe(true);
      expect(() => result.unwrap()).toThrow('Error 404');
    });

    it('flatMaps over error value', () => {
      const result = err('fail').flatMapErr(e => err(e + '!'));
      expect(() => result.unwrap()).toThrow('fail!');
    });

    it('map does nothing on Err', () => {
      const result = err('oops').map(x => x * 2);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('unwrapOr', () => {
    it('returns value on Ok', () => {
      expect(ok(10).unwrapOr(0)).toBe(10);
    });
    it('returns default on Err', () => {
      expect(err('fail').unwrapOr(0)).toBe(0);
    });
  });

  describe('match', () => {
    it('calls ok handler on success', () => {
      const result = ok('hello').match({
        ok: v => v.toUpperCase(),
        err: e => `Error: ${e}`
      });
      expect(result).toBe('HELLO');
    });
    it('calls err handler on failure', () => {
      const result = err('oops').match({
        ok: v => v.toUpperCase(),
        err: e => `Error: ${e}`
      });
      expect(result).toBe('Error: oops');
    });
  });

  describe('serialization', () => {
    it('toJSON preserves Ok value', () => {
      const json = ok({ x: 1 }).toJSON();
      expect(json).toEqual({ ok: true, value: { x: 1 } });
    });
    it('toJSON preserves Err value', () => {
      const json = err('fail').toJSON();
      expect(json).toEqual({ ok: false, error: 'fail' });
    });
  });

  describe('edge cases', () => {
    it('handles null/undefined as valid Ok values', () => {
      expect(ok(null).unwrap()).toBeNull();
      expect(ok(undefined).unwrap()).toBeUndefined();
    });
  });
});