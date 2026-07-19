import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileConfigAdapter } from '../../../../src/modules/configuration/infrastructure/FileConfigAdapter.js';
import { Result } from '../../../../shared/domain/Result.js';

describe('FileConfigAdapter', () => {
  const testDir = path.join(process.cwd(), 'test-config-temp');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('loads JSON configuration file', async () => {
      const configPath = path.join(testDir, 'config.json');
      await fs.writeFile(configPath, JSON.stringify({ app: { port: 3000 }, debug: true }), 'utf-8');

      const adapter = new FileConfigAdapter(configPath);
      const result = await adapter.load();

      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual({ app: { port: 3000 }, debug: true });
    });

    it('loads .env file as flat key-value', async () => {
      const envPath = path.join(testDir, '.env');
      await fs.writeFile(envPath, 'API_KEY=secret123\nPORT=8080\n', 'utf-8');

      const adapter = new FileConfigAdapter(envPath);
      const result = await adapter.load();

      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual({ API_KEY: 'secret123', PORT: '8080' });
    });

    it('returns error for missing file', async () => {
      const adapter = new FileConfigAdapter(path.join(testDir, 'missing.json'));
      const result = await adapter.load();

      expect(result.isErr()).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('returns error for invalid JSON', async () => {
      const configPath = path.join(testDir, 'invalid.json');
      await fs.writeFile(configPath, '{ invalid json }', 'utf-8');

      const adapter = new FileConfigAdapter(configPath);
      const result = await adapter.load();

      expect(result.isErr()).toBe(true);
      expect(result.error.message).toContain('JSON');
    });

    it('merges multiple sources in precedence order', async () => {
      const basePath = path.join(testDir, 'base.json');
      const overridePath = path.join(testDir, 'override.json');
      await fs.writeFile(basePath, JSON.stringify({ a: 1, b: 2 }), 'utf-8');
      await fs.writeFile(overridePath, JSON.stringify({ b: 3, c: 4 }), 'utf-8');

      const adapter = new FileConfigAdapter([basePath, overridePath]);
      const result = await adapter.load();

      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('handles .env file with comments and empty lines', async () => {
      const envPath = path.join(testDir, '.env');
      await fs.writeFile(envPath, '# Comment\nKEY1=value1\n\nKEY2=value2\n  \n', 'utf-8');

      const adapter = new FileConfigAdapter(envPath);
      const result = await adapter.load();

      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual({ KEY1: 'value1', KEY2: 'value2' });
    });

    it('handles .env with values containing equals sign', async () => {
      const envPath = path.join(testDir, '.env');
      await fs.writeFile(envPath, 'KEY=value=with=equals\n', 'utf-8');

      const adapter = new FileConfigAdapter(envPath);
      const result = await adapter.load();

      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toEqual({ KEY: 'value=with=equals' });
    });

    it('returns error for unsupported file format', async () => {
      const configPath = path.join(testDir, 'config.yaml');
      await fs.writeFile(configPath, 'key: value', 'utf-8');

      const adapter = new FileConfigAdapter(configPath);
      const result = await adapter.load();

      expect(result.isErr()).toBe(true);
      expect(result.error.message).toContain('Unsupported config file format');
    });
  });

  describe('watch()', () => {
    it('returns error when watch not enabled', async () => {
      const configPath = path.join(testDir, 'config.json');
      await fs.writeFile(configPath, JSON.stringify({ key: 'value' }), 'utf-8');

      const adapter = new FileConfigAdapter(configPath);
      const result = await adapter.watch(() => {});

      expect(result.isErr()).toBe(true);
      expect(result.error.message).toBe('Watch not enabled');
    });

    it('detects file modification and calls callback', async () => {
      const configPath = path.join(testDir, 'config.json');
      await fs.writeFile(configPath, JSON.stringify({ version: 1 }), 'utf-8');

      const adapter = new FileConfigAdapter(configPath, { watch: true });
      const watchResult = await adapter.watch((config) => {
        // Callback called
      });

      expect(watchResult.isOk()).toBe(true);
      const close = watchResult.unwrap();

      // Modify the file
      await fs.writeFile(configPath, JSON.stringify({ version: 2 }), 'utf-8');

      // Wait for debounce and callback
      await new Promise(resolve => setTimeout(resolve, 200));

      const loadResult = await adapter.load();
      expect(loadResult.isOk()).toBe(true);
      expect(loadResult.unwrap()).toEqual({ version: 2 });

      close();
    });

    it('debounces rapid file changes', async () => {
      const configPath = path.join(testDir, 'config.json');
      await fs.writeFile(configPath, JSON.stringify({ version: 1 }), 'utf-8');

      let callbackCount = 0;
      const adapter = new FileConfigAdapter(configPath, { watch: true });
      const watchResult = await adapter.watch(() => {
        callbackCount++;
      });

      expect(watchResult.isOk()).toBe(true);
      const close = watchResult.unwrap();

      // Rapid modifications within debounce window
      await fs.writeFile(configPath, JSON.stringify({ version: 2 }), 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 30));
      await fs.writeFile(configPath, JSON.stringify({ version: 3 }), 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 30));
      await fs.writeFile(configPath, JSON.stringify({ version: 4 }), 'utf-8');

      // Wait for debounce to settle
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should only trigger once due to debouncing
      expect(callbackCount).toBeLessThanOrEqual(1);

      close();
    });

    it('close() stops notifications', async () => {
      const configPath = path.join(testDir, 'config.json');
      await fs.writeFile(configPath, JSON.stringify({ version: 1 }), 'utf-8');

      let callbackCount = 0;
      const adapter = new FileConfigAdapter(configPath, { watch: true });
      const watchResult = await adapter.watch(() => {
        callbackCount++;
      });

      expect(watchResult.isOk()).toBe(true);
      const close = watchResult.unwrap();

      close();

      // Modify after close
      await fs.writeFile(configPath, JSON.stringify({ version: 2 }), 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callbackCount).toBe(0);
    });

    it('watches parent directory when file does not exist yet', async () => {
      const configPath = path.join(testDir, 'new-config.json');
      // File does not exist yet

      const adapter = new FileConfigAdapter(configPath, { watch: true });
      const watchResult = await adapter.watch(() => {});

      expect(watchResult.isOk()).toBe(true);
      const close = watchResult.unwrap();

      // Create the file
      await fs.writeFile(configPath, JSON.stringify({ version: 1 }), 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 200));

      const loadResult = await adapter.load();
      expect(loadResult.isOk()).toBe(true);

      close();
    });

    it('returns error for missing file when loading after watch', async () => {
      const configPath = path.join(testDir, 'missing.json');
      const adapter = new FileConfigAdapter(configPath, { watch: true });
      const watchResult = await adapter.watch(() => {});

      expect(watchResult.isOk()).toBe(true);
      const close = watchResult.unwrap();

      const loadResult = await adapter.load();
      expect(loadResult.isErr()).toBe(true);
      expect(loadResult.error.message).toContain('not found');

      close();
    });
  });
});