# Planner — Module Design Document (MDD)

**Document Type:** Module Design Document (MDD)
**Module Name:** Planner
**Parent System:** Hybrid AI Development Platform
**Status:** Implementation-Ready
**Audience:** Senior Software Engineers, AI Coding Agents (Cursor, Claude Code, OpenCode, Roo Code)
**Source-of-Truth Inputs:** PRD, SAD, API Specification, Database Design Document, Orchestrator Core MDD, Event Bus MDD, Request Manager MDD, Provider Manager MDD, Provider Plugin System MDD, Model Registry MDD, Capability Selector MDD, Router MDD, Memory Manager MDD, Knowledge Base MDD, Knowledge Comparison Engine MDD

---

## 1. Executive Summary

### 1.1 Purpose

The Planner transforms a high-level objective — a goal expressed by a user or an upstream module — into a validated, optimized, executable **execution graph**: a structured workflow of tasks, their dependencies, and the strategy for carrying them out. It is the platform's sole reasoning layer for "what needs to happen, in what order, and under what constraints," and it produces plans **only**. It never touches execution, providers, routing, or storage of the artifacts it consults.

### 1.2 Responsibilities

The Planner analyzes an objective against available context (organizational policies, relevant knowledge from the Knowledge Comparison Engine, relevant memory from the Memory Manager), decomposes it into goals, subgoals, and concrete tasks, discovers dependencies between those tasks, builds and optimizes an execution graph, validates the result against planning policies and structural correctness rules, and publishes the finished plan for downstream modules (Task Queue, Router, Provider Manager) to execute.

### 1.3 Role

The Planner is the **workflow generation engine** of the platform — a pure transformation from "what should be achieved" to "the validated, structured sequence of steps to achieve it." It is deliberately execution-agnostic: it has no knowledge of which provider will run a task, no knowledge of retry/fallback behavior, and no ability to execute anything itself. Its only output artifact is a Plan.

### 1.4 Architecture Position

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Orchestrator Core                            │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                           │ (events, via Event Bus: PlanRequested)
┌─────────────────────────────────────────▼───────────────────────────────────┐
│                                    Planner (this module)                     │
│  Objective Analysis · Decomposition · Dependency Analysis · Optimization ·   │
│  Validation · Execution Graph Generation                                     │
└───────┬─────────────────────────────────┬───────────────────────────┬───────┘
        │ consults (read-only)             │ consults (read-only)      │ publishes
        ▼                                 ▼                            ▼
┌───────────────────┐          ┌───────────────────┐          ┌───────────────────┐
│ Knowledge Comparison │        │  Memory Manager      │        │   Event Bus         │
│ Engine                │        │                      │        │  (PlanCreated, etc.) │
└───────────────────┘          └───────────────────┘          └─────────┬──────────┘
                                                                          │ dispatch
                                                          ┌───────────────▼───────────────┐
                                                          │  Task Queue → Router →           │
                                                          │  Provider Manager (execution)     │
                                                          └───────────────────────────────┘
```

The Planner sits entirely upstream of execution. It reads from Knowledge Comparison Engine and Memory Manager (read-only), reads planning policy from Configuration Manager, and writes exactly one thing to the rest of the platform: a Plan, delivered as an event via the Event Bus. It has no downstream write access to Task Queue, Router, or Provider Manager — those modules pull/react to the published plan independently.

---

## 2. Goals

### 2.1 Primary Goals

1. Transform a high-level objective into a structurally valid, dependency-correct execution graph.
2. Decompose objectives hierarchically (goals → subgoals → tasks) to an actionable task granularity.
3. Discover and represent all task, resource, data, and execution dependencies accurately.
4. Optimize the resulting workflow for parallelism, critical-path length, and policy compliance without altering its semantic correctness.
5. Validate every plan against structural rules and organizational planning policies before publication.
6. Remain fully execution-agnostic: never select a provider, never execute, never retry.

### 2.2 Secondary Goals

1. Support plan versioning, enabling a plan to be revised in response to new context without losing history.
2. Support reusable plan templates for common objective shapes.
3. Support a planning cache to avoid redundant analysis for structurally similar objectives.
4. Support risk assessment and confidence scoring per plan, as advisory metadata for downstream consumers.

### 2.3 Future Goals

1. AI-assisted planning strategies as pluggable planning algorithms.
2. Hierarchical, multi-level planners (a planner-of-planners) for extremely large objectives.
3. Adaptive/self-optimizing workflows that incorporate execution feedback in future planning cycles (fed back via events, never by the Planner itself re-touching execution).
4. Distributed planning clusters for hyperscale concurrent planning load.

### 2.4 Non-Goals

The Planner explicitly does **not**:

- Execute any task, manage any queue, or communicate with any provider SDK.
- Select a model or provider, or perform any routing.
- Perform retries or fallback of any kind — those are execution-time concerns owned entirely downstream.
- Store memory or knowledge — it only reads from Memory Manager and Knowledge Comparison Engine.
- Perform knowledge comparison itself — it consumes the Knowledge Comparison Engine's output.
- Validate execution *results* — it validates the *plan's* structure and policy compliance before execution ever begins; result validation is a downstream (Review/Validation Engine) concern.
- Contain general business logic unrelated to workflow generation.

---

## 3. Responsibilities

### 3.1 Must Have

- Receive an objective (via an event or direct call from Orchestrator Core) and load relevant context (knowledge, memory, policy).
- Analyze the objective for scope, ambiguity, and feasibility signals.
- Decompose the objective into a hierarchy of goals, subgoals, and concrete tasks.
- Discover dependencies between tasks (task, resource, data, execution) and construct a dependency graph.
- Build a directed acyclic execution graph representing the full workflow.
- Optimize the graph for parallel execution opportunities and critical-path efficiency.
- Apply and enforce planning policies (organizational, security, compliance, priority) during generation.
- Validate the finished plan (structural + policy) before publication; reject and report invalid plans rather than publishing them.
- Publish the finished plan via the Event Bus for downstream consumption.
- Version every plan and retain its full history.

### 3.2 Should Have

- Support plan templates for recurring objective shapes, reducing redundant decomposition work.
- Cache planning sub-results (e.g., a previously-computed decomposition for a structurally similar objective) to reduce latency.
- Provide risk and confidence scoring as advisory plan metadata.
- Support incremental re-planning (updating an existing plan in response to new context) rather than always regenerating from scratch.

### 3.3 Future Responsibilities

- Pluggable planning-strategy algorithms (Section 23), selectable per objective type or organizational policy.
- Distributed, partitioned planning for extremely large execution graphs across a planning cluster.
- Collaborative planning across multiple concurrent planning sessions contributing to one shared objective.

---

## 4. Scope

### 4.1 Owns

- The complete planning pipeline: objective analysis, decomposition, dependency analysis, execution graph construction, optimization, and validation.
- The Plan data model (Section 7) and its versioning/history.
- Planning policies as applied during generation (the *rules engine* that applies them; the *policy values themselves* are supplied by Configuration Manager).
- Plan templates and the Template Manager.
- The planning cache.
- All Planner-specific events (Section 13).

### 4.2 Does Not Own

- Task execution, queue management (Task Queue).
- Provider communication, provider SDKs, model selection, routing (Provider Manager, Router, Capability Selector, Provider Plugin System).
- Memory storage or knowledge storage (Memory Manager, Knowledge Base) — the Planner only reads from them.
- Knowledge comparison logic itself (Knowledge Comparison Engine) — the Planner only consumes its structured output.
- Retry, fallback, or streaming behavior of any kind.
- Browser automation or review/validation of execution *results*.
- General business logic outside workflow generation.

### 4.3 Collaborates With

| Module | Nature of Collaboration |
|---|---|
| Knowledge Comparison Engine | Read-only: supplies structured knowledge (e.g., prior similar plans, known constraints, comparative analysis) consumed during objective analysis and constraint identification. |
| Memory Manager | Read-only: supplies contextual memory (e.g., session/project history) relevant to the objective. |
| Task Queue | Downstream, decoupled consumer: executes the Planner's output; the Planner never calls Task Queue directly, only publishes `PlanCreated`/`WorkflowGenerated` events. |
| Router | Downstream, decoupled consumer: routes individual executable tasks once the Task Queue surfaces them; the Planner has no direct interaction. |
| Provider Manager | Downstream, decoupled consumer: ultimately executes routed tasks; no direct interaction with the Planner. |
| Configuration Manager | Supplies planning policies, optimization parameters, and template configuration. |
| Event Bus | Transport for all planning events (Section 13); the Planner never calls any other module directly. |
| Logger | Receives structured planning logs (Section 15) via the standard Event Bus logging convention. |
| Dashboard Backend | Read-only consumer of planning metrics/plan data for display. |

---

## 5. Internal Architecture

### 5.1 Component Overview

```
                        ┌───────────────────────────────────────────┐
                        │            Planning Coordinator               │
                        │  (orchestrates the full pipeline, Section 6)  │
                        └─────────────────────┬─────────────────────┘
                                              │
       ┌───────────────────────────────────────┼───────────────────────────────────────┐
       │                                       │                                       │
┌──────▼───────┐                    ┌───────────▼───────────┐                ┌──────────▼──────────┐
│Planning Context │                    │  Objective Analyzer     │                │  Constraint Engine     │
│Builder           │                    │                        │                │                        │
└──────┬───────┘                    └───────────┬───────────┘                └──────────┬──────────┘
       │                                       │                                       │
       └───────────────────────────────────────┼───────────────────────────────────────┘
                                              │
                                    ┌───────────▼───────────┐
                                    │    Goal Decomposer       │
                                    └───────────┬───────────┘
                                              │
                                    ┌───────────▼───────────┐
                                    │    Task Decomposer       │
                                    └───────────┬───────────┘
                                              │
                                    ┌───────────▼───────────┐
                                    │  Dependency Analyzer     │
                                    └───────────┬───────────┘
                                              │
                                    ┌───────────▼───────────┐
                                    │ Execution Graph Builder  │
                                    └───────────┬───────────┘
                                              │
                                    ┌───────────▼───────────┐
                                    │  Optimization Engine     │
                                    └───────────┬───────────┘
                                              │
                                    ┌───────────▼───────────┐
                                    │  Risk Assessment Engine  │
                                    └───────────┬───────────┘
                                              │
                                    ┌───────────▼───────────┐
                                    │     Plan Validator        │
                                    └───────────┬───────────┘
                                              │ valid
                                    ┌───────────▼───────────┐
                                    │     Plan Repository       │
                                    └───────────────────────┘

  Cross-cutting: Planning Policy Engine · Template Manager · Version Manager · Planning Cache · Event Emission
