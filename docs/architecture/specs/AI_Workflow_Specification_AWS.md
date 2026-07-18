# AI Workflow Specification (AWS)

**Document Type:** AI Workflow Specification (AWS) — NOT a Module Design Document (MDD) and NOT an architecture document
**Parent System:** Hybrid AI Development Platform
**Status:** Implementation-Ready
**Audience:** Senior Software Engineers, AI Coding Agents, Workflow Implementers, QA Engineers, Product Stakeholders
**Aligns With:** Product Requirements Document (PRD), Software Architecture & Design Document (SAD/SDD), API Specification (ASD), Database Design Document (DDD), and all published Module Design Documents (MDDs): Orchestrator Core, Event Bus, Request Manager, Provider Manager, Provider Plugin System, Model Registry, Capability Selector, Router, Memory Manager, Knowledge Base, Knowledge Comparison Engine, Planner, Task Queue, Review Engine, Validation Engine, Browser Automation, Browser Automation Engine Plugin System, Learning Layer, Configuration Manager, Logger

---

## 1. Executive Summary

### 1.1 Purpose

The AI Workflow Specification (AWS) describes the **business workflows** the Hybrid AI Development Platform executes — the end-to-end sequences by which a user's request becomes planned, executed, reviewed, validated, learned from, and completed. It documents *what happens* during a workflow's execution: which actors and modules participate, in what order, under what conditions, and with what failure/recovery/rollback behavior. It does not document *how* any individual module is built internally — that is the exclusive domain of each module's own MDD.

### 1.2 Goals

- Provide one authoritative catalog of every supported end-to-end workflow.
- Specify actor and module collaboration at the level of "who calls what, in what order, on what event," without prescribing internal implementation.
- Define lifecycle, decision points, failure handling, rollback, and completion criteria precisely enough that two independent teams implementing the same workflow description would produce interoperable results.
- Establish workflow-level identifiers, versioning, and observability standards that apply uniformly across every workflow.

### 1.3 Scope

In scope: business workflow definitions, actor/module collaboration sequences, event flow between modules during a workflow, decision points, failure/rollback/recovery behavior, human approval points, workflow-level governance and versioning.

