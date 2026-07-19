import { BaseException } from '../../../../shared/exceptions/BaseException.js';
import { ErrorCode } from '../../../../shared/exceptions/ErrorCodes.js';

export const ConfigErrorCodes = {
  CONFIG_SOURCE_UNAVAILABLE: 'CONFIG_SOURCE_UNAVAILABLE',
  CONFIG_VALIDATION_FAILED: 'CONFIG_VALIDATION_FAILED',
  CONFIG_PROFILE_NOT_FOUND: 'CONFIG_PROFILE_NOT_FOUND',
  CONFIG_SECRET_RESOLUTION_FAILED: 'CONFIG_SECRET_RESOLUTION_FAILED',
  CONFIG_HOT_RELOAD_FAILED: 'CONFIG_HOT_RELOAD_FAILED',
  CONFIG_VERSION_NOT_FOUND: 'CONFIG_VERSION_NOT_FOUND',
  CONFIG_ROLLBACK_FAILED: 'CONFIG_ROLLBACK_FAILED',
  CONFIG_OVERRIDE_UNAUTHORIZED: 'CONFIG_OVERRIDE_UNAUTHORIZED',
  CONFIG_MERGE_CONFLICT: 'CONFIG_MERGE_CONFLICT',
  CONFIG_SCHEMA_MISMATCH: 'CONFIG_SCHEMA_MISMATCH',
  UNKNOWN_CONFIG_ERROR: 'UNKNOWN_CONFIG_ERROR',
} as const;

export type ConfigErrorCode = typeof ConfigErrorCodes[keyof typeof ConfigErrorCodes];

export class ConfigException extends BaseException {
  constructor(
    code: ConfigErrorCode,
    message: string,
    details?: Record<string, unknown>,
    cause?: Error
  ) {
    super(code as ErrorCode, message, details, cause);
    this.name = 'ConfigException';
  }
}