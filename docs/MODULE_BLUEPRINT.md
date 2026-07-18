# Module Blueprint: File & Interface Specifications

This blueprint defines the expected file structure, architectural responsibilities, and interface boundaries for all 22 modules in the Hybrid AI Development Orchestrator. No implementation code may deviate from these specifications.

---

## 1. Shared Kernel (`shared/`)
Acts as the baseline library for the entire codebase. Every module is permitted to import from the Shared Kernel.
```
shared/
├── domain/
│   ├── Entity.ts          # Base class for domain entities (Entity pattern)
│   ├── ValueObject.ts     # Base class for immutable value objects
│   └── Result.ts          # Monadic Result pattern (Success/Failure states)
├── exceptions/
│   ├── BaseException.ts   # Top-level application error base class
│   └── ErrorCodes.ts      # Global enumerations for system error codes
└── utils/
    ├── DateTime.ts        # UTC-based date/time wrappers
    └── Validation.ts      # Generic parameter sanitizer utilities
```
* **Interfaces Exposed**: `IResult`, `IEntity`
* **Dependencies**: None (Leaf component).

---

## 2. Configuration Module (`src/modules/configuration/`)
Handles application bootstrap configurations, environment variable mappings, and hot-reloads.
```
src/modules/configuration/
├── contracts/
│   └── IConfigurationManager.ts  # Interface exposing get/set settings
├── domain/
│   └── ConfigRules.ts            # Business logic validating config values
├── services/
│   └── ConfigurationService.ts   # Core service managing config states
├── infrastructure/
│   └── FileConfigAdapter.ts      # Reads configuration.json and .env
├── errors/
│   └── ConfigException.ts        # Configuration-specific exceptions
└── tests/
    └── Configuration.test.ts     # Configuration service tests
```
* **Interfaces Exposed**: `IConfigurationManager`
* **Interfaces Consumed**: `IConfigurationAdapter` (implemented by FileConfigAdapter)
* **Events Published**: `CONFIGURATION_HOT_RELOADED`
* **Events Consumed**: None
* **PRD Mapping**: Non-functional constraints for cost controls and system liveness.

---

## 3. Logger Module (`src/modules/logger/`)
Exposes standardized structured JSON logging across the codebase.
```
src/modules/logger/
├── contracts/
│   └── ILogger.ts           # Logger interface (info, debug, warn, error)
├── domain/
│   └── LogLevels.ts         # Enum detailing logging priority thresholds
├── services/
│   └── LoggerService.ts     # Implements structural formatting of payloads
├── infrastructure/
│   └── ConsoleAdapter.ts    # Standard output stream writer
└── tests/
    └── Logger.test.ts       # Structured logging behavior tests
```
* **Interfaces Exposed**: `ILogger`
* **Interfaces Consumed**: None
* **Events Published**: None
* **Events Consumed**: None

---

