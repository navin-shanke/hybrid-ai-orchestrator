# Next Actions Queue (NEXT_ACTIONS.md)

*This file outlines the upcoming execution queue. It shows next sprints and batches in order of dependencies. Do not execute these tasks until CURRENT_SPRINT.md is marked 100% Completed and Approved.*

---

## 1. Upcoming Sprint Queue

### Queue Position 1: Event Bus Module (Seq 3)
* **Sprint Phase**: Phase 1-10 (Contracts, Services, Output Adapters)
* **Target Batch**: Batch 1
* **Tasks**:
  1. Create Event Bus interface `IEventBus.ts`.
  2. Define Event Envelope and Event Catalog.
  3. Implement In-Memory Event Bus `InMemoryEventBus.ts`.
  4. Implement Console Event Adapter for logging.
  5. Build Event Bus unit tests.

---

## 2. Dependencies Resolved
- ✅ Shared Kernel (Entity, ValueObject, Result, BaseException, ErrorCodes, DateTime, Validation)
- ✅ Configuration Manager Batch 1 (Contracts, Domain, Adapters)
- ✅ Configuration Manager Batch 2 (Services, Hot-reload, Tests, Integration)
- ✅ Logger Module Batch 1 (Contracts, Services, Adapters, Tests)

---

## 3. Blockers
None