```

### 5.2 Component Descriptions

Each follows: **Purpose · Responsibilities · Inputs · Outputs · Dependencies · Lifecycle**.

**Planning Coordinator**
- *Purpose:* Drive the full planning pipeline (Section 6) end to end for a given objective.
- *Responsibilities:* Sequence calls to every other component in the correct order, handle early termination on validation/policy failure, and emit lifecycle events at each stage.
- *Inputs:* An incoming objective (via `createPlan()` or a `PlanRequested`-style triggering event).
- *Outputs:* A finished, validated `Plan` (Section 7), or a structured planning failure.
- *Dependencies:* All other components in this section.
- *Lifecycle:* Instantiated per planning request; stateless between requests.

**Planning Context Builder**
- *Purpose:* Assemble the read-only context needed for analysis: relevant knowledge, relevant memory, and applicable planning policies.
- *Responsibilities:* Query the Knowledge Comparison Engine and Memory Manager for objective-relevant data; query the Planning Policy Engine for applicable policies; assemble a single `PlanningContext` object.
- *Inputs:* The raw objective, tenant/organization identifier, session/project identifiers.
- *Outputs:* `PlanningContext { knowledgeRefs, memoryRefs, applicablePolicies }`.
- *Dependencies:* Knowledge Comparison Engine port, Memory Manager port, Planning Policy Engine.
- *Lifecycle:* Invoked once per planning request, early in the pipeline.

**Objective Analyzer**
- *Purpose:* Determine the scope, ambiguity level, and feasibility signals of the objective before decomposition begins.
- *Responsibilities:* Classify the objective (e.g., single-task vs. multi-goal), flag ambiguous or underspecified objectives for early failure rather than producing a low-confidence plan, and extract explicit/implicit sub-goal hints.
- *Inputs:* Raw objective, `PlanningContext`.
- *Outputs:* `ObjectiveAnalysis { scope, ambiguityFlags, feasibilitySignals }`.
- *Dependencies:* Planning Context Builder output.
- *Lifecycle:* Stateless, invoked once per request.

**Constraint Engine**
- *Purpose:* Identify all constraints bearing on the plan — policy-derived, resource-derived, and objective-stated.
- *Responsibilities:* Merge explicit constraints (stated in the objective), policy-derived constraints (from Planning Policy Engine), and contextual constraints (from knowledge/memory) into one normalized constraint set used throughout decomposition and optimization.
- *Inputs:* `ObjectiveAnalysis`, `PlanningContext`.
- *Outputs:* `ConstraintSet`.
- *Dependencies:* Planning Policy Engine.
- *Lifecycle:* Stateless, invoked once per request; constraints propagate downstream (Section 8).

**Goal Decomposer**
- *Purpose:* Break the objective into a hierarchy of goals and subgoals.
- *Responsibilities:* Apply hierarchical/recursive decomposition (Section 8) until subgoals reach a granularity suitable for task decomposition.
- *Inputs:* `ObjectiveAnalysis`, `ConstraintSet`.
- *Outputs:* A goal/subgoal tree.
- *Dependencies:* Template Manager (may apply a matching template's known decomposition shape as a starting point).
- *Lifecycle:* Recursive, bounded by a configurable maximum depth to prevent runaway decomposition.

**Task Decomposer**
- *Purpose:* Convert each leaf subgoal into one or more concrete, executable Task definitions.
- *Responsibilities:* Produce Task records with enough structural detail (but zero execution detail — no provider/model assignment) for downstream Router/Provider Manager to act on.
- *Inputs:* Goal/subgoal tree, `ConstraintSet`.
- *Outputs:* A flat list of `Task` definitions, each linked to its originating subgoal.
- *Dependencies:* Goal Decomposer output.
- *Lifecycle:* Invoked once per leaf subgoal.

**Dependency Analyzer**
- *Purpose:* Discover all dependencies among the decomposed tasks (Section 9).
- *Responsibilities:* Identify task, resource, data, and execution dependencies; detect and reject circular dependencies; identify the critical path and parallelizable task sets.
- *Inputs:* Task list.
- *Outputs:* A dependency graph (nodes = tasks, edges = dependency relationships with typed labels).
- *Dependencies:* Task Decomposer output.
- *Lifecycle:* Stateless, invoked once per request; circular dependency detection is a hard-fail path back to the Planning Coordinator.

**Execution Graph Builder**
- *Purpose:* Materialize the dependency graph into the platform-standard Execution Graph representation (Section 7) used by Task Queue.
- *Responsibilities:* Attach execution-relevant metadata (priority, estimated complexity per node) without attaching any execution-time decision (no provider, no model).
- *Inputs:* Dependency graph, Task list.
- *Outputs:* `ExecutionGraph`.
- *Dependencies:* Dependency Analyzer output.
- *Lifecycle:* Stateless, invoked once per request.

**Optimization Engine**
- *Purpose:* Improve the execution graph's efficiency without altering its semantic correctness (Section 10).
- *Responsibilities:* Reorder independent tasks for maximal parallelism, shorten/simplify the critical path where safe, remove redundant nodes/edges introduced by decomposition, and re-check policy compliance after any structural change.
- *Inputs:* `ExecutionGraph`, `ConstraintSet`.
- *Outputs:* An optimized `ExecutionGraph`.
- *Dependencies:* Execution Graph Builder output, Planning Policy Engine.
- *Lifecycle:* Stateless, invoked once per request; may be skipped for very small graphs where the overhead outweighs benefit (configurable threshold).

**Risk Assessment Engine**
- *Purpose:* Produce advisory risk/confidence metadata for the plan.
- *Responsibilities:* Evaluate structural risk (e.g., very long critical path, high branching factor), knowledge-derived risk (e.g., low-confidence knowledge references), and policy-edge-case risk; compute a `riskLevel` and `confidence` score.
- *Inputs:* Optimized `ExecutionGraph`, `PlanningContext`.
- *Outputs:* `RiskAssessment { riskLevel, confidence, factors[] }`.
- *Dependencies:* Optimization Engine output.
- *Lifecycle:* Stateless, invoked once per request; purely advisory — never blocks plan publication by itself (only Plan Validator failures block publication).

**Plan Validator**
- *Purpose:* The final gate before publication — confirms structural correctness and policy compliance.
- *Responsibilities:* Verify the graph is a valid DAG (no cycles), every task references a resolvable subgoal, every declared constraint is satisfied, and every applicable planning policy (Section 11) is honored.
- *Inputs:* Optimized `ExecutionGraph`, `ConstraintSet`, applicable policies.
- *Outputs:* `ValidationResult { valid, violations[] }`.
- *Dependencies:* Planning Policy Engine.
- *Lifecycle:* Stateless, invoked once per request; a failing result halts publication and routes to error handling (Section 14).

**Plan Repository**
- *Purpose:* Persist finished (and in-progress/rejected, for audit) plans.
- *Responsibilities:* Store the `Plan` record, its version history, and its status; provide lookup by `planId`.
- *Inputs:* Finalized `Plan` records.
- *Outputs:* Persisted records, queryable by ID.
- *Dependencies:* The platform's Database module via a `PlanStorePort`.
- *Lifecycle:* Long-lived, persists across restarts.

**Planning Policy Engine**
- *Purpose:* Resolve which policies (Section 11) apply to a given objective/tenant and enforce them at every relevant pipeline stage.
- *Responsibilities:* Fetch policy definitions from Configuration Manager, evaluate applicability (by tenant, objective type, priority), and expose a uniform `evaluate(context) → PolicyResult` interface to every other component that needs it.
- *Inputs:* Tenant/organization identifiers, objective metadata, Configuration Manager policy definitions.
- *Outputs:* Applicable policy set; policy evaluation results.
- *Dependencies:* Configuration Manager port.
- *Lifecycle:* Policy definitions are cached and refreshed on `ConfigurationReloaded` events; evaluation itself is stateless per call.

**Template Manager**
- *Purpose:* Store and retrieve reusable plan templates for recurring objective shapes.
- *Responsibilities:* Match an incoming objective against known template signatures; supply a starting decomposition shape to the Goal Decomposer when a match is found.
- *Inputs:* Objective classification (from Objective Analyzer), stored templates.
- *Outputs:* An optional matching `PlanTemplate`.
- *Dependencies:* Plan Repository (templates are stored analogously to plans, tagged as reusable).
- *Lifecycle:* Long-lived; templates are curated/administered, not auto-generated by default (auto-generation from repeated similar plans is a Future Responsibility).

**Version Manager**
- *Purpose:* Track a plan's version history across re-planning cycles.
- *Responsibilities:* Assign version numbers, link a new plan version to its predecessor, and preserve prior versions immutably.
- *Inputs:* A finalized `Plan` and, if applicable, its predecessor's `planId`.
- *Outputs:* Version-linked `Plan` records.
- *Dependencies:* Plan Repository.
- *Lifecycle:* Invoked on every plan creation/update.

**Planning Cache**
- *Purpose:* Reduce redundant computation for structurally similar objectives.
- *Responsibilities:* Cache intermediate results (e.g., a decomposition result for a previously-seen objective signature) and full plans for identical/near-identical repeated objectives, with a defined invalidation strategy (Section 18).
- *Inputs:* Objective signature (a normalized hash of the objective + relevant context).
- *Outputs:* Cached intermediate/final results on hit.
- *Dependencies:* None (pure infrastructure); consulted optionally by Planning Coordinator at pipeline entry.
- *Lifecycle:* Ephemeral, in-memory (or pluggable backend).

---

## 6. Planning Lifecycle

### 6.1 Lifecycle Stages

```
RECEIVE OBJECTIVE ──► LOAD CONTEXT ──► ANALYZE GOAL ──► IDENTIFY CONSTRAINTS ──► DECOMPOSE OBJECTIVE
        ──► GENERATE TASKS ──► ANALYZE DEPENDENCIES ──► BUILD EXECUTION GRAPH ──► OPTIMIZE WORKFLOW
        ──► VALIDATE PLAN ──► PUBLISH PLAN
```

### 6.2 Stage Definitions

1. **Receive Objective** — Planning Coordinator accepts an objective from Orchestrator Core (event-triggered or direct call).
2. **Load Context** — Planning Context Builder assembles knowledge, memory, and policy context.
3. **Analyze Goal** — Objective Analyzer classifies scope/ambiguity/feasibility.
4. **Identify Constraints** — Constraint Engine merges explicit, policy-derived, and contextual constraints.
5. **Decompose Objective** — Goal Decomposer produces the goal/subgoal hierarchy (Section 8).
6. **Generate Tasks** — Task Decomposer converts leaf subgoals into concrete Task definitions.
7. **Analyze Dependencies** — Dependency Analyzer discovers dependency relationships and detects cycles (Section 9).
8. **Build Execution Graph** — Execution Graph Builder materializes the platform-standard graph representation.
9. **Optimize Workflow** — Optimization Engine improves parallelism/critical-path efficiency (Section 10).
10. **Validate Plan** — Plan Validator performs the final structural/policy gate.
11. **Publish Plan** — On success, Plan Repository persists the plan and `PlanCreated`/`WorkflowGenerated`/`PlanningCompleted` events are published; on failure, `PlanningFailed` is published instead (Section 14).

### 6.3 Lifecycle Diagram

```
┌───────────────────┐
│ RECEIVE OBJECTIVE   │
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  LOAD CONTEXT       │
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  ANALYZE GOAL       │
└─────────┬─────────┘
          ▼
┌───────────────────┐   ambiguous/infeasible   ┌────────────────────┐
│ IDENTIFY CONSTRAINTS │─────────────────────────►│  PlanningFailed      │ (terminal)
└─────────┬─────────┘                            └────────────────────┘
          ▼
┌───────────────────┐
│ DECOMPOSE OBJECTIVE │
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  GENERATE TASKS     │
└─────────┬─────────┘
          ▼
┌───────────────────┐   circular dependency   ┌────────────────────┐
│ ANALYZE DEPENDENCIES │────────────────────────►│  PlanningFailed      │ (terminal)
└─────────┬─────────┘                           └────────────────────┘
          ▼
┌───────────────────┐
│ BUILD EXECUTION GRAPH│
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ OPTIMIZE WORKFLOW    │
└─────────┬─────────┘
          ▼
┌───────────────────┐   validation/policy failure  ┌────────────────────┐
│  VALIDATE PLAN       │──────────────────────────────►│  PlanningFailed      │ (terminal)
└─────────┬─────────┘                                 └────────────────────┘
          ▼
┌───────────────────┐
│  PUBLISH PLAN        │ (terminal — success)
└───────────────────┘
```

---

## 7. Planning Model

### 7.1 Canonical `Plan` Record

```
Plan {
  planId                 : UUID
  objective               : ObjectiveDescriptor
  goals                   : Goal[]
  subgoals                : Subgoal[]
  tasks                   : Task[]
  dependencies             : DependencyEdge[]
  constraints              : Constraint[]
  priority                : enum(LOW, NORMAL, HIGH, CRITICAL)
  executionStrategy         : enum(SEQUENTIAL, PARALLEL, HYBRID)
  executionGraph            : ExecutionGraph
  estimatedComplexity       : enum(TRIVIAL, LOW, MODERATE, HIGH, VERY_HIGH)
  estimatedCostMetadata     : CostEstimateMetadata
  estimatedDuration         : integer (seconds)
  riskLevel                : enum(LOW, MODERATE, HIGH, CRITICAL)
  confidence               : number (0.0–1.0)
  planningPolicies          : string[]     // IDs of policies applied
  knowledgeReferences        : string[]     // refs into Knowledge Comparison Engine output
  memoryReferences           : string[]     // refs into Memory Manager records
  version                  : integer
  previousPlanId             : UUID | null
  status                   : enum(DRAFT, VALIDATED, PUBLISHED, SUPERSEDED, FAILED, ARCHIVED)
  metadata                 : object
  customMetadata            : object
  createdAt                : ISO-8601 datetime
  updatedAt                : ISO-8601 datetime
}

ExecutionGraph {
  nodes   : ExecutionNode[]
  edges   : ExecutionEdge[]
}

ExecutionNode {
  nodeId          : UUID
  taskId           : UUID
  priority         : enum(LOW, NORMAL, HIGH, CRITICAL)
  estimatedComplexity : enum(TRIVIAL, LOW, MODERATE, HIGH, VERY_HIGH)
  parallelizable    : boolean
}

