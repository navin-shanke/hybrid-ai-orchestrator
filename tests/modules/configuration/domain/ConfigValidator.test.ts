import { describe, it, expect } from 'vitest';
import { ConfigValidator } from '../../../../src/modules/configuration/domain/ConfigValidator.js';
import { Result } from '../../../../shared/domain/Result.js';

describe('ConfigValidator', () => {
  const validator = new ConfigValidator();

  it('validates valid configuration against schema', () => {
    const config = {
      system: { logLevel: 'info', healthCheckInterval: 30000 },
      featureFlags: { newUI: true, betaAPI: false }
    };
    const result = validator.validate(config);
    expect(result.isOk()).toBe(true);
    expect(result.unwrap().valid).toBe(true);
  });

  it('rejects invalid log level', () => {
    const config = { system: { logLevel: 'verbose' } };
    const result = validator.validate(config);
    expect(result.isErr()).toBe(true);
  });

  it('rejects negative retention days', () => {
    const config = { system: { configManager: { retention: -1 } } };
    const result = validator.validate(config);
    expect(result.isErr()).toBe(true);
  });

  it('validates provider config with secretRef', () => {
    const config = {
      providers: {
        openai: { type: 'openai', model: 'gpt-4', secretRef: 'secretRef://openai-key' }
      }
    };
    const result = validator.validate(config);
    expect(result.isOk()).toBe(true);
  });

  it('rejects provider config without secretRef', () => {
    const config = { providers: { openai: { type: 'openai', model: 'gpt-4' } } };
    const result = validator.validate(config);
    expect(result.isErr()).toBe(true);
  });

  it('validates routing weights sum to 1', () => {
    const config = { routing: { policies: { latency: 0.4, cost: 0.3, quality: 0.3 } } };
    const result = validator.validate(config);
    expect(result.isOk()).toBe(true);
  });

  it('rejects routing weights not summing to 1', () => {
    const config = { routing: { policies: { latency: 0.5, cost: 0.5, quality: 0.5 } } };
    const result = validator.validate(config);
    expect(result.isErr()).toBe(true);
  });

  it('returns structured validation errors', () => {
    const config = { system: { logLevel: 'invalid' } };
    const result = validator.validate(config);
    expect(result.isErr()).toBe(true);
    const error = result.error;
    expect(error.message).toContain('system.logLevel');
    expect(error.message).toContain('Invalid log level');
  });

  it('validates feature flags with boolean values', () => {
    const config = { featureFlags: { flag1: true, flag2: false } };
    const result = validator.validate(config);
    expect(result.isOk()).toBe(true);
  });

  it('validates feature flags with string variants', () => {
    const config = { featureFlags: { flag1: 'variant-a', flag2: 'variant-b' } };
    const result = validator.validate(config);
    expect(result.isOk()).toBe(true);
  });

  it('rejects invalid feature flag types', () => {
    const config = { featureFlags: { flag1: 123, flag2: {} } };
    const result = validator.validate(config);
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-positive healthCheckInterval', () => {
    const config = { system: { healthCheckInterval: 0 } };
    const result = validator.validate(config);
    expect(result.isErr()).toBe(true);
  });

  it('rejects non-integer healthCheckInterval', () => {
    const config = { system: { healthCheckInterval: 100.5 } };
    const result = validator.validate(config);
    expect(result.isErr()).toBe(true);
  });

  it('validates multiple namespaces together', () => {
    const config = {
      system: { logLevel: 'debug' },
      providers: { anthropic: { type: 'anthropic', model: 'claude-3', secretRef: 'secretRef://key' } },
      routing: { policies: { latency: 0.6, cost: 0.4 } },
      featureFlags: { newFeature: true }
    };
    const result = validator.validate(config);
    expect(result.isOk()).toBe(true);
  });
});