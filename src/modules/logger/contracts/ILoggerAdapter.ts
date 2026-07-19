import { LogLevel } from '../domain/LogLevels.js';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  loggerName?: string;
}

export interface ILoggerAdapter {
  write(entry: LogEntry): void;
}