ExecutionEdge {
  fromNodeId : UUID
  toNodeId   : UUID
  type       : enum(TASK_DEPENDENCY, RESOURCE_DEPENDENCY, DATA_DEPENDENCY, EXECUTION_DEPENDENCY)
}
```

### 7.2 Field-by-Field Rationale

| Field | Rationale |
|---|---|
| `planId` | Globally unique identifier; the primary key for the Plan Repository and all downstream references. |
| `objective` | Preserves the original input for traceability and for any future re-planning cycle. |
| `goals` / `subgoals` | The hierarchical decomposition output (Section 8), preserved for auditability and human review. |
| `tasks` | The concrete, executable units downstream modules act on. |
| `dependencies` | The full dependency graph (Section 9) in edge-list form, redundant with but complementary to `executionGraph.edges` for query convenience. |
| `constraints` | The merged constraint set (Section 5.2 Constraint Engine) the plan was generated under, for auditability. |
| `priority` | Plan-level priority, informing downstream Task Queue/Router prioritization (the Planner sets this value but never acts on it itself). |
| `executionStrategy` | High-level strategy classification (sequential/parallel/hybrid), a coarse hint for downstream schedulers. |
| `executionGraph` | The materialized DAG (Section 7.1) that Task Queue actually consumes. |
| `estimatedComplexity` | A coarse, advisory sizing signal, useful for capacity planning downstream — never used by the Planner itself to make execution decisions. |
| `estimatedCostMetadata` | Advisory cost estimate metadata, composed from Model Registry pricing metadata reachable via read-only context (not computed authoritatively — actual cost calculation remains Provider Manager's responsibility). |
| `estimatedDuration` | Advisory duration estimate, for scheduling/UX purposes. |
| `riskLevel` / `confidence` | Output of the Risk Assessment Engine (Section 5.2); advisory only, never blocks publication by itself. |
| `planningPolicies` | Records exactly which policies were applied, for compliance auditing. |
| `knowledgeReferences` / `memoryReferences` | Preserve provenance — which knowledge/memory inputs informed this plan, without duplicating that data into the Plan record itself. |
| `version` / `previousPlanId` | Support the versioning model (Section 12); every re-plan is a new, linked version. |
| `status` | Lifecycle state distinct from the pipeline stages of Section 6 — reflects the plan's standing after the pipeline completes (or fails). |
| `metadata` / `customMetadata` | Standard extensibility fields, analogous to other MDDs in this platform (Provider Plugin System, Model Registry). |
| `createdAt` / `updatedAt` | Standard auditability timestamps. |

---

## 8. Goal Decomposition

- **Hierarchical Planning:** The objective is decomposed top-down: Objective → Goals → Subgoals → Tasks, with each level only as granular as necessary for the level below it to be independently actionable.
- **Task Decomposition:** Leaf subgoals are converted into one or more Task definitions by the Task Decomposer (Section 5.2); a subgoal that is already task-granular decomposes 1:1.
- **Recursive Planning:** The Goal Decomposer recurses into a subgoal whenever it is still too coarse for direct task conversion, bounded by a configurable maximum recursion depth (a safety limit against runaway or pathological objectives) that triggers `PlanningFailed` with an `ExcessiveDecompositionDepthError` if exceeded.
- **Dependency Discovery:** Certain dependencies are discoverable directly during decomposition (e.g., a subgoal explicitly stated as depending on another's output) and are recorded provisionally here, then confirmed/completed by the dedicated Dependency Analyzer stage (Section 9) afterward.
- **Constraint Propagation:** Constraints identified at the objective level (Section 5.2 Constraint Engine) propagate downward through every level of decomposition, so a constraint (e.g., "must not use browser automation") is inherited by every subgoal/task derived from the objective it applies to, rather than needing re-declaration at each level.
- **Parallel Opportunities:** The Goal Decomposer flags sibling subgoals with no stated data/order dependency as parallel-candidate, feeding the Optimization Engine's later parallelization pass (Section 10).
- **Sequential Requirements:** Subgoals with an explicit or inferred ordering requirement (e.g., "step B needs step A's output") are flagged as sequential, becoming `TASK_DEPENDENCY`/`DATA_DEPENDENCY` edges in the dependency graph.

---

## 9. Dependency Analysis

- **Task Dependencies:** One task's execution logically requires another task to have completed first (e.g., ordering derived from the goal hierarchy or explicit objective statement).
- **Resource Dependencies:** Two tasks require the same constrained resource (as declared in `ConstraintSet`, e.g., a shared file/document context) such that they cannot safely run fully independently, even without a strict output dependency.
- **Data Dependencies:** One task consumes output data produced by another; the most common and strongest dependency type, always resulting in a `DATA_DEPENDENCY` edge.
- **Execution Dependencies:** A dependency derived from execution *strategy* rather than data or resources (e.g., a policy requiring tasks of a certain classification to run only after a checkpoint task completes) — distinct from a natural data/resource dependency, and sourced from the Constraint Engine/Planning Policy Engine rather than inferred from task content.
- **Blocking Tasks:** Tasks with outgoing dependency edges to many downstream tasks are flagged as blocking/high-impact nodes, surfaced in `ExecutionNode` metadata for downstream scheduling awareness.
- **Parallel Tasks:** Tasks with no path between them in the dependency graph (in either direction) are parallel-eligible, flagged via `ExecutionNode.parallelizable`.
- **Critical Path:** The Dependency Analyzer computes the longest dependency chain (by estimated duration/complexity) through the graph — the theoretical minimum completion time assuming unlimited parallel capacity elsewhere — surfaced in plan metadata for the Optimization Engine and for downstream capacity planning.
- **Dependency Graph:** The complete, typed edge-list structure (`DependencyEdge[]`) is the Dependency Analyzer's primary output, validated to be acyclic (a Directed Acyclic Graph) before proceeding — cycle detection failure is a hard `PlanningFailed` outcome (Section 14).

---

## 10. Workflow Optimization

- **Task Ordering:** Within the constraints of the dependency graph, the Optimization Engine chooses a topological ordering that favors executing high-impact/blocking tasks earlier, reducing downstream idle time.
- **Parallelization:** Groups of parallel-eligible tasks (Section 9) are explicitly grouped in the optimized `ExecutionGraph` so Task Queue can schedule them concurrently without needing to re-derive parallelism itself.
- **Critical Path Optimization:** Where semantically safe (i.e., without violating any dependency or constraint), the Optimization Engine looks for opportunities to shorten the critical path — e.g., by re-checking whether a task originally modeled as sequential could be reclassified as parallel given the finalized constraint set.
- **Dependency Optimization:** Redundant transitive dependencies (an edge A→C when A→B→C already implies it) are pruned to simplify the graph without changing its semantics — this reduces the burden on downstream schedulers without altering execution order guarantees.
- **Workflow Simplification:** Structurally trivial subgraphs (e.g., a subgoal that decomposed into exactly one task with no siblings) are flattened where doing so does not lose auditability information (the original goal hierarchy is still preserved in `goals`/`subgoals`, independent of the flattened execution graph).
- **Policy Compliance:** Every optimization pass re-validates against the `ConstraintSet` and applicable policies (Section 11) before being accepted — an optimization that would violate a policy (e.g., merging two tasks that a compliance policy requires to remain auditable as separate steps) is discarded, never silently applied.
- **Resource Awareness:** The Optimization Engine considers `ResourceDependency` edges when deciding parallelization groups, avoiding proposing "parallel" execution for tasks that share a constrained resource even if no strict data dependency exists between them.

---

## 11. Planning Policies

- **Organization Policies:** Tenant/organization-level rules (e.g., maximum plan size, allowed task types) supplied by Configuration Manager and scoped by tenant identifier.
- **Execution Policies:** Rules constraining *how* a workflow may be shaped for execution-readiness (e.g., "no more than N tasks may run in parallel" — a constraint the Planner respects when optimizing, even though it never itself schedules execution).
- **Security Policies:** Rules restricting what kinds of tasks/subgoals may appear in a plan for a given tenant/context (e.g., disallowing certain capability categories entirely for a restricted tenant).
- **Compliance Policies:** Rules requiring specific structural properties for regulatory/audit purposes (e.g., mandatory checkpoint/review tasks inserted at defined points, or a requirement that certain task types never be merged/optimized away).
- **Optimization Policies:** Rules constraining how aggressively the Optimization Engine may transform the graph (e.g., an organization may disable critical-path optimization for maximum auditability/predictability at the cost of raw efficiency).
- **Priority Policies:** Rules mapping objective characteristics (tenant tier, objective urgency signals) to the `Plan.priority` field.
- **Custom Policies:** Organization-defined, arbitrary rule sets expressed in a structured policy-definition format (owned by Configuration Manager) and evaluated generically by the Planning Policy Engine without requiring Planner source-code changes per new policy (Section 23).

All policies are evaluated through one uniform `PolicyEngine.evaluate(context) → PolicyResult` interface (Section 5.2), regardless of category, so adding a new policy type never requires new Planner code — only a new policy definition in Configuration Manager.

---

## 12. Public Interfaces

### 12.1 `createPlan(objective: ObjectiveDescriptor, options?: PlanningOptions): Promise<Plan>`
- **Purpose:** Run the full planning pipeline (Section 6) for a new objective.
- **Inputs:** `ObjectiveDescriptor`, optional `PlanningOptions { priorityHint, templateHint, skipCache }`.
- **Outputs:** A finished, `PUBLISHED`-status `Plan`.
- **Validation:** Full pipeline validation (Section 6, stage "Validate Plan").
- **Errors:** `InvalidObjectiveError`, `CircularDependencyError`, `PolicyViolationError`, `PlanningFailedError` (aggregate for other pipeline failures).

### 12.2 `updatePlan(planId: string, changes: ObjectivePatch): Promise<Plan>`
- **Purpose:** Re-plan in response to new context/changed objective, producing a new linked version rather than mutating the original.
- **Inputs:** `planId` of the plan being revised, a patch describing what changed.
- **Outputs:** A new `Plan` record with `version` incremented and `previousPlanId` set; the prior version's `status` transitions to `SUPERSEDED`.
- **Validation:** Full pipeline validation, same as `createPlan()`.
- **Errors:** `PlanNotFoundError`, plus the same error set as `createPlan()`.

### 12.3 `validatePlan(planId: string): Promise<ValidationResult>`
- **Purpose:** Re-run the Plan Validator against an existing plan (e.g., after a policy change) without regenerating it.
- **Inputs:** `planId`.
- **Outputs:** `ValidationResult { valid, violations[] }`.
- **Validation/Errors:** `PlanNotFoundError`.

### 12.4 `optimizePlan(planId: string): Promise<Plan>`
- **Purpose:** Re-run optimization against an existing plan's execution graph (e.g., after upstream constraints changed) without a full re-decomposition.
- **Inputs:** `planId`.
- **Outputs:** The updated `Plan` with a refreshed `executionGraph`.
- **Validation:** Re-validates policy compliance post-optimization (Section 10).
- **Errors:** `PlanNotFoundError`, `PolicyViolationError`.

### 12.5 `analyzeObjective(objective: ObjectiveDescriptor): Promise<ObjectiveAnalysis>`
- **Purpose:** Run only the Objective Analyzer stage, for pre-flight feasibility checks without committing to full planning.
- **Inputs:** `ObjectiveDescriptor`.
- **Outputs:** `ObjectiveAnalysis { scope, ambiguityFlags, feasibilitySignals }`.
- **Validation/Errors:** `InvalidObjectiveError` for structurally malformed input.

### 12.6 `generateWorkflow(tasks: Task[], dependencies: DependencyEdge[]): Promise<ExecutionGraph>`
- **Purpose:** A lower-level entry point building an `ExecutionGraph` directly from an already-decomposed task/dependency set (e.g., for template-driven or externally-assisted planning flows) without running the Goal/Task Decomposer stages.
- **Inputs:** Pre-decomposed `Task[]`, `DependencyEdge[]`.
- **Outputs:** An optimized, validated `ExecutionGraph`.
- **Validation:** Dependency Analyzer's cycle check, Plan Validator's structural check.
- **Errors:** `CircularDependencyError`, `PolicyViolationError`.

---

## 13. Events

All events publish via the Event Bus under a `Planning Events` category.

**PlanCreated**
- Publisher: Planning Coordinator / Plan Repository
- Subscribers: Task Queue, Dashboard Backend, Logger
- Payload: `{ planId, objectiveId, taskCount, priority }`
- Trigger: A plan completes the full pipeline and reaches `PUBLISHED` status.
- Retry Behaviour: Standard (3 attempts) — Task Queue must reliably learn of new plans.

**PlanUpdated**
- Publisher: Version Manager
- Subscribers: Task Queue, Dashboard Backend, Logger
- Payload: `{ planId, previousPlanId, version }`
- Trigger: `updatePlan()` produces a new plan version.
- Retry Behaviour: Standard.

**PlanValidated**
- Publisher: Plan Validator
- Subscribers: Dashboard Backend, Logger
- Payload: `{ planId, validationSummary }`
- Trigger: A plan passes the Plan Validator stage.
- Retry Behaviour: None.

**WorkflowGenerated**
- Publisher: Execution Graph Builder
- Subscribers: Task Queue, Dashboard Backend, Logger
- Payload: `{ planId, nodeCount, edgeCount, executionStrategy }`
- Trigger: The execution graph is finalized (post-optimization, pre-validation).
- Retry Behaviour: Standard.

**DependenciesResolved**
- Publisher: Dependency Analyzer
- Subscribers: Dashboard Backend, Logger
- Payload: `{ planId, dependencyCount, criticalPathLength }`
- Trigger: Dependency analysis completes successfully (acyclic graph confirmed).
- Retry Behaviour: None.

**PlanningCompleted**
- Publisher: Planning Coordinator
- Subscribers: Task Queue, Dashboard Backend, Logger
- Payload: `{ planId, durationMs }`
- Trigger: The full pipeline (Section 6) completes successfully.
- Retry Behaviour: Standard.

**PlanningFailed**
- Publisher: Planning Coordinator
- Subscribers: Orchestrator Core, Dashboard Backend, Logger
- Payload: `{ objectiveId, failureStage, errors[] }`
- Trigger: Any pipeline stage fails irrecoverably (Section 14).
- Retry Behaviour: None (Orchestrator Core decides whether to retry planning as a new, distinct request).

**OptimizationCompleted**
- Publisher: Optimization Engine
- Subscribers: Dashboard Backend, Logger
- Payload: `{ planId, optimizationsApplied[], criticalPathBefore, criticalPathAfter }`
- Trigger: The Optimization Engine finishes its pass.
- Retry Behaviour: None.

**PolicyApplied**
- Publisher: Planning Policy Engine
- Subscribers: Dashboard Backend, Logger
- Payload: `{ planId, policyId, effect }`
- Trigger: A policy meaningfully alters or constrains the plan (e.g., rejects an optimization, inserts a mandatory task).
- Retry Behaviour: None.

---

## 14. Error Handling

| Failure Mode | Handling Strategy |
|---|---|
| Planning Failure (general) | Any unrecoverable pipeline-stage failure aborts the request, emits `PlanningFailed` with the specific stage and error detail, and leaves no partial plan in `PUBLISHED` state (a partial/rejected attempt may be retained in the Plan Repository as `FAILED` status for audit, never surfaced as executable). |
| Invalid Objective | Rejected by the Objective Analyzer (`InvalidObjectiveError`) — e.g., empty, structurally malformed, or exceeding maximum size limits — before any decomposition work begins. |
| Circular Dependencies | Detected by the Dependency Analyzer's acyclic check (`CircularDependencyError`); the specific cycle is included in the error detail for diagnosis. |
| Policy Violations | Detected by the Plan Validator or, mid-pipeline, by the Planning Policy Engine's evaluation calls (`PolicyViolationError`); the specific violated policy and rule are included in the error detail. |
| Constraint Failure | An objective whose stated constraints are mutually unsatisfiable (e.g., two constraints that cannot both be honored) is detected by the Constraint Engine and surfaced as a distinct `UnsatisfiableConstraintError`, halting the pipeline early rather than producing an invalid plan. |
| Knowledge Unavailable | If the Knowledge Comparison Engine is unreachable or returns no data, the Planning Context Builder proceeds with an empty/degraded knowledge context rather than failing outright (planning can proceed with reduced confidence, reflected in the Risk Assessment Engine's output) — a hard dependency failure is only raised if the objective explicitly requires knowledge-grounding that is entirely unavailable. |
| Optimization Failure | If the Optimization Engine encounters an internal error, the pipeline falls back to the pre-optimization (but still valid) `ExecutionGraph` rather than failing the entire plan — optimization is an enhancement, not a correctness requirement, so its failure degrades gracefully. |
| Recovery Strategy | Every failure emits a structured `PlanningFailed` event (with enough detail for Orchestrator Core or an administrator to decide whether to retry with a modified objective); the Planner itself never automatically retries planning, since retry policy is an execution-time concern owned elsewhere, and blind retry of a structurally invalid objective would simply reproduce the same failure. |

---

## 15. Logging

- **Planning Logs:** Pipeline stage entry/exit per request, with `planId`/`objectiveId` and `correlationId`.
- **Workflow Logs:** Execution graph construction details — node/edge counts, critical path length.
- **Optimization Logs:** Each optimization applied (or skipped, with reason) and its measured effect on critical path/parallelism.
- **Policy Logs:** Every policy evaluation outcome, especially rejections/modifications (mirroring `PolicyApplied` events).
- **Validation Logs:** Plan Validator outcomes, including specific violations on failure.
- **Audit Logs:** Every `createPlan()`/`updatePlan()` call with actor/source, feeding long-term compliance review.

All logs are emitted as `LoggingEvents`-category events via the Event Bus, carrying `correlationId`/`traceId` tying every stage of one planning request together.

---

## 16. Monitoring

| Metric | Description |
|---|---|
| Planning Throughput | Plans generated per unit time, overall and per tenant. |
| Planning Latency | End-to-end pipeline duration, broken down per stage (Section 6), at p50/p95/p99. |
| Workflow Complexity | Distribution of node/edge counts and critical-path length across generated plans. |
| Optimization Rate | Percentage of plans where optimization measurably improved critical path/parallelism vs. plans where it made no change. |
| Cache Performance | Planning Cache hit/miss ratio and latency savings attributable to cache hits. |
| Policy Usage | Frequency of each policy's evaluation and rejection/modification rate. |
| Plan Success Metrics | Ratio of `PUBLISHED` to `FAILED` outcomes, broken down by failure stage/reason. |

---

## 17. Security

- **Planning Integrity:** Every plan passes through the full validation pipeline (Section 6, 14) before publication; no path allows a plan to reach `PUBLISHED` status without validation.
- **Policy Protection:** Planning policies themselves are supplied and access-controlled by Configuration Manager; the Planner only ever reads/evaluates them, never mutates policy definitions.
- **Access Control:** Mutating public interfaces (`createPlan`, `updatePlan`) are restricted to authorized callers (Orchestrator Core and authorized administrative/API paths) per the platform's standard authorization mechanism.
- **Auditability:** Every plan and every version is retained (Section 12.2), with policy application and validation outcomes logged (Section 15), enabling full reconstruction of why a given plan looked the way it did.
- **Plan Version Integrity:** Prior plan versions are immutable once `SUPERSEDED`; a re-plan always creates a new version rather than editing history in place, consistent with the Immutable Metadata History pattern established in the Model Registry MDD.

---

## 18. Performance

- **Incremental Planning:** `updatePlan()` and `optimizePlan()` (Section 12) avoid full pipeline re-execution when only part of the plan is affected by a change.
- **Planning Cache:** Objective signatures (a normalized hash of objective + relevant constraint/policy context) are cache keys for both intermediate decomposition results and full finished plans, avoiding redundant work for repeated/similar objectives; cache entries invalidate on relevant policy changes (`ConfigurationReloaded`) or explicit `skipCache` option.
- **Parallel Analysis:** Independent decomposition branches (sibling subgoals with no cross-dependency) are analyzed concurrently within a single planning request, bounded by a worker pool.
- **Lazy Evaluation:** Risk Assessment (Section 5.2) and other purely advisory computations are deferred until after the core pipeline's correctness-critical stages succeed, avoiding wasted work on a request that will ultimately fail validation.
- **Workflow Reuse:** The Template Manager (Section 5.2) allows a matched template to short-circuit large portions of the Goal Decomposer's work for recurring objective shapes.
- **Template Optimization:** Templates themselves may carry pre-computed, pre-validated partial execution graphs, further reducing per-request computation for common cases.
- **Memory Optimization:** Large execution graphs are streamed/paginated rather than fully materialized in memory at every pipeline stage where possible, particularly relevant for the hyperscale targets in Section 19.

---

## 19. Enterprise Scalability

The Planner is designed to support **millions of plans, millions of workflow nodes, thousands of concurrent planning requests, unlimited templates and policies, multi-tenant deployments, distributed planning clusters, and cross-region deployment — without any source-code modification.** This is achieved entirely through the same port/adapter (Hexagonal Architecture) seams already established in Sections 5 and 21, not through a separate scalability-specific redesign.

- **Horizontal Scaling:** The Planning Coordinator is stateless per request (Section 5.2); any number of Planner instances may run concurrently behind a standard load-balanced request distribution, each capable of handling any incoming planning request independently.
- **Vertical Scaling:** Individual planning requests for very large objectives benefit from increased per-instance compute (parallel analysis, Section 18) without any architectural change.
- **Distributed Planning:** For extremely large objectives, the domain-level `ExecutionGraph` model already supports partitioning (Task Graph Partitioning below); a distributed planning coordinator can dispatch independent decomposition branches to different worker instances and merge results, using the same `Task`/`DependencyEdge` structures already defined in Section 7 — no new data model is required.
- **Planning Clusters:** A cluster of Planner instances shares the Plan Repository (via its persistence port) and the Planning Cache (via a distributed cache backend adapter), coordinated only through normal database/cache consistency mechanisms — the Planning Coordinator itself requires no cluster-awareness logic.
- **Task Graph Partitioning:** The Dependency Analyzer's output (a typed edge list, Section 7.1) is naturally partitionable by connected-component analysis; independent subgraphs of a very large plan can be assigned to different worker processes for parallel dependency analysis and optimization, then merged by edge-list concatenation with global cycle re-validation.
- **Distributed Workflow Generation:** The Execution Graph Builder and Optimization Engine are both stateless, pure transformations (Section 5.2) — they can run as independently scaled worker pools consuming from a distributed work queue, a direct consequence of their already-stateless design rather than a new capability.
- **Load Balancing:** Standard request-level load balancing across Planner instances; no session affinity is required since every component is stateless per request.
- **Fault Tolerance:** A failed Planner instance mid-request simply loses that in-flight request (never a partially-published, invalid plan, per Section 14's validation gate); the request can be safely retried in full by Orchestrator Core against any healthy instance.
- **High Availability:** Achieved via standard N+1/N+2 redundant instance deployment; the Plan Repository's persistence layer (owned by the Database module) provides the durability guarantee, not the Planner instances themselves.
- **Elastic Scaling:** Instance count scales with observed planning throughput/latency metrics (Section 16), using standard platform-level autoscaling infrastructure — no Planner-specific scaling logic is required beyond exposing accurate metrics.
- **Distributed Cache:** The Planning Cache port (Section 5.2, 21) is backed by a pluggable adapter; a distributed cache (e.g., a clustered in-memory store) is a drop-in adapter swap, not a domain change.
- **Multi-Tenant Planning:** Every planning request already carries a tenant/organization identifier (Section 5.2 Planning Context Builder) used for policy scoping (Section 11); the same identifier scopes cache keys, Plan Repository partitioning, and metrics — multi-tenancy is a data-scoping concern fully supported by the existing model, not a structural one.
- **Cross-Region Deployment:** Because the Planner has no execution-time coupling to any specific provider/region (Non-Goals, Section 2.4) and depends only on ports (Knowledge Comparison Engine, Memory Manager, Configuration Manager, Event Bus, Plan Repository), it may be deployed per-region with region-local adapters for each port, with only the Plan Repository requiring a cross-region consistency strategy (owned by the Database module, not this module).
- **Capacity Planning:** Because every component in the pipeline is stateless and independently scalable, capacity for millions of plans/nodes and thousands of concurrent requests is achieved by horizontal instance scaling plus a sufficiently scaled Plan Repository/cache backend — no architectural ceiling exists within this module's design.

---

## 20. Interaction With Other Modules

### 20.1 Knowledge Comparison Engine

```
Planning Context Builder      Knowledge Comparison Engine
          │  queryRelevantKnowledge(objective)  │
          │─────────────────────────────────────►│
          │◄─────────────────────────────────────│ (structured knowledge refs)
