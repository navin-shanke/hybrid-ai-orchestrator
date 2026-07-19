import { describe, it, expect, vi } from 'vitest';
import { LoggerService } from '@src/modules/logger/services/LoggerService.js';
import { ConsoleAdapter } from '@src/modules/logger/infrastructure/ConsoleAdapter.js';
import { ILoggerAdapter } from '@src/modules/logger/contracts/ILoggerAdapter.js';
import { LogLevel } from '@src/modules/logger/domain/LogLevels.js';

class MockAdapter implements ILoggerAdapter {
  public entries: Array<{ entry: unknown }> = [];

  write(entry: unknown): void {
    this.entries.push({ entry });
  }
}

describe('LoggerService', () => {
  let adapter: MockAdapter;
  let logger: LoggerService;

  beforeEach(() => {
    adapter = new MockAdapter();
    logger = new LoggerService(adapter, { level: LogLevel.DEBUG });
  });

  describe('log levels', () => {
    it('logs debug when level is DEBUG', () => {
      logger.debug('debug message');
      expect(adapter.entries).toHaveLength(1);
      expect(adapter.entries[0].entry).toMatchObject({
        level: LogLevel.DEBUG,
        levelName: 'DEBUG',
        message: 'debug message',
      });
    });

    it('does not log debug when level is INFO', () => {
      logger.setLevel(LogLevel.INFO);
      logger.debug('debug message');
      expect(adapter.entries).toHaveLength(0);
    });

    it('logs info when level is INFO', () => {
      logger.setLevel(LogLevel.INFO);
      logger.info('info message');
      expect(adapter.entries).toHaveLength(1);
      expect(adapter.entries[0].entry).toMatchObject({
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'info message',
      });
    });

    it('logs warn when level is WARN', () => {
      logger.setLevel(LogLevel.WARN);
      logger.warn('warn message');
      expect(adapter.entries).toHaveLength(1);
      expect(adapter.entries[0].entry).toMatchObject({
        level: LogLevel.WARN,
        levelName: 'WARN',
        message: 'warn message',
      });
    });

    it('logs error when level is ERROR', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.error('error message');
      expect(adapter.entries).toHaveLength(1);
      expect(adapter.entries[0].entry).toMatchObject({
        level: LogLevel.ERROR,
        levelName: 'ERROR',
        message: 'error message',
      });
    });

    it('always logs error regardless of level', () => {
      logger.setLevel(LogLevel.INFO);
      logger.error('error message');
      expect(adapter.entries).toHaveLength(1);
    });
  });

  describe('context', () => {
    it('includes context in log entry', () => {
      logger.info('test', { key: 'value' });
      expect(adapter.entries[0].entry).toMatchObject({
        context: { key: 'value' },
      });
    });

    it('merges global context', () => {
      logger.setGlobalContext({ requestId: '123' });
      logger.info('test');
      expect(adapter.entries[0].entry).toMatchObject({
        context: { requestId: '123' },
      });
    });

    it('merges child bindings', () => {
      const child = logger.child({ module: 'config' });
      child.info('test');
      expect(adapter.entries[0].entry).toMatchObject({
        context: { module: 'config' },
      });
    });

    it('merges global, child, and local context', () => {
      logger.setGlobalContext({ requestId: '123' });
      const child = logger.child({ module: 'config' });
      child.info('test', { action: 'load' });
      expect(adapter.entries[0].entry).toMatchObject({
        context: { requestId: '123', module: 'config', action: 'load' },
      });
    });
  });

  describe('error logging', () => {
    it('includes error details', () => {
      const err = new Error('test error');
      logger.error('failed', {}, err);
      expect(adapter.entries[0].entry).toMatchObject({
        error: {
          name: 'Error',
          message: 'test error',
          stack: err.stack,
        },
      });
    });

    it('handles non-Error objects', () => {
      logger.error('failed', {}, 'string error');
      expect(adapter.entries[0].entry).toMatchObject({
        error: {
          name: 'Error',
          message: 'string error',
        },
      });
    });
  });

  describe('child logger', () => {
    it('inherits level from parent', () => {
      logger.setLevel(LogLevel.WARN);
      const child = logger.child({ module: 'test' });
      child.debug('debug');
      expect(adapter.entries).toHaveLength(0);
      child.warn('warn');
      expect(adapter.entries).toHaveLength(1);
    });

    it('inherits global context', () => {
      logger.setGlobalContext({ requestId: '123' });
      const child = logger.child({ module: 'test' });
      child.info('test');
      expect(adapter.entries[0].entry).toMatchObject({
        context: { requestId: '123', module: 'test' },
      });
    });

    it('inherits name', () => {
      const parentAdapter = new MockAdapter();
      const parent = new LoggerService(parentAdapter, { name: 'parent', level: LogLevel.DEBUG });
      const child = parent.child({ module: 'child' });
      child.info('test');
      expect(parentAdapter.entries[0].entry).toMatchObject({
        loggerName: 'parent',
      });
    });
  });

  describe('setLevel', () => {
    it('changes log level dynamically', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('debug');
      expect(adapter.entries).toHaveLength(1);

      logger.setLevel(LogLevel.ERROR);
      adapter.entries = [];
      logger.debug('debug');
      expect(adapter.entries).toHaveLength(0);
    });

    it('getLevel returns current level', () => {
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
      logger.setLevel(LogLevel.WARN);
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });
  });

  describe('adapter errors', () => {
    it('throws LoggerException on adapter write failure', () => {
      const failingAdapter: ILoggerAdapter = {
        write: () => { throw new Error('write failed'); },
      };
      const failingLogger = new LoggerService(failingAdapter);
      expect(() => failingLogger.info('test')).toThrow();
    });
  });

  describe('structured output', () => {
    it('includes timestamp in ISO format', () => {
      logger.info('test');
      const entry = adapter.entries[0].entry;
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('includes level name', () => {
      logger.info('test');
      expect(adapter.entries[0].entry).toMatchObject({ levelName: 'INFO' });
    });

    it('includes logger name when set', () => {
      const namedAdapter = new MockAdapter();
      const namedLogger = new LoggerService(namedAdapter, { name: 'my-logger', level: LogLevel.DEBUG });
      namedLogger.info('test');
      expect(namedAdapter.entries[0].entry).toMatchObject({ loggerName: 'my-logger' });
    });
  });
});