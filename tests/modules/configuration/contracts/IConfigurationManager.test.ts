import { describe, it, expect } from 'vitest';
import type { IConfigurationManager, ConfigurationSnapshot, ConfigurationContext } from '../../../../src/modules/configuration/contracts/IConfigurationManager';

describe('IConfigurationManager', () => {
  it('defines the required interface shape - compiles correctly', () => {
    // This test ensures the interface exists and has the expected methods
    // The actual implementation will be tested via ConfigurationService
    // Type checking at compile time verifies the interface structure
    const _checkInterface: IConfigurationManager = null as unknown as IConfigurationManager;
    expect(_checkInterface).toBeNull();
  });

  it('has ConfigurationSnapshot type with version, timestamp, values', () => {
    const snapshot: ConfigurationSnapshot = {
      version: 1,
      timestamp: new Date(),
      values: { test: 'value' }
    };
    expect(snapshot.version).toBe(1);
    expect(snapshot.timestamp).toBeInstanceOf(Date);
    expect(snapshot.values.test).toBe('value');
  });

  it('has ConfigurationContext type with optional namespace, tenant, project', () => {
    const context: ConfigurationContext = {
      namespace: 'system',
      tenant: 'tenant1',
      project: 'project1'
    };
    expect(context.namespace).toBe('system');
    expect(context.tenant).toBe('tenant1');
    expect(context.project).toBe('project1');
  });

  it('allows partial ConfigurationContext', () => {
    const context: ConfigurationContext = {};
    expect(context.namespace).toBeUndefined();
    expect(context.tenant).toBeUndefined();
    expect(context.project).toBeUndefined();
  });
});