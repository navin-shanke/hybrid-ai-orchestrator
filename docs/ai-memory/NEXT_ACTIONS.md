# Next Actions Queue (NEXT_ACTIONS.md)

*This file outlines the upcoming execution queue. It shows next sprints and batches in order of dependencies. Do not execute these tasks until CURRENT_SPRINT.md is marked 100% Completed and Approved.*

---

## 1. Upcoming Sprint Queue

### Queue Position 1: Configuration Manager (Seq 1)
* **Sprint Phase**: Phase 1-4 (Contracts, Domain, Adapters)
* **Target Batch**: Batch 1
* **Tasks**:
  1. CM-1.1: Create IConfigurationManager.ts interface
  2. CM-1.2: Create ConfigRules.ts validation logic
  3. CM-1.3: Create ConfigException.ts extending BaseException
  4. CM-1.4: Create FileConfigAdapter.ts reading JSON/.env
  5. CM-1.5: Create ConfigValidator.ts with JSON Schema validation

---

### Queue Position 2: Configuration Manager (Seq 1)
* **Sprint Phase**: Phase 5-10 (Services, Events, Tests)
* **Target Batch**: Batch 2
* **Tasks**:
  1. Implement Configuration Service (`services/ConfigurationService.ts`).
  2. Integrate configuration reloading logic and bind events.
  3. Create configuration unit tests (`tests/Configuration.test.ts`).
  4. Perform integration checks.
  5. Update living memory documentation.

---

### Queue Position 3: Logger Module (Seq 2)
* **Sprint Phase**: Phase 1-10 (Contracts, Services, Output Adapters)
* **Target Batch**: Batch 1
* **Tasks**:
  1. Create Logger interface `ILogger.ts`.
  2. Define Logger levels and standard payload models.
  3. Implement Logger service formatting outputs.
  4. Implement console outputs writer in adapters.
  5. Build Logger unit tests.

---

## 2. Dependencies Resolved
- ✅ Shared Kernel (Entity, ValueObject, Result, BaseException, ErrorCodes, DateTime, Validation)

---

## 3. Blockers
None