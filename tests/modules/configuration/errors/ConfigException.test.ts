import { describe, it, expect } from 'vitest';
import { ConfigException, ConfigErrorCodes } from '../../../../src/modules/configuration/errors/ConfigException.js';
import { ErrorCode } from '../../../../shared/exceptions/ErrorCodes.js';

describe('ConfigException', () => {
  it('creates exception with config-specific code', () => {
    const exc = new ConfigException(ConfigErrorCodes.CONFIG_SOURCE_UNAVAILABLE, 'Cannot read config file');
    expect(exc.code).toBe(ConfigErrorCodes.CONFIG_SOURCE_UNAVAILABLE);
    expect(exc.message).toBe('Cannot read config file');
    expect(exc.name).toBe('ConfigException');
  });

  it('captures stack trace', () => {
    const exc = new ConfigException(ConfigErrorCodes.CONFIG_VALIDATION_FAILED, 'test');
    expect(exc.stack).toBeDefined();
    expect(exc.stack).toContain('ConfigException');
  });

  it('serializes to JSON with details', () => {
    const exc = new ConfigException(ConfigErrorCodes.CONFIG_PROFILE_NOT_FOUND, 'Profile missing', { profile: 'staging' });
    const json = exc.toJSON();
    expect(json).toEqual({
      name: 'ConfigException',
      code: ConfigErrorCodes.CONFIG_PROFILE_NOT_FOUND,
      message: 'Profile missing',
      details: { profile: 'staging' },
      stack: expect.any(String)
    });
  });

  it('supports error chaining with cause', () => {
    const cause = new Error('file not found');
    const exc = new ConfigException(ConfigErrorCodes.CONFIG_SOURCE_UNAVAILABLE, 'Cannot load', undefined, cause);
    expect(exc.cause).toBe(cause);
  });

  it('is instanceof BaseException and Error', () => {
    const exc = new ConfigException(ConfigErrorCodes.UNKNOWN_CONFIG_ERROR, 'test');
    expect(exc instanceof Error).toBe(true);
    // BaseException is parent class
    expect(exc.name).toBe('ConfigException');
  });

  it('accepts all config error codes', () => {
    const codes = Object.values(ConfigErrorCodes);
    for (const code of codes) {
      const exc = new ConfigException(code, `Test ${code}`);
      expect(exc.code).toBe(code);
    }
  });
});

describe('ConfigErrorCodes', () => {
  it('contains all required error codes', () => {
    expect(ConfigErrorCodes.CONFIG_SOURCE_UNAVAILABLE).toBe('CONFIG_SOURCE_UNAVAILABLE');
    expect(ConfigErrorCodes.CONFIG_VALIDATION_FAILED).toBe('CONFIG_VALIDATION_FAILED');
    expect(ConfigErrorCodes.CONFIG_PROFILE_NOT_FOUND).toBe('CONFIG_PROFILE_NOT_FOUND');
    expect(ConfigErrorCodes.CONFIG_SECRET_RESOLUTION_FAILED).toBe('CONFIG_SECRET_RESOLUTION_FAILED');
    expect(ConfigErrorCodes.CONFIG_HOT_RELOAD_FAILED).toBe('CONFIG_HOT_RELOAD_FAILED');
    expect(ConfigErrorCodes.CONFIG_VERSION_NOT_FOUND).toBe('CONFIG_VERSION_NOT_FOUND');
    expect(ConfigErrorCodes.CONFIG_ROLLBACK_FAILED).toBe('CONFIG_ROLLBACK_FAILED');
    expect(ConfigErrorCodes.CONFIG_OVERRIDE_UNAUTHORIZED).toBe('CONFIG_OVERRIDE_UNAUTHORIZED');
    expect(ConfigErrorCodes.CONFIG_MERGE_CONFLICT).toBe('CONFIG_MERGE_CONFLICT');
    expect(ConfigErrorCodes.CONFIG_SCHEMA_MISMATCH).toBe('CONFIG_SCHEMA_MISMATCH');
    expect(ConfigErrorCodes.UNKNOWN_CONFIG_ERROR).toBe('UNKNOWN_CONFIG_ERROR');
  });

  it('has exactly 12 error codes', () => {
    expect(Object.keys(ConfigErrorCodes).length).toBe(12);
  });
});