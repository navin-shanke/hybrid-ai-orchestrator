import { LogLevel } from '../domain/LogLevels.js';

export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>, error?: Error): void;

  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  child(bindings: Record<string, unknown>): ILogger;
}