```

### 20.2 Memory Manager

```
Planning Context Builder      Memory Manager
          │  queryRelevantMemory(sessionId, projectId)  │
          │──────────────────────────────────────────────►│
          │◄──────────────────────────────────────────────│ (memory refs)
```

### 20.3 Task Queue (Decoupled, via Event Bus)

```
Planning Coordinator     Event Bus         Task Queue
        │ publish(PlanCreated)     │                │
        │──────────────────────────►│                │
        │                            │ dispatch        │
        │                            │───────────────►│
        │                            │                │ (Task Queue begins scheduling, independently)
```

### 20.4 Router (No Direct Interaction)

The Planner never interacts with Router directly. Router consumes individual tasks surfaced by Task Queue once execution begins, entirely downstream of and decoupled from the Planner.

### 20.5 Configuration Manager

```
Configuration Manager      Event Bus          Planning Policy Engine
       │ publish(ConfigurationReloaded) │                  │
       │────────────────────────────────►│                  │
       │                                  │ dispatch          │
       │                                  │─────────────────►│
       │                                  │                  │ re-fetches policy definitions
```

### 20.6 Event Bus

All events in Section 13 flow exclusively through the Event Bus; the Planner never calls Task Queue, Router, or any other consuming module directly.

### 20.7 Logger

Structured logs (Section 15) are emitted as `LoggingEvents`-category events consumed by the Logger module, consistent with platform-wide convention.

### 20.8 Dashboard Backend

```
Dashboard Backend        Planner (Plan Repository, via Facade)
       │  getPlan(planId) / listPlans(filter)  │
       │───────────────────────────────────────►│
       │◄───────────────────────────────────────│ (plan data/metrics for display)
```

---

## 21. Folder Structure

```
planner/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── Plan.ts                     # Canonical record (Section 7)
│   │   │   ├── Goal.ts
│   │   │   ├── Subgoal.ts
│   │   │   ├── Task.ts
│   │   │   ├── ExecutionGraph.ts
│   │   │   └── DependencyEdge.ts
│   │   ├── value-objects/
│   │   │   ├── PlanStatus.ts               # Lifecycle status enum (Section 7)
│   │   │   ├── ConstraintSet.ts
│   │   │   ├── RiskAssessment.ts
│   │   │   └── ObjectiveDescriptor.ts
│   │   ├── services/
│   │   │   ├── CycleDetector.ts            # Section 9
│   │   │   ├── CriticalPathCalculator.ts   # Section 9
│   │   │   └── GraphSimplifier.ts          # Section 10
│   │   └── ports/
│   │       ├── PlanStorePort.ts             # Persistence contract (Database module)
│   │       ├── KnowledgeComparisonPort.ts   # Read-only contract
│   │       ├── MemoryManagerPort.ts         # Read-only contract
│   │       ├── ConfigurationPort.ts
│   │       ├── EventPublisherPort.ts
│   │       └── CachePort.ts
│   │
│   ├── application/
│   │   ├── CreatePlanUseCase.ts
│   │   ├── UpdatePlanUseCase.ts
│   │   ├── ValidatePlanUseCase.ts
│   │   ├── OptimizePlanUseCase.ts
│   │   ├── AnalyzeObjectiveUseCase.ts
│   │   └── GenerateWorkflowUseCase.ts
│   │
│   ├── pipeline/
│   │   ├── PlanningCoordinator.ts          # Drives Section 6
│   │   ├── PlanningContextBuilder.ts
│   │   ├── ObjectiveAnalyzer.ts
│   │   ├── ConstraintEngine.ts
│   │   ├── GoalDecomposer.ts
│   │   ├── TaskDecomposer.ts
│   │   ├── DependencyAnalyzer.ts
│   │   ├── ExecutionGraphBuilder.ts
│   │   ├── OptimizationEngine.ts
│   │   ├── RiskAssessmentEngine.ts
│   │   └── PlanValidator.ts
│   │
│   ├── policy/
│   │   └── PlanningPolicyEngine.ts         # Section 11
│   │
│   ├── templates/
│   │   └── TemplateManager.ts              # Section 5.2, 18
│   │
│   ├── versioning/
│   │   └── VersionManager.ts               # Section 12.2
│   │
│   ├── infrastructure/
│   │   ├── persistence/
│   │   │   └── PlanRepositoryAdapter.ts    # Implements PlanStorePort
│   │   ├── knowledge/
│   │   │   └── KnowledgeComparisonAdapter.ts
│   │   ├── memory/
│   │   │   └── MemoryManagerAdapter.ts
│   │   ├── cache/
│   │   │   └── PlanningCacheAdapter.ts     # Section 18, distributable per Section 19
│   │   └── events/
│   │       └── EventBusPublisherAdapter.ts
│   │
│   ├── errors/
│   │   ├── InvalidObjectiveError.ts
│   │   ├── CircularDependencyError.ts
│   │   ├── PolicyViolationError.ts
│   │   ├── UnsatisfiableConstraintError.ts
│   │   ├── ExcessiveDecompositionDepthError.ts
│   │   ├── PlanNotFoundError.ts
│   │   └── PlanningFailedError.ts
│   │
│   └── facade/
│       └── PlannerFacade.ts                # The single public entry point (Section 12)
│
├── schemas/
│   └── plan-schema.json                    # Versioned JSON Schema for Plan (Section 7)
│
├── config/
│   └── planner.config.ts                   # Max decomposition depth, optimization thresholds, cache TTLs
│
├── tests/
│   ├── unit/
│   ├── planning/
│   ├── dependency/
│   ├── workflow/
│   ├── optimization/
│   ├── policy/
│   ├── performance/
│   ├── stress/
│   └── regression/
│
└── docs/
    └── MDD.md                              # This document
