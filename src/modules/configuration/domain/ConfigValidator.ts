import { Result, ok, err } from '../../../../shared/domain/Result.js';
import { ConfigRules } from './ConfigRules.js';
import { Validation } from '../../../../shared/utils/Validation.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class ConfigValidator {
  private readonly schemaCache = new Map<string, object>();

  validate(config: Record<string, unknown>): Result<ValidationResult, Error> {
    const errors: string[] = [];

    if (config.system) {
      const sysErrors = this.validateSystem(config.system as Record<string, unknown>);
      errors.push(...sysErrors);
    }

    if (config.providers) {
      const provErrors = this.validateProviders(config.providers as Record<string, unknown>);
      errors.push(...provErrors);
    }

    if (config.routing) {
      const routingErrors = this.validateRouting(config.routing as Record<string, unknown>);
      errors.push(...routingErrors);
    }

    if (config.featureFlags) {
      const flagErrors = this.validateFeatureFlags(config.featureFlags as Record<string, unknown>);
      errors.push(...flagErrors);
    }

    if (errors.length > 0) {
      return err(new Error(errors.join('; ')));
    }

    return ok({ valid: true, errors: [] });
  }

  private validateSystem(system: Record<string, unknown>): string[] {
    const errors: string[] = [];

    if (system.logLevel) {
      const result = ConfigRules.validateLogLevel(system.logLevel);
      if (result.isErr()) {
        errors.push(`system.logLevel: ${result.error.message}`);
      }
    }

    if (system.healthCheckInterval !== undefined) {
      if (!Validation.isPositiveInteger(system.healthCheckInterval)) {
        errors.push('system.healthCheckInterval must be a positive integer');
      }
    }

    if (system.configManager && typeof system.configManager === 'object' && 'retention' in system.configManager) {
      const retention = (system.configManager as Record<string, unknown>).retention;
      const result = ConfigRules.validateRetentionDays(retention);
      if (result.isErr()) {
        errors.push(`system.configManager.retention: ${result.error.message}`);
      }
    }

    return errors;
  }

  private validateProviders(providers: Record<string, unknown>): string[] {
    const errors: string[] = [];

    for (const [name, config] of Object.entries(providers)) {
      if (config && typeof config === 'object') {
        const result = ConfigRules.validateProviderConfig(config);
        if (result.isErr()) {
          errors.push(`providers.${name}: ${result.error.message}`);
        }
      }
    }

    return errors;
  }

  private validateRouting(routing: Record<string, unknown>): string[] {
    const errors: string[] = [];

    if (routing.policies) {
      const result = ConfigRules.validateRoutingWeights(routing.policies);
      if (result.isErr()) {
        errors.push(`routing.policies: ${result.error.message}`);
      }
    }

    return errors;
  }

  private validateFeatureFlags(flags: Record<string, unknown>): string[] {
    const errors: string[] = [];

    for (const [name, value] of Object.entries(flags)) {
      const result = ConfigRules.validateFeatureFlag(name, value);
      if (result.isErr()) {
        errors.push(`featureFlags.${name}: ${result.error.message}`);
      }
    }

    return errors;
  }
}