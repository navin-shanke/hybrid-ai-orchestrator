import { Result, ok, err } from '../../../../shared/domain/Result.js';
import { Validation } from '../../../../shared/utils/Validation.js';

export class ConfigRules {
  private static readonly VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
  private static readonly SECRET_REF_PREFIX = 'secretRef://';

  static validateLogLevel(value: unknown): Result<string, Error> {
    if (!Validation.isNonEmptyString(value)) {
      return err(new Error('Log level must be a non-empty string'));
    }
    const normalized = value.toLowerCase();
    if (!this.VALID_LOG_LEVELS.includes(normalized as typeof this.VALID_LOG_LEVELS[number])) {
      return err(new Error(`Invalid log level: ${value}. Must be one of: ${this.VALID_LOG_LEVELS.join(', ')}`));
    }
    return ok(normalized);
  }

  static validateRetentionDays(value: unknown): Result<number, Error> {
    if (!Validation.isPositiveInteger(value)) {
      return err(new Error('Retention days must be a positive integer'));
    }
    return ok(value);
  }

  static validateFeatureFlag(_name: string, value: unknown): Result<boolean | string, Error> {
    if (typeof value === 'boolean') {
      return ok(value);
    }
    if (Validation.isNonEmptyString(value)) {
      return ok(value);
    }
    return err(new Error(`Feature flag must be boolean or string variant, got: ${typeof value}`));
  }

  static validateProviderConfig(config: unknown): Result<Record<string, unknown>, Error> {
    if (!config || typeof config !== 'object') {
      return err(new Error('Provider config must be an object'));
    }
    const c = config as Record<string, unknown>;
    if (!Validation.isNonEmptyString(c.type)) {
      return err(new Error('Provider config must have a non-empty string "type"'));
    }
    if (!Validation.isNonEmptyString(c.model)) {
      return err(new Error('Provider config must have a non-empty string "model"'));
    }
    if (!Validation.isNonEmptyString(c.secretRef) || !String(c.secretRef).startsWith(this.SECRET_REF_PREFIX)) {
      return err(new Error(`Provider config must have "secretRef" starting with "${this.SECRET_REF_PREFIX}"`));
    }
    return ok(c);
  }

  static validateRoutingWeights(weights: unknown): Result<Record<string, number>, Error> {
    if (!weights || typeof weights !== 'object') {
      return err(new Error('Routing weights must be an object'));
    }
    const w = weights as Record<string, unknown>;
    const entries = Object.entries(w);
    if (entries.length === 0) {
      return err(new Error('Routing weights must have at least one entry'));
    }
    let sum = 0;
    const result: Record<string, number> = {};
    for (const [key, value] of entries) {
      if (typeof value !== 'number' || value < 0) {
        return err(new Error(`Weight for "${key}" must be a non-negative number`));
      }
      sum += value;
      result[key] = value;
    }
    if (Math.abs(sum - 1.0) > 0.0001) {
      return err(new Error(`Routing weights must sum to 1.0, got ${sum}`));
    }
    return ok(result);
  }
}