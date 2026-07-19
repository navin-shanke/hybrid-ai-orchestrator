import { Result, ok, err } from '../../../../shared/domain/Result.js';
import { IConfigurationManager, ConfigurationSnapshot, ConfigurationContext } from '../contracts/IConfigurationManager.js';
import { IConfigurationAdapter } from '../contracts/IConfigurationAdapter.js';
import { ConfigValidator } from '../domain/ConfigValidator.js';
import { ConfigException, ConfigErrorCodes } from '../errors/ConfigException.js';
import { FileConfigAdapter } from '../infrastructure/FileConfigAdapter.js';

interface EventSubscription {
  consumerId: string;
  callback: (snapshot: ConfigurationSnapshot) => void;
  namespaces: string[];
}

export class ConfigurationService implements IConfigurationManager {
  private readonly adapter: IConfigurationAdapter;
  private readonly validator: ConfigValidator;
  private currentSnapshot: ConfigurationSnapshot | null = null;
  private readonly snapshotHistory: Map<number, ConfigurationSnapshot> = new Map();
  private versionCounter = 0;
  private readonly subscriptions: Map<string, EventSubscription> = new Map();
  private isLoaded = false;
  private isReloading = false;

  constructor(adapter?: IConfigurationAdapter) {
    this.adapter = adapter ?? new FileConfigAdapter(['config/default.json', 'config/local.json'], { watch: true });
    this.validator = new ConfigValidator();
  }

  async loadConfiguration(): Promise<Result<ConfigurationSnapshot, Error>> {
    if (this.isLoaded) {
      return err(new ConfigException(ConfigErrorCodes.CONFIG_VALIDATION_FAILED, 'Configuration already loaded'));
    }

    const loadResult = await this.adapter.load();
    if (loadResult.isErr()) {
      return err(new ConfigException(ConfigErrorCodes.CONFIG_SOURCE_UNAVAILABLE, 'Failed to load configuration', undefined, loadResult.error));
    }

    const validateResult = this.validator.validate(loadResult.unwrap());
    if (validateResult.isErr()) {
      return err(new ConfigException(ConfigErrorCodes.CONFIG_VALIDATION_FAILED, 'Configuration validation failed', { errors: validateResult.error.message }));
    }

    const resolvedConfig = this.resolveConfig(loadResult.unwrap());
    this.versionCounter++;
    const snapshot: ConfigurationSnapshot = {
      version: this.versionCounter,
      timestamp: new Date(),
      values: resolvedConfig,
    };

    this.currentSnapshot = snapshot;
    this.snapshotHistory.set(this.versionCounter, snapshot);
    this.isLoaded = true;

    await this.setupHotReload();

    this.notifySubscribers(snapshot);
    return ok(snapshot);
  }

