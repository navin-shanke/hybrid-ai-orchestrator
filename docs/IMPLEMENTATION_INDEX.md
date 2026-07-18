# Master Implementation Index (IMPLEMENTATION_INDEX.md)

This index is the single entry point for all developers and AI agents (such as `OpenCode`). It defines the exact sequential implementation order of the modules, their phase and batch breakdowns, and the strict input/output rules for each batch.

---

## 1. Core Workflow Checklist for Every Batch
Before executing any work, the developer or AI agent **MUST** follow these steps in order:

```
Read docs/ai-memory/AI_CONTEXT.md
  ↓
Read docs/ai-memory/IMPLEMENTATION_RULES.md (No architectural decisions permitted)
  ↓
Identify Target Batch in CURRENT_SPRINT.md & NEXT_ACTIONS.md
  ↓
Read Target MDD + Related Interfaces in MODULE_BLUEPRINT.md
  ↓
Implement Code (Maximum 5 tasks)
  ↓
Run 10-step Review Pipeline (defined in AI_PLAYBOOK.md)
  ↓
Update docs/ai-memory/ files (Progress, sprint, actions, known issues, changelog)
  ↓
Commit and Request Approval
```

---

## 2. Implementation Sequence & Module Status

This table defines the chronological implementation roadmap. **No module may begin until all previous modules have passed Phase 10 (Review) and are marked "100% Completed".**

| Seq | Target Module | Design Doc Link | Status | Active Phase / Batch | Pre-Requisite Documents | Post-Commit Memory Files |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | **Shared Kernel** | [MODULE_BLUEPRINT.md](file:///e:/Projects/New%20folder/docs/MODULE_BLUEPRINT.md#1-shared-kernel-shared) | ⬜ Pending | Phase 1-10 / Batch 1 | PRD, SDD | Context, Progress, Changelog |
| 1 | **Configuration Manager** | [Configuration-Manager-MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Configuration-Manager-MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | Shared Kernel, Config MDD | Progress, Sprint, Changelog |
| 2 | **Logger** | [Logger-MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Logger-MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1 | Logger MDD | Progress, Changelog |
| 3 | **Event Bus** | [EventBus_Module_Design_Document.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/EventBus_Module_Design_Document.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | Event Bus MDD | Progress, Sprint, Changelog |
| 4 | **Request Manager** | [Request_Manager_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Request_Manager_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-3 | Request Manager MDD, ASD | Progress, Sprint, Changelog |
| 5 | **Orchestrator Core** | [Orchestrator_Core_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Orchestrator_Core_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | SDD, Core MDD, AWS | Progress, Sprint, Changelog |
| 6 | **Planner** | [Planner_Module_Design_Document.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Planner_Module_Design_Document.md) | ⬜ Pending | Phase 1-10 / Batch 1-3 | Planner MDD | Progress, Sprint, Changelog |
| 7 | **Task Queue** | [Task-Queue-MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Task-Queue-MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-4 | Task Queue MDD, DDD | Progress, Sprint, Changelog |
| 8 | **Router** | [Router-MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Router-MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | Router MDD | Progress, Sprint, Changelog |
| 9 | **Capability Selector** | [Capability_Selector_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Capability_Selector_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | Capability Selector MDD | Progress, Sprint, Changelog |
| 10 | **Provider Manager** | [Provider_Manager_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Provider_Manager_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-3 | Provider Manager MDD | Progress, Sprint, Changelog |
| 11 | **Provider Plugin System** | [ProviderPluginSystem_Module_Design_Document.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/ProviderPluginSystem_Module_Design_Document.md) | ⬜ Pending | Phase 1-10 / Batch 1-3 | Plugin System MDD | Progress, Sprint, Changelog |
| 12 | **Model Registry** | [ModelRegistry_Module_Design_Document.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/ModelRegistry_Module_Design_Document.md) | ⬜ Pending | Phase 1-10 / Batch 1-3 | Model Registry MDD | Progress, Sprint, Changelog |
| 13 | **Memory Manager** | [Memory-Manager-MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Memory-Manager-MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-3 | Memory Manager MDD, DDD | Progress, Sprint, Changelog |
| 14 | **Knowledge Base** | [Knowledge_Base_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Knowledge_Base_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | Knowledge Base MDD | Progress, Sprint, Changelog |
| 15 | **Review Engine** | [Review_Engine_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Review_Engine_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | Review Engine MDD | Progress, Sprint, Changelog |
| 16 | **Validation Engine** | [Validation_Engine_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Validation_Engine_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | Validation Engine MDD | Progress, Sprint, Changelog |
| 17 | **Browser Automation** | [Browser_Automation_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Browser_Automation_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-3 | Browser Automation MDD | Progress, Sprint, Changelog |
| 18 | **Git Manager** | [Git_Manager_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Git_Manager_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | Git Manager MDD | Progress, Sprint, Changelog |
| 19 | **Learning Layer** | [Learning_Layer_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Learning_Layer_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | Learning Layer MDD | Progress, Sprint, Changelog |
| 20 | **Dashboard Backend** | [Dashboard_Backend_MDD.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/Dashboard_Backend_MDD.md) | ⬜ Pending | Phase 1-10 / Batch 1-2 | Dashboard Backend MDD | Progress, Sprint, Changelog |

---

## 3. Sequential Phase & Batch Breakdown

Below is the detail of the initial modules, their target batches (capped at 5 tasks), and the review checkpoints:

### 3.1 Module: Shared Kernel (Seq 0)
* **Pre-requisites**: None.
* **Batch 1 (Phases 1-10: Shared Baseline Setup)**:
  1. Create `shared/domain/Entity.ts` base class.
  2. Create `shared/domain/ValueObject.ts` base class.
  3. Create `shared/domain/Result.ts` generic wrapper class.
  4. Create `shared/exceptions/BaseException.ts` and `shared/exceptions/ErrorCodes.ts` enums.
  5. Create `shared/utils/DateTime.ts` and validation helpers in `shared/utils/Validation.ts`.
* **Review Gate**: Verify that all files compile, lint passes with zero warnings, and unit tests have >90% coverage.

### 3.2 Module: Configuration Manager (Seq 1)
* **Pre-requisites**: Shared Kernel completed.
* **Batch 1 (Phases 1-4: Contracts, Domains, and Adapters)**:
  1. Create contracts interface [IConfigurationManager.ts](file:///e:/Projects/New%20folder/docs/MODULE_BLUEPRINT.md#2-configuration-module-srcmodulesconfiguration).
  2. Create core domain validation rules in `ConfigRules.ts`.
  3. Create custom config exception definitions in `errors/ConfigException.ts`.
  4. Create implementation file reader in `infrastructure/FileConfigAdapter.ts`.
  5. Implement default configuration validation logic using JSON Schema.
* **Batch 2 (Phases 5-10: Services and Integration)**:
  1. Create the Configuration Manager core service `services/ConfigurationService.ts`.
  2. Integrate configuration changes and publish `CONFIGURATION_HOT_RELOADED` events to Event Bus.
  3. Create unit test files in `tests/Configuration.test.ts`.
  4. Perform complete local integration runs.
  5. Complete documentation audit and compile review logs in `docs/ai-memory/REVIEW_HISTORY.md`.

*(The remaining modules follow this exact breakdown structure in NEXT_ACTIONS.md)*
