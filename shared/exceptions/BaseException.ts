import { ErrorCode } from './ErrorCodes.js';

export class BaseException extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly cause?: Error;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>, cause?: Error) {
    super(message);
    this.name = 'BaseException';
    this.code = code;
    this.details = details;
    this.cause = cause;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BaseException);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }
}