## 4. Event Bus Module (`src/modules/event-bus/`)
Handles asynchronous and event-driven communication across modules, avoiding tight physical coupling.
```
src/modules/event-bus/
├── contracts/
│   ├── IEventBus.ts        # Methods for publish, subscribe, unsubscribe
│   └── IEventSubscriber.ts # Abstract listener subscription contract
├── domain/
│   ├── EventEnvelope.ts    # Model wrapping event metadata and payload
│   └── EventCatalog.ts     # Central registry of permitted event topics
├── services/
│   └── InMemoryEventBus.ts # Synchronous in-memory event dispatcher
└── tests/
    └── EventBus.test.ts    # Publisher/subscriber isolation testing
```
* **Interfaces Exposed**: `IEventBus`
* **Interfaces Consumed**: None
* **Events Published**: None (Routes other modules' events)
* **Events Consumed**: None (Distributes events internally)

---

## 5. Request Manager (`src/modules/request-manager/`)
Manages incoming user requests (via VS Code client), orchestrating validation, parsing, and context generation.
```
src/modules/request-manager/
├── contracts/
│   ├── IRequestManager.ts    # Main request processor interface
│   └── IRequestRepository.ts # Interacts with Request storage
├── domain/
│   ├── Request.ts            # Entity representing a single request session
│   └── RequestStatus.ts      # Enum (PENDING, PROCESSING, SUCCEEDED, FAILED)
├── services/
│   └── RequestService.ts     # Business use case processing requests
├── dto/
│   ├── RequestInputDto.ts    # Structures user prompt and client context
│   └── RequestOutputDto.ts   # Server response with token and text streams
├── validators/
│   └── RequestValidator.ts   # Checks prompt boundaries and cost bounds
└── tests/
    └── RequestManager.test.ts
```
* **Interfaces Exposed**: `IRequestManager`
* **Interfaces Consumed**: `IEventBus`, `IConfigurationManager`
* **Events Published**: `REQUEST_RECEIVED`, `REQUEST_COMPLETED`, `REQUEST_FAILED`
* **Events Consumed**: None

---

## 6. Orchestrator Core (`src/modules/orchestrator-core/`)
The primary system brain coordinating execution paths.
```
src/modules/orchestrator-core/
├── contracts/
│   └── IOrchestratorCore.ts  # Runs the request execution lifecycle
├── services/
│   └── CoreOrchestrator.ts   # Sequences routing, planning, and review loops
├── domain/
│   └── SessionState.ts       # Evaluates application loop thresholds
└── tests/
    └── OrchestratorCore.test.ts
```
* **Interfaces Exposed**: `IOrchestratorCore`
* **Interfaces Consumed**: `IRequestManager`, `IEventBus`, `IRouter`, `IPlanner`, `ITaskQueue`
* **Events Published**: `SESSION_STARTED`, `SESSION_DEGRADED`, `SESSION_TIMEOUT`, `SESSION_COMPLETED`
* **Events Consumed**: `REQUEST_RECEIVED`, `TASK_QUEUE_COMPLETED`

---

## 7. Planner Module (`src/modules/planner/`)
Decomposes user requests into dependency-aware Task lists.
```
src/modules/planner/
├── contracts/
│   └── IPlanner.ts           # Goal decomposition interface
├── domain/
│   ├── Plan.ts               # Domain entity containing plan nodes
│   ├── TaskDefinition.ts     # Properties of planned tasks
│   └── DependencyRule.ts     # Logic preventing cyclic tasks
├── services/
│   └── DecompositionEngine.ts # Evaluates prompt using cloud models
└── tests/
    └── Planner.test.ts
```
* **Interfaces Exposed**: `IPlanner`
* **Interfaces Consumed**: `IEventBus`, `IProviderManager`, `IKnowledgeBase`
* **Events Published**: `PLAN_GENERATED`, `PLAN_DECOMPOSITION_FAILED`
* **Events Consumed**: `SESSION_STARTED`

---

## 8. Task Queue Module (`src/modules/task-queue/`)
Maintains status tracking, dispatching, and dependency checks for planned tasks.
```
src/modules/task-queue/
├── contracts/
│   ├── ITaskQueue.ts         # Add, update, dispatch, and query tasks
│   └── ITaskRepository.ts    # DB access adapter for tasks
├── domain/
│   ├── Task.ts               # Entity tracking states (COMPLETED, IN_PROGRESS, etc.)
│   └── TaskDependency.ts     # Defines pre-requisite node constraints
├── services/
│   └── DispatcherService.ts  # Selects next executable tasks
└── tests/
    └── TaskQueue.test.ts
```
* **Interfaces Exposed**: `ITaskQueue`
* **Interfaces Consumed**: `IEventBus`, `ITaskRepository`
* **Events Published**: `TASK_DISPATCHED`, `TASK_COMPLETED`, `TASK_FAILED`, `TASK_QUEUE_COMPLETED`
* **Events Consumed**: `PLAN_GENERATED`, `TASK_VERIFIED`

---

## 9. Router Module (`src/modules/router/`)
Decides whether a request is routed to Cloud, Local, or Hybrid models.
```
src/modules/router/
├── contracts/
│   └── IRouter.ts            # Intent classification routing interface
├── domain/
│   ├── RouteDecision.ts      # Represents decision, confidence, and target model
│   └── RoutingPolicy.ts      # Hardcoded rules for budget and override keys
├── services/
│   └── HeuristicRouter.ts    # Router implementation
└── tests/
    └── Router.test.ts
```
* **Interfaces Exposed**: `IRouter`
* **Interfaces Consumed**: `IEventBus`, `IConfigurationManager`
* **Events Published**: `ROUTE_DECIDED`, `ROUTE_OVERRIDDEN`
* **Events Consumed**: `REQUEST_RECEIVED`

---

## 10. Capability Selector (`src/modules/capability-selector/`)
Identifies and matches model capabilities against task requirements.
```
src/modules/capability-selector/
├── contracts/
│   └── ICapabilitySelector.ts # Matches tools/tasks to models
├── domain/
│   ├── Capability.ts          # Defines capability schemas (e.g. VISION)
│   └── ModelMatch.ts          # Candidate model rating
├── services/
│   └── SelectorEngine.ts      # Compares model metrics with requirements
└── tests/
    └── CapabilitySelector.test.ts
```
* **Interfaces Exposed**: `ICapabilitySelector`
* **Interfaces Consumed**: `IModelRegistry`
* **Events Published**: `CAPABILITY_MATCHED`, `NO_MATCH_FOUND`
* **Events Consumed**: `ROUTE_DECIDED`

---

## 11. Provider Manager (`src/modules/provider-manager/`)
Maintains connection pools, key management, and API wrappers for all cloud/local model providers.
```
src/modules/provider-manager/
├── contracts/
│   ├── IProviderManager.ts   # Model completions interface
│   └── IModelAdapter.ts      # Client adapter normalization contract
├── domain/
│   └── ModelPayload.ts       # Structured unified input/output schema
├── services/
│   └── ProviderCoordinator.ts # Manages model connections and fallback retries
└── tests/
    └── ProviderManager.test.ts
```
* **Interfaces Exposed**: `IProviderManager`
* **Interfaces Consumed**: `IConfigurationManager`, `ILogger`
* **Events Published**: `PROVIDER_CONNECTION_FAILED`, `PROVIDER_RESPONSE_RECEIVED`
* **Events Consumed**: None

---

## 12. Provider Plugin System (`src/modules/plugin-system/`)
Enables dynamic loading of custom model adapters at runtime.
```
src/modules/plugin-system/
├── contracts/
│   └── IPluginSystem.ts      # Load, unload, and validate plugin manifests
├── domain/
│   └── PluginManifest.ts     # Schema checking adapter definitions
├── services/
│   └── PluginManager.ts      # Discovers files from /plugins folder
└── tests/
    └── PluginSystem.test.ts
```
* **Interfaces Exposed**: `IPluginSystem`
* **Interfaces Consumed**: `IProviderManager`
* **Events Published**: `PLUGIN_LOADED`, `PLUGIN_LOAD_FAILED`
* **Events Consumed**: `CONFIGURATION_HOT_RELOADED`

---

## 13. Model Registry (`src/modules/model-registry/`)
Registers all active and available local and cloud models.
```
src/modules/model-registry/
├── contracts/
│   └── IModelRegistry.ts     # Query model configurations
├── domain/
│   └── ModelMetadata.ts      # Context length, speed, cost, and capability metrics
├── services/
│   └── ModelInventory.ts     # Stores and retrieves model specs
└── tests/
    └── ModelRegistry.test.ts
```
* **Interfaces Exposed**: `IModelRegistry`
* **Interfaces Consumed**: `IConfigurationManager`
* **Events Published**: `MODEL_REGISTERED`, `MODEL_DEREGISTERED`
* **Events Consumed**: `PLUGIN_LOADED`

---

## 14. Memory Manager (`src/modules/memory-manager/`)
Manages the retrieval and saving of project memory.
```
src/modules/memory-manager/
├── contracts/
│   ├── IMemoryManager.ts     # Get/set project memory
│   └── IMemoryRepository.ts  # Database access interface
├── domain/
│   ├── MemorySnapshot.ts     # Set of active tasks, changes, and variables
│   └── MemoryPolicy.ts       # Context injection limits
├── services/
│   └── MemoryService.ts      # Formats and returns memory for model injections
└── tests/
    └── MemoryManager.test.ts
```
* **Interfaces Exposed**: `IMemoryManager`
* **Interfaces Consumed**: `IMemoryRepository`
* **Events Published**: `MEMORY_UPDATED`, `MEMORY_PERSISTED`
* **Events Consumed**: `TASK_COMPLETED`, `TASK_FAILED`

---

## 15. Knowledge Base (`src/modules/knowledge-base/`)
Retrives and processes markdown standards and specs for context injections.
```
src/modules/knowledge-base/
├── contracts/
│   └── IKnowledgeBase.ts     # Query relevant architectural files
├── domain/
│   ├── KnowledgeDocument.ts  # Text, tags, and metadata schema
│   └── RetrievalConfig.ts    # Embedding similarity parameters
├── services/
│   └── KnowledgeEngine.ts    # Retrieves and indexes project files
└── tests/
    └── KnowledgeBase.test.ts
```
* **Interfaces Exposed**: `IKnowledgeBase`
* **Interfaces Consumed**: `IConfigurationManager`
* **Events Published**: `KNOWLEDGE_INDEXED`, `KNOWLEDGE_RETRIEVED`
* **Events Consumed**: `CONFIGURATION_HOT_RELOADED`

---

## 16. Review Engine (`src/modules/review-engine/`)
Coordinates the automated audit loop of code edits using cloud models.
```
src/modules/review-engine/
├── contracts/
│   └── IReviewEngine.ts      # Runs quality audits against code files
├── domain/
│   ├── ReviewResult.ts       # Verification status, issues list, and score
│   └── ReviewCriteria.ts     # Scoring rule mappings
├── services/
│   └── AutomatedAuditor.ts   # Calls model to inspect diffs against standards
└── tests/
    └── ReviewEngine.test.ts
```
* **Interfaces Exposed**: `IReviewEngine`
* **Interfaces Consumed**: `IProviderManager`, `IKnowledgeBase`
* **Events Published**: `REVIEW_COMPLETED`, `REVIEW_FAILED`
* **Events Consumed**: `TASK_COMPLETED`

---

## 17. Validation Engine (`src/modules/validation-engine/`)
Aggregates quality gates (linting, tests, build success, and review approvals).
```
src/modules/validation-engine/
├── contracts/
│   └── IValidationEngine.ts  # Triggers and compiles quality gate reports
├── domain/
│   ├── QualityReport.ts      # Aggregated check results (Pass/Fail)
│   └── ValidationRule.ts     # Quality configuration constraints
├── services/
│   └── PipelineValidator.ts  # Runs build, lint, and test scripts
└── tests/
    └── ValidationEngine.test.ts
```
* **Interfaces Exposed**: `IValidationEngine`
* **Interfaces Consumed**: `IEventBus`, `IReviewEngine`
* **Events Published**: `QUALITY_GATE_PASSED`, `QUALITY_GATE_FAILED`
* **Events Consumed**: `REVIEW_COMPLETED`

---

## 18. Browser Automation (`src/modules/browser-automation/`)
Operates browser tests using Playwright/Puppeteer.
```
src/modules/browser-automation/
├── contracts/
│   └── IBrowserAutomation.ts # Starts session, takes screenshots, runs assertions
├── domain/
│   ├── BrowserSession.ts     # Holds browser references
│   └── Evidence.ts           # Screenshots, console errors, network logs
├── services/
│   └── PlaywrightAdapter.ts  # Automates execution steps
└── tests/
    └── BrowserAutomation.test.ts
```
* **Interfaces Exposed**: `IBrowserAutomation`
* **Interfaces Consumed**: `IConfigurationManager`
* **Events Published**: `BROWSER_TESTS_COMPLETED`, `BROWSER_TESTS_FAILED`
* **Events Consumed**: `QUALITY_GATE_PASSED`

---

## 19. Git Manager (`src/modules/git-manager/`)
Performs automatic checkpoints, task commits, and recovery rollbacks.
```
src/modules/git-manager/
├── contracts/
│   └── IGitManager.ts        # Commits, checkpoints, rollbacks, and diffs
├── domain/
│   └── GitCommit.ts          # Commit details and branch mappings
├── services/
│   └── GitWrapper.ts         # Integrates with simple-git or shell git
└── tests/
    └── GitManager.test.ts
```
* **Interfaces Exposed**: `IGitManager`
* **Interfaces Consumed**: None
* **Events Published**: `GIT_COMMIT_CREATED`, `GIT_ROLLBACK_COMPLETED`
* **Events Consumed**: `QUALITY_GATE_PASSED`, `QUALITY_GATE_FAILED`

---

## 20. Learning Layer (`src/modules/learning-layer/`)
Scans review feedback to generate recurring design rules.
```
src/modules/learning-layer/
├── contracts/
│   └── ILearningLayer.ts     # Evaluates review issues list history
├── domain/
│   ├── CorrectionRecord.ts   # Tracks correction occurrences
│   └── PromotedRule.ts       # Proposed markdown rule for knowledge base
├── services/
│   └── RuleDiscovery.ts      # Computes correction pattern frequencies
└── tests/
    └── LearningLayer.test.ts
```
* **Interfaces Exposed**: `ILearningLayer`
* **Interfaces Consumed**: `IKnowledgeBase`
* **Events Published**: `LEARNED_RULE_PROPOSED`, `LEARNED_RULE_ACCEPTED`
* **Events Consumed**: `REVIEW_COMPLETED`

---

## 21. Dashboard Backend (`src/modules/dashboard/`)
Serves metrics, logs, and task queue progress data.
```
src/modules/dashboard/
├── contracts/
│   └── IDashboardBackend.ts  # Handles metric and task queries
├── services/
│   └── MetricsCollector.ts   # Compiles stats from database
├── infrastructure/
│   └── HttpServer.ts         # Serves REST endpoints and SSE updates
└── tests/
    └── DashboardBackend.test.ts
```
* **Interfaces Exposed**: `IDashboardBackend`
* **Interfaces Consumed**: `ITaskQueue`, `IMemoryManager`
* **Events Published**: `DASHBOARD_METRICS_UPDATED`
* **Events Consumed**: `TASK_DISPATCHED`, `TASK_COMPLETED`, `TASK_FAILED`, `MEMORY_UPDATED`
