# Browser Automation — Module Design Document (MDD)

**Module:** Browser Automation
**Parent System:** Hybrid AI Development Platform — Orchestrator Subsystem
**Document Type:** Module Design Document (MDD)
**Status:** Draft for Implementation
**Audience:** Senior Engineers, AI Coding Agents (Cursor, OpenCode, Roo Code, Claude Code)
**Related Documents:** PRD, SAD, API Specification, Database Design Document, Orchestrator Core MDD, Event Bus MDD, Request Manager MDD, Provider Manager MDD, Provider Plugin System MDD, Model Registry MDD, Capability Selector MDD, Router MDD, Memory Manager MDD, Knowledge Base MDD, Knowledge Comparison Engine MDD, Planner MDD, Task Queue MDD, Review Engine MDD, Validation Engine MDD

> This document defines the Browser Automation module only. It does not restate decisions owned by other documents (planning, task dispatch, provider communication, review, validation). Where the Planner decides *that* a browser workflow should run and the Task Queue decides *when* it is dispatched, this document governs *how* that workflow is orchestrated, resourced, executed, monitored, and recovered — never the workflow's business content, and never the mechanics of any specific browser engine.

---

## 1. Executive Summary

### 1.1 Purpose

Browser-based task execution (navigating pages, filling forms, scraping content, taking screenshots, driving multi-step web workflows) is one of the platform's core AI-agent capabilities. Like AI provider communication (Provider Manager MDD), the underlying execution technology is highly heterogeneous: Playwright, Selenium, Puppeteer, Browser Use, Chrome DevTools Protocol, Browserbase, Browserless, and future engines all differ in session models, resource footprints, capability surfaces, and failure modes.

The Browser Automation module exists to absorb all of that variability behind one stable orchestration boundary. It is the single place in the system that knows *how to manage browser resources and coordinate browser-based workflows in the abstract* — allocate a browser, lease it, create a session, dispatch a workflow, monitor it, recover it, release it — without ever knowing how a click, a navigation, or a screenshot is concretely performed. Those concrete mechanics live entirely inside independently pluggable **Browser Automation Engines**, accessed only through an abstract engine interface owned by the **Browser Automation Engine Plugin System** (a sibling module, referenced but not redefined here).

### 1.2 Responsibilities

The Browser Automation module is responsible for the *operational orchestration and resource lifecycle* of browser-based execution: managing browser pools, leasing browsers, creating and tearing down sessions/contexts, scheduling and coordinating workflow execution, monitoring health, recovering from failure, and reporting metrics. It is explicitly **not** responsible for performing any DOM-level operation itself (click, type, navigate, evaluate JavaScript, screenshot, download, upload, network interception) — those are executed exclusively by the Browser Automation Engine Plugin System, which this module calls through an abstract interface and never bypasses.

### 1.3 Role

The Browser Automation module is the **orchestration and resource-management layer** for all browser-based execution. It sits between the Planner/Task Queue (which decide that a browser workflow should run, and when) and the Browser Automation Engine Plugin System (which performs the actual browser operations), functioning as the application/use-case layer in Hexagonal Architecture terms, with the abstract engine interface as its sole driven port toward execution.

### 1.4 Architecture Position

```
Planner (produces browser workflows)  --->  Task Queue (dispatches browser tasks)
                                                        |
                                                        v
+---------------------------------------------------------------------+
|                        BROWSER AUTOMATION                            |
|   (pool/session/context management, scheduling, execution            |
|    coordination, health, recovery, metrics -- this document)         |
+-------------------------------+---------------------------------------+
                                 |  abstract Browser Engine Interface calls only
                                 v
        +-----------------------------------------------------+
        |         BROWSER AUTOMATION ENGINE PLUGIN SYSTEM        |
        |  (Playwright Engine, Selenium Engine, Puppeteer Engine, |
        |   Browser Use Engine, CDP Engine, Browserbase Engine,   |
        |   Browserless Engine, ...)                               |
        +-----------------------------------------------------+
                                 |  engine-specific driver/protocol calls
                                 v
                     Actual Browser Processes / Remote Browser Farms
```

This module never imports, references, or links against any browser automation library or SDK — the Browser Automation Engine Plugin System does, and is loaded polymorphically through the abstract engine interface, exactly mirroring the Provider Manager MDD's relationship to the Provider Plugin System.

---

## 2. Goals

### 2.1 Primary Goals

1. Provide one abstract orchestration surface (`executeWorkflow()`) that the Task Queue can call regardless of which browser engine ultimately performs the work.
2. Guarantee that adding a new browser engine requires **zero changes** to Browser Automation source code — only a new plugin implementing the abstract Browser Engine Interface within the Browser Automation Engine Plugin System.
3. Manage browser resources (pools, sessions, contexts) efficiently and safely, enforcing leasing, concurrency limits, and cleanup discipline regardless of workload volume.
4. Provide resilient execution: health-aware allocation, recovery from browser/session/engine failure, and clean resource release under all outcomes (success, failure, cancellation, timeout).
5. Provide accurate, real-time browser pool, session, and workflow execution telemetry.

### 2.2 Secondary Goals

1. Support pool auto-scaling based on demand signals (queue depth, utilization) without manual intervention.
2. Support session/context/browser reuse to reduce the overhead of cold browser starts for high-throughput workloads.
3. Provide multi-tenant isolation guarantees (organization/namespace/project scoping) at the pool and session level.
4. Provide a browser health dashboard surface consumable by Dashboard Backend.

### 2.3 Future Goals

1. Distributed browser clusters spanning multiple coordinator instances and multiple regions.
2. Cloud/remote browser farm integration (treated identically to local pools via the same abstract interface).
3. Dynamic, policy-driven resource allocation (e.g., auto-selecting pool size/browser class based on workflow characteristics).
4. Plugin-based coordinator strategies for custom scheduling/allocation logic.

### 2.4 Non-Goals

- The Browser Automation module will **never** perform a DOM operation itself (click, type, navigate, evaluate, screenshot, download, upload, network interception) — these belong exclusively to the Browser Automation Engine Plugin System.
- It will **never** decide the business content of a browser workflow — that is the Planner's responsibility; this module only orchestrates execution of a workflow definition it is handed.
- It will **never** perform AI planning, routing, provider communication, memory management, review, or validation.
- It will **never** implement browser-engine-specific code (Playwright API calls, Selenium WebDriver calls, CDP protocol messages, etc.) directly in its own module tree.

---

## 3. Responsibilities

### 3.1 Must Have (v1 scope)

1. Maintain one or more Browser Pools of allocatable browser resources, each backed by a configured Browser Automation Engine.
2. Allocate and lease browsers to callers (Task Queue-dispatched workflow executions) on demand, enforcing lease ownership and concurrency limits.
3. Create and manage Browser Sessions and Browser Contexts (isolated execution scopes within/across leased browsers) via the abstract engine interface.
4. Coordinate workflow execution: assign a workflow to a leased browser/session/context, dispatch it to the Browser Automation Engine Plugin System for actual execution, and track its progress to completion.
5. Monitor browser and pool health (heartbeat, responsiveness, resource exhaustion signals) and maintain live status per browser/pool.
6. Recover from browser, session, or engine failure per configurable recovery policy (Section 13).
7. Release browsers/sessions/contexts cleanly on workflow completion, failure, or cancellation, guaranteeing no resource leaks.
8. Support workflow cancellation, propagating a cancellation signal into the active engine execution.
9. Collect and expose pool utilization, browser health, execution throughput, session count, and workflow duration metrics.
10. Publish lifecycle and execution events to the Event Bus (Section 12).
11. Enforce browser policies (pool size limits, lease timeouts, concurrency caps, tenant isolation rules) sourced from Configuration Manager, applied without code changes.
12. Persist minimal browser/pool/session state (registry, metadata, lease ownership) needed for coordination and recovery — not workflow business data, and not durable long-term history beyond operational needs (Section 4.1).

### 3.2 Should Have (near-term, v1.x)

1. Pool auto-scaling driven by utilization/queue-depth signals.
2. Browser/session reuse across workflows of the same tenant/context profile to reduce cold-start overhead.
3. Configurable lease-timeout-based reclamation for abandoned/stuck leases.
4. A queryable "stuck workflow" surface for operator visibility into workflows exceeding expected duration.

### 3.3 Future Responsibilities (explicitly out of v1, see Section 22)

1. Distributed, multi-instance coordinator clustering with leader election (Section 18.11).
2. Cross-region pool federation.
3. Dynamic policy-driven resource-class selection (e.g., "lightweight" vs. "full-featured" browser allocation based on workflow characteristics).
4. Plugin-based custom coordinator/scheduling strategies.

---

## 4. Scope

### 4.1 Owns

- Browser Workflow Coordination — assigning workflows to leased browser resources and tracking them to completion.
- Browser Lifecycle — the full state machine from allocation through release (Section 6).
- Browser Session Management and Browser Context Management (creation, tracking, teardown).
- Browser Pool Management — pool creation, scaling, health, cleanup (Section 8).
- Browser Leasing and Browser Resource Allocation.
- Browser Execution Coordination — dispatching to, and tracking status from, the Browser Automation Engine Plugin System (Section 10).
- Browser Scheduling — queueing/prioritizing allocation requests under contention (Section 9).
- Browser Health Monitoring, Browser Metrics, Browser Recovery.
- Browser Policies and Browser Configuration surface (resolved from Configuration Manager).
- Browser State, Browser Registry, Browser Metadata.
- Minimal operational persistence needed for coordination/recovery — not a durable data warehouse; retention is bounded and configuration-driven.

### 4.2 Does Not Own

- Browser Engine Implementations (Playwright, Selenium, Puppeteer, Browser Use, CDP, Browserbase, Browserless) — owned by the Browser Automation Engine Plugin System.
- Any DOM-level operation: click, type, navigate, evaluate JavaScript, downloads, uploads, screenshots, PDF generation, network interception — all owned by the Browser Automation Engine Plugin System.
- AI planning (owned by Planner), routing (owned by Router), provider communication (owned by Provider Manager), memory (owned by Memory Manager), review (owned by Review Engine), validation of workflow business correctness (owned by Validation Engine).
- Task dispatch timing/prioritization policy at the platform level — the Task Queue decides *when* a browser task is dispatched to this module; this module only schedules *among already-dispatched* requests contending for browser resources (Section 9).

### 4.3 Collaborates With

- **Task Queue** — dispatches browser tasks to this module for execution; this module reports completion/failure/cancellation status back.
- **Planner** — the ultimate originator of browser workflow definitions, though never a direct caller; workflows arrive via the Task Queue.
- **Browser Automation Engine Plugin System** — executes all actual browser operations; this module's sole execution dependency, accessed only through the abstract engine interface.
- **Configuration Manager** — supplies browser policies (pool sizing, lease timeouts, concurrency limits, tenant isolation rules, recovery policy).
- **Event Bus** — publisher of all browser lifecycle/execution events (Section 12).
- **Logger** — structured logging at every orchestration stage.
- **Dashboard Backend** — read-only consumer of browser pool/session/health metrics (Section 15).

---

## 5. Internal Architecture

