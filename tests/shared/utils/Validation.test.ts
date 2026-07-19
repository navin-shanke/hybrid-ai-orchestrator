import { Validation } from '../../../shared/utils/Validation';

describe('Validation', () => {
  describe('isNonEmptyString', () => {
    it('returns true for non-empty string', () => {
      expect(Validation.isNonEmptyString('hello')).toBe(true);
    });
    it('returns false for empty string', () => {
      expect(Validation.isNonEmptyString('')).toBe(false);
    });
    it('returns false for whitespace only', () => {
      expect(Validation.isNonEmptyString('   ')).toBe(false);
    });
    it('returns false for null/undefined', () => {
      expect(Validation.isNonEmptyString(null as any)).toBe(false);
      expect(Validation.isNonEmptyString(undefined as any)).toBe(false);
    });
  });

  describe('isValidUUID', () => {
    it('returns true for valid UUID v4', () => {
      expect(Validation.isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });
    it('returns false for invalid format', () => {
      expect(Validation.isValidUUID('not-a-uuid')).toBe(false);
      expect(Validation.isValidUUID('')).toBe(false);
    });
    it('returns false for non-string values', () => {
      expect(Validation.isValidUUID(null as any)).toBe(false);
      expect(Validation.isValidUUID(undefined as any)).toBe(false);
      expect(Validation.isValidUUID(123 as any)).toBe(false);
      expect(Validation.isValidUUID({} as any)).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('returns true for valid email', () => {
      expect(Validation.isValidEmail('user@example.com')).toBe(true);
    });
    it('returns false for invalid email', () => {
      expect(Validation.isValidEmail('invalid')).toBe(false);
      expect(Validation.isValidEmail('@example.com')).toBe(false);
    });
    it('returns false for non-string values', () => {
      expect(Validation.isValidEmail(null as any)).toBe(false);
      expect(Validation.isValidEmail(undefined as any)).toBe(false);
      expect(Validation.isValidEmail(123 as any)).toBe(false);
      expect(Validation.isValidEmail({} as any)).toBe(false);
    });
  });

  describe('isPositiveInteger', () => {
    it('returns true for positive integers', () => {
      expect(Validation.isPositiveInteger(1)).toBe(true);
      expect(Validation.isPositiveInteger(100)).toBe(true);
    });
    it('returns false for zero, negative, non-integers', () => {
      expect(Validation.isPositiveInteger(0)).toBe(false);
      expect(Validation.isPositiveInteger(-1)).toBe(false);
      expect(Validation.isPositiveInteger(1.5)).toBe(false);
    });
    it('returns false for non-number values', () => {
      expect(Validation.isPositiveInteger('1' as any)).toBe(false);
      expect(Validation.isPositiveInteger(null as any)).toBe(false);
      expect(Validation.isPositiveInteger(undefined as any)).toBe(false);
      expect(Validation.isPositiveInteger({} as any)).toBe(false);
    });
  });

  describe('isWithinRange', () => {
    it('returns true when value in range', () => {
      expect(Validation.isWithinRange(5, 1, 10)).toBe(true);
      expect(Validation.isWithinRange(1, 1, 10)).toBe(true);
      expect(Validation.isWithinRange(10, 1, 10)).toBe(true);
    });
    it('returns false when out of range', () => {
      expect(Validation.isWithinRange(0, 1, 10)).toBe(false);
      expect(Validation.isWithinRange(11, 1, 10)).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('trims and removes control characters', () => {
      expect(Validation.sanitizeString('  hello\x00world  ')).toBe('hello world');
    });
    it('limits length', () => {
      expect(Validation.sanitizeString('abcdef', 3)).toBe('abc');
    });
    it('handles string without maxLength', () => {
      expect(Validation.sanitizeString('  hello  ')).toBe('hello');
    });
    it('handles string with only control characters', () => {
      expect(Validation.sanitizeString('\x00\x01\x02')).toBe('');
    });
    it('handles string with no control characters', () => {
      expect(Validation.sanitizeString('hello world')).toBe('hello world');
    });
    it('handles exact maxLength', () => {
      expect(Validation.sanitizeString('abc', 3)).toBe('abc');
    });
    it('handles maxLength less than string length', () => {
      expect(Validation.sanitizeString('abcdef', 3)).toBe('abc');
    });
  });
});