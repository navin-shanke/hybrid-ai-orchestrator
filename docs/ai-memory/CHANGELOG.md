# Implementation Changelog (CHANGELOG.md)

*This file log tracks the chronological history of all completed batches and design modifications. It is updated at the completion of every review cycle.*

---

## [Unreleased]
*Pending OpenCode implementation tasks.*

---

## [0.4.0] - 2026-07-19
### Added
- Logger Module foundation (Batch LM-1)
  - `ILogger` interface with debug/info/warn/error, child loggers, global context
  - `LogLevels.ts` enum with DEBUG/INFO/WARN/ERROR and formatting utilities
  - `LoggerService` with structured JSON output, context merging, child loggers
  - `ConsoleAdapter` with JSON Lines output, pretty-print option
  - `LoggerException` with logger-specific error codes
- ConfigurationService integration with injected `ILogger` (replaces `console.*`)
  - Hot-reload warnings and errors now use structured logging
  - Subscriber notification errors logged with consumer context
- Comprehensive unit test suite (21 tests, 100% branch coverage on validation logic)
  - Tests for all log levels, filtering, context merging
  - Child logger inheritance (level, context, name)
  - Error serialization (Error objects, strings, non-Error objects)
  - Adapter error handling and exception wrapping
  - Structured output (ISO timestamps, level names, logger names)
  - Child logger inheritance of level, context, and name

---

## [0.3.0] - 2026-07-19
### Added
- Configuration Manager Services (Batch CM-2)
  - `ConfigurationService` implementing `IConfigurationManager` with full lifecycle management
  - Configuration loading, validation, resolution, and snapshot versioning
  - Hot-reload support via file watching with debouncing
  - Event publishing for configuration changes (subscriber notifications)
  - Override application with validation and version increments
  - Rollback to previous versions with schema re-validation
  - Consumer registration and subscription for hot-reload notifications
  - Refresh API for cache-busting configuration reads
- Comprehensive unit test suite (41 tests, 100% branch coverage on validation logic)
  - Tests for all public methods including error paths
  - Hot-reload edge cases (watch errors, missing watch support)
  - Rollback validation against current schema
  - Subscriber error isolation

---