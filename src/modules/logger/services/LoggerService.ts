import { ILogger } from '../contracts/ILogger.js';
import { ILoggerAdapter } from '../contracts/ILoggerAdapter.js';
import { LogEntry, LogLevel, formatLogLevel } from '../domain/LogLevels.js';
import { LoggerException, LoggerErrorCodes } from '../errors/LoggerException.js';

interface LoggerBindings {
  [key: string]: unknown;
}

export class LoggerService implements ILogger {
  private readonly adapter: ILoggerAdapter;
  private level: LogLevel;
  private globalContext: Record<string, unknown> = {};
  private bindings: LoggerBindings = {};
  private name?: string;

  constructor(adapter: ILoggerAdapter, options: { level?: LogLevel; name?: string } = {}) {
    this.adapter = adapter;
    this.level = options.level ?? 1; // INFO
    this.name = options.name;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(0, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(1, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(2, message, context);
  }

  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(3, message, context, error);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  child(bindings: Record<string, unknown>): ILogger {
    const childLogger = new LoggerService(this.adapter, { level: this.level });
    childLogger.globalContext = { ...this.globalContext };
    childLogger.bindings = { ...this.bindings, ...bindings };
    childLogger.name = this.name;
    return childLogger;
  }

  setGlobalContext(context: Record<string, unknown>): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: unknown): void {
    if (level < this.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName: formatLogLevel(level),
      message,
      context: this.mergeContext(context),
    };

    if (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      entry.error = {
        name: errorObj.name,
        message: errorObj.message,
        stack: errorObj.stack,
      };
    }

    if (this.name) {
      entry.loggerName = this.name;
    }

    try {
      this.adapter.write(entry);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new LoggerException(
        LoggerErrorCodes.LOGGER_ADAPTER_WRITE_FAILED,
        'Failed to write log entry',
        { originalError: error.message },
        error
      );
    }
  }

  private mergeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
    const merged = { ...this.globalContext, ...this.bindings };
    if (context) {
      const mergedContext: Record<string, unknown> = { ...merged };
      Object.assign(mergedContext, context);
      return Object.keys(mergedContext).length > 0 ? mergedContext : undefined;
    }
    return Object.keys(merged).length > 0 ? merged : undefined;
  }
}