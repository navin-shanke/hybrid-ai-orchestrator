import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { Result, ok, err } from '../../../../shared/domain/Result.js';
import { IConfigurationAdapter } from '../contracts/IConfigurationAdapter.js';

export interface FileConfigAdapterOptions {
  watch?: boolean;
}

export class FileConfigAdapter implements IConfigurationAdapter {
  private readonly sources: string[];
  private readonly options: FileConfigAdapterOptions;
  private watchers: fs.FSWatcher[] = [];

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

  async watch(callback: (config: Record<string, unknown>) => void): Promise<Result<() => void, Error>> {
    if (!this.options.watch) {
      return Promise.resolve(err(new Error('Watch not enabled')));
    }

    const debounceTimers = new Map<string, NodeJS.Timeout>();

    const handleChange = (sourcePath: string) => {
      // Debounce rapid changes
      if (debounceTimers.has(sourcePath)) {
        const timer = debounceTimers.get(sourcePath);
        if (timer) clearTimeout(timer);
      }
      debounceTimers.set(sourcePath, setTimeout(() => {
        void this.load().then((result) => {
          if (result.isOk()) {
            callback(result.unwrap());
          }
        });
      }, 100));
    };

    for (const source of this.sources) {
      try {
        await fsPromises.access(source);
        const watcher = fs.watch(source, { persistent: false }, (eventType) => {
          if (eventType === 'change') {
            handleChange(source);
          }
        });
        this.watchers.push(watcher);
      } catch {
        // File doesn't exist yet, watch parent directory
        const dir = path.dirname(source);
        const watcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
          if (filename && path.resolve(dir, filename) === source && eventType === 'change') {
            handleChange(source);
          }
        });
        this.watchers.push(watcher);
      }
    }

    const close = () => {
      for (const watcher of this.watchers) {
        watcher.close();
      }
      this.watchers = [];
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();
    };

    return ok(close);
  }

  private async loadSingle(source: string): Promise<Result<Record<string, unknown>, Error>> {
    try {
      const ext = path.extname(source).toLowerCase();
      const content = await fsPromises.readFile(source, 'utf-8');

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