```

### 21.1 Folder Responsibility Summary

- `domain/` — Framework-agnostic core: `Plan`/`Goal`/`Task`/`ExecutionGraph` entities, cycle detection and critical-path algorithms, and ports; zero I/O.
- `application/` — Use-case orchestration for each public operation (Section 12).
- `pipeline/` — The full planning pipeline components (Section 5.2, 6), one focused component per stage.
- `policy/` — The Planning Policy Engine (Section 11).
- `templates/` — Plan template storage/matching (Section 5.2, 18).
- `versioning/` — Plan version linkage (Section 12.2).
- `infrastructure/` — Concrete adapters: persistence, read-only knowledge/memory access, caching, event publishing.
- `errors/` — Typed error hierarchy referenced throughout Section 14.
- `facade/` — The only file other modules (Orchestrator Core, Dashboard Backend) import directly.
- `schemas/` — The versioned Plan schema — the contract artifact referenced throughout this document.
- `config/` — All tunable parameters — never hardcoded in domain/pipeline logic.
- `tests/` — Mirrors the testing strategy in Section 22.

---

## 22. Testing Strategy

| Test Type | Focus |
|---|---|
| Unit Tests | Domain logic in isolation: cycle detection, critical-path calculation, graph simplification, constraint merging — against injected fakes for every port. |
| Planning Tests | Full facade-level flows: `createPlan()` end to end across a range of objective shapes (trivial, deeply hierarchical, highly parallel, highly sequential). |
| Dependency Tests | Correctness of dependency discovery across all four types (Section 9), including deliberately-crafted circular-dependency fixtures to verify rejection. |
| Workflow Tests | Correctness of `ExecutionGraph` construction from a known task/dependency fixture set. |
| Optimization Tests | Verifies optimizations improve (or correctly decline to change) critical path/parallelism without altering semantic correctness; includes policy-blocked-optimization fixtures. |
| Policy Tests | Every policy category (Section 11) evaluated against matching and non-matching contexts, verifying correct application/rejection. |
| Performance Tests | Pipeline latency across a range of objective/graph sizes, including the parallel-analysis path (Section 18). |
| Stress Tests | Very large objectives (near the maximum decomposition depth/graph size) and high concurrent request volume, consistent with the targets in Section 19. |
| Regression Tests | Fixed objective/plan fixtures representing previously-fixed bugs, permanently retained in the suite. |

---

## 23. Future Expansion

Every extension below is achievable **without modifying the `Plan`/`ExecutionGraph` schema's required fields (Section 7), the public Facade contract (Section 12), or existing pipeline source code**:

- **AI-Assisted Planning:** Implemented as an alternative Goal/Task Decomposer strategy behind the existing decomposition interfaces (Section 5.2), selectable via configuration or policy, without changing the pipeline's overall shape.
- **Hierarchical Planners:** A planner-of-planners composes multiple `Plan` outputs from this module as inputs to a higher-level plan — achievable entirely through the existing public interface (`createPlan()` composition) without internal changes.
- **Plugin-Based Planning Strategies:** A `PlanningStrategyPort` (mirroring the pattern established by the Provider Plugin System MDD) allows swapping decomposition/optimization algorithms per objective type or tenant, without touching the Planning Coordinator's orchestration logic.
- **Industry-Specific Planners:** Implemented as specialized policy sets (Section 11) and/or templates (Section 5.2, 18) rather than new source code.
- **Adaptive Planning:** Execution feedback (from Task Queue/Provider Manager, delivered via Event Bus, never by the Planner reaching into execution directly) can inform future `updatePlan()` calls or template refinement, reusing the existing versioning model (Section 12.2).
- **Self-Optimizing Workflows:** An extension of the Optimization Engine that learns from historical `OptimizationCompleted` outcomes — a new strategy behind the same `OptimizationEngine` interface.
- **Collaborative Planning:** Multiple concurrent planning sessions contributing to one shared objective is achievable via the existing partitioning approach (Section 19 Task Graph Partitioning) with a merge step, without new domain concepts.
- **Distributed Planning Clusters:** Already architected for in Section 19; scaling further requires only infrastructure/adapter changes.
- **Future Planning Algorithms:** Any new algorithm is a new implementation behind the existing `GoalDecomposer`/`TaskDecomposer`/`OptimizationEngine` interfaces (Open/Closed Principle applied throughout Section 5).

---

## 24. Risks

| Risk Category | Risk | Mitigation |
|---|---|---|
| Architecture | A planning-strategy implementation leaks execution-time decisions (e.g., provider hints) into the `Plan` model | Interface/schema review discipline enforced via Plan Validator's structural checks (Section 14) and code review policy; the `ExecutionGraph` model has no fields for provider/model assignment by design (Section 7). |
| Planning | Pathological objectives cause runaway/excessive decomposition | Configurable maximum decomposition depth (Section 8) with a hard `ExcessiveDecompositionDepthError` failure path. |
| Performance | Very large objectives produce execution graphs too large to process within acceptable latency | Parallel analysis (Section 18) and Task Graph Partitioning (Section 19) directly address this; stress tests (Section 22) validate behavior at scale. |
| Scalability | A single Plan Repository/cache backend becomes a bottleneck under hyperscale concurrent load | Persistence and cache ports (Section 21) are swappable adapters, supporting distributed backends without domain-logic changes (Section 19). |
| Consistency | Concurrent `updatePlan()` calls against the same plan produce conflicting versions | Version Manager enforces strictly monotonic versioning per `planId`, with the underlying Plan Repository's storage layer providing the necessary write-conflict detection (owned by the Database module). |
| Maintenance | Policy sprawl (Section 11) makes plan behavior difficult to reason about over time | Every policy application is logged/eventable (`PolicyApplied`, Section 13) and recorded on the `Plan.planningPolicies` field, keeping every plan's policy provenance fully auditable. |

---

## 25. Design Decisions

| Decision | Rationale | Trade-off / Alternatives Considered |
|---|---|---|
| The Planner never touches execution, providers, or routing | Enforces a hard architectural boundary matching the platform's Open/Closed and separation-of-concerns requirements; keeps planning reusable and testable independent of execution infrastructure | Downstream modules (Task Queue, Router) must independently interpret the `ExecutionGraph`'s advisory fields (priority, complexity) without any Planner guarantee about how execution will actually proceed; acceptable since that interpretation is explicitly their designated responsibility |
| Every re-plan produces a new, version-linked `Plan` rather than in-place mutation | Preserves full auditability and matches the Immutable History pattern already established in the Model Registry MDD | Increases storage volume for frequently-revised plans over time; mitigated by standard archival/retention policy at the Plan Repository level |
| Optimization is best-effort and degrades gracefully on failure (Section 14) | A plan that is merely sub-optimally ordered is still correct and executable; failing the entire planning request over an optimization bug would be a worse outcome than shipping an unoptimized-but-valid plan | Slightly more complex error-handling logic distinguishing "correctness failures" (hard-fail) from "enhancement failures" (soft-fail); judged worthwhile for overall pipeline resilience |
| Policies are evaluated through one uniform `PolicyEngine.evaluate()` interface regardless of category | Enables unlimited new policy types (Section 11, 23) without Planner source-code changes, directly satisfying the Open/Closed requirement | Requires policy definitions themselves to be expressed in a sufficiently generic, structured format (owned by Configuration Manager) rather than arbitrary code — a deliberate constraint that keeps policy evaluation safe and centrally auditable |
| Every pipeline component (Section 5) is stateless per request | Directly enables the horizontal-scaling and stateless-worker-pool story in Section 19 without any later redesign | Requires all cross-stage state to flow explicitly through the pipeline's data objects (`PlanningContext`, `ConstraintSet`, etc.) rather than component-local state, a small additional design discipline cost paid once, upfront |

---

## 26. Diagrams

### 26.1 Component Diagram
See Section 5.1.

### 26.2 Planning Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                              Planner                                 │
│  ┌───────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐         │
│  │ Objective │ │ Decomposers│ │Dependency  │ │Optimization│         │
│  │ Analyzer  │ │(Goal/Task) │ │Analyzer    │ │Engine      │         │
│  └───────────┘ └────────────┘ └────────────┘ └────────────┘         │
│      pure workflow generation — no execution, no providers, no      │
│      routing, no retries                                            │
└─────────────┬─────────────────────────────────────┬────────────────┘
              │ reads (read-only)                     │ publishes
   ┌───────────▼───────────┐                ┌──────────▼──────────┐
   │ Knowledge Comparison /  │                │      Event Bus         │
   │ Memory Manager           │                │  (PlanCreated, etc.)  │
   └─────────────────────────┘                └──────────────────────┘
```

### 26.3 Planning Lifecycle Diagram
See Section 6.3.

### 26.4 Execution Graph Diagram

```
            ┌─────────┐
            │  Task A  │
            └────┬────┘
      DATA_DEPENDENCY
       ┌──────────┴──────────┐
       ▼                     ▼
 ┌─────────┐           ┌─────────┐
 │ Task B   │           │ Task C   │   ← B and C are parallel-eligible
 └────┬────┘           └────┬────┘
      │TASK_DEPENDENCY       │TASK_DEPENDENCY
      └───────────┬──────────┘
                   ▼
             ┌─────────┐
             │  Task D  │   ← critical path: A → B/C → D
             └─────────┘
```

### 26.5 Dependency Graph
See Section 9 and 26.4 (the same structure viewed as a typed edge list rather than an execution-ready graph).

### 26.6 Workflow Generation Flow

```
Goal/Subgoal Tree → Task Decomposer → Task List
        │
        ▼
Dependency Analyzer → Dependency Graph (cycle-checked)
        │
        ▼
Execution Graph Builder → Raw ExecutionGraph
        │
        ▼
Optimization Engine → Optimized ExecutionGraph (policy re-checked)
        │
        ▼
Plan Validator → PUBLISHED Plan (or PlanningFailed)
```

### 26.7 Sequence Diagram
See Section 20.1–20.8.

### 26.8 Folder Structure Diagram
See Section 21.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| Objective | The high-level goal statement the Planner receives as input. |
| Execution Graph | The DAG of `ExecutionNode`/`ExecutionEdge` representing the finished, executable workflow. |
| Critical Path | The longest dependency chain through the execution graph, by estimated duration/complexity. |
| Planning Policy | A rule (organizational, security, compliance, optimization, priority, or custom) evaluated uniformly during plan generation. |
| Plan Version | An immutable, linked snapshot of a plan; a re-plan always creates a new version rather than mutating history. |

---

## 27. Architectural Constraints

The Planner operates under the following immutable architectural constraints. These constraints define the module's **purpose boundary** and prevent scope creep that would compromise the architecture's integrity.

**Execution-Related Constraints:**
- The Planner **never executes any task.** Execution is exclusively a downstream responsibility of Task Queue, Provider Manager, and Router.
- The Planner **never performs routing** of any kind — task-to-provider assignment is a Router responsibility.
- The Planner **never selects providers** or models — Provider Manager and Model Registry own those decisions.
- The Planner **never communicates directly with any provider SDK** — all execution communication is through Provider Manager.
- The Planner **never manages task queues** — Task Queue owns scheduling and queue management.
- The Planner **never performs retries** — retries are an execution-time concern owned by Provider Manager.
- The Planner **never performs fallback behavior** of any kind — fallback is a downstream execution strategy.
- The Planner **never validates execution *results*** — Plan Validator validates the *plan's* structure and policy compliance; result validation is a Review/Validation Engine concern.
- The Planner **never reviews AI responses or execution artifacts** — that is exclusively a downstream responsibility.

**Storage-Related Constraints:**
- The Planner **never stores memory** — Memory Manager owns memory persistence; the Planner only reads from it.
- The Planner **never stores knowledge** — Knowledge Base owns knowledge persistence; the Planner only reads from it.
- The Planner **never performs knowledge comparison** — Knowledge Comparison Engine owns that analysis; the Planner only consumes its structured output.

**Context Consumption Constraints:**
- The Planner **only consumes Knowledge Comparison Engine output** — never directly accesses the Knowledge Base.
- The Planner **only consumes Memory Manager context** — never directly accesses the Memory store or performs memory queries.

**Event and Lifecycle Constraints:**
- The Planner **publishes plans exclusively through the Event Bus** — never writes to Task Queue, Router, or Provider Manager directly.
- The Planner **remains stateless between planning requests** — no request's outcome affects the handling of any subsequent request, enabling arbitrary distribution across worker instances.

**Execution Ownership Constraint:**
- **Execution ownership belongs entirely to downstream modules.** The Planner terminates its responsibility the moment a plan reaches `PUBLISHED` status.

---

## 28. Architecture Decision Records (ADRs)

### 28.1 ADR-001: Planner as the Platform's Sole Workflow-Generation Engine

**Decision:** The Planner is the platform's exclusive source of truth for workflow structure. Every task sequence and dependency graph representing a customer-requested objective flows through the Planner's pipeline before becoming an executable plan.

**Context:** The platform requires a single, auditable entry point for "what needs to happen and in what order" to avoid conflicting plan sources, ensure policy consistency, and maintain auditability across the enterprise.

**Alternatives Considered:**
1. Multiple specialized planners per objective type — rejected because it fragments audit trails and makes global policy enforcement difficult.
2. Direct task composition by callers — rejected because it lacks validation, dependency analysis, and policy application.
3. Template-only planning — rejected because it cannot handle novel objectives and reduces optimization opportunities.

**Rationale:** Centralizing workflow generation in the Planner ensures every plan is validated, policy-compliant, dependency-correct, and fully auditable before any execution begins. This is essential for enterprise governance, compliance, and debuggability.

**Consequences:** 
- All workflow-generation logic must live in or be integrated into the Planner.
- Every objective type and complexity level must be handled by the same pipeline.
- New planning strategies (if added) must integrate through the Planner's component interfaces, not as external alternatives.

---

### 28.2 ADR-002: Separation of Planning from Execution

**Decision:** The Planner is purely a planning engine — it transforms objectives into execution graphs but never touches execution, routing, retry, or fallback logic.

**Context:** Mixing planning and execution decisions creates ambiguity about which failures/issues belong to the planning layer vs. the execution layer, makes testing and debugging difficult, and couples the Planner to execution-time failure modes it cannot predict or control.

**Alternatives Considered:**
1. Unified planner-executor module — rejected because it couples planning logic to execution contingencies, making both harder to reason about and test independently.
2. Planner issuing execution commands directly — rejected because it introduces latency, concurrency, and durability concerns outside the Planner's control.

**Rationale:** Clear separation allows the Planner to be purely deterministic (same inputs always produce the same plan) and fully testable without mocking execution infrastructure. It also allows execution strategies to evolve independently.

**Consequences:**
- Execution failures cannot trigger re-planning within the Planner; only explicit `updatePlan()` calls (from Orchestrator Core) do.
- The Planner cannot adapt behavior based on real-time execution feedback — feedback arrives post-hoc via events, informing future planning decisions.
- Execution quality depends entirely on downstream modules' correctness.

---

### 28.3 ADR-003: Execution Graph as the Canonical Planning Artifact

**Decision:** Every finished plan is published as an `ExecutionGraph` — a DAG of executable nodes and typed dependency edges — not as an imperative script, decision tree, or other structure.