```
+---------------------------------------------------------------------------+
|                          BROWSER AUTOMATION                                |
|                                                                              |
| +-------------------+   +------------------+   +------------------------+ |
| | Browser Automation  |-->| Policy Engine      |-->| Configuration Manager    | |
| | Coordinator          |   |                    |   | (adapter to platform CM)  | |
| +---------+---------+   +------------------+   +------------------------+ |
|           |                                                                 |
|           v                                                                 |
| +-------------------+   +------------------+   +------------------------+ |
| | Browser Scheduler    |-->| Browser Resource    |-->| Browser Pool Manager     | |
| +-------------------+   | Manager             |   +-----------+------------+ |
|                          +------------------+                | |
|                                                                v |
|                                                       +------------------+ |
|                                                       | Browser Registry    | |
|                                                       +--------+---------+ |
|                                                                | |
|           +----------------------------------------------------+--------+ |
|           v                                                     v          | |
| +-------------------+                                 +------------------+ | |
| | Browser Session      |                                 | Lifecycle Manager  | | |
| | Manager               |                                 +------------------+ | |
| +---------+---------+                                                       | |
|           v                                                                 | |
| +-------------------+                                                       | |
| | Browser Context       |                                                       | |
| | Manager                |                                                       | |
| +---------+---------+                                                       | |
|           v                                                                 | |
| +-------------------+   +------------------+   +------------------------+ |
| | Workflow Coordinator  |-->| Execution           |-->| State Manager             | |
| +---------+---------+   | Coordinator          |   +------------------------+ |
|           |               +------------------+                                |
|           v                                                                 |
| +-------------------+   +------------------+   +------------------------+ |
| | Health Monitor        |-->| Recovery Manager    |   | Metrics Collector          | |
| +-------------------+   +------------------+   +------------------------+ |
|                                                                              |
| +-------------------+   +------------------+                              |
| | Persistence Manager   |   | Cache Manager       |                              |
| +-------------------+   +------------------+                              |
+---------------------------------------------------------------------------+
```

### 5.1 Browser Automation Coordinator

- **Purpose:** Top-level orchestrator for the module; the single entry point invoked by the public interfaces (Section 11) that sequences calls across every other internal component.
- **Responsibilities:** Drives allocation -> leasing -> session/context creation -> execution coordination -> cleanup -> release -> metrics -> archival (Section 6), enforcing the Browser Lifecycle state machine via Lifecycle Manager.
- **Inputs:** Public interface calls (`allocateBrowser()`, `executeWorkflow()`, etc.).
- **Outputs:** Results/handles returned to callers; drives all downstream component invocation.
- **Dependencies:** Every other component in this section, via injected interfaces.
- **Lifecycle:** Long-lived singleton per module instance; stateless with respect to any individual workflow beyond what is tracked in State Manager/Browser Registry.

### 5.2 Browser Registry

- **Purpose:** The authoritative, queryable record of every browser resource known to the system — its pool membership, current lease, session/context associations, health status, and metadata (Section 7).
- **Responsibilities:** CRUD-like access for all other components needing to read/update browser resource state; the single source of truth `getBrowserStatus()` (Section 11) queries against.
- **Inputs:** State updates from Lifecycle Manager, Browser Pool Manager, Browser Session Manager.
- **Outputs:** `BrowserResourceRecord` (Section 7) query results.
- **Dependencies:** Persistence Manager (for durable/recoverable registry state).
- **Lifecycle:** Long-lived; entries created on browser provisioning, removed on decommission.

### 5.3 Browser Pool Manager

- **Purpose:** Owns pool-level concerns — creation, scaling, health aggregation, and cleanup of pools of browser resources (Section 8).
- **Responsibilities:** Creates new pools per configured policy; scales pool size up/down based on demand signals; aggregates per-browser health into pool-level health; triggers cleanup of unhealthy/expired browsers within a pool.
- **Inputs:** Pool configuration (from Policy Engine), demand signals (from Browser Scheduler), health signals (from Health Monitor).
- **Outputs:** Pool state updates to Browser Registry; scaling actions (provision/decommission requests to the Browser Automation Engine Plugin System via Lifecycle Manager).
- **Dependencies:** Policy Engine, Browser Registry, Health Monitor, Lifecycle Manager.

### 5.4 Browser Session Manager

- **Purpose:** Manages Browser Sessions — the logical unit of "a browser being used for a period of related work," distinct from the underlying leased browser process itself (a session may span multiple contexts; a browser may host multiple sessions depending on engine capability, per Section 7).
- **Responsibilities:** Creates sessions via the abstract engine interface upon successful browser lease; tracks session status; closes sessions on workflow completion or explicit `closeSession()` call.
- **Inputs:** Lease confirmation, session creation parameters (tenant/isolation requirements).
- **Outputs:** `SessionHandle` (session ID + engine reference).
- **Dependencies:** Browser Automation Engine Plugin System (abstract interface), Browser Registry, Lifecycle Manager.

### 5.5 Browser Context Manager

- **Purpose:** Manages Browser Contexts — isolated execution scopes within a session (e.g., separate cookie/storage isolation for concurrent, independent workflow steps within one session), where supported by the underlying engine.
- **Responsibilities:** Creates/tears down contexts via the abstract engine interface; tracks context-to-session-to-browser association in Browser Registry. For engines that do not support sub-session context isolation, this component's operations are no-ops that map 1:1 onto the session (a capability declared by the engine, not assumed by this module).
- **Inputs:** Session handle, context isolation requirements.
- **Outputs:** `ContextHandle`.
- **Dependencies:** Browser Automation Engine Plugin System, Browser Registry.

### 5.6 Workflow Coordinator

- **Purpose:** Manages the execution of a specific workflow once resources (browser/session/context) are allocated — the browser-automation-specific analog of the Provider Manager's Execution Coordinator.
- **Responsibilities:** Hands the workflow definition to Execution Coordinator for dispatch to the engine; tracks workflow status transitions; coordinates cleanup and result collection on completion.
- **Inputs:** Workflow definition (from Task Queue, via public interface), allocated resource handles.
- **Outputs:** `WorkflowExecutionResult`.
- **Dependencies:** Execution Coordinator, State Manager, Lifecycle Manager.

### 5.7 Execution Coordinator

- **Purpose:** The component that actually dispatches a workflow to the Browser Automation Engine Plugin System and tracks its progress — the direct boundary crossing into engine execution (Section 10).
- **Responsibilities:** Invokes the abstract engine interface's workflow execution method; relays progress/status updates; detects and classifies execution failures (engine unavailable, browser crash, workflow-level failure) for Recovery Manager.
- **Inputs:** Workflow definition, resource handles (browser/session/context), timeout/cancellation configuration.
- **Outputs:** `WorkflowExecutionResult` or classified error.
- **Dependencies:** Browser Automation Engine Plugin System (abstract interface), Recovery Manager, Metrics Collector.
- **Explicit boundary:** This component never performs any DOM operation itself — it only invokes the engine's workflow execution method and observes the result; actual browser manipulation happens entirely inside the Browser Automation Engine Plugin System (Section 10 clarifies this exhaustively).

### 5.8 Policy Engine

- **Purpose:** The single source of truth for resolved browser policy applicable to a given pool/lease/workflow request (pool sizing, lease timeout, concurrency caps, tenant isolation rules, recovery policy).
- **Responsibilities:** Resolves effective policy (global defaults + organization/tenant overrides + per-request overrides) from Configuration Manager.
- **Inputs:** Request context (organization/namespace/project, explicit overrides).
- **Outputs:** Resolved `BrowserPolicySet`.
- **Dependencies:** Configuration Manager.

### 5.9 Browser Scheduler

- **Purpose:** Coordinates allocation requests under resource contention (Section 9) — decides ordering when demand for browsers exceeds current pool capacity.
- **Responsibilities:** Applies immediate/delayed/priority scheduling rules; signals Browser Pool Manager when sustained contention indicates a scaling need; applies backpressure (rejecting or queuing new requests) when pools are saturated and cannot scale further.
- **Inputs:** Allocation requests, pool capacity/utilization state, resolved `BrowserPolicySet`.
- **Outputs:** Scheduling decisions (allocate now / queue / reject).
- **Dependencies:** Browser Pool Manager, Policy Engine, Browser Registry.

### 5.10 Browser Resource Manager

- **Purpose:** The component Browser Scheduler hands an "allocate now" decision to; performs the actual lease assignment against the Browser Registry.
- **Responsibilities:** Selects a specific available browser from the appropriate pool (per selection policy — e.g., least-recently-used, or reuse-affinity for tenant/context profile), marks it leased, and returns a lease handle.
- **Inputs:** Scheduling decision, pool ID, lease requester identity.
- **Outputs:** `LeaseHandle` (browser ID + lease owner + expiry).
- **Dependencies:** Browser Registry, Browser Pool Manager.

### 5.11 Lifecycle Manager

- **Purpose:** Owns the Browser Lifecycle state machine (Section 6) — governs all state transitions for individual browser resources, sessions, and workflows, exactly analogous to the Request Manager's Lifecycle Controller and Provider Manager's Lifecycle Manager patterns.
- **Responsibilities:** Enforces legal state transitions; rejects illegal ones; is the sole writer of status fields in Browser Registry/State Manager.
- **Inputs:** Transition requests from every other component.
- **Outputs:** Confirmed state transitions; triggers corresponding event publication.
- **Dependencies:** Browser Registry, State Manager, Event Bus.

### 5.12 Health Monitor

- **Purpose:** Runs periodic and on-demand health checks against browsers/pools/engines, mirroring the Provider Manager's Health Monitor pattern.
- **Responsibilities:** Invokes the abstract engine interface's health-check method; updates health status in Browser Registry; feeds Recovery Manager and Browser Pool Manager.
- **Inputs:** Configured health-check interval, on-demand trigger requests.
- **Outputs:** `BrowserHealthStatus` updates.
- **Dependencies:** Browser Automation Engine Plugin System (abstract interface), Browser Registry, Recovery Manager.

### 5.13 Recovery Manager

- **Purpose:** Applies configured recovery policy when a browser, session, or workflow execution fails (Section 13).
- **Responsibilities:** Classifies failure type; decides recover-in-place (retry within the same browser), reallocate (fresh browser/session), or fail-and-release; coordinates with Lifecycle Manager and Browser Resource Manager to execute the chosen strategy.
- **Inputs:** Failure signals from Execution Coordinator/Health Monitor, resolved `BrowserPolicySet` (recovery rules).
- **Outputs:** Recovery action taken; `BrowserRecovered` or terminal failure event.
- **Dependencies:** Policy Engine, Lifecycle Manager, Browser Resource Manager, Execution Coordinator.

### 5.14 Metrics Collector

- **Purpose:** Aggregates and exposes operational metrics (Section 15), sourced from events published by other components (Observer pattern via Event Bus), mirroring the Provider Manager's Metrics Collector design.
- **Responsibilities:** Computes pool utilization, execution throughput, session counts, workflow duration distributions, recovery rate.
- **Inputs:** Events (Section 12).
- **Outputs:** Aggregate metric snapshots for Dashboard Backend / Monitoring.
- **Dependencies:** Event Bus (subscriber).

### 5.15 Persistence Manager

