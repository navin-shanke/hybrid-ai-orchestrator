export class Validation {
  static isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  static isValidUUID(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  static isValidEmail(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  static isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }

  static isWithinRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }

  static sanitizeString(value: string, maxLength?: number): string {
    // Remove control characters (ASCII 0-31 and 127)
    // eslint-disable-next-line no-control-regex
    let sanitized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }
    return sanitized;
  }
}