**Context:** An execution graph is abstract enough to represent diverse workflow shapes (sequential, parallel, conditional) while concrete enough for Task Queue to schedule and Provider Manager to execute without further interpretation.

**Alternatives Considered:**
1. Linear task list — rejected because it cannot represent parallelism or data dependencies.
2. State machine / decision tree — rejected because it is overfit to conditional logic and lacks a natural representation for simple sequential/parallel workflows.
3. Imperative script — rejected because it binds the plan to a specific execution model and language, reducing portability.

**Rationale:** The graph model is well-understood, algorithmically analyzable (cycle-detectable, critical-path-computable), and neutral with respect to execution strategy.

**Consequences:**
- Task Queue and Router must each implement their own interpretation logic for the graph (scheduling, routing).
- The graph cannot represent arbitrary control flow (loops, conditionals) — those are not modeled as plans but as internal task logic.
- Validation must ensure the graph is a strict DAG (no cycles).

---

### 28.4 ADR-004: Hierarchical Goal Decomposition

**Decision:** Objectives are decomposed hierarchically (Objective → Goals → Subgoals → Tasks) with each level only as granular as necessary for the level below it to be independently actionable, rather than directly into a flat task list.

**Context:** Hierarchical decomposition preserves the customer's original reasoning about goal structure, supports auditability ("why did this subgoal exist?"), and enables policy enforcement at multiple levels of abstraction.

**Alternatives Considered:**
1. Flat task list — rejected because it loses structural information and makes goal-level policy enforcement difficult.
2. Unlimited recursion depth — rejected because it creates pathological objectives that may never reach actionable granularity.

**Rationale:** Hierarchy mirrors how humans reason about complex objectives and enables policies/constraints to apply meaningfully at the goal level, subgoal level, or task level as appropriate.

**Consequences:**
- The pipeline must enforce a maximum decomposition depth to prevent runaway recursion.
- Audit trails must retain the full goal/subgoal tree for traceability.
- Optimization may flatten trivial subgoals, but the original structure is always preserved separately for auditability.

---

### 28.5 ADR-005: Dependency-Driven Planning

**Decision:** The Planner models four explicit dependency types (task, resource, data, execution) as the sole basis for task ordering, rather than inferring ordering from objective statement or allowing implicit coupling.

**Context:** Explicit dependencies are auditable, cycle-detectable, and provide the basis for parallelism optimization. Implicit ordering is fragile and cannot be analyzed automatically.

**Alternatives Considered:**
1. Implicit ordering from objective prose — rejected because it is ambiguous and not machine-analyzable.
2. Single dependency type — rejected because it conflates different constraint types and prevents fine-grained optimization.

**Rationale:** Explicit, typed dependencies enable the Dependency Analyzer to compute critical paths, detect cycles, and identify parallelizable task groups without ambiguity.

**Consequences:**
- Task decomposition must explicitly identify and declare dependencies rather than leaving them implicit.
- Every dependency must have a well-defined type for accurate analysis.
- Circular dependencies are treated as irrecoverable failures.

---

### 28.6 ADR-006: Policy-Driven Planning

**Decision:** Planning policies (Section 11) — organizational, security, compliance, optimization, priority, and custom rules — are applied uniformly through one `PolicyEngine.evaluate()` interface and are evaluated at every relevant pipeline stage.

**Context:** Policies are the primary mechanism for expressing enterprise governance within the Planner. Uniform evaluation ensures consistency and makes it straightforward to add new policy types without Planner source-code changes.

**Alternatives Considered:**
1. Hard-coded enterprise rules in the Planner — rejected because it requires source-code changes per new rule and couples policy logic to planning logic.
2. Post-pipeline policy validation — rejected because policies applied late cannot influence the optimization or constraint-application phases.

**Rationale:** Policy-first planning ensures every plan respects organizational boundaries before execution, and policy definitions remain external (Configuration Manager) rather than embedded in Planner code.

**Consequences:**
- Policies must be expressible in a structured, machine-evaluable format.
- Policy-driven failures are validation failures, not planning failures — they prevent publication but do not indicate a bug in the pipeline.
- Every policy that might affect workflow shape must be evaluated before the graph is finalized.

---

### 28.7 ADR-007: Stateless Planning Pipeline

**Decision:** Every component in the planning pipeline is stateless per request — all cross-stage state is carried explicitly through the pipeline's data objects (Section 5.2), with no component maintaining local mutable state between stages.

**Context:** Statelessness is essential for horizontal scaling (Section 19), testability, and determinism. It also simplifies failure recovery — if a request fails mid-pipeline, restarting is safe because no partial state persists.

**Alternatives Considered:**
1. Stateful components accumulating state — rejected because it prevents horizontal scaling and makes failure recovery complex.

**Rationale:** Statelessness directly enables the scalability story in Section 19 and makes the pipeline deterministic and replay-safe.

**Consequences:**
- Cross-stage communication must be explicit and structured (e.g., `PlanningContext`, `ConstraintSet` objects).
- Each component is a pure function of its inputs (modulo external port calls).
- In-process concurrency (parallel decomposition branches) requires careful thread-safe state aggregation.

---

### 28.8 ADR-008: Event-Driven Publication

**Decision:** Finished plans are published exclusively as events (Section 13) via the Event Bus, never through direct method calls or writes to Task Queue/Router databases.

**Context:** Event-driven publication ensures loose coupling between Planner and downstream consumers, supports durability/replay, and enables observability (all plan-related events flow through one channel).

**Alternatives Considered:**
1. Direct method calls to Task Queue — rejected because it couples lifecycle to Task Queue's implementation and makes async/reliable publication difficult.
2. Direct database writes — rejected because it bypasses event-driven coordination.

**Rationale:** Event publication aligns with the platform's Event Bus architecture and enables downstream modules to consume plans independently without blocking the Planner.

**Consequences:**
- Downstream modules depend on Event Bus reliability, not on synchronous Planner confirmation.
- Plan publication is asynchronous — callers receive a `planId` immediately but the plan's entry into Task Queue is downstream.
- Event Bus failure temporarily prevents plan propagation but does not prevent the Planner from producing plans internally.

---

### 28.9 ADR-009: Immutable Plan Versioning

**Decision:** Every re-plan produces a new, immutable plan version rather than mutating an existing plan in place. Versions are linked via `previousPlanId` and increment a global `version` counter.

**Context:** Immutable history is essential for auditability, allows blame-tracing ("which plan was actually executed?"), and prevents accidental data loss if a re-plan fails.

**Alternatives Considered:**
1. In-place mutation — rejected because it loses history and prevents audit reconstruction.
2. Version branching (multiple parents) — rejected because it introduces complexity and ambiguity.

**Rationale:** Immutable versioning, consistent with the Immutable Metadata History pattern in Model Registry MDD, preserves provenance and enables full reconstruction of planning decisions over time.

**Consequences:**
- Storage volume grows with repeated re-planning of the same objective.
- Archival/retention policies may eventually delete old superseded versions.
- Every re-plan cycle is fully traceable.

---

### 28.10 ADR-010: Hexagonal Architecture

**Decision:** The Planner depends on external services (Knowledge Comparison Engine, Memory Manager, Configuration Manager, Event Bus, persistent storage) exclusively through ports and adapters (Section 21), with no hard-coded dependencies.

**Context:** Ports and adapters enable the Planner to remain agnostic to the specific implementations of those services, supporting testability (via fake adapters) and deployment flexibility.

**Alternatives Considered:**
1. Direct imports/calls to other modules — rejected because it introduces coupling and makes testing/mocking difficult.
2. Configuration-based factory methods — rejected because ports provide a clearer, more decoupled abstraction.

**Rationale:** Hexagonal architecture keeps the Planner's core domain logic independent of infrastructure, enabling test isolation and infrastructure flexibility.

**Consequences:**
- Every external interaction must go through a port.
- Ports must be injected at startup, not created locally.
- Fake implementations are required for unit testing.

---

### 28.11 ADR-011: Clean Architecture

**Decision:** The Planner is organized into concentric layers: domain (entities, services), application (use cases), and infrastructure (adapters), with dependency flow exclusively inward (domain and application have no dependencies on infrastructure).

**Context:** Clean Architecture enforces separation of concerns, ensures business logic is independent of framework/database/UI choices, and makes the codebase navigable and maintainable over time.

**Alternatives Considered:**
1. Layered architecture without inversion of control — rejected because it often results in domain logic depending on infrastructure details.
2. Flat structure — rejected because it makes code organization and responsibility isolation unclear.

**Rationale:** Clean Architecture maximizes the Planner's reusability, testability, and maintainability by isolating domain logic from infrastructure.

**Consequences:**
- Infrastructure details (persistence, API calls) must not appear in domain/application layers.
- All external dependencies (Event Bus, ports) must be injected into application services.
- Tight layering discipline is required during code review.

---

### 28.12 ADR-012: Planning Cache as a Performance Optimization, Not a Correctness Dependency

**Decision:** The Planning Cache (Section 18) improves performance for repeated/similar objectives but is never a correctness requirement. Cache failures are degraded-mode, not failures.

**Context:** Caching can introduce subtle bugs (stale entries, invalidation errors). Declaring it non-essential means correctness bugs are contained to performance, never availability or correctness.

**Alternatives Considered:**
1. Cache as required — rejected because it couples correctness to cache consistency, a distributed systems problem.
2. No cache — rejected because it misses the opportunity to optimize for common repeated objectives.

**Rationale:** Cache misses degrade performance but not correctness; cache hits improve latency. The pipeline is always correct independent of cache state.

**Consequences:**
- Cache is bypassed on every `skipCache=true` option or configuration override.
- Cache invalidation is triggered by policy/configuration changes but missing invalidation merely reduces hit rate, not correctness.
- Stale cache entries are benign (worst case: redundant planning computation).

---

### 28.13 ADR-013: Optimization as Advisory Rather Than Correctness-Critical

**Decision:** The Optimization Engine (Section 10) produces an optimized execution graph as an enhancement, not a requirement. If optimization fails, the pipeline falls back to the pre-optimization graph and succeeds.

**Context:** Optimization logic is complex and may have edge-case bugs. Failing the entire planning request over an optimization bug would be worse than shipping an unoptimized-but-valid plan.

**Alternatives Considered:**
1. Optimization failure is a hard failure — rejected because it makes the pipeline fragile to optimization bugs.
2. No optimization — rejected because it misses parallelism opportunities and increases execution time.

**Rationale:** Graceful degradation ensures the Planner remains reliable even if optimization logic has bugs; optimization is a performance feature, not a correctness feature.

**Consequences:**
- The plan may be sub-optimal in ordering or parallelism if optimization fails.
- Optimization failures are logged and exposed in metrics but do not block plan publication.
- Testing must include failure scenarios to verify fallback behavior.

---

## 29. Plan Versioning Governance

### 29.1 Version Ownership

- **Planner** owns version numbering and linkage — every new version is assigned by the Version Manager.
- **Plan Repository** owns the persistence layer — it stores all versions with their historical metadata.
- **Orchestrator Core** or API callers own the decision to re-plan and trigger `updatePlan()`, not the Planner itself.

### 29.2 Immutable History