  async reloadConfiguration(): Promise<Result<ConfigurationSnapshot, Error>> {
    if (this.isReloading) {
      return err(new ConfigException(ConfigErrorCodes.CONFIG_HOT_RELOAD_FAILED, 'Reload already in progress'));
    }
    this.isReloading = true;

    try {
      const loadResult = await this.adapter.load();
      if (loadResult.isErr()) {
        return err(new ConfigException(ConfigErrorCodes.CONFIG_SOURCE_UNAVAILABLE, 'Failed to load configuration', undefined, loadResult.error));
      }

      const validateResult = this.validator.validate(loadResult.unwrap());
      if (validateResult.isErr()) {
        return err(new ConfigException(ConfigErrorCodes.CONFIG_VALIDATION_FAILED, 'Configuration validation failed', { errors: validateResult.error.message }));
      }

      const resolvedConfig = this.resolveConfig(loadResult.unwrap());

      if (this.currentSnapshot && JSON.stringify(this.currentSnapshot.values) === JSON.stringify(resolvedConfig)) {
        this.isReloading = false;
        return ok(this.currentSnapshot);
      }

      this.versionCounter++;
      const snapshot: ConfigurationSnapshot = {
        version: this.versionCounter,
        timestamp: new Date(),
        values: resolvedConfig,
      };

      this.currentSnapshot = snapshot;
      this.snapshotHistory.set(this.versionCounter, snapshot);

      this.notifySubscribers(snapshot);
      this.isReloading = false;
      return ok(snapshot);
    } catch (error) {
      this.isReloading = false;
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  getConfiguration(namespace: string, context?: ConfigurationContext): Promise<Result<Record<string, unknown>, Error>> {
    if (!this.currentSnapshot) {
      return Promise.resolve(err(new ConfigException(ConfigErrorCodes.CONFIG_NOT_FOUND, 'Configuration not loaded')));
    }

    const resolved = this.resolveForNamespace(this.currentSnapshot.values, namespace, context);
    return Promise.resolve(ok(resolved));
  }

  getSnapshot(version?: number): Promise<Result<ConfigurationSnapshot, Error>> {
    if (!this.currentSnapshot) {
      return Promise.resolve(err(new ConfigException(ConfigErrorCodes.CONFIG_NOT_FOUND, 'Configuration not loaded')));
    }

    if (version === undefined) {
      return Promise.resolve(ok(this.currentSnapshot));
    }

    const snapshot = this.snapshotHistory.get(version);
    if (!snapshot) {
      return Promise.resolve(err(new ConfigException(ConfigErrorCodes.CONFIG_VERSION_NOT_FOUND, `Version ${version} not found`)));
    }

    return Promise.resolve(ok(snapshot));
  }

  getVersion(): Promise<Result<{ version: number; activatedAt: Date }, Error>> {
    if (!this.currentSnapshot) {
      return Promise.resolve(err(new ConfigException(ConfigErrorCodes.CONFIG_NOT_FOUND, 'Configuration not loaded')));
    }
    return Promise.resolve(ok({ version: this.currentSnapshot.version, activatedAt: this.currentSnapshot.timestamp }));
  }

  resolveConfiguration(namespace: string, context: ConfigurationContext): Promise<Result<Record<string, unknown>, Error>> {
    return this.getConfiguration(namespace, context);
  }

  validate(candidateConfig: Record<string, unknown>): Promise<Result<{ valid: boolean; errors: string[] }, Error>> {
    const result = this.validator.validate(candidateConfig);
    if (result.isOk()) {
      return Promise.resolve(ok({ valid: true, errors: [] }));
    }
    return Promise.resolve(ok({ valid: false, errors: [result.error.message] }));
  }

  applyOverrides(changeSet: Record<string, unknown>, _requestedBy: string): Promise<Result<ConfigurationSnapshot, Error>> {
    if (!this.currentSnapshot) {
      return Promise.resolve(err(new ConfigException(ConfigErrorCodes.CONFIG_NOT_FOUND, 'Configuration not loaded')));
    }

    const merged = { ...this.currentSnapshot.values, ...changeSet };
    const validateResult = this.validator.validate(merged);
    if (validateResult.isErr()) {
      return Promise.resolve(err(new ConfigException(ConfigErrorCodes.CONFIG_VALIDATION_FAILED, 'Override validation failed', { errors: validateResult.error.message })));
    }

    const resolvedConfig = this.resolveConfig(merged);
    this.versionCounter++;
    const snapshot: ConfigurationSnapshot = {
      version: this.versionCounter,
      timestamp: new Date(),
      values: resolvedConfig,
    };

    this.currentSnapshot = snapshot;
    this.snapshotHistory.set(this.versionCounter, snapshot);

    this.notifySubscribers(snapshot);
    return Promise.resolve(ok(snapshot));
  }

  registerConsumer(consumerId: string, namespaces: string[]): Promise<Result<void, Error>> {
    const existing = this.subscriptions.get(consumerId);
    if (existing) {
      existing.namespaces = namespaces;
      return Promise.resolve(ok(undefined));
    }
    this.subscriptions.set(consumerId, { consumerId, namespaces, callback: () => {} });
    return Promise.resolve(ok(undefined));
  }

  subscribe(consumerId: string, callback: (snapshot: ConfigurationSnapshot) => void): Promise<Result<void, Error>> {
    const subscription = this.subscriptions.get(consumerId);
    if (!subscription) {
      return Promise.resolve(err(new ConfigException(ConfigErrorCodes.CONFIG_SOURCE_UNAVAILABLE, `Consumer ${consumerId} not registered`)));
    }
    subscription.callback = callback;
    return Promise.resolve(ok(undefined));
  }

  rollbackConfiguration(targetVersion: number): Promise<Result<ConfigurationSnapshot, Error>> {
    const snapshot = this.snapshotHistory.get(targetVersion);
    if (!snapshot) {
      return Promise.resolve(err(new ConfigException(ConfigErrorCodes.CONFIG_VERSION_NOT_FOUND, `Version ${targetVersion} not found`)));
    }

    const validateResult = this.validator.validate(snapshot.values);
    if (validateResult.isErr()) {
      return Promise.resolve(err(new ConfigException(ConfigErrorCodes.CONFIG_VALIDATION_FAILED, 'Rollback target validation failed', { errors: validateResult.error.message })));
    }

    this.versionCounter++;
    const newSnapshot: ConfigurationSnapshot = {
      version: this.versionCounter,
      timestamp: new Date(),
      values: snapshot.values,
    };

    this.currentSnapshot = newSnapshot;
    this.snapshotHistory.set(this.versionCounter, newSnapshot);

    this.notifySubscribers(newSnapshot);
    return Promise.resolve(ok(newSnapshot));
  }

  refresh(namespaces?: string[]): Promise<Result<Record<string, unknown>, Error>> {
    if (!this.currentSnapshot) {
      return Promise.resolve(err(new ConfigException(ConfigErrorCodes.CONFIG_NOT_FOUND, 'Configuration not loaded')));
    }

    if (namespaces && namespaces.length > 0) {
      const merged: Record<string, unknown> = {};
      for (const ns of namespaces) {
        const resolved = this.resolveForNamespace(this.currentSnapshot.values, ns);
        Object.assign(merged, resolved);
      }
      return Promise.resolve(ok(merged));
    }

    return Promise.resolve(ok(this.currentSnapshot.values));
  }

  private async setupHotReload(): Promise<void> {
    if (!this.adapter.watch) {
      console.warn('Hot reload not supported by adapter');
      return;
    }

    const watchResult = await this.adapter.watch((_config) => {
      void this.reloadConfiguration();
    });

    if (watchResult.isErr()) {
      console.warn('Hot reload setup failed:', watchResult.error.message);
    }
  }

  private resolveConfig(config: Record<string, unknown>): Record<string, unknown> {
    return config;
  }

  private resolveForNamespace(config: Record<string, unknown>, namespace: string, _context?: ConfigurationContext): Record<string, unknown> {
    const parts = namespace.split('.');
    let current: unknown = config;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return {};
      }
    }
    return (current as Record<string, unknown>) ?? {};
  }

  private notifySubscribers(snapshot: ConfigurationSnapshot): void {
    for (const subscription of this.subscriptions.values()) {
      try {
        subscription.callback(snapshot);
      } catch (error) {
        console.error(`Failed to notify subscriber ${subscription.consumerId}:`, error);
      }
    }
  }
}