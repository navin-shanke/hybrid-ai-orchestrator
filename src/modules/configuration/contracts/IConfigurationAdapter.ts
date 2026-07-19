import { Result } from '../../../../shared/domain/Result.js';

export interface IConfigurationAdapter {
  load(): Promise<Result<Record<string, unknown>, Error>>;
  watch?(callback: (config: Record<string, unknown>) => void): Promise<Result<() => void, Error>>;
}