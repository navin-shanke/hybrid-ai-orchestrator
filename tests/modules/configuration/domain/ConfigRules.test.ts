import { describe, it, expect } from 'vitest';
import { ConfigRules } from '../../../../src/modules/configuration/domain/ConfigRules.js';
import { Validation } from '../../../../shared/utils/Validation.js';

describe('ConfigRules', () => {
  describe('validateLogLevel', () => {
    it('accepts valid log levels', () => {
      const result = ConfigRules.validateLogLevel('info');
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe('info');
    });

    it('rejects invalid log levels', () => {
      const result = ConfigRules.validateLogLevel('verbose');
      expect(result.isErr()).toBe(true);
    });

    it('normalizes case', () => {
      const result = ConfigRules.validateLogLevel('DEBUG');
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe('debug');
    });

    it('accepts all valid levels: debug, info, warn, error', () => {
      expect(ConfigRules.validateLogLevel('debug').isOk()).toBe(true);
      expect(ConfigRules.validateLogLevel('info').isOk()).toBe(true);
      expect(ConfigRules.validateLogLevel('warn').isOk()).toBe(true);
      expect(ConfigRules.validateLogLevel('error').isOk()).toBe(true);
    });

    it('rejects empty string', () => {
      expect(ConfigRules.validateLogLevel('').isErr()).toBe(true);
    });

    it('rejects non-string values', () => {
      expect(ConfigRules.validateLogLevel(123).isErr()).toBe(true);
      expect(ConfigRules.validateLogLevel(null).isErr()).toBe(true);
      expect(ConfigRules.validateLogLevel(undefined).isErr()).toBe(true);
    });
  });

  describe('validateRetentionDays', () => {
    it('accepts positive integers', () => {
      const result = ConfigRules.validateRetentionDays(30);
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(30);
    });

    it('rejects zero or negative', () => {
      expect(ConfigRules.validateRetentionDays(0).isErr()).toBe(true);
      expect(ConfigRules.validateRetentionDays(-1).isErr()).toBe(true);
    });

    it('rejects non-integers', () => {
      expect(ConfigRules.validateRetentionDays(30.5).isErr()).toBe(true);
    });

    it('rejects non-number values', () => {
      expect(ConfigRules.validateRetentionDays('30').isErr()).toBe(true);
      expect(ConfigRules.validateRetentionDays(null).isErr()).toBe(true);
      expect(ConfigRules.validateRetentionDays(undefined).isErr()).toBe(true);
    });
  });

  describe('validateFeatureFlag', () => {
    it('accepts boolean flags', () => {
      const result = ConfigRules.validateFeatureFlag('featureX', true);
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(true);
    });

    it('accepts variant strings', () => {
      const result = ConfigRules.validateFeatureFlag('featureX', 'variant-a');
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe('variant-a');
    });

    it('rejects invalid types', () => {
      expect(ConfigRules.validateFeatureFlag('featureX', 123).isErr()).toBe(true);
      expect(ConfigRules.validateFeatureFlag('featureX', {}).isErr()).toBe(true);
      expect(ConfigRules.validateFeatureFlag('featureX', null).isErr()).toBe(true);
      expect(ConfigRules.validateFeatureFlag('featureX', undefined).isErr()).toBe(true);
    });
  });

  describe('validateProviderConfig', () => {
    it('accepts valid provider config', () => {
      const config = {
        type: 'openai',
        model: 'gpt-4',
        secretRef: 'secretRef://openai-api-key'
      };
      const result = ConfigRules.validateProviderConfig(config);
      expect(result.isOk()).toBe(true);
    });

    it('rejects missing required fields', () => {
      const config = { type: 'openai' };
      const result = ConfigRules.validateProviderConfig(config);
      expect(result.isErr()).toBe(true);
    });

    it('rejects missing model', () => {
      const config = { type: 'openai', secretRef: 'secretRef://key' };
      const result = ConfigRules.validateProviderConfig(config);
      expect(result.isErr()).toBe(true);
    });

    it('rejects missing secretRef', () => {
      const config = { type: 'openai', model: 'gpt-4' };
      const result = ConfigRules.validateProviderConfig(config);
      expect(result.isErr()).toBe(true);
    });

    it('rejects invalid secretRef format', () => {
      const config = {
        type: 'openai',
        model: 'gpt-4',
        secretRef: 'invalid-format'
      };
      const result = ConfigRules.validateProviderConfig(config);
      expect(result.isErr()).toBe(true);
    });

    it('rejects non-object input', () => {
      expect(ConfigRules.validateProviderConfig('string').isErr()).toBe(true);
      expect(ConfigRules.validateProviderConfig(null).isErr()).toBe(true);
      expect(ConfigRules.validateProviderConfig(undefined).isErr()).toBe(true);
    });
  });

  describe('validateRoutingWeights', () => {
    it('accepts weights summing to 1', () => {
      const weights = { latency: 0.4, cost: 0.3, quality: 0.3 };
      const result = ConfigRules.validateRoutingWeights(weights);
      expect(result.isOk()).toBe(true);
    });

    it('rejects weights not summing to 1', () => {
      const weights = { latency: 0.5, cost: 0.5, quality: 0.5 };
      const result = ConfigRules.validateRoutingWeights(weights);
      expect(result.isErr()).toBe(true);
    });

    it('rejects negative weights', () => {
      const weights = { latency: -0.1, cost: 0.6, quality: 0.5 };
      const result = ConfigRules.validateRoutingWeights(weights);
      expect(result.isErr()).toBe(true);
    });

    it('rejects non-numeric weights', () => {
      const weights = { latency: '0.4', cost: 0.3, quality: 0.3 };
      const result = ConfigRules.validateRoutingWeights(weights);
      expect(result.isErr()).toBe(true);
    });

    it('rejects empty weights object', () => {
      const result = ConfigRules.validateRoutingWeights({});
      expect(result.isErr()).toBe(true);
    });

    it('rejects non-object input', () => {
      expect(ConfigRules.validateRoutingWeights('string').isErr()).toBe(true);
      expect(ConfigRules.validateRoutingWeights(null).isErr()).toBe(true);
    });

    it('allows floating point precision tolerance', () => {
      const weights = { latency: 0.33333333, cost: 0.33333333, quality: 0.33333334 };
      const result = ConfigRules.validateRoutingWeights(weights);
      expect(result.isOk()).toBe(true);
    });
  });
});