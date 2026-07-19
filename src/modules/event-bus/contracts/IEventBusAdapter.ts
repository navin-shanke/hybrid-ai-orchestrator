import { Event } from '../domain/entities/Event.js';
import { Result, ok, err } from '@shared/domain/Result.js';

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
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