- **Purpose:** Provides durable storage of minimal operational state (Browser Registry entries, active leases, session/context associations, in-progress workflow tracking) needed for coordination continuity and crash recovery — never workflow business data or captured page content.
- **Responsibilities:** Persists/restores Browser Registry and State Manager data across module restarts; bounded retention (configurable) for completed/terminal records.
- **Inputs/Outputs:** `BrowserResourceRecord`, `WorkflowExecutionState` persistence operations.
- **Dependencies:** A pluggable storage backend port (Section 20), abstracted so v1's implementation choice does not constrain future scaling (mirrors the Request Manager MDD's Registry-port pattern).

### 5.16 Cache Manager

- **Purpose:** Transient, TTL-bounded cache for frequently-accessed, cheap-to-recompute data (e.g., resolved `BrowserPolicySet`, pool capacity snapshots) to reduce redundant Policy Engine/Configuration Manager round-trips under high request volume.
- **Responsibilities:** Cache lookup/write with configurable TTL; never a source of truth — a cache miss always falls back correctly to authoritative resolution.
- **Dependencies:** Configuration Manager (TTL policy).

### 5.17 State Manager

- **Purpose:** Tracks in-flight workflow execution state (distinct from Browser Registry's resource-centric view) — the workflow-centric complement, tracking `WorkflowExecutionState` (status, assigned resources, timestamps) for every active/recently-completed workflow.
- **Responsibilities:** Single source of truth for `getBrowserStatus()`-adjacent workflow status queries and for Recovery Manager's "what was this workflow doing when it failed" context.
- **Dependencies:** Persistence Manager.

---

## 6. Browser Lifecycle

### 6.1 Lifecycle Flow

```
  Workflow Received (from Task Queue via executeWorkflow())
        |
        v
    Validate Workflow        (structural validation of the workflow request itself, not business content)
        |
        v
   Allocate Browser           (Browser Scheduler -> Browser Resource Manager -> Browser Pool Manager, if scaling needed)
        |
        v
    Lease Browser              (Browser Resource Manager marks browser leased; LeaseHandle returned)
        |
        v
   Create Session               (Browser Session Manager, via abstract engine interface)
        |
        v
   Create Context                (Browser Context Manager, via abstract engine interface, if isolation requested)
        |
        v
  Execute Workflow                (Workflow Coordinator -> Execution Coordinator -> Browser Automation Engine Plugin System)
        |
        v
  Collect Results                  (Execution Coordinator receives WorkflowExecutionResult from engine)
        |
        v
     Cleanup                        (Context/Session teardown via abstract engine interface)
        |
        v
  Release Browser                   (Browser Resource Manager releases lease; browser returns to pool, available or recycled per policy)
        |
        v
  Update Metrics                     (Metrics Collector records final workflow/browser metrics)
        |
        v
  Archive State                       (Persistence Manager bounds/archives terminal WorkflowExecutionState per retention policy)
```

### 6.2 Browser Resource State Machine

```
  Provisioned
      |
      v
  HealthChecking  --(fails)--> Unhealthy (retried per Health Monitor schedule; may be decommissioned)
      |
      v
  Available  <----------------------------+
      |                                     |
      v                                     | released cleanly / recovered
   Leased                                    |
      |                                     |
      v                                     |
  InSession -> InExecution -> Cleanup -----+
      |
      | (failure at any point)
      v
  Failed --(Recovery Manager)--> Recovering --(success)--> Available
      |                                          |(exhausted)
      v                                          v
  Decommissioned                            Decommissioned
```

### 6.3 State Definitions

| State | Meaning |
|---|---|
| `Provisioned` | Browser resource created/registered but not yet health-verified. |
| `HealthChecking` | Initial or periodic health verification in progress. |
| `Unhealthy` | Failed health check; not eligible for leasing until recovered or decommissioned. |
| `Available` | Healthy, in a pool, eligible for leasing. |
| `Leased` | Assigned to a specific requester via `LeaseHandle`, not yet in active session. |
| `InSession` | A Browser Session has been created on this leased browser. |
| `InExecution` | A workflow is actively executing within this browser's session/context. |
| `Cleanup` | Session/context teardown in progress following execution completion. |
| `Failed` | Browser, session, or engine-level failure detected during any non-terminal state. |
| `Recovering` | Recovery Manager attempting recover-in-place or reallocation. |
| `Decommissioned` | Permanently removed from the pool (unrecoverable failure, pool scale-down, or explicit removal). |

### 6.4 Lifecycle Diagram — Sequence (Happy Path)

```
TaskQueue   Coordinator   Scheduler   ResourceManager   SessionManager   ContextManager   ExecutionCoordinator   Engine(Plugin)   MetricsCollector
   |             |             |              |                |                |                   |                  |               |
   |--executeWorkflow(workflow)->|             |              |                |                |                   |                  |               |
   |             |--validate----|              |                |                |                |                   |                  |               |
   |             |--schedule--->|              |                |                |                |                   |                  |               |
   |             |              |--allocate--->|                |                |                |                   |                  |               |
   |             |              |<--LeaseHandle-|                |                |                |                   |                  |               |
   |             |--createSession---------------->|                |                |                   |                  |               |
   |             |<--SessionHandle-----------------|                |                |                   |                  |               |
   |             |--createContext------------------------------->|                |                   |                  |               |
   |             |<--ContextHandle---------------------------------|                |                   |                  |               |
   |             |--dispatch------------------------------------------------------->|                   |                  |               |
   |             |                                                                    |--execute(workflow)->|               |               |
   |             |                                                                    |<--WorkflowExecutionResult-|               |               |
   |             |<--WorkflowExecutionResult-----------------------------------------|                   |                  |               |
   |             |--cleanup(session,context)---------------------------------------------------------------------------->|               |
   |             |--release(browser)------------->|                |                |                   |                  |               |
   |             |--record------------------------------------------------------------------------------------------------------------------>|
   |<--WorkflowExecutionResult--|             |              |                |                |                   |                  |               |
```

---

## 7. Browser Resource Model

The `BrowserResourceRecord` is the canonical internal representation of a browser resource, tracked in Browser Registry.

| Field | Description / Why It Exists |
|---|---|
| `browserId` | Unique identity for this browser resource instance; primary key in Browser Registry. |
| `poolId` | Which Browser Pool this browser belongs to, governing its policy set (size limits, engine type, tenant scoping). |
| `sessionId` | The currently associated Browser Session, if `InSession` or later — null when `Available`/`Leased` without an active session. |
| `contextId` | The currently associated Browser Context, if context isolation is in use — null for engines/workflows not using sub-session contexts. |
| `workerId` | Identifies the specific coordinator/worker instance managing this browser in a distributed deployment (Section 18), enabling ownership tracing in multi-instance topologies. |
| `leaseOwner` | The identity (Task Queue-originated request/workflow ID) currently holding the lease — enforces single-owner leasing discipline and supports lease-expiration reclamation. |
| `workflowId` | The workflow currently (or most recently) executing on this browser — correlates browser state to a specific piece of work. |
| `taskId` | The originating Task Queue task ID, propagated through for end-to-end tracing consistent with `requestId`/`correlationId` propagation in the Request Manager MDD. |
| `engineReference` | Which Browser Automation Engine plugin (and version) this browser is backed by — resolved at pool-creation time, never chosen ad hoc by this module. |
| `browserStatus` | Current lifecycle state (Section 6.3). |
| `health` | Current `BrowserHealthStatus` (healthy/unhealthy, last check timestamp, latency). |
| `capabilities` | Declared capabilities of the backing engine (e.g., supports contexts, supports downloads, supports network interception) — read-only, sourced from the engine plugin, used by Browser Context Manager and Browser Scheduler to make capability-aware decisions without hardcoding per-engine knowledge. |
| `metadata` | Free-form descriptive metadata (browser version, OS/platform, resource class) supplied by the engine plugin at provisioning time. |
| `tags` | Operator/policy-assigned labels (e.g., `high-memory`, `headless`) used for pool segmentation and scheduling affinity. |
| `version` | Schema/record version, supporting safe evolution of the resource model over time. |
| `organization` | Tenant-level scoping identifier — required for multi-tenant isolation (Section 16, Section 18.6). |
| `namespace` | Sub-tenant or environment-level scoping (e.g., `production`, `staging`) within an organization. |
| `project` | Project-level scoping, consistent with the `ProjectReference` concept in the Request Manager MDD. |
| `createdTime` | When this browser resource was provisioned — feeds pool-age/rotation policy. |
| `lastActivity` | Timestamp of the most recent lease/session/execution activity — feeds idle-timeout reclamation and stale-resource detection. |

---

## 8. Browser Pool Management

### 8.1 Pool Creation
Pools are created either statically (at module startup, per a Configuration-Manager-supplied manifest listing pool definitions: engine type, min/max size, tenant scope) or dynamically (an operator or an automated policy registers a new pool at runtime) — mirroring the Provider Manager MDD's static/dynamic registration duality.

### 8.2 Pool Allocation
Browser Resource Manager selects a specific browser from within a pool per a configured selection strategy (least-recently-used by default, with reuse-affinity for matching tenant/context profile as a Should-Have optimization, Section 17.1).

### 8.3 Pool Scaling
Browser Pool Manager monitors utilization (leased/available ratio) and Browser Scheduler's queued-request depth; when sustained demand exceeds a configured high-water mark, it requests provisioning of additional browsers (up to configured pool max) via the abstract engine interface's provisioning capability; scales down (decommissioning idle browsers) when utilization falls below a configured low-water mark, subject to a configured minimum pool size.

### 8.4 Pool Health
Aggregated from individual browser health (Health Monitor); a pool is considered degraded when the proportion of unhealthy/unavailable browsers exceeds a configured threshold, surfaced via `HealthChanged` (Section 12) at the pool level in addition to per-browser events.

### 8.5 Pool Cleanup
Periodic sweep (Lifecycle Manager, driven by Browser Pool Manager) decommissions browsers exceeding a configured max-age or idle-timeout, and reclaims leases exceeding a configured lease-timeout without corresponding activity (Section 13 Lease Expiration).

### 8.6 Browser Leasing
Strict single-owner leasing: a browser is leased to exactly one `leaseOwner` at a time; `LeaseHandle` carries an expiry, and Recovery Manager/Browser Pool Manager reclaim expired leases automatically, publishing a distinct event so the reclamation is auditable rather than silent.

### 8.7 Browser Reuse
For engines/workflows that support it, a released browser returns to `Available` (rather than being decommissioned) for reuse by a subsequent lease, subject to a configured reuse policy (e.g., "reuse only within the same tenant" or "always recycle after N leases" for hygiene) — reducing cold-start overhead per Section 17.

### 8.8 Pool Monitoring
Pool-level metrics (utilization, size, health ratio, scaling events) are continuously exposed via Metrics Collector (Section 15) and consumed by Dashboard Backend.

---

## 9. Browser Scheduling

### 9.1 Immediate Scheduling
The default path: an allocation request is granted immediately from an `Available` browser if pool capacity permits.

### 9.2 Delayed Scheduling
When no browser is immediately available and the pool is not at its max (scaling is possible), the request is queued pending a scale-up action or another browser's release, per a configured max-wait policy.

### 9.3 Priority Scheduling
Allocation requests may carry a priority tag (propagated from the originating workflow/task, consistent with the `priority` field pattern established in the Request Manager MDD); Browser Scheduler orders queued requests by priority, with configurable starvation-prevention (aging) to guarantee low-priority requests are not indefinitely starved.

### 9.4 Queue Coordination
Browser Scheduler's internal allocation queue is distinct from, and downstream of, the platform-level Task Queue — this module only queues *contending allocation requests*, never workflow business scheduling, which remains entirely the Task Queue's responsibility.

### 9.5 Concurrency Limits
Enforced per pool (max concurrent leases) and per tenant (max concurrent leases per organization/namespace/project), both policy-driven via Policy Engine, preventing any single tenant or workload from monopolizing shared browser capacity.

### 9.6 Backpressure
When a pool is at max size, at max concurrency, and the allocation queue itself exceeds a configured depth, new allocation requests are rejected with a classified `PoolExhaustedError` (Section 13) rather than queued indefinitely, protecting system stability and giving the Task Queue clear signal to apply its own backoff/retry policy.

### 9.7 Worker Allocation
In distributed deployments (Section 18), "worker" refers to the coordinator instance managing a given browser (`workerId` in Section 7); Browser Scheduler's allocation decisions are worker-aware so requests are routed to a coordinator instance that actually owns capacity, avoiding cross-instance contention races.

### 9.8 Load Balancing
Across multiple pools serving equivalent capability (e.g., two pools both backed by the same engine type for redundancy), Browser Scheduler distributes allocation requests to balance utilization, using the same live pool-utilization signal that drives scaling decisions.

---

## 10. Browser Execution Coordination

### 10.1 Workflow Assignment
Once a browser is leased and session/context created, Workflow Coordinator formally assigns the workflow to that resource triple (browser/session/context), recorded in State Manager as `InExecution`.

### 10.2 Engine Selection Request
The specific engine backing a pool is fixed at pool-creation time (Section 8.1) — this module does not perform per-workflow engine selection intelligence (that would duplicate Router/Capability-Selector-style logic inappropriately for browser resources); instead, workflow requests may specify a *required pool* or *required engine capability tag*, and Browser Scheduler allocates from a matching pool. Any true "which engine is best for this workflow" intelligence, if ever needed, belongs upstream (Planner/Task Queue), consistent with the Provider Manager MDD's Non-Goal that selection intelligence never lives in the execution/orchestration layer.

### 10.3 Session Creation
Covered in Section 5.4/Section 6 — performed via the abstract engine interface strictly after a successful lease.

### 10.4 Execution Tracking
Execution Coordinator maintains a live status handle for the in-progress workflow, updated as the Browser Automation Engine Plugin System reports progress (if the engine interface supports incremental progress reporting) or, at minimum, updated on final completion/failure.

### 10.5 Execution Monitoring
Health Monitor and Execution Coordinator jointly watch for stuck/unresponsive executions (no progress signal within a configured timeout window), feeding Recovery Manager.

### 10.6 Completion Tracking
On workflow completion (success or failure), Execution Coordinator finalizes `WorkflowExecutionResult`, hands off to Workflow Coordinator for cleanup sequencing, and triggers `WorkflowCompleted`/execution-failure events.

### 10.7 Cleanup
Context and session teardown, performed via the abstract engine interface, always executed regardless of workflow outcome (success, failure, or cancellation) — cleanup is not conditional on success, guaranteeing no resource leak.

### 10.8 Recovery
Covered fully in Section 13; Execution Coordinator's role is limited to detecting and classifying the failure and handing off to Recovery Manager — it does not itself decide retry/reallocate/fail policy.

### 10.9 Explicit Execution Boundary

**Actual browser execution belongs exclusively to the Browser Automation Engine Plugin System.** Every component in this section (Workflow Coordinator, Execution Coordinator) is limited to: assigning resources, dispatching a workflow definition through the abstract engine interface, observing status/results, and coordinating cleanup/recovery around that dispatch. No component in the Browser Automation module ever performs, simulates, or partially implements a DOM operation, browser protocol call, or engine-specific API call. This mirrors, exhaustively and by design, the Provider Manager MDD's boundary with the Provider Plugin System (Section 2.4 Non-Goals of that document) — the same architectural pattern applied to a different execution domain.

---

## 11. Public Interfaces

### 11.1 `allocateBrowser(poolId, requesterContext) -> LeaseHandle`
- **Purpose:** Request a leased browser from a specified (or policy-resolved default) pool, without yet creating a session.
- **Input:** `poolId` (or capability/tag-based selector), `requesterContext` (tenant scope, priority, workflow/task correlation IDs).
- **Output:** `LeaseHandle` (`browserId`, `leaseOwner`, `expiresAt`).
- **Validation:** Tenant scope must be permitted against the target pool's isolation policy.
- **Errors:** `PoolExhaustedError`, `PoolNotFoundError`, `TenantIsolationViolationError`.

### 11.2 `leaseBrowser(browserId, requesterContext) -> LeaseHandle`
- **Purpose:** Request a lease on a *specific* browser (used for reuse-affinity scenarios where a caller wants to continue using a previously-released browser it has affinity with).
- **Input:** `browserId`, `requesterContext`.
- **Output:** `LeaseHandle`.
- **Validation:** Target browser must be `Available` and tenant-scope-compatible.
- **Errors:** `BrowserNotAvailableError`, `BrowserNotFoundError`, `TenantIsolationViolationError`.

### 11.3 `releaseBrowser(leaseHandle) -> ReleaseResult`
- **Purpose:** Release a leased browser back to the pool (available for reuse or decommissioned, per pool reuse policy).
- **Input:** `leaseHandle`.
- **Output:** `ReleaseResult` (`success`, `finalStatus`: `available`/`decommissioned`).
- **Validation:** Lease must exist and belong to the requesting owner (or be an authorized administrative release).
- **Errors:** `LeaseNotFoundError`, `LeaseOwnershipMismatchError`.

### 11.4 `createSession(leaseHandle, sessionOptions) -> SessionHandle`
- **Purpose:** Create a Browser Session on a leased browser.
- **Input:** `leaseHandle`, `sessionOptions` (isolation requirements, engine-specific opaque options passed through without inspection).
- **Output:** `SessionHandle`.
- **Validation:** Lease must be valid and in `Leased` state.
- **Errors:** `SessionCreationFailedError`, `InvalidLeaseStateError`.

### 11.5 `closeSession(sessionHandle) -> void`
- **Purpose:** Explicitly close a session (and any child contexts) ahead of full browser release, e.g., for callers managing multiple sequential sessions on one leased browser.
- **Input:** `sessionHandle`.
- **Errors:** `SessionNotFoundError`.

### 11.6 `executeWorkflow(workflowDefinition, executionOptions) -> WorkflowExecutionResult`
- **Purpose:** The primary, comprehensive entry point — runs the full Browser Lifecycle (Section 6) for a given workflow: allocate, lease, session/context create, execute, collect, cleanup, release, in one coordinated call.
- **Input:** `workflowDefinition` (opaque to this module beyond structural validation — the actual step content is Planner-authored and interpreted entirely by the Browser Automation Engine Plugin System), `executionOptions` (pool/engine selector, tenant scope, priority, timeout).
- **Output:** `WorkflowExecutionResult` (status, engine-reported output references, duration, resource lineage).
- **Validation:** Structural validation only (Section 6 "Validate Workflow" stage) — business-content validation of the workflow is Validation Engine's responsibility upstream, not re-implemented here.
- **Errors:** `PoolExhaustedError`, `EngineUnavailableError`, `WorkflowExecutionFailedError`, `WorkflowTimeoutError`.
- **Side Effects:** Publishes the full lifecycle event sequence (Section 12); consumes and releases browser resources.

### 11.7 `cancelWorkflow(workflowId) -> CancellationResult`
- **Purpose:** Cancel an in-progress workflow execution.
- **Input:** `workflowId`.
- **Output:** `CancellationResult` (`accepted`, current status).
- **Validation:** Workflow must exist and be in a cancellable (non-terminal) state.
- **Errors:** `WorkflowNotFoundError`, `InvalidStateTransitionError`.
- **Side Effects:** Propagates cancellation into the active engine execution; triggers cleanup/release exactly as a normal completion would.

### 11.8 `recoverWorkflow(workflowId) -> RecoveryResult`
- **Purpose:** Explicitly trigger recovery evaluation for a workflow that appears stuck/failed (also invoked automatically by Recovery Manager, but exposed publicly for operator-triggered recovery).
- **Input:** `workflowId`.
- **Output:** `RecoveryResult` (action taken: `recovered`, `reallocated`, `failed`).
- **Errors:** `WorkflowNotFoundError`, `RecoveryNotApplicableError` (workflow already terminal).

### 11.9 `getBrowserStatus(browserId | workflowId) -> StatusView`
- **Purpose:** Read-only status query, either browser-resource-centric or workflow-centric.
- **Output:** `StatusView` (current lifecycle state, health, lease info, or workflow execution status as applicable).
- **Errors:** `NotFoundError`.

---

## 12. Events

| Event | Publisher | Subscribers | Payload | Trigger | Retry Behaviour |
|---|---|---|---|---|---|
| `BrowserAllocated` | Browser Resource Manager (via Lifecycle Manager) | Monitoring, Dashboard Backend | `{ browserId, poolId, leaseOwner }` | Successful lease | None |
| `BrowserReleased` | Browser Resource Manager | Monitoring, Dashboard Backend | `{ browserId, poolId, finalStatus }` | Lease released | None |
| `SessionCreated` | Browser Session Manager | Monitoring | `{ sessionId, browserId }` | Session successfully created | None |
| `WorkflowStarted` | Execution Coordinator | Task Queue, Monitoring | `{ workflowId, browserId, poolId }` | Workflow dispatched to engine | None |
| `WorkflowCompleted` | Execution Coordinator | Task Queue, Monitoring, Dashboard Backend | `{ workflowId, durationMs, resultSummary }` | Successful workflow completion | None |
| `WorkflowCancelled` | Workflow Coordinator (via Lifecycle Manager) | Task Queue, Monitoring | `{ workflowId, reason }` | `cancelWorkflow()` invoked | None |
| `BrowserRecovered` | Recovery Manager | Monitoring, Alerting | `{ browserId, workflowId, recoveryAction }` | Recovery attempt succeeds | None |
| `PoolScaled` | Browser Pool Manager | Monitoring, Dashboard Backend | `{ poolId, previousSize, newSize, direction }` | Pool scale-up/down action | None |
| `HealthChanged` | Health Monitor | Monitoring, Alerting, Browser Pool Manager, Recovery Manager | `{ browserId or poolId, previousStatus, newStatus }` | Health status transition | None |
| `WorkflowExecutionFailed` | Execution Coordinator | Task Queue, Monitoring, Alerting | `{ workflowId, errorClassification }` | Terminal, unrecoverable execution failure | None |
| `LeaseExpired` | Browser Pool Manager (reclamation sweep) | Monitoring, Audit | `{ browserId, leaseOwner, leasedDurationMs }` | Lease exceeds configured timeout without activity | None |

Event publication is best-effort/fire-and-forget, consistent with the Event Bus MDD's delivery guarantees; a publish failure is logged but never blocks orchestration.

---

## 13. Error Handling

| Error Condition | Handling |
|---|---|
| **Pool Exhaustion** | Browser Scheduler returns `PoolExhaustedError` once queue-depth/backpressure thresholds are exceeded (Section 9.6); the Task Queue is expected to apply its own backoff/retry per its own MDD's policy — this module does not silently block indefinitely. |
| **Lease Expiration** | Browser Pool Manager's reclamation sweep (Section 8.5) detects leases exceeding configured timeout without activity, force-releases them (publishing `LeaseExpired`), and returns the browser to `Available` (after a health re-check) or `Decommissioned` if the expiration coincided with an apparent failure. |
| **Session Failure** | Session creation failure via the abstract engine interface is classified (transient vs. permanent); transient failures trigger a bounded retry on the same browser; permanent failures (e.g., engine reports the browser process is unresponsive) escalate to Recovery Manager for reallocation. |
| **Engine Unavailable** | If the Browser Automation Engine Plugin System reports the backing engine itself is unavailable (analogous to Provider Manager's `ProviderUnavailableError`), the affected pool is marked degraded, no new allocations are routed to it until recovery, and in-flight workflows on that pool's browsers are escalated to Recovery Manager. |
| **Browser Failure** | A crashed/unresponsive browser mid-workflow is detected by Execution Coordinator/Health Monitor, classified, and handed to Recovery Manager; the failed browser is decommissioned (never returned to `Available` without passing a fresh health check). |
| **Resource Exhaustion** | If Persistence Manager or Cache Manager's backing store itself becomes unavailable/exhausted (distinct from browser pool exhaustion), the module fails closed for new allocations (safer than allocating without durable tracking) while continuing to service `getBrowserStatus()` reads from best-effort cached state, logged at `error` level with alerting. |
| **Recovery Strategy** | Recovery Manager applies, in order: (1) recover-in-place (retry the workflow step on the same browser/session if the failure was classified transient and the browser itself remains healthy), (2) reallocate (release the failed browser, allocate a fresh one, restart the workflow from a Planner/Task-Queue-defined restart point — this module does not itself know how to resume mid-workflow business logic), (3) fail-and-release (exhaust recovery attempts per configured `maxRecoveryAttempts`, release/decommission the browser, return a terminal `WorkflowExecutionFailedError` to the Task Queue). |

---

## 14. Logging

| Log Category | Contents |
|---|---|
| **Browser Logs** | Lifecycle transitions per browser resource (`Provisioned` -> ... -> `Decommissioned`), always including `browserId`, `poolId`. |
| **Pool Logs** | Pool creation, scaling events, health aggregation transitions. |
| **Session Logs** | Session/context creation and teardown events, including `sessionId`, `contextId`, `browserId`. |
| **Execution Logs** | One entry per workflow execution attempt: `workflowId`, `taskId`, `browserId`, outcome, duration. |
| **Recovery Logs** | Every recovery attempt, the classification that triggered it, the strategy applied, and the outcome. |
| **Audit Logs** | Lease grants/releases/expirations and pool scaling actions, always including the acting identity/tenant context for compliance traceability. |

All logs include `taskId`/`workflowId` and, where available, the originating `requestId`/`correlationId` propagated from upstream (Task Queue/Planner/Request Manager), consistent with the cross-module tracing convention established in the Request Manager and Provider Manager MDDs.

---

## 15. Monitoring

| Metric | Description |
|---|---|
| **Pool Utilization** | Leased/available browser ratio per pool, over time. |
| **Browser Health** | Aggregate healthy/unhealthy browser counts per pool, uptime percentage. |
| **Execution Throughput** | Workflows completed per second/minute, per pool/tenant. |
| **Session Count** | Active session count, per pool/tenant. |
| **Workflow Duration** | p50/p95/p99 workflow execution duration, per pool/engine type. |
| **Recovery Rate** | Recovery attempts / total failures, broken down by strategy (recover-in-place / reallocate / fail). |
| **Resource Usage** | Pool size vs. configured max, scaling event frequency, lease-expiration rate (a proxy for abandoned/stuck workflows upstream). |

---

## 16. Security

| Concern | Handling |
|---|---|
| **Session Isolation** | Every Browser Session is scoped to exactly one `leaseOwner`; no session is ever shared across concurrent, unrelated workflow executions, preventing cross-workflow data leakage within a browser. |
| **Browser Isolation** | Contexts (where engine-supported) provide sub-session isolation (cookies/storage) for concurrent, independent operations; where not engine-supported, this module enforces session-level (not context-level) isolation as the floor, never silently assuming an isolation guarantee the engine cannot provide (`capabilities` field, Section 7, governs this). |
| **Tenant Isolation** | `organization`/`namespace`/`project` scoping (Section 7) is enforced at allocation time (Section 11.1–11.2 validation) — a lease request from one tenant can never be satisfied by a pool/browser scoped to another tenant, per Policy Engine-resolved isolation rules. |
| **Access Control** | This module assumes the caller (Task Queue, ultimately the Planner/Orchestrator Core) has already been authorized to request browser execution at a higher layer, consistent with the Provider Manager MDD's pattern of deferring authorization upstream rather than duplicating it. |
| **Credential Protection** | Any credentials a workflow needs (e.g., login credentials for a target site) are opaque payload within the workflow definition, passed through to the Browser Automation Engine Plugin System without inspection, logging, or persistence by this module — mirroring the Provider Manager MDD's secret-handling discipline. |
| **Auditability** | Every lease grant/release, pool scaling action, and recovery action is logged and event-published with sufficient detail (Section 14, Section 12) to reconstruct resource custody history for any browser at any point in time. |

---

## 17. Performance

### 17.1 Browser Reuse
Released, healthy browsers return to `Available` for reuse rather than default decommissioning (Section 8.7), amortizing cold-start cost across many workflows.

### 17.2 Pool Optimization
Pool sizing (min/max, scaling water-marks) is tuned via Policy Engine configuration per pool/tenant, allowing operators to balance cost (idle browser overhead) against latency (allocation wait time) without code changes.

### 17.3 Session Reuse
Where workflow semantics permit (policy-gated, since session reuse across unrelated workflows risks state leakage if misapplied), a caller may explicitly request continued use of an existing session via `leaseBrowser()` + a session-affinity hint, rather than always creating a fresh session per workflow.

### 17.4 Distributed Pools
Pools may be sharded across multiple coordinator/worker instances (Section 18); Browser Scheduler's worker-aware allocation (Section 9.7) ensures requests are efficiently routed without cross-instance coordination overhead on the hot path.

### 17.5 Parallel Coordination
Multiple workflow executions proceed concurrently across different leased browsers with no global lock; concurrency control is scoped per-pool/per-tenant only where policy limits require it (Section 9.5).

### 17.6 Memory Optimization
Browser Registry and State Manager retain only resource/workflow metadata (never captured page content, screenshots, or downloaded artifacts — those are engine-plugin-produced outputs referenced, not embedded, in `WorkflowExecutionResult`), bounding this module's own memory footprint regardless of workflow content size.

### 17.7 Caching
Cache Manager (Section 5.16) reduces redundant Policy Engine resolution and pool-capacity-snapshot recomputation under high request volume.

---

## 18. Enterprise Scalability

### 18.1 Horizontal Scaling
Browser Automation Coordinator instances are largely stateless with respect to any individual workflow beyond what is tracked in Browser Registry/State Manager (both backed by a pluggable, swappable persistence layer, Section 5.15) — any number of coordinator instances can run concurrently, each owning a subset of pools/browsers (tracked via `workerId`, Section 7).

### 18.2 Vertical Scaling
Individual coordinator instances can be vertically scaled for higher local pool capacity/throughput without code change, as a pure deployment/configuration concern.

### 18.3 Distributed Browser Pools
A single logical pool (as seen by policy/scheduling) may be physically distributed across multiple coordinator instances, each managing a shard of the pool's browsers; Browser Pool Manager's scaling and Browser Scheduler's allocation logic are designed against this sharded model from the outset (mirroring the Knowledge Comparison Engine MDD's `DistributionStrategyPort` pattern — a `PoolDistributionStrategyPort` extension point serves the analogous role here).

### 18.4 Distributed Browser Coordinators
Multiple coordinator instances coordinate pool/lease state through the shared Persistence Manager backend (Section 5.15) and Event Bus, avoiding any single-instance bottleneck for the platform's overall browser orchestration capacity.

### 18.5 Cross-Region Deployment
Pools may be defined per-region (analogous to the Provider Manager MDD's multi-region provider pattern: distinct `poolId`s per region, e.g., `us-pool`, `eu-pool`), with Task Queue/Planner supplying region-aware pool selectors — this module requires no code change to support this, only configuration/pool topology.

### 18.6 Multi-Tenant Isolation
Enforced structurally via `organization`/`namespace`/`project` scoping on both pools and leases (Section 7, Section 16), with Policy Engine resolving tenant-specific concurrency and isolation policy — supporting unlimited organizations without any per-tenant code branching.

### 18.7 Elastic Scaling
Pool auto-scaling (Section 8.3) directly implements elastic capacity response to demand; Metrics Collector's utilization/throughput signals feed both this module's internal scaling logic and any external platform-level autoscaler (e.g., for the coordinator instances themselves), consistent with the Provider Manager MDD's approach of exposing signals rather than implementing infrastructure-level autoscaling itself.

### 18.8 High Availability
Because coordinator instances share state through Persistence Manager/Event Bus rather than in-process-only memory, the failure of one instance does not lose track of browsers/leases owned by other instances; browsers owned by a failed instance are detected via missed heartbeats (Health Monitor) and their leases eventually reclaimed (Section 13 Lease Expiration) by a surviving instance.

### 18.9 Fault Tolerance
Per-browser and per-workflow failure isolation (Section 13) ensures a single browser crash or engine hiccup never cascades into a coordinator-wide failure; Recovery Manager's bounded retry/reallocation strategy contains failure blast radius to the individual workflow.

### 18.10 Disaster Recovery
Persistence Manager's durable backing store (Section 5.15) is the recovery point for Browser Registry/State Manager on a full coordinator-fleet restart; in-flight workflows at the moment of a disaster are treated as failed on restart (their leases will have expired) and are the Task Queue's responsibility to re-dispatch, consistent with this module never claiming ownership of workflow business-continuity guarantees beyond its own resource bookkeeping.

### 18.11 Leader Election & Distributed Locking
For pool-level operations that must not be performed redundantly by multiple coordinator instances simultaneously (e.g., a single pool's scale-up decision), a leader-election mechanism (per-pool or per-shard) or distributed lock (via the shared Persistence Manager backend, e.g., a database-backed lock or a dedicated coordination service) ensures exactly one instance drives that decision at a time — this is an explicit extension point (`DistributedCoordinationPort`) rather than a v1 hard requirement for single-region, moderate-scale deployments, but the architecture is designed so the port can be implemented without touching Browser Pool Manager's core scaling logic.

### 18.12 Capacity Planning
Pool Utilization and Resource Usage metrics (Section 15) directly inform capacity planning; the module itself does not perform capacity planning/forecasting — it exposes the signals for external planning tools/operators to consume.

### 18.13 Supporting the Stated Scale Targets
- **Millions of browser workflows / hundreds of thousands of browser sessions:** Supported via horizontal scaling of stateless-per-workflow coordinator instances plus distributed pool sharding (18.3); no architectural ceiling exists since no component holds unbounded in-process state.
- **Thousands of browser coordinators:** Supported via the shared-state (Persistence Manager + Event Bus) coordination model (18.4) rather than any single coordinating bottleneck instance.
- **Unlimited browser pools / unlimited organizations:** Both are consumed as configuration/data (Policy Engine, Browser Registry entries) rather than being enumerated in code — adding a new pool or onboarding a new organization is a configuration change, never a code change.

---

## 19. Interaction With Other Modules

### 19.1 Planner

- No direct call relationship — the Planner produces browser workflow definitions that are handed to the Task Queue for dispatch; this module never receives a workflow directly from the Planner.

### 19.2 Task Queue — Sequence Diagram

```
TaskQueue          BrowserAutomation           EventBus
   |--executeWorkflow(workflowDef)-->|                  |
   |                                  |  (full lifecycle, Section 6)  |
   |                                  |--publish WorkflowStarted----->|
   |                                  |--publish WorkflowCompleted--->|
   |<--WorkflowExecutionResult--------|                  |
```

### 19.3 Browser Automation Engine Plugin System — Sequence Diagram

```
ExecutionCoordinator        EnginePluginSystem (abstract interface)
       |--createSession(config)----------------->|
       |<--SessionHandle---------------------------|
       |--execute(workflowDefinition)------------->|
       |<--WorkflowExecutionResult-------------------|
       |--closeSession(sessionHandle)-------------->|
       |<--ack---------------------------------------|
```

### 19.4 Configuration Manager — Sequence Diagram

```
PolicyEngine              ConfigurationManager
    |--resolvePolicy(org, namespace, project)-->|
    |<--BrowserPolicySet--------------------------|
```

### 19.5 Event Bus

- Pure publisher for all events in Section 12; also a subscriber where distributed coordination (Section 18.4) relies on Event-Bus-propagated state-change notifications across coordinator instances.

### 19.6 Logger

- Consumed via injected interface for all logging categories (Section 14).

### 19.7 Dashboard Backend — Sequence Diagram

```
DashboardBackend         MetricsCollector
      |--getPoolMetrics(poolId)-->|
      |<--AggregateSnapshot--------|
```

---

## 20. Folder Structure

```
browser-automation/
├── domain/
│   ├── entities/
│   │   ├── BrowserResourceRecord.ts       # Section 7
│   │   ├── WorkflowExecutionResult.ts
│   │   ├── LeaseHandle.ts
│   │   ├── SessionHandle.ts
│   │   └── ContextHandle.ts
│   ├── value-objects/
│   │   ├── BrowserId.ts
│   │   ├── PoolId.ts
│   │   ├── WorkflowId.ts
│   │   └── BrowserHealthStatus.ts
│   └── state-machine/
│       ├── BrowserLifecycleStateMachine.ts    # Section 6.2
│       └── WorkflowExecutionStateMachine.ts
│
├── application/
│   ├── use-cases/
│   │   ├── AllocateBrowserUseCase.ts
│   │   ├── LeaseBrowserUseCase.ts
│   │   ├── ReleaseBrowserUseCase.ts
│   │   ├── CreateSessionUseCase.ts
│   │   ├── CloseSessionUseCase.ts
│   │   ├── ExecuteWorkflowUseCase.ts
│   │   ├── CancelWorkflowUseCase.ts
│   │   ├── RecoverWorkflowUseCase.ts
│   │   └── GetBrowserStatusUseCase.ts
│   └── ports/                              # Interfaces this module depends on (driven ports)
│       ├── BrowserEngineInterface.ts       # The abstract contract every engine plugin implements
│       ├── BrowserRegistryPort.ts
│       ├── PersistencePort.ts
│       ├── EventBusPort.ts
│       ├── ConfigurationPort.ts
│       ├── LoggerPort.ts
│       ├── PoolDistributionStrategyPort.ts  # Section 18.3
│       └── DistributedCoordinationPort.ts   # Section 18.11
│
├── components/                             # Internal components from Section 5
│   ├── BrowserAutomationCoordinator.ts
│   ├── BrowserRegistry.ts
│   ├── BrowserPoolManager.ts
│   ├── BrowserSessionManager.ts
│   ├── BrowserContextManager.ts
│   ├── WorkflowCoordinator.ts
│   ├── ExecutionCoordinator.ts
│   ├── PolicyEngine.ts
│   ├── BrowserScheduler.ts
│   ├── BrowserResourceManager.ts
│   ├── LifecycleManager.ts
│   ├── HealthMonitor.ts
│   ├── RecoveryManager.ts
│   ├── MetricsCollector.ts
│   ├── PersistenceManager.ts
│   ├── CacheManager.ts
│   └── StateManager.ts
│
├── infrastructure/                         # Adapters implementing the ports
│   ├── persistence/
│   │   └── DatabaseBackedPersistenceAdapter.ts  # v1; swappable per Section 18
│   ├── event-bus/
│   │   └── EventBusAdapter.ts
│   ├── logging/
│   │   └── StructuredLoggerAdapter.ts
│   └── coordination/
│       └── DistributedLockAdapter.ts        # Implements DistributedCoordinationPort (Section 18.11)
│
├── interface/                              # Driving adapters — how callers invoke this module
│   └── core/
│       └── BrowserAutomationFacade.ts       # Implements the public interfaces from Section 11
│
├── config/
│   └── browser-automation.config.schema.ts  # Pool/lease/timeout/recovery policy schema
│
├── tests/
│   ├── unit/
│   ├── pool/
│   ├── session/
│   ├── lifecycle/
│   ├── recovery/
│   ├── performance/
│   ├── stress/
│   ├── chaos/
│   └── regression/
│
└── README.md
```

**Note:** No folder in this structure contains any browser-engine-specific code (no Playwright/Selenium/Puppeteer/CDP imports anywhere). Actual Browser Automation Engines live in a **separate, independently versioned Browser Automation Engine Plugin System** module/repository, each implementing `application/ports/BrowserEngineInterface.ts` and nothing more from this module's perspective — directly mirroring the Provider Manager MDD's Provider Plugin System separation.

---

## 21. Testing Strategy

| Test Type | Coverage |
|---|---|
| **Unit Tests** | Every component in Section 5 tested in isolation with mocked ports — e.g., Browser Scheduler tested against a table of contention scenarios (immediate/delayed/priority/backpressure) without a real pool; Lifecycle Manager tested through every legal and illegal state transition. |
| **Pool Tests** | Pool creation, scaling (up/down), health aggregation, and cleanup tested against configurable Mock Engine plugins simulating varying provisioning latency/failure rates. |
| **Session Tests** | Session/context creation and teardown tested against Mock Engines with varying declared `capabilities` (e.g., an engine that does not support contexts) to verify graceful capability-aware behavior. |
| **Lifecycle Tests** | Full `executeWorkflow()` pipeline exercised end-to-end against Mock Engines, verifying every stage of Section 6.1 executes in order and cleanup/release always occurs regardless of outcome. |
| **Recovery Tests** | Fault injection at every stage (session failure, engine unavailable, browser crash mid-workflow) verifying Recovery Manager selects the correct strategy (recover-in-place / reallocate / fail) per configured policy. |
| **Performance Tests** | Measure this module's own orchestration overhead (allocation + session/context creation + cleanup time) independent of actual engine execution latency, using Mock Engines with near-zero simulated latency. |
| **Stress Tests** | High-concurrency allocation/execution bursts to validate Browser Scheduler backpressure correctness, pool scaling behavior under sustained load, and Browser Registry consistency under concurrent writes. |
| **Chaos Tests** | Simulated coordinator instance failure mid-workflow (in a multi-instance test topology) verifying lease reclamation and workflow failure/recovery behave correctly without orphaned resources; simulated Persistence Manager backend unavailability verifying fail-closed behavior (Section 13 Resource Exhaustion). |
| **Regression Tests** | A fixed corpus of previously-observed failure/recovery scenarios re-run on every change to Lifecycle Manager/Recovery Manager logic to catch unintended behavioral drift. |

Mock Engine plugins (configurable behavior: always succeed, fail N times then succeed, simulate slow provisioning, simulate mid-workflow crash, declare specific capability sets) are used across all test types without ever depending on a real browser engine, mirroring the Provider Manager MDD's Mock Provider testing pattern.

---

## 22. Future Expansion

Designed so the following require **no changes to Browser Automation source code**, only new engine plugins, new configuration, or new adapter implementations behind existing ports:

- **Distributed Browser Clusters:** Enabled by `PoolDistributionStrategyPort` (Section 18.3) and `DistributedCoordinationPort` (Section 18.11), already present as extension points.
- **Cloud Browser Providers / Remote Browser Farms:** Any new provider (Browserbase, Browserless, a future cloud provider) is added purely as a new engine plugin implementing `BrowserEngineInterface`; this module treats a remote farm identically to a local pool — the engine plugin internally handles the remoteness.
- **Dynamic Resource Allocation:** A future policy-driven allocation strategy (e.g., auto-selecting pool/resource class based on workflow characteristics) is addable as a new Browser Scheduler strategy implementation without touching the scheduler's core contention-handling logic.
- **Custom Browser Policies:** Already fully supported in v1 via Policy Engine + Configuration Manager (Section 5.8) — no further architectural work needed, only policy documents.
- **Plugin-Based Coordinators:** A `CoordinatorStrategyPort` (a natural extension of the existing `DistributionStrategyPort`/`DistributedCoordinationPort` pattern) can be introduced if fully custom coordination logic is ever needed, without modifying `components/` core sequencing logic.
- **Future Browser Technologies:** Any technology not yet conceived is supported the same way as every other engine — a new `BrowserEngineInterface` implementation — since this module's only contact point with execution technology is that one abstract interface, deliberately capability-oriented rather than protocol- or vendor-specific.

---

## 23. Risks

| Risk Category | Description | Mitigation |
|---|---|---|
| **Architecture** | Confusing this module's boundary with the Browser Automation Engine Plugin System's (e.g., adding a "quick" direct browser call for convenience) would violate the orchestration-only constraint and reintroduce tight coupling to a specific engine. | The Purpose section's explicit "never executes browser operations directly" constraint, combined with the total absence of any browser-library import in this module's dependency list (Section 4.2, Section 20), makes such a violation structurally difficult, not just policy-discouraged — mirroring the identical guardrail in the Provider Manager MDD. |
| **Pool Risks** | Poorly tuned pool sizing/scaling water-marks could lead to either excessive idle-browser cost or excessive allocation-wait latency under bursty demand. | Pool Utilization and Resource Usage metrics (Section 15) provide the empirical signal to tune water-marks; scaling thresholds are fully configuration-driven (Section 8.3), allowing per-environment tuning without code changes. |
| **Performance** | A slow-provisioning or hanging engine could exhaust allocation-queue capacity if Browser Scheduler's backpressure thresholds are misconfigured. | Backpressure (Section 9.6) and mandatory timeouts on every engine-interface call (mirroring the Provider Manager MDD's mandatory-timeout pattern) prevent unbounded resource exhaustion even under a misbehaving engine. |
| **Scalability** | A single coordinator instance's in-memory-only state (if Persistence Manager's backend were skipped) would prevent horizontal scaling and lose all lease/registry state on restart. | Persistence Manager's durable, pluggable backend (Section 5.15) is a first-class v1 component, not an afterthought, directly enabling Section 18's horizontal-scaling and high-availability guarantees. |
| **Maintenance** | As the number of supported browser engines grows, the Browser Automation Engine Plugin System could become large and inconsistent in quality if plugin authors interpret `BrowserEngineInterface` loosely (echoing the identical risk noted in the Provider Manager MDD for provider plugins). | Contract tests against `BrowserEngineInterface` (Section 21, mirroring the Provider Manager MDD's contract-test discipline) provide an enforceable, automatable certification gate for any new or updated engine plugin. |
| **Coupling Drift** | Contributors might be tempted to add engine-specific conditionals (`if engineType === "playwright"`) directly into Browser Automation components for convenience, or to have this module perform planning/business-logic shortcuts for browser workflows. | This document's explicit "MUST NOT contain browser engine implementations / DOM operations / business logic" constraints (Purpose section, Section 4.2) and code review discipline treat any such addition as a design violation requiring escalation, exactly mirroring the Coupling Drift guardrails already established in the Request Manager, Provider Manager, and Knowledge Comparison Engine MDDs. |

---

## 24. Design Decisions

| Decision | Rationale | Trade-off / Alternative Considered |
|---|---|---|
| **All browser engines implemented as external plugins behind one `BrowserEngineInterface`, never as internal Browser Automation code** | Directly mirrors the Provider Manager MDD's proven plugin-architecture pattern; guarantees the "unlimited future browser engines without modifying source code" requirement and keeps this module's cohesion high (orchestration mechanics only, never engine specifics). | Alternative: built-in support for a "primary" engine (e.g., Playwright) with plugins only for others — rejected for the same reason it was rejected in the Provider Manager MDD: it creates two extension paths and invites special-casing (Coupling Drift risk, Section 23). |
| **Resource-centric Browser Registry kept structurally distinct from workflow-centric State Manager** | Browsers and workflows have different lifecycles and different query patterns (an operator asking "what's the state of browser X" is a different question from "what's the state of workflow Y") — separating them keeps each component's responsibility singular, consistent with the resource-vs-request-centric separation pattern seen in the Request Manager MDD (`Request` object vs. Registry). | Alternative: one unified registry keyed ambiguously by either ID type — rejected as it would blur two genuinely different concerns and complicate the state-machine definitions for each. |
| **Recovery strategy limited to recover-in-place / reallocate / fail, with no attempt to resume mid-workflow business logic** | This module has no visibility into workflow business semantics (that's Planner-owned); attempting to "resume from step 7" would require business-logic awareness this module must never have (Section 4.2 Non-Goals). | Alternative: build workflow-step-aware resumption directly into Recovery Manager — rejected as a direct violation of the orchestration/business-logic boundary; restart-point semantics, if desired, are the Planner/Task Queue's responsibility to define and re-dispatch. |
| **Browser reuse and session reuse both policy-gated (not default-on) for cross-tenant safety** | Reuse improves performance (Section 17) but risks state leakage (cookies, storage, cached credentials) across unrelated workloads if applied indiscriminately; making it explicit, policy-controlled, and tenant-scoped avoids a default configuration that could create a security issue. | Alternative: always reuse browsers/sessions for maximum performance — rejected as an unsafe default; the architecture supports aggressive reuse where an operator explicitly opts in via policy, but never assumes it is safe. |
| **Distributed coordination (leader election / distributed locking) treated as an explicit v1.x extension point rather than a hard v1 requirement** | Consistent with the PRD's initial single-region/moderate-scale deployment target (mirroring the identical reasoning in the Request Manager, Provider Manager, and Knowledge Comparison Engine MDDs) — building full distributed-coordination machinery prematurely would add complexity without near-term benefit, while the port-based design (Section 18.11) keeps the upgrade path cheap. | Alternative: require full distributed coordination from day one given the stated hyperscale target — rejected as premature engineering investment ahead of the PRD's staged rollout plan; the architecture is *designed for* hyperscale without *requiring* it be built before it's needed. |

---

## 25. Architectural Constraints

The following constraints are normative and binding for this module. They do not alter the existing architecture; they define the governance boundary that preserves it.

- Browser Automation never performs DOM operations.
- Browser Automation never executes browser-engine APIs directly.
- Browser Automation never imports Playwright.
- Browser Automation never imports Selenium.
- Browser Automation never imports Puppeteer.
- Browser Automation never imports CDP libraries.
- Browser Automation never performs workflow planning.
- Browser Automation never selects AI models.
- Browser Automation never performs provider communication.
- Browser Automation never performs validation.
- Browser Automation never performs review.
- Browser Automation never manages knowledge.
- Browser Automation never stores business workflow data.
- Browser Automation only orchestrates browser resources through the abstract Browser Engine Interface.

## 26. Architecture Decision Records (ADRs)

### ADR-01: Browser Orchestration Separated from Browser Execution
- **Decision:** Browser Automation coordinates resource lifecycle and execution orchestration while the Browser Automation Engine Plugin System owns actual browser execution.
- **Context:** Browser engines differ in protocol, APIs, and failure modes; direct embedding of engine-specific logic into this module would create unmaintainable coupling.
- **Alternatives Considered:** Embedding Playwright/Selenium/Puppeteer logic directly in Browser Automation; maintaining one engine-specific code path with special cases.
- **Rationale:** Separation preserves portability, clean architecture boundaries, and future engine extensibility without changing the orchestration module.
- **Consequences:** The orchestration layer remains stable while engine-specific implementations evolve independently.

### ADR-02: Browser Engine Plugin System Abstraction
- **Decision:** All browser execution is accessed through a single abstract Browser Engine Interface.
- **Context:** The platform must support multiple browser engines with no code changes to Browser Automation.
- **Alternatives Considered:** Hard-coded engine selection per workflow; a plugin registry inside Browser Automation.
- **Rationale:** An abstract interface provides a stable contract and keeps orchestration logic engine-agnostic.
- **Consequences:** New engines are added behind the plugin boundary rather than inside the orchestration module.

### ADR-03: Pool-Based Resource Management
- **Decision:** Browsers are managed as pooled, leaseable resources rather than ad hoc one-off allocations.
- **Context:** Browser startup and teardown are expensive; shared resource pools improve efficiency and reuse.
- **Alternatives Considered:** Allocating a fresh browser for every workflow; managing browsers as unmanaged global processes.
- **Rationale:** Pooling centralizes lifecycle management, health monitoring, reuse policy, and scaling governance.
- **Consequences:** Resource utilization is more predictable and operationally governable.

### ADR-04: Session and Context Separation
- **Decision:** Browser Sessions and Browser Contexts are managed as distinct logical structures with separate lifecycle ownership.
- **Context:** Different workflows need isolation, reuse, and controllable state boundaries.
- **Alternatives Considered:** Treating sessions and contexts as the same entity; ignoring context isolation entirely.
- **Rationale:** Separation improves isolation, observability, and compatibility with engines that support contextual execution scopes.
- **Consequences:** Lifecycle management is more precise and safer for concurrent workloads.

### ADR-05: Browser Leasing Model
- **Decision:** A browser is leased to exactly one owner for a bounded period and is released on completion or failure.
- **Context:** Shared browser resources require strict ownership and bounded contention.
- **Alternatives Considered:** Shared browser usage without explicit leasing; leaseless ownership by workflow.
- **Rationale:** Single-owner leasing prevents cross-workflow interference and simplifies cleanup and recovery.
- **Consequences:** Ownership, auditability, and recovery semantics become deterministic.

### ADR-06: Stateless Coordinator Design
- **Decision:** Browser Automation Coordinator remains stateless with respect to individual workflows beyond the state stored in registry and state management services.
- **Context:** The module must scale horizontally and survive coordinator restarts without losing operational continuity.
- **Alternatives Considered:** In-memory workflow state tightly bound to a single coordinator instance.
- **Rationale:** Stateless orchestration supports resilience, failover, and distributed operation.
- **Consequences:** A coordinator instance can be restarted or replaced without losing the ability to recover resource state.

### ADR-07: Event-Driven Lifecycle
- **Decision:** Lifecycle transitions and operational events are emitted through the Event Bus rather than hidden in direct procedure calls.
- **Context:** Monitoring, recovery, metrics, and distributed coordination all depend on timely visibility into lifecycle state.
- **Alternatives Considered:** Centralized polling-only monitoring; direct in-process callbacks for every transition.
- **Rationale:** Event-driven updates create loose coupling and consistent observability across subsystems.
- **Consequences:** The module is easier to observe, extend, and scale.

### ADR-08: Distributed Coordination Through Ports
- **Decision:** Distributed coordination is implemented via explicit ports and adapters rather than embedded in the core orchestration flow.
- **Context:** Future deployments may require leader election, distributed locks, or cross-instance coordination.
- **Alternatives Considered:** Hard-coding distributed coordination into the coordinator core.
- **Rationale:** Ports allow future coordination strategies without destabilizing the base architecture.
- **Consequences:** The system remains extensible while staying simple for single-region deployments.

### ADR-09: Clean Architecture
- **Decision:** Browser Automation is implemented as an application/use-case layer over domain entities and driven ports.
- **Context:** The module must remain maintainable and testable across a changing execution landscape.
- **Alternatives Considered:** Monolithic procedural orchestration with direct dependencies on engines and infrastructure.
- **Rationale:** Clean Architecture isolates business rules, orchestration logic, and infrastructure concerns.
- **Consequences:** The module can evolve with fewer regressions and less coupling.

### ADR-10: Hexagonal Architecture
- **Decision:** Browser Automation uses hexagonal boundaries so the core orchestrator depends on ports instead of concrete implementations.
- **Context:** The module must remain decoupled from engine implementations, persistence choices, and event transport mechanisms.
- **Alternatives Considered:** Intra-module direct calls to persistence, engine libraries, and event infrastructure.
- **Rationale:** Hexagonal architecture makes the core domain portable and maintainable.
- **Consequences:** The module can be adapted to new transport or storage backends without architectural rewrites.

## 27. Browser Versioning Governance

Browser versioning is governed as a first-class operational concern to preserve compatibility, reproducibility, and safe evolution.

- **Browser Resource Schema Versioning:** Every BrowserResourceRecord version is recorded and validated on read/write. Schema changes must be backward-compatible or accompanied by a migration path.
- **Pool Schema Versioning:** Pool definitions carry a policy/schema version so scaling and allocation logic can evolve safely.
- **Session Schema Versioning:** Session records include a version field for lifecycle and capability evolution.
- **Context Schema Versioning:** Context records include a version field to preserve context isolation semantics across upgrades.
- **Browser Policy Versioning:** Resolved BrowserPolicySet versions are tracked so policy changes are auditable and roll-back capable.
- **Engine Capability Versioning:** Engine capability declarations are versioned and compared against required workflow capabilities before allocation.
- **Lifecycle Versioning:** Lifecycle state machine definitions and transition rules are versioned to support orderly migration and regression testing.
- **Public API Versioning:** Public interfaces and payload structures are versioned so callers can evolve independently of internal implementation changes.
- **Backward Compatibility:** Non-breaking changes are preferred. Breaking changes require a new API version, documented migration path, and compatibility window.
- **Historical Reproducibility:** Operational state and lifecycle records must retain enough version information to reconstruct historical browser/resource state for incident analysis.

## 28. Ownership Matrix

| Concern | Owner |
|---|---|
| Browser orchestration | Browser Automation |
| Browser pools | Browser Automation |
| Browser leasing | Browser Automation |
| Session lifecycle | Browser Automation |
| Context lifecycle | Browser Automation |
| Workflow coordination | Browser Automation |
| Recovery | Browser Automation |
| Browser health | Browser Automation |
| Browser metrics | Browser Automation |
| Operational persistence | Browser Automation |
| Browser execution | Browser Automation Engine Plugin System |
| DOM interaction | Browser Automation Engine Plugin System |
| Playwright integration | Browser Automation Engine Plugin System |
| Selenium integration | Browser Automation Engine Plugin System |
| Puppeteer integration | Browser Automation Engine Plugin System |
| CDP integration | Browser Automation Engine Plugin System |
| Screenshots / downloads / uploads / JavaScript execution | Browser Automation Engine Plugin System |
| Workflow definitions | Planner |
| Dispatch timing | Task Queue |
| Policies | Configuration Manager |
| Event transport | Event Bus |

## 29. Processing Guarantees

The following guarantees are required operationally and must hold under normal and failure conditions.

- Single-owner browser leasing.
- Deterministic lifecycle transitions.
- Deterministic cleanup.
- Guaranteed browser release.
- Guaranteed session cleanup.
- Guaranteed context cleanup.
- No browser resource leaks.
- Stateless orchestration.
- Complete traceability.
- Fail-safe recovery.

## 30. Browser Identity Model

Browser identity is a first-class operational contract and must remain consistent across the full lifecycle.

| Identifier | Purpose | Uniqueness | Ownership | Propagation | Lifecycle |
|---|---|---|---|---|---|
| `browserId` | Unique browser resource instance | Globally unique within the registry domain | Browser Automation | Propagated to lease/session/workflow records | Created at provision; removed on decommission |
| `poolId` | Pool membership | Unique within the pool domain | Browser Automation | Propagated to browser and allocation records | Created at pool registration; removed on pool deletion |
| `sessionId` | Browser session instance | Unique within the deployment domain | Browser Automation | Propagated to context and workflow records | Created on session create; removed on session close |
| `contextId` | Context scope instance | Unique within the deployment domain | Browser Automation | Propagated with session/workflow lineage | Created on context create; removed on teardown |
| `workflowId` | Logical workflow execution | Unique within the workflow domain | Planner/Task Queue origin; tracked by Browser Automation | Propagated from task dispatch through execution and recovery | Created on workflow submission; terminal on completion/failure |
| `taskId` | Dispatch task identity | Unique within the task domain | Task Queue | Propagated to Browser Automation for traceability | Created on task enqueue; terminal on completion |
| `workerId` | Coordinator or worker instance ownership | Unique within the distributed deployment | Browser Automation | Propagated in distributed coordination records | Created on worker startup; removed on shutdown |
| `leaseId` | Lease instance | Unique within the lease domain | Browser Automation | Propagated to release and recovery events | Created on lease grant; closed on release/expiration |
| `engineId` | Engine plugin identity | Unique within the plugin registry | Browser Automation Engine Plugin System | Propagated to pool and browser records | Created on engine registration |
| `engineVersion` | Engine implementation version | Versioned per engine identity | Browser Automation Engine Plugin System | Propagated to capability and resource metadata | Versioned on plugin release |
| `organizationId` | Tenant organization identity | Unique per organization | Platform tenant domain | Propagated to pool, lease, and workflow records | Persistent across lifecycle |
| `namespaceId` | Namespace or environment identity | Unique within an organization | Platform tenant domain | Propagated to policies and resource scopes | Persistent across lifecycle |
| `projectId` | Project-scoped identity | Unique within a namespace | Platform tenant domain | Propagated to workflow and policy context | Persistent across lifecycle |
| `requestId` | Request-level correlation | Unique per request | Request Manager / upstream caller | Propagated through Browser Automation | Valid for request lifetime |
| `correlationId` | Cross-component correlation | Unique per correlation chain | Upstream orchestration | Propagated across all related components | Valid for workflow lifecycle |
| `traceId` | Distributed trace identity | Unique per trace | Platform observability layer | Propagated end-to-end | Valid for full operation duration |
| `spanId` | Nested operation span | Unique within a trace | Platform observability layer | Propagated per operation segment | Valid for span duration |

## 31. Operational Limits

Operational limits are configuration-driven and must be enforced by policy rather than embedded in business logic.

- Maximum pool size.
- Maximum concurrent browsers.
- Maximum concurrent sessions.
- Maximum contexts per session.
- Maximum lease duration.
- Maximum recovery attempts.
- Maximum queued requests.
- Maximum browser age.
- Maximum idle time.
- Cache limits.
- Persistence retention.

## 32. Observability Standards

The following fields are mandatory for browser lifecycle and execution observability.

- `browserId`
- `poolId`
- `workflowId`
- `taskId`
- `sessionId`
- `contextId`
- `leaseId`
- `workerId`
- allocation latency
- lease duration
- session creation latency
- workflow execution latency
- cleanup duration
- recovery latency
- pool utilization
- browser health
- queue depth
- scaling events
- cache utilization

## 33. Resource Governance

Resource governance ensures that browser resources remain safe, reusable, and auditable.

- Pool lifecycle must be governed by policy and health signals.
- Browser lifecycle must be deterministic from provision to decommission.
- Lease lifecycle must enforce ownership, expiry, and cleanup.
- Session lifecycle must ensure teardown on any terminal outcome.
- Context lifecycle must ensure isolation and cleanup.
- Browser reuse policy must be explicit and tenant-aware.
- Browser recycling policy must be explicit and auditable.
- Pool scaling governance must preserve health and cost balance.
- Resource ownership must be traceable at all times.
- Cleanup guarantees must be enforced even on crash or timeout.

## 34. Policy Governance

Policy governance is the authority layer for runtime behavior and operational control.

- Policy ownership lies with Configuration Manager and the platform policy domain.
- Pool policy precedence is resolved from global defaults, tenant overrides, and request-specific overrides.
- Tenant override rules must be deterministic and auditable.
- Scaling policy governance must be versioned and reviewable.
- Lease governance must define maximum duration, reclamation, and expiry behavior.
- Recovery policy governance must define retry, reallocation, and fail-fast boundaries.
- Session policy governance must define isolation and cleanup expectations.
- Browser reuse governance must be explicit and security-reviewed.
- Versioning must be retained for every policy change.
- Audit requirements must capture who changed what policy and when.

## 35. Failure Recovery Guarantees

Recovery behavior is part of the contract of this module and must be governed, documented, and testable.

- Guaranteed browser cleanup.
- Guaranteed lease release.
- Recovery consistency across coordinator instances.
- Crash recovery for interrupted workflows or lost coordinators.
- Browser decommissioning when recovery is not safe.
- Distributed recovery across multiple coordinator nodes.
- Coordinator restart behavior that preserves resource integrity.
- Recovery after persistence outage without silently corrupting state.
- Safe rolling upgrades without orphaned resources.

## 36. Security Governance

Security governance ensures that browser execution remains isolated, auditable, and tenant-safe.

- Browser isolation must be preserved across pools and sessions.
- Session isolation must prevent cross-workflow data leakage.
- Context isolation must be enforced where supported and safely degraded where not supported.
- Tenant isolation must be enforced at allocation and lease time.
- Credential handling must remain opaque to this module and never be logged or persisted as business content.
- Resource authorization must be enforced through the lease and policy boundary.
- Lease authorization must prevent unauthorized use of a browser resource.
- Immutable audit logging must record lifecycle, recovery, and access events.
- Multi-tenant security must be preserved under shared infrastructure.
- Operational audit requirements must be sufficient for compliance review.

## 37. Future Scalability Governance

The architecture is considered ready for growth, provided the governance rules above remain in effect.

- Distributed browser clusters.
- Multi-region browser pools.
- Remote browser farms.
- Elastic browser provisioning.
- Plugin-based scheduling strategies.
- AI-assisted resource optimization.
- Active-active deployments.
- Geo-distributed browser pools.
- Hyperscale orchestration.
| **Pool-level engine binding fixed at pool-creation time, no per-workflow dynamic engine selection inside this module** | Prevents this module from re-implementing Router/Capability-Selector-style selection intelligence (Section 10.2), preserving the same "selection intelligence lives upstream, execution intelligence lives here" boundary established for AI providers in the Provider Manager MDD. | Alternative: let this module dynamically choose the "best" engine per workflow — rejected as scope creep and a direct duplication of upstream Router responsibility, adapted to a new resource domain but making the identical mistake the Provider Manager MDD explicitly avoided. |

---

## 38. Diagrams

### 25.1 Component Diagram
See Section 5 for the full internal component diagram.

### 25.2 Browser Architecture Diagram

```
+-----------------------------------------------------------+
|                    BROWSER AUTOMATION                     |
|         (depends only on BrowserEngineInterface -- a port)|
+-------------------------+---------------------------------+
                          | implements
        +------------------+------------------+------------------+------------------+
        v                 v                    v                  v                  v
+---------------+ +---------------+ +---------------+ +---------------+ +----------------+
| Playwright      | | Selenium        | | Puppeteer       | | Browser Use     | | Browserbase /     |
| Engine Plugin   | | Engine Plugin   | | Engine Plugin   | | Engine Plugin   | | Browserless        |
+---------------+ +---------------+ +---------------+ +---------------+ +----------------+
```

### 25.3 Browser Lifecycle Diagram
See Section 6.1 and Section 6.2.

### 25.4 Pool Diagram

```
+-------------------------------------------------------------+
|                        BROWSER POOL (poolId)                 |
|  engineReference: Playwright   min: 5   max: 50               |
|                                                                 |
|  [Available] [Available] [Leased->workflowA] [Unhealthy]       |
|  [Leased->workflowB] [Available] [InSession] ...                |
|                                                                 |
|  utilization: 62%   health: 95% healthy   scaling: stable       |
+-------------------------------------------------------------+
```

### 25.5 Sequence Diagram
See Section 6.4 (happy path lifecycle), Section 19.2–19.4 (module interactions).

### 25.6 Folder Structure Diagram
See Section 20.

---

## Appendix B — Consistency Notes

- `workflowDefinition` (Section 11.6) is the structured browser-workflow artifact produced by the Planner per the Planner MDD and dispatched via the Task Queue per the Task Queue MDD; this module treats its step-level content as opaque beyond structural validation and never redefines its schema here.
- `BrowserEngineInterface` (the sole driven port toward execution) is defined and versioned jointly with the Browser Automation Engine Plugin System MDD; this document specifies the capability surface this module requires of it (create session, create context, execute workflow, health check, cancel, provision/decommission) without redefining that sibling document's own internal plugin-loading/validation architecture, which follows the same pattern already established in the Provider Manager MDD for AI provider plugins.
- Tenant scoping fields (`organization`, `namespace`, `project`, Section 7) are consistent with the `ProjectReference` concept established in the Request Manager MDD, and this module assumes the same upstream authorization boundary already established there (Section 16 Access Control).
- Event delivery semantics (best-effort, no publisher-side retry) referenced in Section 12 and Section 19.5 follow the guarantees already established in the Event Bus MDD and are not re-specified here.
- Persistence Manager's durable backend (Section 5.15, Section 18.10) stores only operational coordination state (registry, leases, workflow status) consistent with the Database Design Document's schema conventions for operational/non-business-content tables; it does not store workflow business data, captured page content, or artifacts, which — if persisted at all — are the responsibility of whichever downstream module (e.g., Knowledge Base) the Planner directs the Browser Automation Engine Plugin System's output toward.
