export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

export function parseLogLevel(value: string): LogLevel {
  const upper = value.toUpperCase();
  for (const [level, name] of Object.entries(LOG_LEVEL_NAMES)) {
    if (name === upper) {
      return parseInt(level, 10);
    }
  }
  return LogLevel.INFO;
}

export function formatLogLevel(level: LogLevel): string {
  return LOG_LEVEL_NAMES[level] ?? 'UNKNOWN';
}

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