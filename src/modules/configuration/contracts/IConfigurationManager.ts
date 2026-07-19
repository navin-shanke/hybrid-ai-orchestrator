import { Result } from '../../../../shared/domain/Result.js';

export interface ConfigurationSnapshot {
  version: number;
  timestamp: Date;
  values: Record<string, unknown>;
}

export interface ConfigurationContext {
  namespace?: string;
  tenant?: string;
  project?: string;
}

export interface IConfigurationManager {
  /**
   * Loads and validates all configuration sources at startup.
   * Must be called once before any other method.
   */
  loadConfiguration(): Promise<Result<ConfigurationSnapshot, Error>>;

  /**
   * Reloads configuration from sources (hot reload).
   */
  reloadConfiguration(): Promise<Result<ConfigurationSnapshot, Error>>;

  /**
   * Gets resolved configuration for a namespace.
   */
  getConfiguration(namespace: string, context?: ConfigurationContext): Promise<Result<Record<string, unknown>, Error>>;

  /**
   * Gets a specific configuration snapshot by version.
   */
  getSnapshot(version?: number): Promise<Result<ConfigurationSnapshot, Error>>;

  /**
   * Gets metadata about the currently active version.
   */
  getVersion(): Promise<Result<{ version: number; activatedAt: Date }, Error>>;

  /**
   * Gets resolved configuration for a specific namespace with full context resolution.
   */
  resolveConfiguration(namespace: string, context: ConfigurationContext): Promise<Result<Record<string, unknown>, Error>>;

  /**
   * Validates a candidate configuration without activating it.
   */
  validate(candidateConfig: Record<string, unknown>): Promise<Result<{ valid: boolean; errors: string[] }, Error>>;

  /**
   * Applies a targeted configuration change.
   */
  applyOverrides(changeSet: Record<string, unknown>, requestedBy: string): Promise<Result<ConfigurationSnapshot, Error>>;

  /**
   * Registers a consumer for hot-reload notifications.
   */
  registerConsumer(consumerId: string, namespaces: string[]): Promise<Result<void, Error>>;

  /**
   * Subscribes to configuration change events.
   */
  subscribe(consumerId: string, callback: (snapshot: ConfigurationSnapshot) => void): Promise<Result<void, Error>>;

  /**
   * Rolls back to a previous configuration version.
   */
  rollbackConfiguration(targetVersion: number): Promise<Result<ConfigurationSnapshot, Error>>;

  /**
   * Refreshes configuration (bypasses client-side cache).
   */
  refresh(namespaces?: string[]): Promise<Result<Record<string, unknown>, Error>>;
}