- Every version is immutable once created.
- A version's `status` may transition from `VALIDATED` to `PUBLISHED` to `SUPERSEDED`, but the version's data content never changes.
- Prior versions are retained indefinitely (subject to retention/archival policy at the Plan Repository level, not the Planner's responsibility).

### 29.3 Version Numbering Rules

- **Monotonic Increment:** `Plan.version` is a strictly increasing integer per `planId` lineage.
- **Single Lineage:** A plan has at most one `previousPlanId`. Versions form a linked list, not a tree.
- **Global Scope:** Version numbers are scoped per `planId` lineage, not globally; different plan lineages may have overlapping version numbers.

### 29.4 Superseded Plan Handling

- When `updatePlan(planId, changes)` produces a new plan version, the prior plan's `status` transitions to `SUPERSEDED`.
- `SUPERSEDED` plans are immutable and never returned by lookup APIs unless explicitly queried for historical reasons.
- `SUPERSEDED` plans remain in the Plan Repository for audit trails.

### 29.5 Re-Planning Rules

- Re-planning is triggered explicitly via `updatePlan()` or a new `createPlan()` request.
- The Planner never automatically re-plans in response to external events.
- Each re-plan is a new version, not a mutation of the existing plan.

### 29.6 Backward Compatibility

- The `Plan` schema (Section 7) is versioned via `schemas/plan-schema.json`. Schema migrations are managed centrally, not within the Planner.
- Older plan versions may not match the current schema but remain queryable via the Plan Repository's versioning layer.

### 29.7 Audit Requirements

- Every plan creation/update records: `createdAt`, `updatedAt`, actor/source identifier (via audit logging).
- The audit trail is the Plan Repository's responsibility, but the Planner ensures immutability by design.

### 29.8 Version Lineage

- `Plan.previousPlanId` forms a singly-linked list enabling full reconstruction of re-planning history.
- Callers can walk the lineage to understand how a plan evolved in response to context changes.

---

## 30. Planning Ownership Matrix

This matrix clarifies which module owns which planning responsibility.

| Responsibility | Owner | Role |
|---|---|---|
| Objective analysis | **Planner** | Classify scope, ambiguity, feasibility before decomposition. |
| Goal decomposition | **Planner** | Break objectives into goal hierarchies. |
| Task decomposition | **Planner** | Convert subgoals to concrete executable task definitions. |
| Constraint application | **Planner** | Merge and propagate constraints through decomposition. |
| Dependency analysis | **Planner** | Discover task/resource/data/execution dependencies; detect cycles. |
| Execution graph generation | **Planner** | Materialize the DAG from dependencies. |
| Optimization | **Planner** | Improve parallelism/critical-path efficiency within policy bounds. |
| Planning validation | **Planner** | Verify structural correctness and policy compliance. |
| Plan publication | **Planner** | Emit `PlanCreated` and related events via Event Bus. |
| Execution scheduling | **Task Queue** | Schedule task execution per plan's execution graph and system capacity. |
| Routing | **Router** | Assign individual tasks to providers/capabilities. |
| Provider execution | **Provider Manager** | Invoke providers and manage execution lifecycle. |
| Capability matching | **Capability Selector** | Match task requirements to available capabilities. |
| Knowledge analysis | **Knowledge Comparison Engine** | Analyze and structure relevant knowledge; supply to Planner as read-only context. |
| Memory retrieval | **Memory Manager** | Retrieve session/project memory; supply to Planner as read-only context. |
| Policy definition | **Configuration Manager** | Define and store planning policies; supply to Planner for evaluation. |
| Policy evaluation | **Planner** (via Planning Policy Engine) | Apply policies during planning; enforce constraints. |
| Result validation | **Review/Validation Engine** | Validate execution *results* (not plan structure). |
| Retry/fallback | **Provider Manager** | Manage execution-time retries and fallback strategies. |
| Plan storage | **Plan Repository** (via Database module) | Persist plans and version history. |

---

## 31. Planning Processing Guarantees

The Planner offers the following guarantees to downstream consumers.

### 31.1 Deterministic Planning

**Guarantee:** For identical inputs (objective, context, policies, configuration), the Planner produces identical plans.

**Rationale:** Determinism enables debugging, testing, and replay.

**Enforcement:** The Planning Coordinator's pipeline is purely functional; all randomness is explicitly controlled via seeded random number generation (if needed) with the seed recorded in plan metadata.

**Exception:** If Knowledge Comparison Engine or Memory Manager produce non-deterministic outputs (e.g., variable result ordering), the Planner's output may differ; the Planner will record the context inputs in `knowledgeReferences`/`memoryReferences` for reconstruction.

### 31.2 Validation Before Publication

**Guarantee:** Every published plan (status `PUBLISHED`) has passed the Plan Validator and all applicable policies.

**Rationale:** Downstream consumers can rely on the plan's structural correctness.

**Enforcement:** A plan reaches `PUBLISHED` status if and only if Plan Validator returns `valid=true` (Section 6, stage 10).

### 31.3 No Cyclic Execution Graphs

**Guarantee:** No published plan contains a cycle in its execution graph.

**Rationale:** Cycles would prevent eventual task completion.

**Enforcement:** The Dependency Analyzer's cycle detection is a hard-fail gate; cyclic graphs never proceed past the "Analyze Dependencies" stage (Section 6).

### 31.4 Valid Goal Hierarchy

**Guarantee:** Every task in a published plan is traceable to a valid goal/subgoal hierarchy preserved in the plan.

**Rationale:** Auditability — downstream consumers and auditors can reconstruct why each task exists.

**Enforcement:** Task Decomposer links each task to its originating subgoal, and Goal Decomposer preserves the full hierarchy in the plan.

### 31.5 Policy Compliance Before Publication

**Guarantee:** Every published plan satisfies every applicable policy evaluated by the Planning Policy Engine at the time of planning.

**Rationale:** Enterprise governance.

**Enforcement:** Plan Validator confirms policy satisfaction; policies evaluated mid-pipeline (e.g., by Optimization Engine) re-validate post-optimization.

### 31.6 Immutable Published Plans

**Guarantee:** Once a plan reaches `PUBLISHED` status, its `goals`, `tasks`, `dependencies`, `executionGraph`, and `constraints` fields are immutable.

**Rationale:** Prevents accidental data loss and ensures audit trails remain valid.

**Enforcement:** The Plan Repository persists plans as immutable records; updates always create a new version (Section 29).

### 31.7 Complete Planning Provenance

**Guarantee:** Every published plan records which policies were applied (`planningPolicies`), which knowledge informed it (`knowledgeReferences`), and which memory context was consulted (`memoryReferences`).

**Rationale:** Full auditability — administrators can understand why the plan looks the way it does.

**Enforcement:** Planning Context Builder records these references during context assembly, and Plan Validator confirms they are populated before publication.

### 31.8 Stateless Execution Per Request

**Guarantee:** The Planner's handling of request N is not affected by the outcome of request N-1. Each request is independent.

**Rationale:** Enables horizontal scaling and eliminates state pollution risks.

**Enforcement:** Planning Coordinator is stateless; all state flows explicitly through the pipeline's data objects.

---

## 32. Planning Identity Model

The Planner assigns and manages the following identifiers across plans and their components.

### 32.1 Core Identifiers

| Identifier | Uniqueness | Scope | Lifecycle | Assigned By |
|---|---|---|---|---|
| `planId` | Globally unique (UUID) | Entire platform | Created at plan inception, never changes | Planning Coordinator |
| `objectiveId` | Globally unique (UUID) | Entire platform | Supplied by caller (Orchestrator Core) | Caller |
| `goalId` | Unique per plan | Per `planId` | Assigned during decomposition | Goal Decomposer |
| `subgoalId` | Unique per plan | Per `planId` | Assigned during decomposition | Goal Decomposer |
| `taskId` | Unique per plan | Per `planId` | Assigned during task decomposition | Task Decomposer |
| `dependencyId` | Unique per plan | Per `planId` | Assigned during dependency analysis | Dependency Analyzer |
| `templateId` | Globally unique (UUID) | Entire platform | Assigned at template creation | Template Manager |
| `policyId` | Globally unique (UUID) | Entire platform | Assigned by Configuration Manager | Configuration Manager |

### 32.2 Correlation and Tracing Identifiers

| Identifier | Scope | Assigned By | Passed Through |
|---|---|---|---|
| `tenantId` | Organization | Caller | Every planning request; scopes policy/data access |
| `projectId` | Project within tenant | Caller | Relevant for memory/knowledge scoping; optional |
| `sessionId` | Session (user/API interaction) | Caller or platform | Scopes memory context; optional |
| `requestId` | Single planning request | Platform (Event Bus / Orchestrator Core) | Traces one planning operation; unique per request |
| `correlationId` | Business operation | Platform or caller | Ties multiple related requests together (e.g., orchestration flow) |
| `traceId` | Distributed trace | Observability infrastructure (e.g., OpenTelemetry) | Traces across all platform services participating in one user action |
| `spanId` | Individual operation within a trace | Observability infrastructure | Identifies one specific component/stage within a trace |

### 32.3 Identity Assignment Guarantees

- **Uniqueness:** All globally-scoped identifiers (`planId`, `objectiveId`, `templateId`, `policyId`) are UUIDs, ensuring uniqueness across the distributed platform without coordination.
- **Stability:** An identifier never changes over the lifetime of the entity it identifies. Re-planning creates a new `planId`, not a reuse of the old one.
- **Traceability:** Correlation IDs and trace IDs flow through all logging/events, enabling administrators to reconstruct the full lifecycle of a plan from logs.

### 32.4 Identifier Usage in Events and Logs

Every event (Section 13) and log entry carries:
- `planId` (identifies the plan being worked on)
- `requestId` (identifies this specific planning request)
- `correlationId` (identifies the broader business operation, if applicable)
- `traceId` + `spanId` (distributed tracing)

This ensures full observability and auditability from the perspective of any identifier.

---

## 33. Operational Limits

The Planner enforces the following configurable limits to prevent resource exhaustion and pathological behavior.

### 33.1 Decomposition Limits

| Limit | Default | Rationale | Enforcement |
|---|---|---|---|
| Maximum decomposition depth | 10 | Prevents runaway recursion and pathologically deep hierarchies | Goal Decomposer; exceeding triggers `ExcessiveDecompositionDepthError` |
| Maximum goals per objective | 1,000 | Prevents explosive goal expansion | Goal Decomposer |
| Maximum subgoals per goal | 1,000 | Prevents explosive subgoal expansion | Goal Decomposer |

### 33.2 Execution Graph Limits

| Limit | Default | Rationale | Enforcement |
|---|---|---|---|
| Maximum tasks per plan | 10,000 | Prevents graphs too large to schedule efficiently | Task Decomposer |
| Maximum dependency edges | 100,000 | Prevents dense graphs with excessive coupling | Dependency Analyzer |
| Maximum graph size (nodes + edges, in bytes) | 100 MB | Prevents memory exhaustion during graph construction | Execution Graph Builder |

### 33.3 Pipeline Limits

| Limit | Default | Rationale | Enforcement |
|---|---|---|---|
| Maximum planning duration | 5 minutes | Prevents hung/slow planning requests from blocking resources | Planning Coordinator; timeout triggers `PlanningFailedError` |
| Maximum concurrent planning requests per instance | 100 | Prevents resource starvation on a single instance | Request dispatcher (infrastructure layer) |

### 33.4 Template and Policy Limits

| Limit | Default | Rationale | Enforcement |
|---|---|---|---|
| Maximum templates | 10,000 per tenant | Prevents template proliferation and lookup slowdown | Template Manager |
| Maximum policies | 1,000 per tenant | Prevents policy evaluation from becoming a bottleneck | Planning Policy Engine |

### 33.5 Cache Limits

| Limit | Default | Rationale | Enforcement |
|---|---|---|---|
| Maximum cache entries | 100,000 | Prevents memory exhaustion in cache | Planning Cache (backend-dependent) |
| Cache entry TTL | 24 hours | Invalidates stale cached plans | Planning Cache eviction strategy |

### 33.6 Optimization Limits

| Limit | Default | Rationale | Enforcement |
|---|---|---|---|
| Maximum optimization iterations | 100 | Prevents optimization from entering infinite loops | Optimization Engine |

### 33.7 Configuration and Adjustment

- All limits are defined in `config/planner.config.ts`.
- Limits are adjustable per deployment (dev, staging, production) and per tenant if necessary.
- Exceeding a limit triggers a specific, documented error (e.g., `PlanningFailedError` with `reason: EXCESSIVE_DECOMPOSITION_DEPTH`).
- Metric dashboards expose current usage vs. configured limits for capacity planning.

---

## 34. Observability Standards

The Planner emits metrics, logs, and trace spans to enable operators to monitor health, diagnose issues, and measure performance.

### 34.1 Core Metrics

Emitted per planning request and aggregated by minute/hour/day:

| Metric | Type | Dimensions | Use Case |
|---|---|---|---|
| `planning_request_count` | Counter | tenant, objective_type | Throughput monitoring |
| `planning_duration_ms` | Histogram (p50/p95/p99) | tenant, objective_type | Latency SLO tracking |
| `planning_stage_duration_ms` | Histogram | stage_name (e.g., "decomposition", "optimization") | Bottleneck identification |
| `task_count` | Histogram | — | Workflow complexity distribution |
| `dependency_count` | Histogram | — | Dependency density distribution |
| `execution_graph_size_bytes` | Histogram | — | Memory consumption pattern |
| `critical_path_length` | Histogram | — | Execution duration expectations |
| `optimization_improvement_percent` | Histogram | — | Optimization effectiveness |
| `cache_hit_ratio` | Gauge | — | Cache performance |
| `policy_evaluation_count` | Counter | policy_id | Policy application frequency |
| `policy_rejection_count` | Counter | policy_id, reason | Policy enforcement rates |
| `planning_success_count` | Counter | outcome (success/failure) | Reliability baseline |
| `planning_failure_count` | Counter | failure_stage, error_type | Failure pattern tracking |

### 34.2 Trace Spans

Each planning request generates a trace with spans per stage:

| Span Name | Attributes | Purpose |
|---|---|---|
| `planner.planning_request` (root) | `planId`, `objectiveId`, `requestId` | Root span for the entire request |
| `planner.load_context` | `tenant`, `memory_refs_count`, `knowledge_refs_count` | Context assembly |
| `planner.analyze_objective` | `objective_size`, `ambiguity_flags` | Objective analysis |
| `planner.identify_constraints` | `constraint_count` | Constraint merging |
| `planner.decompose_objective` | `goal_count`, `max_depth` | Goal decomposition |
| `planner.generate_tasks` | `task_count` | Task decomposition |
| `planner.analyze_dependencies` | `edge_count`, `cycle_count` (should be 0) | Dependency analysis |
| `planner.build_execution_graph` | `node_count`, `edge_count` | Graph construction |
| `planner.optimize_workflow` | `optimizations_applied_count`, `critical_path_before`, `critical_path_after` | Optimization |
| `planner.validate_plan` | `violation_count` | Validation |
| `planner.publish_plan` | `event_published_count` | Publication |

### 34.3 Structured Logging

Every log entry carries:

```json
{
  "timestamp": "ISO-8601",
  "level": "INFO | WARN | ERROR",
  "message": "Human-readable message",
  "planId": "UUID (if applicable)",
  "requestId": "UUID",
  "correlationId": "UUID (if applicable)",
  "traceId": "UUID (if applicable)",
  "spanId": "UUID (if applicable)",
  "tenant": "tenant-identifier",
  "component": "planning-coordinator | objective-analyzer | ...",
  "event": "stage_entry | stage_exit | policy_applied | optimization_complete | ...",
  "data": { /* stage-specific structured data */ }
}
```

### 34.4 Alerting Thresholds

| Alert | Condition | Action |
|---|---|---|
| Planning latency SLO | p99 > 10 seconds | Page on-call; investigate bottleneck |
| High failure rate | >5% of requests fail in last hour | Page on-call; check for systematic issues |
| Cache thrashing | Hit ratio < 10% | Adjust cache TTL or investigate workload change |
| Policy rejections spike | 10x increase in rejections in last hour | Alert ops; investigate policy change or workload drift |
| Graph size limit exceeded | Any request >= 80% of max size | Alert ops; plan for scaling or config adjustment |

---

## 35. Template Governance

### 35.1 Template Ownership

- **Template Manager** owns template storage and retrieval.
- **Planning Coordinator** consults templates during objective analysis; templates are optional hints, not mandatory paths.
- Actual plan generation always proceeds through the full pipeline, even if a template matches.

### 35.2 Approval Workflow

- Templates are created by authorized administrators or automated curation (e.g., common repeated objectives automatically promoted to templates).
- Before publication, a template must:
  - Represent a real, recurring objective pattern.
  - Have pre-computed and pre-validated decomposition/execution graph data.
  - Include a clear description and versioning identifier.
  - Be approved by a planning architecture administrator.

### 35.3 Versioning

- Each template has a version number and immutable history.
- A template update (change to decomposition or graph) creates a new version, not an in-place mutation.
- Old template versions remain available for backward compatibility.

### 35.4 Compatibility Rules

- A template's goal/task structure must remain compatible with the current `Plan` schema (Section 7).
- When the `Plan` schema changes, template updates are necessary but templates themselves do not need to version-match the schema.

### 35.5 Deprecation Policy

- Templates may be marked `DEPRECATED` if they no longer match common objective patterns.
- Deprecated templates are not suggested for new plans but remain queryable for historical lookup.
- Deprecation follows a 30-day notification period before removal from automatic recommendations.

### 35.6 Validation Requirements

- Every template's pre-computed decomposition and graph must pass the Plan Validator's checks (Section 14).
- Templates are validated per schema version; cross-schema-version compatibility is explicit and tested.

### 35.7 Audit Trail

- Template creation, updates, and deprecation are logged with timestamps and actor identifiers.
- All template versions remain queryable for audit reconstruction.

### 35.8 Certification Process

Templates may be marked with a "certified" flag indicating they have:
- Been used successfully in production for >100 planning instances.
- Never caused downstream failures traced back to the template structure.
- Been explicitly reviewed by the planning architecture team.

---

## 36. Planning Policy Governance

### 36.1 Policy Ownership

- **Configuration Manager** owns policy *definitions* and storage.
- **Planning Policy Engine** owns policy *evaluation* during planning.
- **Planner** owns policy *application* throughout the pipeline.

### 36.2 Evaluation Order

Policies are evaluated in a defined order to prevent conflicts:

1. **Security Policies** — evaluated first; a security policy failure halts the pipeline immediately.
2. **Compliance Policies** — evaluated second; compliance violations prevent publication.
3. **Execution Policies** — evaluated third; execution constraints inform the Optimization Engine.
4. **Custom Policies** — evaluated last; custom policies do not override security or compliance.

### 36.3 Policy Precedence

- Tenant-level policies override organization-level defaults.
- Explicit objective-type policies override generic policies.
- Security > Compliance > Execution > Optimization priority ordering prevents inconsistency.

### 36.4 Conflict Resolution

If two policies conflict (e.g., one requires a task to be separate, another requires it to be merged):
- The more restrictive policy wins (separation requirement > merger requirement).
- A conflict is logged and surfaced in plan metadata as a warning.
- If conflicts are systematic, alerts are sent to administrators to resolve policy inconsistencies.

### 36.5 Versioning

Policies follow the same immutable versioning as plans:
- Each policy update creates a new version.
- Prior versions remain queryable.
- `Plan.planningPolicies` records the exact policy versions applied, enabling historical reconstruction.

### 36.6 Backward Compatibility

When a policy definition changes:
- The new version applies to all future planning requests.
- Existing published plans retain references to the policy version active at their creation time.
- Re-planning an objective may produce a different plan if policy versions have changed.

### 36.7 Approval Workflow

- Policy creation requires approval by a planning administrator.
- Policy changes (edits or deprecation) require documented justification.
- All policy changes are versioned and logged.

### 36.8 Administrative Controls

Administrators can:
- Enable/disable policies per tenant.
- Override policies for specific objectives (with audit logging).
- Audit which policies have been applied and their outcomes.
- Schedule policy deprecation with a transition period for callers to adapt.

---

## 37. Failure Recovery Guarantees

The Planner provides the following recovery guarantees to enable resilient operation.

### 37.1 Graceful Degradation Without Context

**Guarantee:** If Knowledge Comparison Engine or Memory Manager are unreachable, planning proceeds with reduced confidence rather than failing outright.

**Enforcement:**
- Planning Context Builder catches connection errors and proceeds with empty/degraded context.
- Risk Assessment Engine lowers confidence scores when context is unavailable.
- `Plan.knowledgeReferences` and `Plan.memoryReferences` are empty when context sources are unavailable.

**Exception:** If the objective explicitly requires knowledge-grounding (e.g., "base this on prior similar projects"), unavailable knowledge causes planning failure.

### 37.2 Cache Failures Never Affect Correctness

**Guarantee:** Cache misses, stale entries, or cache layer failures degrade performance but never produce incorrect plans.

**Enforcement:**
- Cache is consulted optionally; absence of a cache entry triggers full pipeline execution.
- Plans are always generated via the full pipeline unless explicitly skipped (none of the logic ever skips the full pipeline).
- Cache failures (connection errors, timeouts) are caught and logged; the request proceeds cache-miss.

### 37.3 Optimization Failures Fall Back to Pre-Optimization Graphs

**Guarantee:** If the Optimization Engine encounters an error, the pipeline uses the validated pre-optimization ExecutionGraph and succeeds.

**Enforcement:**
- Optimization Engine wraps its logic in error handling.
- On optimization error, the pipeline logs the error, increments an alert counter, and publishes the pre-optimization graph.
- Plan status remains `PUBLISHED`; the customer gets a valid but potentially sub-optimal plan.

### 37.4 Repository Failures Prevent Publication

**Guarantee:** If Plan Repository persistence fails, the plan is not published.

**Enforcement:**
- Publishing is the last stage of the pipeline (Section 6).
- If Plan Repository write fails, a `PlanningFailed` event is emitted instead of `PlanCreated`.
- The Planner does not retry persistence internally; Orchestrator Core may retry planning as a new request.

### 37.5 Validation Failures Block Publication

**Guarantee:** Plans that fail validation never reach `PUBLISHED` status.

**Enforcement:**
- Plan Validator is the final correctness gate before publication.
- A `ValidationResult { valid: false }` triggers `PlanningFailed` event, not `PlanCreated`.
- Invalid plans may be stored in Plan Repository as `FAILED` status for audit but never executed.

### 37.6 Event Publication Reliability

**Guarantee:** Events are published reliably to the Event Bus with retry semantics.

**Enforcement:**
- All events in Section 13 specify their retry behavior.
- High-importance events (`PlanCreated`, `PlanningCompleted`, `PlanningFailed`) use standard retry (3 attempts).
- Event Bus is responsible for durability; the Planner trusts Event Bus delivery.

### 37.7 Safe Recovery After Process Restart

**Guarantee:** A restarted Planner instance can safely resume planning requests without state corruption.

**Enforcement:**
- Planning Coordinator is stateless per request (ADR-007).
- In-flight requests are lost on restart but can be safely retried by Orchestrator Core (identical inputs → identical plan due to ADR-001).
- Plan Repository is the single source of truth; the Planner never maintains state outside requests.

### 37.8 Stateless Request Replay

**Guarantee:** Re-running a failed planning request with identical inputs produces an identical plan.

**Enforcement:**
- Deterministic planning (Section 31.1).
- Replay safety means callers can safely implement automatic retry logic.
- Exceptions are logged and metrics exposed if determinism is violated.

---

## 38. Security Governance

The Planner implements the following security controls.

### 38.1 Plan Integrity

**Mechanism:** Plans are cryptographically signed by the Planner at publication.

- Each `Plan` record receives a `signature` field (computed over canonical JSON representation of the plan data).
- Downstream consumers can verify the signature to ensure the plan has not been tampered with in transit or storage.

### 38.2 Policy Integrity

**Mechanism:** Policies are retrieved from Configuration Manager and cached, with integrity validation on cache refresh.

- Cached policies are validated against a known policy signature on every `ConfigurationReloaded` event.
- An invalid policy (signature mismatch) triggers an alert and the old cached policy remains active until resolved.

### 38.3 Version Integrity

**Mechanism:** Plan versions are linked immutably and version history is tamper-evident.

- Each version's `previousPlanId` reference is cryptographically included in the version's signature.
- Breaking a link or altering a prior version would invalidate all successor versions' signatures.

### 38.4 Audit Requirements

**Mechanism:** Every planning operation is logged with actor, timestamp, and full context.

- `createPlan()` and `updatePlan()` log: actor ID, tenant ID, objective content, policy decisions, and outcome.
- Audit logs are immutable and retained per compliance policy (typically 7 years minimum).

### 38.5 Access Control

**Mechanism:** Public interfaces (`createPlan`, `updatePlan`) are restricted to authenticated callers with appropriate authorization.

- Orchestrator Core and administrative APIs authenticate before calling the Planner.
- Authorization rules (who can plan what objectives for which tenants) are enforced by Orchestrator Core and API gateway, not by the Planner itself.
- The Planner trusts `tenantId` supplied in the request; access control is upstream.

### 38.6 Tenant Isolation

**Mechanism:** All plan data is scoped by `tenantId`; cross-tenant data access is impossible within the Planner.

- Plan Repository partition all plans by tenant.
- Policies, templates, and cache are all scoped by tenant.
- The Planning Policy Engine ensures policies applicable to one tenant do not leak to another.

### 38.7 Metadata Protection

**Mechanism:** Sensitive objective/plan metadata is not exposed in logs or events beyond what is necessary.

- Logs include `planId`, `requestId`, and summary data (task count, complexity) but not the full objective text or sensitive task details.
- Full plan details are stored in Plan Repository (restricted by authorization at the repository level).
- Events published via Event Bus carry summary data; full plans are accessible via API only.

### 38.8 Administrative Overrides

**Mechanism:** Authorized administrators can override policies on a per-plan basis, with mandatory audit logging.

- `createPlan(objective, { adminOverride: "reason", ... })` is allowed only for callers with administrative privileges.
- Every override is logged with actor, reason, and timestamp, triggering an administrative audit alert.

### 38.9 Immutable Audit History

**Mechanism:** Audit logs are written once and never modified or deleted (only archived).

- Audit events are immutable once created.
- Audit logs are replicated to a secure audit trail system outside the Planner's control.

### 38.10 Compliance Logging

**Mechanism:** All compliance-relevant planning decisions are explicitly logged.

- Policy applications, policy rejections, validation outcomes, and audit events are tagged as compliance-relevant.
- Compliance-tagged events flow to a dedicated compliance audit system.

---

## 39. Future Scalability Governance

The Planner is architected to support scaling to extreme scale without source-code modifications. This section documents architectural readiness for anticipated future growth.

### 39.1 Distributed Planning Clusters

**Readiness:** Planning Coordinator is stateless per request (ADR-007) and fully reentrant. Scaling horizontally to 100s/1000s of instances requires only:
- Load-balanced request distribution to available instances.
- Shared Plan Repository backend (database).
- Shared Planning Cache backend (distributed cache).

**Future:** No changes to Planning Coordinator logic required.

### 39.2 Regional Planners

**Readiness:** All port dependencies (Section 21) are regional and can be deployed per-region with region-local adapters.

**Future:** Deploy a complete Planner instance per region with local Knowledge Comparison Engine, Memory Manager, Configuration Manager, and Event Bus adapters. The Plan Repository may use cross-region replication if needed (owned by Database module).

### 39.3 Parallel Decomposition

**Readiness:** Goal Decomposer recursively decomposes independent subgoals; these decomposition branches can be dispatched to parallel workers.

**Future:** A distributed Goal Decomposer coordinator partitions sibling subgoals to worker instances and merges results. The merge is a data-structure operation (goal tree concatenation), not a complex semantic operation.

### 39.4 Distributed Optimization

**Readiness:** Optimization Engine is stateless; very large execution graphs can be partitioned into independent subgraphs (connected components), optimized in parallel, and merged.

**Future:** An Optimization Coordinator applies connected-component analysis to the dependency graph, dispatches subgraphs to worker instances, and merges optimized subgraphs back into a global graph.

### 39.5 Distributed Validation

**Readiness:** Plan Validator checks can be partitioned: structural validation (DAG check) is global; constraint/policy validation can be per-component.

**Future:** A distributed Plan Validator dispatches structural and constraint checks to worker instances and aggregates validation results.

### 39.6 Federated Planning

**Readiness:** Multiple organizations may operate independent Planner instances with cross-organization policy coordination via Configuration Manager.

**Future:** Federated planning allows organization A to incorporate plans from organization B by explicit delegation, with policy/security boundaries preserved. The merged plan remains traceable to its constituent organization-level plans.

### 39.7 AI-Assisted Planning Strategies

**Readiness:** The Plan Model and Pipeline (Sections 5 and 6) are independent of the decomposition algorithms used.

**Future:** Goal Decomposer and Task Decomposer can be swapped for AI-assisted implementations (e.g., LLM-based decomposition) without changing the pipeline. AI strategies are evaluated via the same Plan Validator, ensuring equivalence of output correctness.

### 39.8 Plugin-Based Planning Strategies

**Readiness:** Ports and adapters (Hexagonal Architecture, ADR-010) allow pluggable strategy implementations.

**Future:** A `PlanningStrategyPort` interface (mirroring Provider Plugin System MDD) allows third-party planning strategies to be registered and selected per objective type or organization.

### 39.9 Extremely Large Execution Graphs

**Readiness:** Execution Graph representation (Section 7) is serializable to streaming formats (JSON Lines, Protocol Buffers).

**Future:** For graphs with millions of nodes/edges, streaming construction and pagination in queries ensure the Planner never materializes the full graph in memory. All components already use the typed edge-list representation (`DependencyEdge[]`), enabling streaming.

### 39.10 Multi-Region Deployments

**Readiness:** No components depend on single-region infrastructure. All dependencies are regional ports/adapters.

**Future:** Deploy Planner instances in every region with region-local Configuration Manager, Event Bus, and context (Knowledge/Memory) sources. Plan Repository coordination (cross-region consistency) is a Database module concern.

---

## 40. Enterprise Governance — Compliance Certifications

To document the Planner's readiness for enterprise deployments, the following compliance capabilities are in place:

### 40.1 SOC 2 Readiness

- ✓ Audit logging (Section 38.4)
- ✓ Access controls (Section 38.5)
- ✓ Immutable plan history (Section 29.2)
- ✓ Encryption of plans via signatures (Section 38.1)
- ✓ Change tracking (Section 29.8)

### 40.2 HIPAA Compliance (where applicable)

- ✓ Tenant isolation (Section 38.6)
- ✓ Audit trails (Section 38.4)
- ✓ Administrative controls (Section 38.8)

### 40.3 GDPR Compliance (where applicable)

- ✓ Data retention policies (Section 29.2, Plan Repository level)
- ✓ Right to be forgotten (coordinated at Plan Repository level, architecture ready)
- ✓ Data portability (plans are structured, portable records)

---

**End of Module Design Document — Planner**