Out of scope: internal module architecture (see each module's MDD), database schema (see DDD), API request/response formats (see ASD), infrastructure/deployment topology (see SAD/SDD).

### 1.4 Audience

Engineers implementing orchestration logic that strings together existing module interfaces; QA engineers designing workflow-level test suites; product stakeholders reviewing what the platform actually does end-to-end; future contributors proposing new workflows via the governance process (Section 18).

### 1.5 Relationship to Other Documents

| Document | Relationship |
|---|---|
| PRD | The AWS operationalizes the PRD's feature requirements into concrete, executable workflow sequences. |
| SAD/SDD | The AWS assumes the architecture described there (module boundaries, Hexagonal/Event-Driven design) as a given; it never redefines it. |
| MDDs | The AWS references each module's public interface and published events exactly as specified in that module's MDD; it never introduces new module responsibilities or new interface methods. |
| DDD | The AWS references persisted entities (plans, tasks, reviews, etc.) by the identifiers the DDD defines, without specifying schema. |
| ASD | The AWS references API-triggered workflows by the endpoints the ASD defines, without specifying request/response payload shape. |

---

## 2. Workflow Philosophy

The platform's workflows are built on the following principles, consistent with the architecture established across all MDDs:

- **Event-Driven Execution:** Workflow steps advance by modules publishing and consuming events via the Event Bus (per the Event Bus MDD), not via direct synchronous module-to-module calls, except where a module's own MDD explicitly defines a synchronous read (e.g., Router reading Model Registry).
- **Stateless Orchestration:** Orchestrator Core (and any workflow-coordinating logic) holds no long-lived in-memory workflow state between steps; workflow state lives in persisted entities (Plan, Task, Review, Validation records) and is reconstructed from events/persistence on every step, consistent with the statelessness principle established in the Planner and other MDDs.
- **Modular Collaboration:** Every workflow is a choreography of existing module contracts; no workflow definition grants a module new authority beyond what its MDD already specifies.
- **Idempotent Workflows:** Every workflow step is designed so that re-processing the same event/command (e.g., after a crash and retry) produces the same end state rather than duplicating side effects — enforced via idempotency keys (`executionId`, `taskId`, etc., Section on Workflow Standards) checked by the receiving module.
- **Observable Workflows:** Every workflow execution is fully traceable via `correlationId`/`traceId`/`spanId` propagated through every event and module call (Section 15).
- **Recoverable Workflows:** Every workflow supports resumption from its last durable checkpoint after a failure, rather than requiring a full restart (Section 12).
- **Versioned Workflows:** Each workflow definition carries a `workflowVersion`, independent of the versions of the modules it orchestrates, so a workflow's behavior at a given version is reproducible even as underlying modules evolve (Section 16).
- **Human-in-the-Loop Support:** Certain workflow transitions require explicit human approval (Section 13) before proceeding; workflows are designed to suspend cleanly at these points rather than blocking any module.
- **Explainable Execution:** Every completed workflow's history (which modules acted, what decisions were made and why, what evidence supported them) is reconstructable after the fact, consistent with the explainability goals established in the Learning Layer and Planner MDDs.
- **Deterministic State Transitions:** A workflow instance's lifecycle state (Section 3) transitions only in response to well-defined triggers (an event, a completed module operation, a timeout, an explicit approval); no transition occurs implicitly or as a side effect of an unrelated action.

---

## 3. Workflow Lifecycle

### 3.1 Lifecycle Stages

```
REQUESTED ──► VALIDATED ──► PLANNED ──► SCHEDULED ──► EXECUTING ──► REVIEWING ──► VALIDATING
       ──► LEARNING ──► COMPLETED ──► ARCHIVED
```

A workflow may also transition to `FAILED`, `ROLLED_BACK`, `SUSPENDED`, or `CANCELLED` at various points (Section 10, 11, 12).

### 3.2 Stage Definitions

1. **Requested** — An actor (User, VS Code Extension, Dashboard, or a scheduled/system trigger) submits a request that Request Manager accepts and assigns a `requestId`.
2. **Validated** — Request Manager performs structural/entry validation; an invalid request terminates the workflow at this stage without ever reaching Planner.
3. **Planned** — Planner (per the Planner MDD) transforms the validated request/objective into a `Plan` with an `ExecutionGraph`.
4. **Scheduled** — Task Queue accepts the plan's tasks and schedules them for execution, respecting the plan's dependency graph.
5. **Executing** — Router selects capable models/providers (via Capability Selector and Model Registry) and Provider Manager executes each scheduled task; Browser Automation executes any browser-dependent tasks.
6. **Reviewing** — Review Engine evaluates completed task outputs where the workflow's plan calls for review.
7. **Validating** — Validation Engine confirms outputs meet correctness/business criteria where the workflow's plan calls for validation.
8. **Learning** — Learning Layer observes the finished outcome (asynchronously, outside the critical path) and may produce learning candidates/recommendations.
9. **Completed** — All required tasks, reviews, and validations have reached a terminal success state; the workflow's completion criteria (Section 5, per-workflow) are satisfied.
10. **Archived** — The completed workflow's full record is retained in long-term, queryable history per platform retention policy.

### 3.3 Lifecycle State Diagram

```
   ┌───────────┐
   │ REQUESTED  │
   └─────┬─────┘
         │validate
   ┌─────▼─────┐   invalid   ┌──────────┐
   │ VALIDATED  │────────────►│  FAILED   │
   └─────┬─────┘             └──────────┘
         │plan
   ┌─────▼─────┐   planning failure   ┌──────────┐
   │  PLANNED   │─────────────────────►│  FAILED   │
   └─────┬─────┘                      └──────────┘
         │schedule
   ┌─────▼─────┐
   │ SCHEDULED  │
   └─────┬─────┘
         │execute
   ┌─────▼─────┐   unrecoverable failure   ┌──────────────┐
   │ EXECUTING  │──────────────────────────►│ ROLLED_BACK   │
   └─────┬─────┘◄──────suspend/resume───────┴──────────────┘
         │        (Section 12)
   ┌─────▼─────┐   (if plan requires review)
   │ REVIEWING  │
   └─────┬─────┘
         │(if plan requires validation)
   ┌─────▼─────┐
   │ VALIDATING │
   └─────┬─────┘
         │(async, non-blocking)
   ┌─────▼─────┐
   │  LEARNING  │
   └─────┬─────┘
         │
   ┌─────▼─────┐
   │ COMPLETED  │
   └─────┬─────┘
         │retention window elapses
   ┌─────▼─────┐
   │ ARCHIVED   │ (terminal)
   └───────────┘

   A workflow may also enter SUSPENDED (Section 12) from EXECUTING/REVIEWING/VALIDATING,
   and CANCELLED (explicit actor action) from any non-terminal state.
```

### 3.4 Lifecycle Rules

- A workflow instance may only advance forward through the lifecycle, never skip a required stage its workflow definition (Section 5, 6) declares mandatory.
- `Reviewing` and `Validating` are conditionally entered only if the specific workflow's definition requires them (Section 9, Decision Points); workflows that do not require review/validation transition directly from `Executing` to `Learning`/`Completed`.
- `Learning` never blocks `Completed` — the workflow is considered complete once execution/review/validation criteria are met; the Learning Layer's observation continues asynchronously per its own MDD's non-blocking design.
- A workflow may be `SUSPENDED` at any checkpointed stage (Section 12) and later `RESUMED` into the same stage it was suspended from.
- `ROLLED_BACK` is reachable only from `EXECUTING`/`REVIEWING`/`VALIDATING` upon an unrecoverable failure (Section 10, 11), never from `COMPLETED`.

---

## 4. Actors

| Actor | Responsibilities (within workflows) | Interactions | Inputs | Outputs |
|---|---|---|---|---|
| **User** | Initiates requests; provides approvals at human-in-the-loop points (Section 13). | VS Code Extension, Dashboard | Objectives, approvals, feedback | Requests, decisions |
| **VS Code Extension** | Client-side entry point for developer-initiated workflows. | Request Manager (via API) | User actions/objectives | API requests |
| **Dashboard** | Client-side entry point for administrative/monitoring-initiated workflows and approval UI. | Request Manager, Learning Layer, Model Registry, Task Queue (all via their read interfaces) | User actions, approval decisions | API requests, approval submissions |
| **Orchestrator Core** | Coordinates workflow-level sequencing by reacting to events and invoking the next module's public interface at each lifecycle stage. | Every module, via Event Bus and direct public-interface calls per each module's MDD | Lifecycle events | Lifecycle events, module invocations |
| **Request Manager** | Accepts and structurally validates inbound requests, assigns `requestId`. | Orchestrator Core, Event Bus | Raw request | `RequestReceived`/`RequestValidated` events |
| **Planner** | Transforms a validated objective into a `Plan`/`ExecutionGraph`. | Knowledge Comparison Engine, Memory Manager (read-only), Event Bus | Objective, context | `Plan`, `PlanCreated` event |
| **Task Queue** | Schedules and tracks execution of a plan's tasks. | Router, Event Bus | `ExecutionGraph` | Task scheduling/status events |
| **Router** | Selects a capable model/provider for each executable task. | Capability Selector, Model Registry, Provider Manager | Task, capability requirements | Routing decision |
| **Provider Manager** | Executes a routed task against a selected AI provider. | Provider Plugin System, Model Registry (read-only) | Routed task | Task result |
| **Memory Manager** | Supplies and stores contextual memory. | Planner, Learning Layer (read-only consumers) | Memory queries/updates | Memory records |
| **Knowledge Base** | Supplies and stores structured knowledge. | Planner (via Knowledge Comparison Engine), Learning Layer (read-only consumers) | Knowledge queries/updates | Knowledge records |
| **Knowledge Comparison Engine** | Supplies comparative/structured knowledge analysis to Planner. | Knowledge Base, Planner | Objective context | Structured knowledge |
| **Review Engine** | Evaluates completed task outputs for quality/correctness where required. | Task Queue, Event Bus | Task output | `ReviewCompleted` event |
| **Validation Engine** | Confirms outputs meet business/correctness criteria where required. | Task Queue, Review Engine outputs, Event Bus | Task/review output | `ValidationCompleted` event |
| **Learning Layer** | Observes finished outcomes and produces learning candidates/recommendations, asynchronously. | Event Bus (subscribe-only), Memory Manager/Knowledge Base/Model Registry (read-only) | Outcome events | Learning artifacts, recommendations |
| **Browser Automation** | Executes browser-dependent tasks via the Browser Automation Engine Plugin System. | Browser Automation Engine Plugin System, Task Queue | Browser task | Browser task result |
| **Git Manager** | Executes git operations (commit, checkpoint) as directed by a workflow. | Task Queue, Event Bus | Git operation request | `GitCheckpointCreated` event |
| **Configuration Manager** | Supplies workflow-relevant configuration and policy values. | All modules (read) | Configuration queries | Configuration values, `ConfigurationReloaded` events |
| **Logger** | Receives structured logs from every module throughout workflow execution. | Event Bus (subscribe-only) | Log events | Persisted/indexed logs |
| **Event Bus** | Transports every event between every actor/module throughout the workflow. | All modules | Published events | Dispatched events |

---

## 5. Workflow Catalog

| ID | Name | Purpose (one line) |
|---|---|---|
| WF-001 | New Project | Initialize a new project from a user objective through to a scaffolded, planned codebase. |
| WF-002 | Resume Project | Resume an existing, suspended project workflow from its last checkpoint. |
| WF-003 | Architecture Generation | Produce and gain approval for an architectural plan/design for a project or feature. |
| WF-004 | Feature Implementation | Implement a defined feature end-to-end: plan, execute, review, validate. |
| WF-005 | Bug Fix | Diagnose and resolve a defect through a targeted plan/execute/validate cycle. |
| WF-006 | Code Review | Route completed code output through the Review Engine and gather approval. |
| WF-007 | Validation | Confirm a completed output against business/correctness criteria via the Validation Engine. |
| WF-008 | Browser Testing | Execute browser-based validation of a UI-facing change via Browser Automation. |
| WF-009 | Regression Detection | Compare current outcomes against historical baselines to detect regressions. |
| WF-010 | Knowledge Update | Apply an approved knowledge change to the Knowledge Base via its own governance. |
| WF-011 | Memory Promotion | Promote validated session/project memory into longer-lived Memory Manager storage. |
| WF-012 | Git Commit | Commit validated, approved changes via Git Manager, creating a checkpoint. |
| WF-013 | Release Preparation | Aggregate a set of completed, validated changes into a release-ready state. |
| WF-014 | Learning Promotion | Carry a Learning Layer candidate through evaluation to promotion/publication. |

Each is detailed in Section 6.

---

## 6. Detailed Workflow Specifications

### WF-001 — New Project

- **Workflow Identifier / Name:** WF-001 / New Project
- **Purpose:** Establish a new project context and produce an initial plan for scaffolding it.
- **Business Goal:** Let a user go from a stated objective ("build me an X") to a validated, executable initial plan with minimal friction.
- **Trigger:** User submits a "new project" objective via VS Code Extension or Dashboard.
- **Entry Conditions:** No existing `projectId` is referenced; the objective is well-formed enough for Request Manager to accept.
- **Exit Conditions:** A `Plan` exists in `PUBLISHED` status with an associated new `projectId`, and initial scaffolding tasks are `SCHEDULED`.
- **Inputs:** User objective, optional starting constraints (language, framework preferences).
- **Outputs:** `projectId`, `planId`, initial `ExecutionGraph`.
- **Module Sequence:** Request Manager → Orchestrator Core → Planner (consulting Knowledge Comparison Engine, Memory Manager) → Task Queue.
- **Events:** `RequestReceived` → `RequestValidated` → `PlanRequested` → `PlanCreated` → `WorkflowGenerated` → `TaskCreated`(s) → `TaskQueued`(s).
- **Decision Points:** Need Planning? (always yes for this workflow); Need Architecture Approval? (Section 13, if the objective is large/ambiguous, WF-003 is triggered as a sub-workflow first).
- **Parallel Activities:** Knowledge Comparison Engine and Memory Manager context loading occur in parallel during Planner's context-building stage (per the Planner MDD's Planning Context Builder).
- **Retries:** Standard event-delivery retries (Event Bus MDD); a Planning Failure (Planner MDD Section 14) is not automatically retried — it surfaces to the user for a revised objective.
- **Rollback:** If scaffolding task scheduling fails after a plan is published, the plan is marked `SUPERSEDED` and the project creation is rolled back (Section 11); no partial project record is left active.
- **Timeouts:** Planning stage timeout per `planner.config` (Planner MDD); overall workflow timeout per Section 17.
- **Compensation:** None required prior to `SCHEDULED` (nothing external has been mutated yet); after scheduling, compensation cancels any already-dispatched scaffolding tasks.
- **Recovery:** Resumable from `PLANNED` if Task Queue scheduling fails transiently.
- **Audit:** Full `correlationId`-linked event trail from `RequestReceived` through `TaskQueued`.
- **Observability:** Workflow duration measured `REQUESTED`→`SCHEDULED`; see Section 15.
- **Security:** Standard request authentication/authorization (Section 14); no elevated approval required unless Architecture Approval is triggered.
- **Acceptance Criteria:** A new `projectId` exists with an associated `PUBLISHED` plan and at least one `SCHEDULED` task, within the configured workflow timeout.

