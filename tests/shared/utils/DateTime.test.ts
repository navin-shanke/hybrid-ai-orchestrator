import { DateTime } from '../../../shared/utils/DateTime';

describe('DateTime', () => {
  it('creates from ISO string', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    expect(dt.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('creates from timestamp', () => {
    const dt = DateTime.fromTimestamp(1705314600000); // 2024-01-15T10:30:00Z
    expect(dt.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('creates now', () => {
    const before = Date.now();
    const dt = DateTime.now();
    const after = Date.now();
    expect(dt.toMillis()).toBeGreaterThanOrEqual(before);
    expect(dt.toMillis()).toBeLessThanOrEqual(after);
  });

  it('formats to ISO string', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    expect(dt.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('returns milliseconds since epoch', () => {
    const dt = DateTime.fromTimestamp(1705314600000);
    expect(dt.toMillis()).toBe(1705314600000);
  });

  it('adds duration', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    const later = dt.plus({ hours: 2, minutes: 30 });
    expect(later.toISOString()).toBe('2024-01-15T13:00:00.000Z');
  });

  it('subtracts duration', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    const earlier = dt.minus({ hours: 1 });
    expect(earlier.toISOString()).toBe('2024-01-15T09:30:00.000Z');
  });

  it('compares dates', () => {
    const dt1 = DateTime.fromISO('2024-01-15T10:30:00Z');
    const dt2 = DateTime.fromISO('2024-01-15T11:30:00Z');
    expect(dt1.isBefore(dt2)).toBe(true);
    expect(dt2.isAfter(dt1)).toBe(true);
    expect(dt1.equals(dt1)).toBe(true);
  });

  it('handles invalid ISO string', () => {
    expect(() => DateTime.fromISO('invalid')).toThrow();
  });

  it('handles plus with days only', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    const later = dt.plus({ days: 1 });
    expect(later.toISOString()).toBe('2024-01-16T10:30:00.000Z');
  });

  it('handles plus with seconds only', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    const later = dt.plus({ seconds: 30 });
    expect(later.toISOString()).toBe('2024-01-15T10:30:30.000Z');
  });

  it('handles minus with days only', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    const earlier = dt.minus({ days: 1 });
    expect(earlier.toISOString()).toBe('2024-01-14T10:30:00.000Z');
  });

  it('handles minus with minutes only', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    const earlier = dt.minus({ minutes: 15 });
    expect(earlier.toISOString()).toBe('2024-01-15T10:15:00.000Z');
  });

  it('handles plus with empty object', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    const same = dt.plus({});
    expect(same.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('handles minus with empty object', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    const same = dt.minus({});
    expect(same.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });
});