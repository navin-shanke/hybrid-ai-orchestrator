import { ILogger } from '@src/modules/logger/contracts/ILogger.js';

export function createNoopLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    setLevel: () => {},
    getLevel: () => 1,
    child: () => createNoopLogger(),
  };
}