### WF-002 — Resume Project

- **Purpose:** Resume a previously `SUSPENDED` project-level workflow from its last checkpoint.
- **Business Goal:** Avoid re-doing completed work when a user returns to an in-progress project.
- **Trigger:** User opens an existing project with an incomplete workflow, or an explicit "resume" action.
- **Entry Conditions:** An existing `projectId` with a workflow in `SUSPENDED` state and a valid checkpoint (Section 12).
- **Exit Conditions:** The workflow re-enters the lifecycle stage it was suspended from, with all prior state intact.
- **Inputs:** `projectId`, `executionId` (of the suspended workflow).
- **Outputs:** Resumed workflow instance in its prior lifecycle stage.
- **Module Sequence:** Request Manager → Orchestrator Core (checkpoint lookup) → the module owning the resumed stage (Planner/Task Queue/Router/Provider Manager/Review Engine/Validation Engine, as applicable).
- **Events:** `RequestReceived` → `WorkflowResumeRequested` → (stage-specific resumption event, e.g., `TaskQueued` if resuming mid-execution).
- **Decision Points:** Is the checkpoint still valid (not expired per `retention.*`-style policy)? If expired, the workflow cannot resume and must be re-planned from the objective (falls back to WF-001-style re-entry).
- **Parallel Activities:** None beyond what the resumed stage itself parallelizes.
- **Retries:** Checkpoint lookup retried per standard persistence-failure retry policy (Section 10).
- **Rollback:** N/A (resumption does not itself introduce new mutations beyond what resuming triggers).
- **Timeouts:** Checkpoint-lookup timeout; if exceeded, workflow surfaces a resume failure to the user.
- **Compensation:** None.
- **Recovery:** If resumption itself fails, the workflow remains `SUSPENDED` and may be retried.
- **Audit:** Resume action logged with actor and `executionId`.
- **Observability:** Time-to-resume measured from request to stage re-entry.
- **Security:** Only the project's authorized users/tenant may resume it (tenant isolation, Section 14).
- **Acceptance Criteria:** The workflow instance re-enters its prior lifecycle stage with no loss of previously-completed task results.

### WF-003 — Architecture Generation

