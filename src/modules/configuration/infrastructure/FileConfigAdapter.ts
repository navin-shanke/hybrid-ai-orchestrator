import * as fs from 'fs/promises';
import * as path from 'path';
import { Result, ok, err } from '../../../../shared/domain/Result.js';
import { IConfigurationAdapter } from '../contracts/IConfigurationAdapter.js';

export interface FileConfigAdapterOptions {
  watch?: boolean;
}

export class FileConfigAdapter implements IConfigurationAdapter {
  private readonly sources: string[];
  private readonly options: FileConfigAdapterOptions;

  constructor(source: string | string[], options: FileConfigAdapterOptions = {}) {
    this.sources = Array.isArray(source) ? source : [source];
    this.options = options;
  }

  async load(): Promise<Result<Record<string, unknown>, Error>> {
    const merged: Record<string, unknown> = {};

    for (const source of this.sources) {
      const result = await this.loadSingle(source);
      if (result.isErr()) {
        return err(result.error);
      }
      Object.assign(merged, result.unwrap());
    }

    return ok(merged);
  }

  watch(_callback: (config: Record<string, unknown>) => void): Promise<Result<() => void, Error>> {
    if (!this.options.watch) {
      return Promise.resolve(err(new Error('Watch not enabled')));
    }

    // Simple implementation - not fully tested, returns error for now
    return Promise.resolve(err(new Error('Watch not fully implemented')));
  }

  private async loadSingle(source: string): Promise<Result<Record<string, unknown>, Error>> {
    try {
      const ext = path.extname(source).toLowerCase();
      const content = await fs.readFile(source, 'utf-8');

      if (ext === '.json') {
        return ok(JSON.parse(content));
      } else if (ext === '.env' || path.basename(source) === '.env') {
        return ok(this.parseEnv(content));
      } else {
        return err(new Error(`Unsupported config file format: ${ext}`));
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return err(new Error(`Configuration file not found: ${source}`));
      }
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private parseEnv(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        result[key] = value;
      }
    }
    return result;
  }
}