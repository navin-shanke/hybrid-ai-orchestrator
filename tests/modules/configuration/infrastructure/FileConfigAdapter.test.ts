import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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