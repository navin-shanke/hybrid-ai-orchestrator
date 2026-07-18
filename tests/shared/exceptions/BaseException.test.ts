import { BaseException } from '../../../shared/exceptions/BaseException';
import { ErrorCodes } from '../../../shared/exceptions/ErrorCodes';

describe('BaseException', () => {
  it('creates exception with code and message', () => {
    const err = new BaseException(ErrorCodes.CONFIG_INVALID, 'Invalid config');
    expect(err.code).toBe(ErrorCodes.CONFIG_INVALID);
    expect(err.message).toBe('Invalid config');
    expect(err.name).toBe('BaseException');
  });

  it('captures stack trace', () => {
    const err = new BaseException(ErrorCodes.UNKNOWN, 'test');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('BaseException');
  });

  it('serializes to JSON', () => {
    const err = new BaseException(ErrorCodes.VALIDATION_FAILED, 'bad input', { field: 'email' });
    const json = err.toJSON();
    expect(json).toEqual({
      name: 'BaseException',
      code: ErrorCodes.VALIDATION_FAILED,
      message: 'bad input',
      details: { field: 'email' },
      stack: expect.any(String)
    });
  });

  it('supports error chaining with cause', () => {
    const cause = new Error('root cause');
    const err = new BaseException(ErrorCodes.PROVIDER_TIMEOUT, 'timeout', undefined, cause);
    expect(err.cause).toBe(cause);
  });

  it('is instanceof Error', () => {
    const err = new BaseException(ErrorCodes.UNKNOWN, 'test');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof BaseException).toBe(true);
  });
});

describe('ErrorCodes', () => {
  it('contains all required error codes', () => {
    expect(ErrorCodes.CONFIG_INVALID).toBe('CONFIG_INVALID');
    expect(ErrorCodes.CONFIG_NOT_FOUND).toBe('CONFIG_NOT_FOUND');
    expect(ErrorCodes.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(ErrorCodes.PROVIDER_UNAVAILABLE).toBe('PROVIDER_UNAVAILABLE');
    expect(ErrorCodes.PROVIDER_TIMEOUT).toBe('PROVIDER_TIMEOUT');
    expect(ErrorCodes.PROVIDER_AUTH_FAILED).toBe('PROVIDER_AUTH_FAILED');
    expect(ErrorCodes.MODEL_NOT_FOUND).toBe('MODEL_NOT_FOUND');
    expect(ErrorCodes.MODEL_CAPABILITY_MISMATCH).toBe('MODEL_CAPABILITY_MISMATCH');
    expect(ErrorCodes.TASK_QUEUE_FULL).toBe('TASK_QUEUE_FULL');
    expect(ErrorCodes.MEMORY_LOAD_FAILED).toBe('MEMORY_LOAD_FAILED');
    expect(ErrorCodes.KNOWLEDGE_RETRIEVAL_FAILED).toBe('KNOWLEDGE_RETRIEVAL_FAILED');
    expect(ErrorCodes.REVIEW_FAILED).toBe('REVIEW_FAILED');
    expect(ErrorCodes.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(ErrorCodes.BROWSER_AUTOMATION_FAILED).toBe('BROWSER_AUTOMATION_FAILED');
    expect(ErrorCodes.GIT_OPERATION_FAILED).toBe('GIT_OPERATION_FAILED');
    expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCodes.UNKNOWN).toBe('UNKNOWN');
  });
});