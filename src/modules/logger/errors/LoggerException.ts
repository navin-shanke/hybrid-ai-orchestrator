import { BaseException } from '../../../../shared/exceptions/BaseException.js';
import { ErrorCode } from '../../../../shared/exceptions/ErrorCodes.js';

export const LoggerErrorCodes = {
  LOGGER_ADAPTER_UNAVAILABLE: 'LOGGER_ADAPTER_UNAVAILABLE',
  LOGGER_INVALID_LEVEL: 'LOGGER_INVALID_LEVEL',
  LOGGER_SERIALIZATION_FAILED: 'LOGGER_SERIALIZATION_FAILED',
  LOGGER_ADAPTER_WRITE_FAILED: 'LOGGER_ADAPTER_WRITE_FAILED',
  LOGGER_CONFIGURATION_INVALID: 'LOGGER_CONFIGURATION_INVALID',
} as const;

export type LoggerErrorCode = typeof LoggerErrorCodes[keyof typeof LoggerErrorCodes];

export class LoggerException extends BaseException {
  constructor(
    code: LoggerErrorCode,
    message: string,
    details?: Record<string, unknown>,
    cause?: Error
  ) {
    super(code as ErrorCode, message, details, cause);
    this.name = 'LoggerException';
  }
}