- **Purpose:** Produce a proposed architectural plan for a project or major feature and route it through human approval.
- **Business Goal:** Ensure large/ambiguous objectives get an explicit, reviewable architectural plan before implementation work begins.
- **Trigger:** WF-001/WF-004 determines (Decision Point, Section 9) that the objective's scope warrants an explicit architecture step, or a user directly requests architecture generation.
- **Entry Conditions:** A validated objective/feature request exists.
- **Exit Conditions:** An architectural plan exists and has received human approval (Section 13) or has been rejected (returning to the user for a revised objective).
- **Inputs:** Objective, relevant existing knowledge/memory.
- **Outputs:** An architecture-scoped `Plan`, an approval decision.
- **Module Sequence:** Planner (architecture-scoped plan generation) → Dashboard (approval UI) → Orchestrator Core (approval-gated continuation).
- **Events:** `PlanCreated` → `ArchitectureApprovalRequested` → `ArchitectureApproved` | `ArchitectureRejected`.
- **Decision Points:** Approved? If yes, continue to WF-004-style implementation; if no, return to Planner with feedback for revision, or terminate the workflow.
- **Parallel Activities:** None; approval is a blocking human-in-the-loop point by design (Section 13).
- **Retries:** N/A (human decision, not a transient failure).
- **Rollback:** A rejected architecture plan is marked `REJECTED` in Plan history (per the Planner MDD's versioning) with no downstream effect.
- **Timeouts:** Configurable approval-wait timeout (Section 17); on expiry, the workflow transitions to `SUSPENDED` pending later approval rather than failing outright.
- **Compensation:** None (nothing has been executed yet at this stage).
- **Recovery:** Resumable from `SUSPENDED` once approval is eventually given.
- **Audit:** Approval decision logged with approving actor identity and timestamp.
- **Observability:** Time-to-approval measured and reported (Section 15).
- **Security:** Approval action restricted to authorized approver roles (Section 13, 14).
- **Acceptance Criteria:** The architecture plan reaches either `ArchitectureApproved` (continuing the parent workflow) or a terminal rejection with feedback captured.

### WF-004 — Feature Implementation

- **Purpose:** Implement a defined feature end-to-end.
- **Business Goal:** The platform's core value-delivery workflow — turning a feature request into working, reviewed, validated code.
- **Trigger:** User submits a feature objective (directly, or as a continuation of an approved WF-003).
- **Entry Conditions:** A validated objective exists, and (if triggered) architecture approval has been granted.
- **Exit Conditions:** All planned tasks are executed, reviewed (if required), and validated (if required), and the workflow reaches `COMPLETED`.
- **Inputs:** Feature objective, project context.
- **Outputs:** Executed code changes, review/validation records, an optional Git checkpoint (WF-012).
- **Module Sequence:** Planner → Task Queue → Router → Provider Manager (→ Browser Automation, if UI-facing) → Review Engine → Validation Engine → Learning Layer (async) → Git Manager (optional, WF-012).
- **Events:** `PlanCreated` → `WorkflowGenerated` → `TaskCreated`/`TaskQueued`/`TaskStarted`/`TaskCompleted` (per task) → `ProviderSelected` → `ReviewCompleted` → `ValidationCompleted` → `PlanningCompleted`-equivalent workflow completion event.
- **Decision Points:** Need Browser Validation? (Section 9, if the feature is UI-facing); Need Review? Need Validation? Need Retry? (per task outcome).
- **Parallel Activities:** Independent, parallel-eligible tasks (per the Planner MDD's Optimization Engine) execute concurrently via Task Queue/Router.
- **Retries:** Task-level retries per Provider Manager's own retry policy (out of this workflow's implementation scope, referenced only as a black-box behavior); workflow-level retry of an entire failed task sequence is bounded by `operational.maxRetries` (Section 17).
- **Rollback:** A task that fails validation after retries exhausted triggers task-level rollback (Section 11); if the failure is deemed to compromise the whole feature, workflow-level rollback reverts to the last Git checkpoint.
- **Timeouts:** Per-task timeout (Provider Manager/Task Queue's own configuration); overall workflow timeout (Section 17).
- **Compensation:** Reverting any partially-applied code changes to the last known-good checkpoint.
- **Recovery:** Resumable from the last completed task (checkpoint, Section 12) after a transient failure.
- **Audit:** Full task/review/validation event trail under one `correlationId`.
- **Observability:** Per-task and overall workflow duration, retry counts, failure counts (Section 15).
- **Security:** Standard request authorization; merge/deployment-adjacent steps may require additional approval (Section 13) depending on configured policy.
- **Acceptance Criteria:** All plan tasks reach `TaskCompleted`, all required reviews reach `ReviewCompleted` with an approving outcome, all required validations reach `ValidationCompleted` with a passing outcome.

### WF-005 — Bug Fix

- **Purpose:** Diagnose and resolve a defect via a targeted plan/execute/validate cycle.
- **Business Goal:** Efficiently resolve reported defects with minimal unrelated change surface.
- **Trigger:** User reports a bug, or Regression Detection (WF-009) surfaces one automatically.
- **Entry Conditions:** A defect description or a `RegressionDetected` event exists.
- **Exit Conditions:** A fix is implemented, validated against the specific defect, and the workflow reaches `COMPLETED`.
- **Inputs:** Bug description/regression details, relevant code context.
- **Outputs:** A targeted code change, validation confirming the defect no longer reproduces.
- **Module Sequence:** Planner (targeted, typically smaller-scope plan) → Task Queue → Router → Provider Manager → Validation Engine (specifically re-checking the original failure condition) → Learning Layer (async) → Git Manager.
- **Events:** Mirrors WF-004's event sequence at a smaller scope; additionally may consume `RegressionDetected` as a trigger.
- **Decision Points:** Need Review? (often yes, given defect-fix risk); Need Regression Re-check? (always yes — validation must specifically re-test the originally-failing condition).
- **Parallel Activities:** Minimal, given the typically narrow, sequential nature of a bug fix plan.
- **Retries:** Same policy as WF-004.
- **Rollback:** If the fix itself introduces a new regression (detected by Validation Engine or a subsequent WF-009 run), the workflow rolls back to pre-fix state.
- **Timeouts:** Same as WF-004, typically with a shorter default given smaller scope.
- **Compensation:** Revert to last checkpoint if the fix is rejected.
- **Recovery:** Same pattern as WF-004.
- **Audit:** Links back to the originating bug report or `RegressionDetected` event via `correlationId`.
- **Observability:** Time-to-fix measured from trigger to `COMPLETED`.
- **Security:** Standard.
- **Acceptance Criteria:** The originally-reported/detected failure condition no longer reproduces under Validation Engine's re-check, and no new regression is introduced.

### WF-006 — Code Review

- **Purpose:** Route a completed task's output through the Review Engine and gather an approval/rejection outcome.
- **Business Goal:** Ensure code quality/correctness gates are applied consistently before validation/completion.
- **Trigger:** `TaskCompleted` event for a task whose plan marks review as required.
- **Entry Conditions:** A completed task output exists.
- **Exit Conditions:** `ReviewCompleted` (approved) or a review-rejection outcome routed back for rework.
- **Inputs:** Task output, review criteria (from the plan/policy).
- **Outputs:** Review result record.
- **Module Sequence:** Task Queue → Review Engine → Task Queue (outcome routed back) / Validation Engine (if approved and validation also required).
- **Events:** `ReviewStarted` → `ReviewCompleted`.
- **Decision Points:** Approved? If not, is a retry-with-feedback loop configured (bounded by `operational.maxRetries`), or does it escalate to human review (Section 13)?
- **Parallel Activities:** Multiple independent tasks' reviews may run concurrently.
- **Retries:** Bounded automatic rework retries; beyond the limit, escalates to human review.
- **Rollback:** N/A at this stage alone (review does not itself mutate code); a persistently-failing review may trigger task-level rollback within the parent workflow (e.g., WF-004).
- **Timeouts:** Per Review Engine's own configuration (referenced as black-box).
- **Compensation:** None.
- **Recovery:** Resumable — a review can always be re-run against the same task output.
- **Audit:** Full review outcome and rationale logged.
- **Observability:** Review latency and approval-rate metrics (Section 15).
- **Security:** Standard; human-escalated reviews require an authorized reviewer role.
- **Acceptance Criteria:** The task output reaches an approved `ReviewCompleted` state, or the parent workflow is explicitly informed of a rejection for its own handling.

### WF-007 — Validation

- **Purpose:** Confirm a completed (and, if applicable, reviewed) output meets business/correctness criteria via the Validation Engine.
- **Business Goal:** The platform's final automated correctness gate before a change is considered done.
- **Trigger:** `TaskCompleted` (or `ReviewCompleted`, if review preceded it) for a task whose plan marks validation as required.
- **Entry Conditions:** A completed (and, if required, reviewed) task output exists.
- **Exit Conditions:** `ValidationCompleted` with a passing or failing outcome.
- **Inputs:** Task/review output, validation criteria.
- **Outputs:** Validation result record.
- **Module Sequence:** Task Queue/Review Engine → Validation Engine → Task Queue (outcome routed back) / Learning Layer (async observation).
- **Events:** `ValidationStarted` → `ValidationCompleted`.
- **Decision Points:** Passed? If not, is a retry-with-fix loop configured, or does the workflow roll back (Section 11)?
- **Parallel Activities:** Multiple independent tasks' validations may run concurrently.
- **Retries:** Bounded automatic retry of the underlying task-plus-fix cycle.
- **Rollback:** Persistent validation failure beyond retry limits triggers rollback of the associated task/workflow.
- **Timeouts:** Per Validation Engine's own configuration.
- **Compensation:** None at this stage alone.
- **Recovery:** Resumable — validation can always be re-run against updated output.
- **Audit:** Full validation outcome and criteria evaluated logged.
- **Observability:** Validation latency and pass-rate metrics.
- **Security:** Standard.
- **Acceptance Criteria:** The task output reaches a passing `ValidationCompleted` state.

### WF-008 — Browser Testing

- **Purpose:** Execute browser-based validation of a UI-facing change.
- **Business Goal:** Confirm UI-facing changes actually work in a real browser context before being considered validated.
- **Trigger:** A task's plan marks browser validation as required (typically for UI-facing feature work).
- **Entry Conditions:** A completed task output representing a UI-facing change exists.
- **Exit Conditions:** `BrowserValidationCompleted` with a passing or failing outcome.
- **Inputs:** The change under test, browser test scenario definition.
- **Outputs:** Browser validation result (including any captured screenshots per the Browser Automation Engine Plugin System MDD's `captureScreenshot()`).
- **Module Sequence:** Task Queue → Browser Automation (via the Browser Automation Engine Plugin System's selected engine) → Validation Engine (browser result feeds into overall validation).
- **Events:** `BrowserStarted` → `BrowserCompleted` → (feeds into) `ValidationCompleted`.
- **Decision Points:** Passed? Need a specific engine (per capability negotiation, Browser Automation Engine Plugin System MDD Section 9)?
- **Parallel Activities:** Multiple independent browser scenarios may run concurrently across pooled browser sessions (Browser Automation's own concern).
- **Retries:** Bounded automatic retry for transient browser/engine failures.
- **Rollback:** N/A at this stage alone; feeds into the parent workflow's own rollback decision.
- **Timeouts:** Per Browser Automation's own configuration.
- **Compensation:** None.
- **Recovery:** Resumable — the browser test can be re-run against the same or updated change.
- **Audit:** Full browser session/result trail, including captured artifacts (screenshots).
- **Observability:** Browser test latency, pass-rate, and engine-specific performance metrics.
- **Security:** Standard; browser sessions execute in an isolated context (Browser Automation's own isolation guarantees).
- **Acceptance Criteria:** The UI-facing change passes its defined browser test scenario(s).

### WF-009 — Regression Detection

- **Purpose:** Compare current outcomes against historical baselines (via the Knowledge Comparison Engine) to detect regressions.
- **Business Goal:** Catch quality/behavior regressions proactively rather than only reactively via user bug reports.
- **Trigger:** Scheduled/periodic execution, or triggered immediately following a `ValidationCompleted`/`ReviewCompleted` event for a change touching previously-baselined behavior.
- **Entry Conditions:** A prior baseline exists in the Knowledge Base for the relevant scope.
- **Exit Conditions:** A `RegressionDetected` event is published (if a regression is found) or the comparison completes with no findings.
- **Inputs:** Current outcome data, historical baseline reference.
- **Outputs:** Comparison result; `RegressionDetected` event if applicable.
- **Module Sequence:** Knowledge Comparison Engine → Knowledge Base (read) → Event Bus (`RegressionDetected` publication) → Orchestrator Core (may trigger WF-005 automatically per policy).
- **Events:** `KnowledgeCompared` → `RegressionDetected` (conditional).
- **Decision Points:** Regression found? If yes, auto-trigger WF-005, or merely notify for human triage, per configured policy.
- **Parallel Activities:** Multiple scope comparisons (per project/feature area) may run concurrently.
- **Retries:** Standard transient-failure retry.
- **Rollback:** N/A (read-only comparison; no mutation to roll back).
- **Timeouts:** Per Knowledge Comparison Engine's own configuration.
- **Compensation:** None.
- **Recovery:** Fully re-runnable at any time against the same baseline/current data.
- **Audit:** Full comparison result and any resulting regression trail.
- **Observability:** Comparison latency, regression-detection rate.
- **Security:** Standard read-access controls on Knowledge Base.
- **Acceptance Criteria:** Every scheduled/triggered comparison completes and, if a regression exists, a `RegressionDetected` event is reliably published.

### WF-010 — Knowledge Update

- **Purpose:** Apply an approved knowledge change to the Knowledge Base, through Knowledge Base's own governed write interface.
- **Business Goal:** Keep the platform's structured knowledge current as new validated learning/information emerges.
- **Trigger:** A Learning Layer recommendation targeting Knowledge Base (Section 9, Learning Layer MDD) or a direct administrative knowledge-update request.
- **Entry Conditions:** A proposed knowledge change (from a recommendation or a direct request) exists.
- **Exit Conditions:** The Knowledge Base's own write interface confirms the update is applied (or rejected per its own governance).
- **Inputs:** Proposed knowledge content, source recommendation/justification.
- **Outputs:** Updated Knowledge Base record (owned entirely by Knowledge Base itself).
- **Module Sequence:** Learning Layer (recommendation, read-only from this workflow's perspective) → Dashboard/administrative approval (if required by Knowledge Base's own policy) → Knowledge Base (applies the update via its own interface).
- **Events:** `RecommendationGenerated` (Learning Layer) → `KnowledgeUpdateApprovalRequested` (if required) → `MemoryUpdated`/knowledge-equivalent completion event (published by Knowledge Base itself, per its own MDD).
- **Decision Points:** Does policy require human approval before applying? (Section 13).
- **Parallel Activities:** None typically; knowledge updates are usually applied sequentially to avoid conflicting concurrent changes to the same knowledge scope.
- **Retries:** Standard transient-failure retry on the Knowledge Base write call.
- **Rollback:** Handled entirely within Knowledge Base's own versioning (this workflow only initiates the request; rollback of the knowledge record itself is Knowledge Base's own responsibility per its MDD).
- **Timeouts:** Approval-wait timeout (Section 17) if human approval is required.
- **Compensation:** N/A (Knowledge Base's own governance handles this).
- **Recovery:** The update request can be resubmitted if it fails transiently.
- **Audit:** Full trail from originating recommendation to applied update, with actor (automated or human) recorded.
- **Observability:** Time from recommendation to applied update.
- **Security:** Update application restricted to Knowledge Base's own configured authorization rules; this workflow never bypasses them.
- **Acceptance Criteria:** The proposed knowledge change is either applied (confirmed by Knowledge Base) or explicitly rejected with reason recorded.

### WF-011 — Memory Promotion

- **Purpose:** Promote validated session/project memory into longer-lived Memory Manager storage.
- **Business Goal:** Ensure durable, useful context persists beyond a single session/project when it has proven valuable.
- **Trigger:** A Learning Layer recommendation targeting memory promotion, or an explicit user/administrative action.
- **Entry Conditions:** Session/project-scoped memory exists that is a candidate for promotion to a broader scope.
- **Exit Conditions:** Memory Manager's own write interface confirms the promotion (or rejects it per its own governance).
- **Inputs:** Candidate memory content, source recommendation/justification, target scope.
- **Outputs:** Updated Memory Manager record (owned entirely by Memory Manager itself).
- **Module Sequence:** Learning Layer (recommendation) → Dashboard/administrative approval (if required) → Memory Manager (applies the promotion via its own interface).
- **Events:** `RecommendationGenerated` → `MemoryPromotionApprovalRequested` (if required) → `MemoryUpdated` (published by Memory Manager itself).
- **Decision Points:** Does policy require human approval? Is the target scope broader than the source scope (requiring a higher approval bar, mirroring the Learning Layer's own scope-gating policy)?
- **Parallel Activities:** None typically.
- **Retries:** Standard transient-failure retry.
- **Rollback:** Handled within Memory Manager's own versioning.
- **Timeouts:** Approval-wait timeout if required.
- **Compensation:** N/A.
- **Recovery:** Resubmittable if it fails transiently.
- **Audit:** Full trail from recommendation to applied promotion.
- **Observability:** Time from recommendation to applied promotion.
- **Security:** Promotion restricted to Memory Manager's own authorization rules.
- **Acceptance Criteria:** The candidate memory is either promoted (confirmed by Memory Manager) or explicitly rejected with reason recorded.

### WF-012 — Git Commit

- **Purpose:** Commit validated, approved changes via Git Manager, creating a checkpoint.
- **Business Goal:** Durably capture a known-good state of the codebase at meaningful workflow milestones.
- **Trigger:** Successful completion of validation (and review, if required) for a change, per the parent workflow's (e.g., WF-004, WF-005) configured checkpoint policy.
- **Entry Conditions:** A validated (and, if required, reviewed) change exists.
- **Exit Conditions:** `GitCheckpointCreated` event published, confirming the commit.
- **Inputs:** The validated change, commit metadata (message, associated `taskId`/`planId`).
- **Outputs:** A Git checkpoint/commit reference.
- **Module Sequence:** Validation Engine (trigger) → Task Queue → Git Manager.
- **Events:** `ValidationCompleted` → `GitCheckpointCreated`.
- **Decision Points:** Does policy require merge/deployment approval before committing to a protected branch (Section 13)?
- **Parallel Activities:** None; commits are inherently sequential per branch.
- **Retries:** Standard transient-failure retry on the git operation.
- **Rollback:** A failed commit leaves the prior checkpoint intact; no partial commit state is left.
- **Timeouts:** Per Git Manager's own configuration.
- **Compensation:** N/A (a failed commit attempt requires no compensation, since it never partially applied).
- **Recovery:** Resubmittable.
- **Audit:** Full commit metadata and triggering validation/review references logged.
- **Observability:** Commit latency and success-rate metrics.
- **Security:** Commit access restricted per repository/branch permission policy; protected-branch commits require the configured approval (Section 13).
- **Acceptance Criteria:** `GitCheckpointCreated` is published referencing the correct validated change.

### WF-013 — Release Preparation

- **Purpose:** Aggregate a set of completed, validated changes into a release-ready state.
- **Business Goal:** Provide a controlled, reviewable checkpoint before changes are considered ready for deployment (deployment itself is out of this workflow's scope, per Section 20 future expansion).
- **Trigger:** A configured release cadence, or an explicit administrative request.
- **Entry Conditions:** One or more completed, validated changes (each with its own Git checkpoint, WF-012) exist since the last release.
- **Exit Conditions:** A release candidate record exists and has received deployment approval (Section 13) or is explicitly held.
- **Inputs:** The set of changes/checkpoints since the last release.
- **Outputs:** A release candidate record, an approval decision.
- **Module Sequence:** Git Manager (aggregates checkpoints) → Dashboard (release approval UI) → Orchestrator Core (approval-gated continuation).
- **Events:** `GitCheckpointCreated`(s) aggregated → `ReleaseCandidateCreated` → `DeploymentApprovalRequested` → `DeploymentApproved` | `DeploymentRejected`.
- **Decision Points:** All included changes validated? Approved for release?
- **Parallel Activities:** None; release aggregation is inherently sequential over the change history.
- **Retries:** Standard transient-failure retry on aggregation.
- **Rollback:** A rejected release candidate is marked as such with no further effect; individual changes remain in their already-committed state.
- **Timeouts:** Approval-wait timeout (Section 17); on expiry, the release candidate is held pending later approval.
- **Compensation:** N/A.
- **Recovery:** Resumable from `SUSPENDED` once approval is eventually given.
- **Audit:** Full list of included changes/checkpoints and the approval decision logged.
- **Observability:** Time-to-release-approval measured.
- **Security:** Deployment approval restricted to authorized release-manager roles (Section 13, 14).
- **Acceptance Criteria:** The release candidate reaches `DeploymentApproved` (handing off to future deployment automation, Section 20) or a terminal hold/rejection with reason recorded.

### WF-014 — Learning Promotion

- **Purpose:** Carry a Learning Layer candidate through confidence scoring and policy evaluation to promotion/publication.
- **Business Goal:** Ensure the platform's continuous-improvement loop (per the Learning Layer MDD) operates under this workflow's observability and, where configured, human oversight.
- **Trigger:** `LearningCandidateCreated` event.
- **Entry Conditions:** A candidate exists in the Learning Layer's own pipeline (per its MDD).
- **Exit Conditions:** `LearningPromoted` or `LearningRejected`.
- **Inputs:** The learning candidate and its accumulated evidence (entirely owned/managed by the Learning Layer itself, per its own MDD — this workflow only observes and, where configured, gates the process with human approval).
- **Outputs:** A promoted `LearningArtifact`, or a recorded rejection.
- **Module Sequence:** Learning Layer (internal pipeline, per its own MDD) → Dashboard (approval UI, if the candidate's confidence falls in the manual-review band per `promotion.requireManualReviewBelow`) → Learning Layer (finalizes promotion via its own `promoteLearning()`/`rejectLearning()` interface).
- **Events:** `LearningCandidateCreated` → `ConfidenceCalculated` → `LearningApproved` | `LearningRejected` → (if approved) `LearningPromoted`.
- **Decision Points:** Confidence above auto-promotion threshold? Below manual-review threshold (auto-reject or hold)? Between the two (requires human approval, Section 13)?
- **Parallel Activities:** Multiple independent candidates may be evaluated concurrently (per the Learning Layer's own parallel-evaluation design).
- **Retries:** Standard transient-failure retry on the evaluation/promotion calls; policy-resolution failures fail-safe to "hold" per the Learning Layer's own MDD.
- **Rollback:** A rejected candidate requires no rollback (nothing was ever applied); a promoted-then-later-found-flawed artifact is handled via the Learning Layer's own versioning/archival, never by this workflow reaching in directly.
- **Timeouts:** Approval-wait timeout for the manual-review band (Section 17).
- **Compensation:** N/A.
- **Recovery:** Resumable — evaluation can always be re-triggered for a still-pending candidate.
- **Audit:** Full evidence/confidence/policy trail, per the Learning Layer's own provenance guarantees.
- **Observability:** Time-to-promotion-decision, approval rate.
- **Security:** Manual-review approval restricted to authorized roles (Section 13, 14); this workflow never grants the Learning Layer any authority to write to another module directly, consistent with its MDD's Non-Goals.
- **Acceptance Criteria:** The candidate reaches a terminal `LearningPromoted` or `LearningRejected` outcome, fully recorded.

---

## 7. Module Collaboration

The canonical collaboration sequence for a full, review-and-validation-requiring workflow (e.g., WF-004) is:

```
Orchestrator Core
    │ (receives validated request)
    ▼
Planner
    │ (produces Plan/ExecutionGraph)
    ▼
Task Queue
    │ (schedules tasks per dependency graph)
    ▼
Router
    │ (selects capable provider/model per task)
    ▼
Provider Manager
    │ (executes task against selected provider)
    ▼
Memory  ◄──(read context)──┐
Knowledge  ◄──(read context)┤  consulted during Planning, not after execution
    ▼
Review
    │ (evaluates output, if plan requires it)
    ▼
Validation
    │ (confirms correctness, if plan requires it)
    ▼
Learning
    │ (observes outcome, asynchronously — never blocks the chain above)
    ▼
Git
    │ (commits validated change, if checkpoint policy triggers it)
    ▼
Logger
    │ (receives structured logs at every step above)
    ▼
Dashboard
    │ (displays workflow progress/results throughout)
```

Each arrow represents **collaboration through a public interface or an event**, never a shared mutable state or a bypass of module ownership. Memory and Knowledge are consulted (read-only) primarily during Planning, not as a distinct sequential stage after execution — they are shown here to clarify *when* in the sequence they are typically read, not to imply a strict additional lifecycle stage.

---

## 8. Event Flow

### 8.1 Published Events (by originating module, workflow-relevant subset)

Request Manager: `RequestReceived`, `RequestValidated`, `RequestForwarded`.
Planner: `PlanCreated`, `WorkflowGenerated`, `DependenciesResolved`, `PlanningCompleted`, `PlanningFailed`.
Task Queue: `TaskCreated`, `TaskQueued`, `TaskStarted`, `TaskCompleted`, `TaskFailed`.
Router/Provider Manager: `ProviderSelected`, `ProviderFailed`, `ProviderRecovered`.
Review Engine: `ReviewStarted`, `ReviewCompleted`.
Validation Engine: `ValidationStarted`, `ValidationCompleted`.
Browser Automation: `BrowserStarted`, `BrowserCompleted`.
Knowledge Comparison Engine: `KnowledgeCompared`, `RegressionDetected`.
Git Manager: `GitCheckpointCreated`.
Learning Layer: `LearningCandidateCreated`, `ConfidenceCalculated`, `LearningApproved`, `LearningRejected`, `LearningPromoted`, `RecommendationGenerated`.
Configuration Manager: `ConfigurationReloaded`.

### 8.2 Consumed Events (by workflow-orchestrating logic)

Orchestrator Core (and workflow-level coordination logic generally) consumes essentially every event above to advance the workflow's lifecycle stage (Section 3) and to trigger the next module invocation per the workflow's defined sequence (Section 6).

### 8.3 Ordering

Per-topic ordering is guaranteed by the Event Bus (per its own MDD); across topics, workflow logic relies on `correlationId`-based reconstruction rather than assuming strict global ordering — a workflow instance's state machine (Section 3) only advances on the specific triggering event it expects at each stage, tolerating out-of-order arrival of unrelated events.

### 8.4 Correlation

Every event in a workflow's execution shares one `correlationId` (assigned at `RequestReceived`) and a `traceId` (for distributed tracing), with `spanId` scoping individual module operations within that trace — consistent with the identifier standards in every module's MDD.

### 8.5 Event Payloads

This specification does not define event payload schemas — those are owned by each publishing module's own MDD (Section 9-equivalent of each) and the platform's Event Bus envelope (Event Bus MDD Section 6). Workflow logic consumes only the fields those schemas already define.

### 8.6 Retries

Event delivery retries follow the Event Bus's own retry policy (per-category, exponential backoff) — this specification does not define a separate retry mechanism, only which failures at the workflow level should be interpreted as retryable (Section 10).

### 8.7 Dead-Letter Handling

Events that exhaust Event Bus retries land in its Dead Letter Queue (per the Event Bus MDD); a workflow instance whose expected next-stage event never arrives (detected via a workflow-level timeout, Section 17) is treated as a stalled workflow and surfaced for administrative attention, distinct from the Event Bus's own DLQ handling of the underlying event.

### 8.8 Event Versioning

Each event's schema version is owned by its publishing module (per the Event Bus MDD's `version` envelope field); this specification's workflow definitions reference events by name and by the fields already guaranteed by each module's MDD, and are reviewed (Section 18) whenever a referenced event's schema changes in a breaking way.

---

## 9. Decision Points

| Decision | Condition | Outcome (Yes) | Alternative Path (No) |
|---|---|---|---|
| Need Planning? | Objective requires decomposition beyond a single trivial task | Route through Planner (WF-001/003/004) | Skip directly to Task Queue with a single-task plan |
| Need Architecture Approval? | Objective scope/ambiguity exceeds configured threshold | Trigger WF-003 before proceeding | Proceed directly to implementation planning |
| Need Routing? | Task requires a specific capability/model selection | Router selects via Capability Selector/Model Registry | N/A — routing is required for every executable task by architectural constraint |
| Need Browser Validation? | Change is UI-facing per plan metadata | Trigger WF-008 | Skip directly to Validation Engine (non-UI validation only) |
| Need Review? | Plan/policy marks the task category as review-required | Trigger WF-006 | Skip directly to Validation |
| Need Validation? | Plan/policy marks the task category as validation-required | Trigger WF-007 | Task is considered complete without a validation gate (rare, policy-gated) |
| Need Retry? | A task/review/validation fails within the configured retry budget | Re-attempt the failed step | Escalate to rollback (Section 11) or human escalation (Section 10) |
| Need Rollback? | Retries exhausted, or a failure is classified as unrecoverable | Trigger Section 11 rollback procedure | N/A (this is itself the "no more retry" branch) |
| Need Learning? | An outcome reaches a terminal state (success or failure) | Learning Layer observes asynchronously (never blocks) | N/A — observation is always attempted, but its outcome never gates workflow completion |

---

## 10. Failure Handling

| Failure | Recovery | Retries | Compensation | Escalation |
|---|---|---|---|---|
| Planning Failure | Surface to user/administrator with the specific failure detail (per Planner MDD Section 14) | Not automatically retried (a structurally invalid objective would simply reproduce the same failure) | None (nothing executed yet) | User revises objective, or an administrator intervenes |
| Routing Failure | Router/Capability Selector reports no viable candidate | Retried against a broadened candidate set if configured | None | Escalates to human/administrative review if no provider is ever found |
| Provider Failure | Handled entirely within Provider Manager's own retry/fallback policy (black-box to this workflow) | Per Provider Manager's own configuration | N/A at this workflow's level | A task that remains failed after Provider Manager's own retries is reported to Task Queue as `TaskFailed`, triggering this workflow's own retry/rollback decision |
| Review Failure | Rework loop (bounded) or escalation | Bounded automatic retries | None | Human review escalation past the retry limit |
| Validation Failure | Rework loop (bounded) or rollback | Bounded automatic retries | Rollback to last checkpoint if retries exhausted | Human escalation if rollback itself is contested |
| Browser Failure | Retried per Browser Automation's own transient-failure policy | Bounded | None at this workflow's level | Escalates to Validation Failure handling if browser validation cannot ultimately succeed |
| Git Failure | Retried (transient) | Bounded | None (a failed commit never partially applies) | Administrative attention if persistent |
| Memory Failure | Planning proceeds with degraded context (per Planner MDD's graceful degradation) | N/A | None | Logged for administrative attention; does not fail the whole workflow |
| Knowledge Failure | Same graceful-degradation handling as Memory Failure | N/A | None | Same as above |
| Configuration Failure | Workflow-relevant configuration read failures fall back to last-known-good cached configuration where available | Retried | None | Administrative attention if configuration remains unreachable beyond a threshold |
| Recovery (general) | Every failure above leaves the workflow in its last successfully-checkpointed state (Section 12), never an ambiguous partial state | — | — | — |

---

## 11. Rollback Strategy

- **Workflow Rollback:** Reverts the entire workflow instance to its state prior to the failing stage, restoring any Git checkpoint that predates the failure and marking all tasks executed since as reverted.
- **Task Rollback:** Reverts only the specific failing task's effects (e.g., discarding its output) without affecting sibling tasks that already completed successfully and independently.
- **Partial Completion:** A workflow that completes some tasks successfully before an unrecoverable failure retains those completed tasks' results (they are not discarded) unless the parent workflow's policy explicitly requires all-or-nothing completion (configurable per workflow, Section 17).
- **Compensation:** Where a task's effect cannot simply be discarded (e.g., an already-applied file change), compensation applies the inverse change, restoring the pre-task state, via the same module (e.g., Git Manager) that applied the original change.
- **Recovery:** Following rollback, the workflow transitions to `ROLLED_BACK` (a terminal state distinct from `FAILED`, signifying the system was returned to a known-good state) or, if configured, re-enters `PLANNED` for a fresh attempt with revised inputs.
- **User Notification:** Every rollback is surfaced to the initiating user/actor via Dashboard/VS Code Extension notification, including the reason and the state the system was restored to.
- **State Restoration:** State restoration always targets the most recent valid Git checkpoint (WF-012) as the ground truth for code state; any in-flight Task Queue/Router/Provider Manager state associated with the rolled-back workflow is discarded, never left dangling.

---

## 12. Long Running Workflows

- **Suspension:** A workflow may be explicitly suspended (e.g., awaiting human approval, Section 13) or implicitly suspended after a configured period of inactivity; suspension persists the workflow's current lifecycle stage and all completed-so-far state.
- **Resume:** WF-002 defines the resumption sequence; resumption always re-enters the exact lifecycle stage the workflow was suspended from, never restarting from `REQUESTED`.
- **Checkpoint:** A checkpoint is recorded at minimum at every lifecycle stage transition (Section 3) and additionally at every Git commit (WF-012); a checkpoint captures enough state (`planId`, completed `taskId`s, review/validation outcomes so far) to fully reconstruct the workflow's position.
- **Persistence:** Checkpoints are persisted durably (via the Database module, referenced per the DDD) before the corresponding lifecycle-stage event is published, guaranteeing no checkpoint is ever "announced" without being durably recorded.
- **Recovery:** A workflow that was mid-execution when the platform restarted resumes from its last durable checkpoint automatically, without requiring explicit user action, distinct from user-initiated Suspend/Resume.
- **Cancellation:** An explicit actor action that transitions a workflow from any non-terminal state to `CANCELLED`; already-completed tasks' results are retained per the same partial-completion policy as rollback (Section 11), but no further tasks are scheduled.
- **Timeout:** Each lifecycle stage has a configurable maximum duration (Section 17); exceeding it transitions the workflow to `SUSPENDED` (for stages awaiting human input) or `FAILED` (for stages awaiting automated processing that should have completed), per the specific stage's classification.
- **Expiration:** A `SUSPENDED` workflow that remains unresumed beyond a configured retention window is archived as `EXPIRED` (a specialization of `ARCHIVED`) rather than remaining indefinitely resumable.

---

## 13. Human Approval Points

| Approval Point | Workflow | Trigger Condition | Approver Role |
|---|---|---|---|
| Architecture Approval | WF-003 | Objective scope/ambiguity exceeds threshold | Authorized architect/lead role |
| Review Approval | WF-006 (escalated case) | Automatic rework retries exhausted | Authorized reviewer role |
| Merge Approval | WF-012 (protected branch) | Target branch is policy-protected | Authorized maintainer role |
| Configuration Approval | WF-010-adjacent (where Configuration Manager's own governance requires it) | A recommended configuration change targets a sensitive namespace | Authorized administrator role |
| Deployment Approval | WF-013 | Release candidate assembled | Authorized release-manager role |
| Learning Promotion Approval | WF-014 | Candidate confidence falls in the manual-review band | Authorized reviewer/administrator role |

Every approval point suspends the workflow cleanly (Section 12) rather than blocking any module, and every approval decision is logged with approver identity, timestamp, and rationale (Section 14).

---

## 14. Security Considerations

- **Authentication:** Every workflow-initiating request is authenticated per the platform's standard authentication mechanism (owned by the platform's security infrastructure, referenced here rather than redefined).
- **Authorization:** Every workflow step that mutates state (task execution, Git commit, knowledge/memory promotion, learning promotion) is authorized against the initiating actor's role/permissions before proceeding.
- **Approval Workflows:** Human approval points (Section 13) enforce role-based authorization on the approval action itself, distinct from the authorization required to initiate the underlying workflow.
- **Audit:** Every lifecycle transition, module invocation, and approval decision is logged with actor, timestamp, and `correlationId` (Section 15), providing a complete audit trail per workflow execution.
- **Secrets:** Workflow definitions never carry credentials/secrets directly; any credential needed by a module (e.g., Provider Manager's provider credentials) is resolved by that module itself from Configuration Manager, per that module's own MDD.
- **Tenant Isolation:** Every workflow instance carries a `projectId`/organization scope; cross-tenant data access during a workflow is prevented at each module's own interface boundary (per each module's MDD), not re-implemented by this specification.

---

## 15. Observability

- **Metrics:** Workflow-level throughput (workflows started/completed per unit time), stage-level duration distributions, retry counts, failure/rollback rates, approval wait times — all tagged by `workflowId`/`workflowVersion`.
- **Tracing:** Every workflow execution corresponds to one distributed trace (`traceId`), with each module invocation as a child span (`spanId`), enabling full visual reconstruction of a workflow's execution path.
- **Logging:** Every stage transition, decision point outcome, and failure is logged (via each module's own Logger integration, per the Logger MDD) under the workflow's `correlationId`.
- **Correlation IDs:** `correlationId` is assigned at `RequestReceived` and propagated unchanged through every subsequent event/module call for the life of the workflow.
- **Workflow Duration:** Measured `REQUESTED`→`COMPLETED` (or terminal failure state), both overall and per lifecycle stage.
- **Task Duration:** Measured per individual task within the workflow's plan, sourced from Task Queue's own metrics (referenced, not redefined).
- **Retries:** Counted per stage and per workflow instance, surfaced on the Dashboard.
- **Failures:** Counted and categorized (Section 10) per workflow type, surfaced for trend analysis.
- **Recovery:** Time-to-recovery measured from failure detection to successful resumption/rollback completion.

---

## 16. Workflow Versioning

- **Version Identifiers:** Every workflow definition carries a `workflowVersion` (semantic versioning), independent of any module's own version.
- **Compatibility:** A running workflow instance is pinned to the `workflowVersion` active at its `REQUESTED` stage for its entire lifecycle, even if the workflow definition is updated mid-execution — ensuring in-flight workflows are never silently altered.
- **Migration:** A new `workflowVersion` may define a migration path for in-flight instances of the prior version (e.g., mapping an old lifecycle stage to a new one), applied only when explicitly configured; otherwise, in-flight instances complete under their original version.
- **Deprecation:** A deprecated workflow version continues to support already-in-flight instances through completion but rejects new `REQUESTED` instances, surfaced via a deprecation notice per the governance process (Section 18).
- **Execution Reproducibility:** Because every workflow instance records its `workflowVersion` and the full event/decision trail (Section 15), any completed workflow's execution can be fully reconstructed and audited against the exact version of the workflow definition that governed it, regardless of later workflow-definition changes.

---

## 17. Operational Constraints

| Constraint | Default | Notes |
|---|---|---|
| Maximum workflow duration | 24 hours (configurable per workflow type) | Beyond this, the workflow is flagged for administrative review, distinct from a stage-level timeout. |
| Maximum task count per workflow | 500 (configurable) | Guards against pathological plan sizes (mirroring the Planner MDD's decomposition-depth safeguard). |
| Retry limits | 3 automatic retries per stage (configurable per stage type) | Beyond this, escalates per Section 10. |
| Concurrency limits | Configurable per tenant/organization | Prevents a single tenant from monopolizing shared execution capacity. |
| Queue limits | Per Task Queue's own configured capacity (referenced, not redefined) | Workflow-level back-pressure surfaces as a `SUSPENDED` (queue-full) state rather than a hard failure. |
| Timeouts (per stage) | Stage-specific, configurable (Section 3, 12) | See individual workflow specifications (Section 6) for typical defaults. |
| Resource limits | Per Provider Manager/Browser Automation's own resource governance (referenced, not redefined) | This specification only defines workflow-level behavior when a resource limit is hit (retry/backoff/escalation), not the limit's enforcement mechanism itself. |

---

## 18. Workflow Governance

- **Ownership:** Each workflow definition (Section 6) has a designated owning team/role responsible for its correctness and evolution.
- **Approval Process:** A new or materially-changed workflow definition requires review and sign-off from the owning team plus any team whose module is newly referenced in the workflow's module sequence.
- **RFC Process:** Proposed new workflows or significant changes to existing ones are submitted as an RFC referencing this specification's structure (Section 6 template), reviewed by affected module owners before adoption.
- **Change Management:** Changes to a published workflow definition increment its `workflowVersion` (Section 16) and follow the platform's standard change-management/release process.
- **Review Cadence:** Workflow definitions are reviewed on a regular cadence (e.g., quarterly) for continued alignment with the PRD and with each referenced module's current MDD.
- **Deprecation Policy:** A workflow may be deprecated (Section 16) when superseded by a newer version or no longer aligned with product direction; deprecation requires the same approval process as introduction.
- **Compliance Requirements:** Workflows touching regulated data or requiring auditability guarantees (Section 14) must document their specific compliance posture as part of their RFC.

---

## 19. Testing Strategy

| Test Type | Focus |
|---|---|
| Unit Workflow Tests | Individual decision-point logic (Section 9) and stage-transition rules (Section 3) in isolation, using mocked module responses. |
| Integration Workflow Tests | A full workflow (Section 6) executed against real (or realistic in-memory) module implementations, verifying correct module sequencing and event flow. |
| End-to-End Workflow Tests | A full workflow executed against the complete, deployed platform stack, verifying real cross-module behavior. |
| Failure Injection | Deliberately induced failures at each stage (Section 10) verifying correct retry/escalation/rollback behavior. |
| Recovery Testing | Deliberate suspension/restart scenarios (Section 12) verifying correct checkpoint-based resumption. |
| Performance Testing | Workflow throughput and latency under realistic concurrent load, against the operational constraints in Section 17. |
| Chaos Testing | Random module unavailability/latency injected mid-workflow, verifying graceful degradation and no data loss. |
| Contract Testing | Verifies every event/interface a workflow definition references still matches the current version of the owning module's MDD/API Specification. |
| Acceptance Testing | Verifies each workflow's documented Acceptance Criteria (Section 6) against a realistic end-to-end scenario. |

---

## 20. Future Workflows

The following are anticipated future workflow categories, expressible within this specification's existing structure (Section 6 template) without requiring any change to module responsibilities:

- **Multi-Agent Workflows:** Multiple concurrent Planner/Task Queue instances collaborating on a shared objective, coordinated via the same event-driven choreography already defined here.
- **Collaborative Development:** Multiple human actors contributing to the same in-flight workflow (e.g., pair-review), layered on the existing Human Approval Points mechanism (Section 13).
- **CI/CD Integration:** A workflow triggered by an external CI/CD system event, following the same Trigger/Entry Conditions structure as any other workflow (Section 6).
- **Deployment Automation:** A successor to WF-013 that actually performs deployment (currently out of scope, Section 1.3), reusing the same approval-gated structure.
- **Cloud Orchestration:** Workflows spanning multiple deployed platform regions/clusters, reusing the same event-correlation model (Section 8.4) across region boundaries.
- **Enterprise Approval Chains:** Multi-step, multi-role approval sequences extending the single-approver model in Section 13 to a chain, without changing the underlying suspend/resume mechanism (Section 12).
- **Autonomous Optimization:** Learning Layer recommendations (WF-014) applied with progressively less human-in-the-loop gating as confidence in the recommendation pipeline grows, governed entirely by policy configuration, never a workflow-structure change.
- **Organization-Wide Knowledge Sharing:** WF-010/WF-011 extended to `global` scope promotion, already representable via the existing scope field these workflows already reference (per the Knowledge Base and Memory Manager MDDs).

---

## 21. Diagrams

### 21.1 Workflow Diagram (WF-004 example)
See Section 6, WF-004 Module Sequence, and Section 7.

### 21.2 Activity Diagram

```
[Start] → Validate Request → Plan → Schedule Tasks → (parallel) Execute Tasks
    → Review? →(yes) Review →(no)┐
                                  ▼
    → Validate? →(yes) Validate →(no)┐
                                       ▼
    → Learn (async, non-blocking) → Commit? →(yes) Git Commit →(no)┐
                                                                     ▼
    → [Completed]
```

### 21.3 Sequence Diagram
See Section 6 (per-workflow Module Sequence/Events) and Section 7.

### 21.4 State Diagram
See Section 3.3.

### 21.5 Event Flow Diagram
See Section 8.

### 21.6 Decision Tree
See Section 9 (tabular form serves as the decision tree; each row is a decision node with two branches).

### 21.7 Swimlane Diagram

```
User        │ Request Manager │ Planner │ Task Queue │ Router │ Provider Mgr │ Review │ Validation │ Learning │ Git
────────────┼──────────────────┼─────────┼────────────┼────────┼──────────────┼────────┼────────────┼──────────┼─────
 submit ────►                  │         │            │        │              │        │            │          │
             │ validate ───────►         │            │        │              │        │            │          │
             │                  │ plan────►            │        │              │        │            │          │
             │                  │         │ schedule───►        │              │        │            │          │
             │                  │         │            │ route──►              │        │            │          │
             │                  │         │            │        │ execute──────►        │            │          │
             │                  │         │            │        │              │ review─►            │          │
             │                  │         │            │        │              │        │ validate───►          │
             │                  │         │            │        │              │        │            │ learn────►
             │                  │         │            │        │              │        │            │          │ commit
◄────────────────────────────────────────────────── result notification ─────────────────────────────────────────
```

### 21.8 Workflow Dependency Graph

```
WF-003 (Architecture Generation) ──feeds──► WF-004 (Feature Implementation)
WF-009 (Regression Detection) ──may trigger──► WF-005 (Bug Fix)
WF-004 / WF-005 ──may trigger──► WF-006 (Code Review) ──feeds──► WF-007 (Validation)
WF-007 ──may trigger──► WF-008 (Browser Testing, if UI-facing)
WF-007 ──on success──► WF-012 (Git Commit)
WF-012 (aggregated) ──feeds──► WF-013 (Release Preparation)
Any terminal outcome ──observed by (async)──► Learning Layer ──may produce candidate──► WF-014 (Learning Promotion)
WF-014 ──may recommend──► WF-010 (Knowledge Update) / WF-011 (Memory Promotion)
WF-002 (Resume Project) ──re-enters──► whichever workflow/stage was suspended
```

---

## Workflow Standards

### Identifiers

Every workflow execution defines and propagates the applicable subset of: `workflowId`, `workflowVersion`, `executionId`, `requestId`, `sessionId`, `projectId`, `planId`, `taskId`, `providerId`, `reviewId`, `validationId`, `browserSessionId`, `gitOperationId`, `learningId`, `correlationId`, `traceId`, `spanId`.

### Required Execution Metadata

Every workflow execution record defines: `lifecycle state` (Section 3), `initiating actor` (Section 4), `participating modules` (the subset of Section 4's module actors actually invoked), `emitted events` and `consumed events` (Section 8), `checkpoints` (Section 12), `rollback points` (Section 11), `completion status`, and `execution metadata` (timestamps, duration, retry counts).

---

## Architectural Constraints

This specification explicitly affirms:

- The AWS does not redefine module responsibilities; every module's authority and internal design remain exactly as specified in that module's own MDD.
- The AWS references existing module public interfaces and published events rather than implementation details — every module is treated as a black box with a well-defined contract.
- Workflows are versioned independently of the modules they orchestrate (Section 16); a module's internal version may change without requiring a workflow version change, and vice versa.
- All module communication described in this specification occurs through public interfaces and events, exactly as each module's MDD defines them — the AWS introduces no new communication channel, no new interface method, and no direct-access bypass of any module's ownership.
- Business workflows remain independent of any specific AI provider or underlying implementation technology — every workflow's module sequence references Router/Provider Manager/Capability Selector abstractly, never a named provider or engine, consistent with the Provider Plugin System and Browser Automation Engine Plugin System MDDs' Open/Closed design.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| Workflow | A defined, versioned, end-to-end business process orchestrated across multiple platform modules. |
| Workflow Instance | A single, running execution of a workflow definition, identified by `executionId`. |
| Checkpoint | A durably-persisted snapshot of a workflow instance's progress, enabling suspend/resume. |
| Human Approval Point | A defined workflow stage requiring an authorized human decision before the workflow may proceed. |
| Black-Box Module Reference | This specification's convention of referencing a module only by its public interface/events, never its internal implementation. |

---

**End of AI Workflow Specification (AWS)**
