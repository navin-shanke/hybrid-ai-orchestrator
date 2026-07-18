# Learning Layer — Module Design Document (MDD)

**Document Type:** Module Design Document (MDD)
**Module Name:** Learning Layer
**Parent System:** Hybrid AI Development Platform
**Status:** Implementation-Ready
**Audience:** Senior Software Engineers, AI Coding Agents (Cursor, Claude Code, OpenCode, Roo Code)
**Source-of-Truth Inputs:** PRD, SAD, API Specification, Database Design Document, Orchestrator Core MDD, Event Bus MDD, Request Manager MDD, Provider Manager MDD, Model Registry MDD, Configuration Manager MDD, Logger MDD, Memory Manager MDD, Knowledge Base MDD, Review Engine MDD, Validation Engine MDD, Browser Automation MDD, Planner MDD, Task Queue MDD, Router MDD

---

## 1. Executive Summary

### 1.1 Purpose

The Learning Layer is the platform's continuous-learning orchestration layer. It watches what actually happened across the platform — validated outcomes, review results, regression detections, browser validation results, user feedback, provider performance, routing decisions, and planning effectiveness — and turns that observed history into evidence-based, confidence-scored **learning artifacts**: reusable knowledge candidates, routing/provider/configuration **recommendations**, and long-term optimization signals. It exists so the platform gets measurably better over time without any human having to manually mine logs for patterns.

### 1.2 Responsibilities

The Learning Layer observes platform events (via the Event Bus only), aggregates execution outcomes into evidence, generates learning candidates from that evidence, scores each candidate's confidence, evaluates it against learning policy, promotes validated candidates into published, versioned learning artifacts, and produces recommendations for other modules to voluntarily act on through their own public interfaces. It maintains a full, immutable history of every learning artifact and its provenance.

### 1.3 Architectural Role

The Learning Layer is an **orchestrator of learning, not a storage engine or a decision engine**. It never stores memory, knowledge, configuration, or model registry data itself — it only reads (through public interfaces) and recommends. It never executes anything, never plans, never routes, and never runs outside of the request-execution path's *shadow* — it observes finished outcomes asynchronously, entirely decoupled from and non-blocking to any user-facing workflow.

### 1.4 Module Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  Event Bus                                    │
│  (RequestCompleted, ReviewCompleted, ValidationCompleted, RegressionDetected,  │
│   BrowserValidationCompleted, ProviderPerformanceRecorded, RoutingDecisionMade, │
│   PlanningCompleted, UserFeedbackReceived, ...)                               │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │ subscribes (read-only, asynchronous)
┌───────────────────────────────────────▼───────────────────────────────────────┐
│                              Learning Layer (this module)                       │
│  Aggregation · Evidence Collection · Candidate Generation · Confidence          │
│  Scoring · Policy Evaluation · Promotion · Recommendation · History             │
└───────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┘
        │ recommends via    │ recommends via    │ recommends via    │ recommends via
        ▼ public interface   ▼ public interface   ▼ public interface   ▼ public interface
┌───────────────┐  ┌───────────────┐   ┌───────────────┐    ┌────────────────────┐
│ Knowledge Base  │  │ Model Registry │   │ Router          │    │ Configuration Mgr   │
│ (owns writes)   │  │ (owns writes)  │   │ (owns writes)   │    │ (owns writes)        │
└───────────────┘  └───────────────┘   └───────────────┘    └────────────────────┘
```

The Learning Layer sits entirely outside the synchronous request path. It is downstream of the Event Bus (its only observation source) and upstream, only ever advisory, of every module it might influence — every actual state change happens inside the owning module, through that module's own governance, never by the Learning Layer reaching in directly.

---

## 2. Goals

### 2.1 Primary Goals

1. Observe platform events without ever affecting request-path latency.
2. Aggregate execution outcomes across validated results, review outcomes, regression detection, browser validation, user feedback, provider performance, routing decisions, and planner effectiveness.
3. Generate learning candidates from aggregated evidence, and score each candidate's confidence.
4. Evaluate candidates against configurable learning policy before allowing promotion.
5. Promote validated learning into immutable, versioned learning artifacts, with full provenance.
6. Produce recommendations (routing, provider, configuration) that other modules may voluntarily consume and apply through their own interfaces.
7. Maintain a complete, queryable, explainable learning history.

### 2.2 Secondary Goals

1. Support incremental, streaming aggregation rather than large periodic batch recomputation.
2. Support a learning cache for high-frequency recommendation queries.
3. Support explainability: every promoted artifact and every recommendation must be traceable back to the specific evidence and events that produced it.
4. Support learning scoped at project, organization, and global levels.

### 2.3 Non-Goals

The Learning Layer must never:

- Execute requests, perform planning, perform routing, or execute providers.
- Modify Memory Manager, Knowledge Base, Configuration Manager, or Model Registry state directly.
- Change policies automatically or make runtime execution decisions.
- Bypass any module's ownership of its own data — every change reaches its destination only through that module's public interface and governance.
- Participate synchronously in request execution in any way.

### 2.4 Design Constraints

- All observation is event-driven and asynchronous; the Learning Layer holds no synchronous call path from any request-serving module.
- All interaction with Memory Manager and Knowledge Base is strictly through their public, read-oriented interfaces — never direct storage access.
- Every learning artifact is immutable once published; any change is a new version, never an in-place edit.
- Every learning artifact and recommendation must carry confidence, provenance, and evidence references sufficient for a human to audit *why* it was produced.

### 2.5 Future Goals

1. Federated learning across multiple platform deployments.
2. AI-assisted optimization strategies as a pluggable evaluation/scoring strategy.
3. Reinforcement-learning-style signals feeding future Planner/Router iterations (still only ever as recommendations).
4. Cross-project, team-level, and organization-wide learning scopes, and eventually a learning marketplace (Section 22).

---

## 3. Responsibilities

### 3.1 Must Have

- Subscribe to the full set of relevant platform events (Section 9, 10) via the Event Bus, and never any other transport.
- Aggregate raw events into structured evidence tied to a specific outcome (a completed request, a review, a validation, a regression, a browser validation, a piece of user feedback).
- Generate learning candidates from sufficiently strong evidence.
- Score every candidate's confidence using a defined, explainable methodology (Section 5, Confidence Engine).
- Evaluate every candidate against configured learning policy before it can be promoted.
- Promote qualifying candidates into immutable, versioned learning artifacts with complete provenance.
- Generate recommendations (routing, provider, configuration) derived from promoted learning, exposed only through this module's own read interfaces — never pushed/applied to other modules automatically.
- Maintain full learning history, queryable and explainable.
- Never write to Memory Manager, Knowledge Base, Configuration Manager, or Model Registry directly — recommendations are the only output artifact those modules may choose to act on, through their own interfaces.

### 3.2 Should Have

- Support a Learning Cache for frequent recommendation/history queries.
- Support incremental aggregation to avoid redundant recomputation as new events arrive.
- Support configurable learning policies per tenant/project/organization scope.
- Support a Learning Health Monitor reporting on pipeline health (aggregation lag, promotion throughput).

### 3.3 Future Responsibilities

- Pluggable, AI-assisted confidence-scoring and candidate-generation strategies (Section 22).
- Federated cross-deployment learning synchronization.
- A governed learning marketplace for sharing promotable learning artifacts across organizations (opt-in, access-controlled).

---

## 4. Scope

### 4.1 Owns

- Learning orchestration (the full pipeline, Section 7).
- Learning aggregation (evidence collection and structuring).
- Learning scoring (confidence).
- Learning promotion (policy evaluation and the promotion decision).
- Learning history (immutable, versioned, queryable).
- Learning recommendations (the recommendation artifacts themselves — not their application).
- Learning confidence methodology and confidence artifacts.
- Learning provenance (linking every artifact back to its originating evidence/events).
- Learning metadata (tags, scope, classification of learning artifacts).
- The learning lifecycle/state machine (Section 8).

### 4.2 Never Owns

- Memory storage (Memory Manager).
- Knowledge storage (Knowledge Base).
- Routing decisions (Router).
- Planning (Planner).
- Validation of execution results (Validation Engine).
- Review of outputs (Review Engine).
- Provider execution (Provider Manager).
- Browser automation (Browser Automation).
- Configuration values/storage (Configuration Manager).
- Any general business workflow.

### 4.3 Other Module Responsibilities (Explicit Separation)

| Module | What It Owns (Learning Layer never touches this directly) | What Learning Layer May Do |
|---|---|---|
| Memory Manager | All memory storage/retrieval | Read via Memory Manager's public interface only, as evidence input |
| Knowledge Base | All knowledge storage | Read via Knowledge Base's public interface only, as evidence input; **recommend** new/updated knowledge, never write it |
| Model Registry | All model metadata | Read model metadata as evidence context; **recommend** model-related configuration changes, never write registry data |
| Router | All routing decisions | Read routing-decision events as evidence; **recommend** routing optimizations, never make or apply routing decisions |
| Configuration Manager | All configuration values/storage | **Recommend** configuration improvements; Configuration Manager's own governance decides whether/how to apply them |
| Review Engine | Review execution and results | Consume `ReviewCompleted`-style events as evidence input |
| Validation Engine | Validation execution and results | Consume `ValidationCompleted`-style events as evidence input |
| Orchestrator Core | Overall workflow coordination | Consume orchestration-level completion events as evidence input; never receive or send synchronous calls to/from Orchestrator Core |

---

## 5. Internal Architecture

### 5.1 Component Overview

```
                            ┌───────────────────────────────────────────┐
                            │            Learning Coordinator              │
                            │   (drives the full pipeline, Section 7)      │
                            └─────────────────────┬─────────────────────┘
                                                  │
       ┌────────────────────────────────────────────┼────────────────────────────────────────────┐
       │                                            │                                            │
┌──────▼───────┐                        ┌────────────▼────────────┐                  ┌────────────▼────────────┐
│Event Aggregator │                        │   Evidence Collector      │                  │Learning Candidate Manager │
└──────┬───────┘                        └────────────┬────────────┘                  └────────────┬────────────┘
       │                                            │                                            │
       └────────────────────────────────────────────┼────────────────────────────────────────────┘
                                                  │
                                        ┌───────────▼───────────┐
                                        │    Confidence Engine      │
                                        └───────────┬───────────┘
                                                  │
                                        ┌───────────▼───────────┐
                                        │    Learning Evaluator     │
                                        │ (applies Learning Policy)  │
                                        └───────────┬───────────┘
                                                  │
                              ┌────────────────────┼────────────────────┐
                              │                    │                    │
                    ┌─────────▼────────┐ ┌─────────▼─────────┐ ┌────────▼────────┐
                    │ Promotion Manager  │ │Recommendation Engine │ │Learning Registry  │
                    └─────────┬────────┘ └─────────┬─────────┘ └────────┬────────┘
                              └────────────────────┼────────────────────┘
                                                  │
                                        ┌───────────▼───────────┐
                                        │  Learning History Manager │
                                        └───────────┬───────────┘
                                                  │
                                        ┌───────────▼───────────┐
                                        │ Learning Persistence Adapter│
                                        └───────────────────────┘

  Cross-cutting: Learning Policy Manager · Learning Metadata Manager · Provenance Manager ·
                 Learning Cache · Learning Event Publisher · Learning Health Monitor ·
                 Learning Metrics Manager · Learning Scheduler
```

### 5.2 Component Descriptions

Each follows: **Purpose · Responsibilities · Interfaces · Dependencies · Internal Communication · Lifecycle**.

**Learning Coordinator**
- *Purpose:* Orchestrate the end-to-end learning pipeline (Section 7).
- *Responsibilities:* Sequence Event Aggregator → Evidence Collector → Learning Candidate Manager → Confidence Engine → Learning Evaluator → Promotion Manager → Recommendation Engine → Learning History Manager, and route failures at any stage into error handling (Section 12).
- *Interfaces:* Internal only; invoked by the Learning Scheduler and by asynchronous event handlers.
- *Dependencies:* All components below.
- *Internal Communication:* Direct in-process calls between pipeline stages, following Dependency Inversion — the Coordinator depends on interfaces, not concrete implementations.
- *Lifecycle:* Long-lived; each pipeline run is a stateless, independent execution.

**Event Aggregator**
- *Purpose:* Subscribe to the Event Bus and group related raw events into a coherent outcome unit.
- *Responsibilities:* Subscribe to every relevant event category (Section 9, 10); correlate events sharing a `correlationId`/`requestId` into a single aggregated outcome record; buffer/window events for incrementally-arriving related events (e.g., a request's completion followed shortly after by its review result).
- *Interfaces:* Event Bus subscription (read-only).
- *Dependencies:* Event Bus port.
- *Internal Communication:* Emits aggregated outcome records to the Evidence Collector.
- *Lifecycle:* Long-lived, continuously running subscriber.

**Evidence Collector**
- *Purpose:* Transform an aggregated outcome record into structured `Evidence` (Section 6 model) suitable for candidate generation.
- *Responsibilities:* Normalize disparate event payloads (review outcomes, validation results, regression detections, browser validation results, user feedback, provider performance, routing decisions, planner effectiveness) into a common `Evidence` schema; attach provenance (source events, timestamps).
- *Interfaces:* Consumes Event Aggregator output; may read supplementary context from Memory Manager/Knowledge Base/Model Registry public interfaces (read-only) when an event alone is insufficient context.
- *Dependencies:* Event Aggregator, Memory Manager port, Knowledge Base port, Model Registry port (all read-only).
- *Internal Communication:* Emits `Evidence` records to the Learning Candidate Manager.
- *Lifecycle:* Invoked per aggregated outcome.

**Learning Candidate Manager**
- *Purpose:* Decide whether accumulated evidence is sufficient to form a `LearningCandidate` and construct it.
- *Responsibilities:* Apply candidate-generation heuristics/strategies (pluggable, Section 22) to evidence (potentially accumulated across multiple related outcomes over time, not just a single event); construct a `LearningCandidate` (Section 6) with full evidence references.
- *Interfaces:* Consumes Evidence Collector output and, for incremental aggregation, previously-accumulated evidence from the Learning Cache/Persistence Adapter.
- *Dependencies:* Evidence Collector, Learning Cache, Learning Persistence Adapter.
- *Internal Communication:* Emits `LearningCandidate` records to the Confidence Engine.
- *Lifecycle:* Invoked per evidence-accumulation threshold (configurable) or on-demand via `evaluateLearning()`.

**Confidence Engine**
- *Purpose:* Score a candidate's confidence.
- *Responsibilities:* Apply a defined, explainable scoring methodology (e.g., weighted combination of evidence volume, evidence consistency, source reliability, recency) producing a `confidence` score (0.0–1.0) plus a breakdown of contributing factors for explainability (Section 3.1's explainability goal).
- *Interfaces:* `calculateConfidence()` (Section 6 public interface, also used internally).
- *Dependencies:* Learning Candidate Manager output.
- *Internal Communication:* Attaches a `ConfidenceScore` to the candidate and forwards it to the Learning Evaluator.
- *Lifecycle:* Invoked per candidate.

**Learning Evaluator**
- *Purpose:* Evaluate a scored candidate against applicable Learning Policy (Section 11) to determine promotion eligibility.
- *Responsibilities:* Fetch applicable policies from the Learning Policy Manager, evaluate the candidate's confidence/evidence/scope against policy thresholds and rules, and produce an `EvaluationResult` (approve/reject/hold-for-review).
- *Interfaces:* Consumes Confidence Engine output.
- *Dependencies:* Learning Policy Manager.
- *Internal Communication:* Forwards approved candidates to the Promotion Manager; rejected candidates go to the Learning History Manager directly (as `REJECTED`, never silently discarded).
- *Lifecycle:* Invoked per scored candidate.

**Promotion Manager**
- *Purpose:* Finalize the promotion of an approved candidate into a published, immutable `LearningArtifact`.
- *Responsibilities:* Construct the final artifact (Section 6), assign version, and hand it to the Learning Registry and Learning History Manager; emit `LearningPromoted`.
- *Interfaces:* `promoteLearning()`/`rejectLearning()` (Section 6).
- *Dependencies:* Learning Evaluator output, Learning Registry, Version Manager (internal to History Manager, Section 5.2 below).
- *Internal Communication:* Publishes the finalized artifact for the Recommendation Engine to consider.
- *Lifecycle:* Invoked per approved candidate.

**Recommendation Engine**
- *Purpose:* Derive actionable recommendations (routing, provider, configuration) from promoted learning artifacts.
- *Responsibilities:* Translate a `LearningArtifact`'s content into one or more `Recommendation` records (Section 6), each scoped to the module category it targets (Router, Provider Manager, Configuration Manager) — always as advisory output, never as an applied change.
- *Interfaces:* `getRecommendations()` (Section 6).
- *Dependencies:* Promotion Manager output, Learning Registry.
- *Internal Communication:* Recommendations are stored in the Learning Registry and surfaced via the public read interface; this module never pushes them anywhere.
- *Lifecycle:* Invoked per promoted artifact, and re-evaluated periodically (Section 5.2 Learning Scheduler) as new evidence may strengthen/weaken an existing recommendation.

**Learning Policy Manager**
- *Purpose:* Own the resolution and evaluation of learning policies (Section 11).
- *Responsibilities:* Fetch policy definitions from Configuration Manager (namespace `policies.*`), evaluate applicability by tenant/project/organization scope, and expose a uniform `evaluate(context) → PolicyResult` interface to the Learning Evaluator.
- *Interfaces:* Internal; consumed by Learning Evaluator.
- *Dependencies:* Configuration Manager port.
- *Internal Communication:* Policy definitions cached and refreshed on `ConfigurationReloaded` events (Section 9, 11).
- *Lifecycle:* Long-lived; evaluation is stateless per call.

**Learning History Manager**
- *Purpose:* Own the durable, immutable, versioned record of every learning artifact (published, rejected, superseded, or archived).
- *Responsibilities:* Persist every candidate's outcome (approved/rejected) and every artifact's full version history; support `getHistory()`/`searchLearning()`.
- *Interfaces:* `getHistory()`, `searchLearning()` (Section 6).
- *Dependencies:* Learning Persistence Adapter, Version Manager.
- *Internal Communication:* Receives finalized outcomes from Promotion Manager and the Learning Evaluator (for rejections).
- *Lifecycle:* Long-lived, persists across restarts.

**Learning Registry**
- *Purpose:* The in-memory, queryable index of currently-active (published, non-superseded) learning artifacts and recommendations.
- *Responsibilities:* Provide fast lookup by `learningId`, scope (project/organization/global), category, and status for `getLearning()`/`getRecommendations()`.
- *Interfaces:* `getLearning()`, `getRecommendations()` (Section 6).
- *Dependencies:* Learning History Manager (as the durable source of truth), Learning Cache.
- *Internal Communication:* Updated on every promotion/rejection/archival.
- *Lifecycle:* Long-lived, incrementally maintained.

**Learning Metadata Manager**
- *Purpose:* Maintain classification/tagging metadata for learning artifacts (Section 6 `metadata`/`customMetadata`).
- *Responsibilities:* Support tag-based and scope-based search (`searchLearning()`).
- *Interfaces:* Internal, consumed by Learning Registry/History Manager.
- *Dependencies:* Learning Registry.
- *Internal Communication:* Updated alongside every artifact write.
- *Lifecycle:* Long-lived.

**Provenance Manager**
- *Purpose:* Guarantee every learning artifact and recommendation is traceable back to its originating evidence and source events.
- *Responsibilities:* Maintain the `provenance` structure (Section 6) linking `learningId` → `evidenceId[]` → source `eventId[]`/`correlationId[]`, enabling full explainability.
- *Interfaces:* Internal; consumed throughout the pipeline and exposed read-only via `getLearning()`.
- *Dependencies:* Evidence Collector, Learning Candidate Manager, Promotion Manager.
- *Internal Communication:* Provenance is attached at every pipeline stage, never reconstructed after the fact.
- *Lifecycle:* Cross-cutting, invoked at every stage.

**Learning Cache**
- *Purpose:* Serve high-frequency reads (recommendation queries, recent history queries) without hitting persistence on every call.
- *Responsibilities:* Cache `Recommendation`/`LearningArtifact` reads; invalidate on any relevant write.
- *Interfaces:* Internal, consulted by Learning Registry.
- *Dependencies:* Learning Persistence Adapter (source of truth on cache miss).
- *Internal Communication:* Transparent to callers.
- *Lifecycle:* Ephemeral, in-memory (or pluggable backend).

**Learning Event Publisher**
- *Purpose:* Centralize emission of all Learning Layer events (Section 9) to the Event Bus.
- *Responsibilities:* Translate internal pipeline-stage transitions into standardized events.
- *Interfaces:* Event Bus publisher port.
- *Dependencies:* Event Bus port.
- *Internal Communication:* Invoked by every pipeline component at its respective transition point.
- *Lifecycle:* Long-lived, cross-cutting.

**Learning Health Monitor**
- *Purpose:* Track the health of the learning pipeline itself (not the platform at large).
- *Responsibilities:* Monitor aggregation lag, promotion throughput, evidence backlog size; emit `LearningHealthChanged`.
- *Interfaces:* `health()` (Section 6).
- *Dependencies:* Every pipeline stage's internal metrics.
- *Internal Communication:* Polls/collects from other components on a schedule.
- *Lifecycle:* Long-lived, runs continuously.

**Learning Metrics Manager**
- *Purpose:* Aggregate and expose the metrics listed in Section 14.
- *Responsibilities:* Counters/gauges/histograms for candidates, promotions, rejections, confidence distribution, recommendation counts, latencies.
- *Interfaces:* Exposed to the platform's monitoring subsystem per standard convention.
- *Dependencies:* Every pipeline stage.
- *Internal Communication:* Passive collection.
- *Lifecycle:* Long-lived.

**Learning Scheduler**
- *Purpose:* Drive periodic, non-event-triggered pipeline activity — e.g., periodic re-evaluation of existing recommendations as new evidence accumulates, and scheduled archival/cleanup (Section 7).
- *Responsibilities:* Trigger the Learning Coordinator on a configured interval for incremental aggregation/re-evaluation passes.
- *Interfaces:* Internal.
- *Dependencies:* Learning Coordinator.
- *Internal Communication:* Time-triggered invocation.
- *Lifecycle:* Long-lived, runs on a configured schedule (`aggregation.*` namespace, Section 11).

**Learning Persistence Adapter**
- *Purpose:* Durable storage of all learning data (candidates, artifacts, history, evidence references).
- *Responsibilities:* Implement the `LearningStorePort`, backed by the platform's Database module.
- *Interfaces:* `LearningStorePort`.
- *Dependencies:* Database module (via port).
- *Internal Communication:* Consulted by Learning History Manager, Learning Cache (on miss).
- *Lifecycle:* Long-lived, persists across restarts.

---

## 6. Public Interfaces

### 6.1 `recordOutcome(outcome: OutcomeDescriptor): Promise<void>`
- **Purpose:** Explicit, direct submission of an outcome for aggregation (as an alternative/supplement to pure event-driven observation — e.g., for backfill or manual submission).
- **Inputs:** `OutcomeDescriptor { sourceType, correlationId, payload }`.
- **Outputs:** Resolves once accepted into the Event Aggregator's processing queue.
- **Validation:** `sourceType` must be a recognized outcome category (Section 9's event taxonomy mirrors this).
- **Error Conditions:** `InvalidOutcomeError`.
- **Side Effects:** Queues the outcome for asynchronous aggregation; never blocks or returns pipeline results synchronously.

### 6.2 `submitEvidence(evidence: EvidenceInput): Promise<EvidenceRecord>`
- **Purpose:** Explicit submission of pre-structured evidence, bypassing the Evidence Collector's own normalization (e.g., for administrative or test-fixture submission).
- **Inputs:** `EvidenceInput` conforming to the `Evidence` schema (Section 6.13 below / Section 8).
- **Outputs:** The persisted `EvidenceRecord` with assigned `evidenceId`.
- **Validation:** Structural schema validation.
- **Error Conditions:** `InvalidEvidenceError`.
- **Side Effects:** Persists evidence; may trigger Learning Candidate Manager evaluation if an evidence-accumulation threshold is met.

### 6.3 `evaluateLearning(candidateId: string): Promise<EvaluationResult>`
- **Purpose:** Force immediate confidence scoring and policy evaluation of a specific candidate (rather than waiting for the Scheduler).
- **Inputs:** `candidateId`.
- **Outputs:** `EvaluationResult { approved, confidence, violations[] }`.
- **Validation:** Candidate must exist and be in an evaluable state (Section 8).
- **Error Conditions:** `CandidateNotFoundError`, `InvalidCandidateStateError`.
- **Side Effects:** Advances the candidate's lifecycle state; may trigger promotion or rejection.

### 6.4 `calculateConfidence(candidateId: string): Promise<ConfidenceScore>`
- **Purpose:** Run only the Confidence Engine against a candidate, without policy evaluation/promotion — useful for preview/diagnostic purposes.
- **Inputs:** `candidateId`.
- **Outputs:** `ConfidenceScore { value, factors[] }`.
- **Validation:** Candidate must exist.
- **Error Conditions:** `CandidateNotFoundError`.
- **Side Effects:** None (read-only; does not persist a new confidence score unless the candidate's stored score is stale, in which case it is refreshed).

### 6.5 `promoteLearning(candidateId: string, options?: PromotionOptions): Promise<LearningArtifact>`
- **Purpose:** Explicitly promote an approved candidate (administrative override path, distinct from automatic promotion via the pipeline).
- **Inputs:** `candidateId`, optional `{ actor, justification }`.
- **Outputs:** The finalized, published `LearningArtifact`.
- **Validation:** Candidate must have passed evaluation (`APPROVED` state) unless `options.override` is explicitly set and the actor is authorized (Section 15).
- **Error Conditions:** `CandidateNotFoundError`, `InvalidCandidateStateError`, `UnauthorizedOverrideError`.
- **Side Effects:** Publishes the artifact; emits `LearningPromoted`; updates the Learning Registry/History.

### 6.6 `rejectLearning(candidateId: string, reason: string): Promise<void>`
- **Purpose:** Explicitly reject a candidate.
- **Inputs:** `candidateId`, `reason`.
- **Outputs:** Resolves on completion.
- **Validation:** Candidate must exist and not already be `PROMOTED`.
- **Error Conditions:** `CandidateNotFoundError`, `InvalidCandidateStateError`.
- **Side Effects:** Candidate transitions to `REJECTED`; recorded in Learning History; emits `LearningRejected`.

### 6.7 `getLearning(learningId: string): Promise<LearningArtifact | null>`
- **Purpose:** Retrieve a specific published learning artifact.
- **Inputs:** `learningId`.
- **Outputs:** The artifact, or `null` if not found.
- **Validation:** None.
- **Error Conditions:** None (never throws for a missing artifact).
- **Side Effects:** None (read-only).

### 6.8 `getRecommendations(filter?: RecommendationFilter): Promise<Recommendation[]>`
- **Purpose:** Retrieve current recommendations, optionally filtered by target module category, scope, or minimum confidence.
- **Inputs:** Optional `RecommendationFilter { targetModule?, scope?, minConfidence? }`.
- **Outputs:** Array of matching `Recommendation` records.
- **Validation:** None; empty array on no matches.
- **Error Conditions:** None.
- **Side Effects:** None (read-only).

### 6.9 `getHistory(learningId?: string, filter?: HistoryFilter): Promise<LearningHistoryEntry[]>`
- **Purpose:** Retrieve the full version/lifecycle history of one artifact, or a filtered history across all artifacts.
- **Inputs:** Optional `learningId`, optional `HistoryFilter { status?, dateRange?, scope? }`.
- **Outputs:** Array of `LearningHistoryEntry`.
- **Validation:** None.
- **Error Conditions:** None.
- **Side Effects:** None (read-only).

### 6.10 `searchLearning(query: LearningSearchQuery): Promise<LearningArtifact[]>`
- **Purpose:** Structured, multi-field search across published learning artifacts (by tag, scope, category, confidence range, date range).
- **Inputs:** `LearningSearchQuery`.
- **Outputs:** Ranked/filtered array of matching artifacts.
- **Validation:** `InvalidSearchQueryError` for malformed query structure.
- **Error Conditions:** `InvalidSearchQueryError`.
- **Side Effects:** None (read-only).

### 6.11 `publishLearning(artifactId: string): Promise<LearningArtifact>`
- **Purpose:** Finalize publication of an already-promoted artifact if a distinct publish step is configured (some deployments may separate "promoted" from "externally visible/published" as distinct governance gates).
- **Inputs:** `artifactId`.
- **Outputs:** The published artifact.
- **Validation:** Artifact must be in `PROMOTED` state.
- **Error Conditions:** `ArtifactNotFoundError`, `InvalidArtifactStateError`.
- **Side Effects:** Transitions artifact to `PUBLISHED`; emits a publication event.

### 6.12 `health(): Promise<LearningHealthStatus>`
- **Purpose:** Report the health of the learning pipeline.
- **Inputs:** None.
- **Outputs:** `LearningHealthStatus { status, aggregationLagMs, evidenceBacklog, promotionThroughput }`.
- **Validation:** None.
- **Error Conditions:** None.
- **Side Effects:** None (read-only).

---

## 7. Internal Workflow

### 7.1 Workflow Stages

```
EVENT OBSERVATION ──► EVIDENCE AGGREGATION ──► LEARNING CANDIDATE CREATION ──► CONFIDENCE SCORING
   ──► POLICY EVALUATION ──► PROMOTION DECISION ──► RECOMMENDATION GENERATION ──► PUBLICATION
   ──► ARCHIVAL ──► CLEANUP
```

### 7.2 Stage Definitions

1. **Event Observation** — Event Aggregator subscribes to the Event Bus and receives relevant platform events asynchronously.
2. **Evidence Aggregation** — Evidence Collector normalizes correlated events into structured `Evidence`, attaching provenance.
3. **Learning Candidate Creation** — Learning Candidate Manager determines whether accumulated evidence meets the threshold to form a `LearningCandidate`.
4. **Confidence Scoring** — Confidence Engine computes a `ConfidenceScore` with an explainable factor breakdown.
5. **Policy Evaluation** — Learning Evaluator checks the scored candidate against applicable Learning Policy.
6. **Promotion Decision** — Approved candidates proceed to Promotion Manager; rejected candidates are recorded as `REJECTED` in history.
7. **Recommendation Generation** — Recommendation Engine derives `Recommendation` records from newly-promoted (or re-evaluated existing) artifacts.
8. **Publication** — The artifact/recommendation becomes visible via the public read interfaces (Section 6).
9. **Archival** — Superseded or expired artifacts transition to `ARCHIVED` (Section 8), remaining queryable for audit but excluded from active recommendation generation.
10. **Cleanup** — Retention policy (`retention.*` namespace, Section 11) periodically purges evidence/history beyond the configured retention window, never removing the audit trail of currently-active artifacts.

### 7.3 Sequence Diagram — End-to-End Learning Pipeline

```
Event Bus       Event Aggregator   Evidence Collector   Candidate Mgr   Confidence Engine   Evaluator   Promotion Mgr   Recommendation Engine   History Mgr
   │ dispatch(ReviewCompleted) │                     │                │                   │            │              │                        │
   │──────────────────────────►│                     │                │                   │            │              │                        │
   │                            │  correlate+window     │                │                   │            │              │                        │
   │                            │──────────────────────►│                │                   │            │              │                        │
   │                            │                       │  normalize      │                   │            │              │                        │
   │                            │                       │───────────────►│                   │            │              │                        │
   │                            │                       │                │  threshold met?     │            │              │                        │
   │                            │                       │                │────────────────────►│            │              │                        │
   │                            │                       │                │                    │  score      │              │                        │
   │                            │                       │                │                    │─────────────►│              │                        │
   │                            │                       │                │                    │              │  evaluate     │                        │
   │                            │                       │                │                    │              │──────────────►│                        │
   │                            │                       │                │                    │              │              │  approved              │
   │                            │                       │                │                    │              │              │───────────────────────►│
   │                            │                       │                │                    │              │              │                        │ persist + version
   │                            │                       │                │                    │              │              │◄───────────────────────│
   │                            │                       │                │                    │              │              │  generate recs           │
   │                            │                       │                │                    │              │              │─────────────────────────►(self)
```

---

## 8. State Management

### 8.1 Candidate Lifecycle

```
COLLECTING_EVIDENCE ──► CANDIDATE_FORMED ──► CONFIDENCE_SCORED ──► POLICY_EVALUATED
        │                                                              │
        │                                                    ┌─────────┴─────────┐
        │                                                    ▼                    ▼
        │                                               APPROVED              REJECTED (terminal)
        │                                                    │
        │                                                    ▼
        │                                                PROMOTED
        └──insufficient evidence, timeout──► EXPIRED (terminal)
```

### 8.2 Promotion Lifecycle

```
APPROVED ──► PROMOTED ──► PUBLISHED ──► (superseded by new version) ──► SUPERSEDED ──► ARCHIVED
```

### 8.3 Recommendation Lifecycle

```
GENERATED ──► ACTIVE ──► (re-evaluated as evidence changes) ──► STRENGTHENED | WEAKENED ──► ACTIVE
    │
    └──(underlying artifact archived/superseded)──► RETIRED (terminal)
```

### 8.4 Confidence Lifecycle

```
UNSCORED ──► SCORED ──► (new evidence arrives) ──► RESCORING ──► SCORED (new value, versioned)
```

### 8.5 Recovery, Synchronization, Persistence

- **Recovery:** Any pipeline-stage failure leaves the candidate in its last successfully-completed state (Section 12), never advancing it based on partial work; a retry re-enters the pipeline from that state.
- **Synchronization:** Learning Registry (in-memory) is synchronized from the Learning History Manager (durable) on startup and incrementally on every write; the durable store is always the authority.
- **Persistence:** Every state transition is persisted immediately via the Learning Persistence Adapter before the corresponding event is published (write-then-publish ordering guarantees consumers never observe an event for a state that failed to persist).

### 8.6 State Diagram — Combined Candidate/Artifact Lifecycle

```
   ┌──────────────────────┐
   │ COLLECTING_EVIDENCE    │
   └──────────┬───────────┘
              │threshold met
   ┌──────────▼───────────┐   timeout/insufficient   ┌───────────┐
   │  CANDIDATE_FORMED       │─────────────────────────►│ EXPIRED    │ (terminal)
   └──────────┬───────────┘                           └───────────┘
              │score
   ┌──────────▼───────────┐
   │ CONFIDENCE_SCORED       │
   └──────────┬───────────┘
              │evaluate
   ┌──────────▼───────────┐    reject      ┌───────────┐
   │ POLICY_EVALUATED        │───────────────►│ REJECTED   │ (terminal)
   └──────────┬───────────┘                └───────────┘
              │approve
   ┌──────────▼───────────┐
   │      APPROVED           │
   └──────────┬───────────┘
              │promote
   ┌──────────▼───────────┐
   │      PROMOTED           │
   └──────────┬───────────┘
              │publish
   ┌──────────▼───────────┐
   │      PUBLISHED          │◄────────rescoring/new evidence─────┐
   └──────────┬───────────┘                                      │
              │new version supersedes                            │
   ┌──────────▼───────────┐                                      │
   │      SUPERSEDED         │──────────────────────────────────────┘
   └──────────┬───────────┘
              │retention window elapsed
   ┌──────────▼───────────┐
   │      ARCHIVED           │ (terminal)
   └───────────────────────┘
```

---

## 9. Events

All events publish via the Event Bus under a `Learning Events` category. The Learning Layer both **subscribes to** platform events (as its evidence source) and **publishes** its own events (below).

### 9.1 Subscribed (Input) Events

`RequestCompleted`, `ReviewCompleted`, `ValidationCompleted`, `RegressionDetected`, `BrowserValidationCompleted`, `UserFeedbackReceived`, `ProviderPerformanceRecorded`, `RoutingDecisionMade`, `PlanningCompleted`, `ConfigurationReloaded` — all consumed read-only, exactly as published by their owning modules (Review Engine, Validation Engine, Knowledge Comparison Engine, Browser Automation, Provider Manager, Router, Planner, Configuration Manager respectively).

### 9.2 Published (Output) Events

**LearningCandidateCreated**
- Publisher: Learning Candidate Manager
- Consumers: Dashboard Backend, Logger
- Payload: `{ candidateId, evidenceIds[], scope }`
- Trigger: Sufficient evidence accumulates to form a candidate.
- Failure Behavior: None (notification-only).

**EvidenceCollected**
- Publisher: Evidence Collector
- Consumers: Logger, Dashboard Backend
- Payload: `{ evidenceId, sourceType, correlationId }`
- Trigger: A new `Evidence` record is created.
- Failure Behavior: None.

**ConfidenceCalculated**
- Publisher: Confidence Engine
- Consumers: Dashboard Backend, Logger
- Payload: `{ candidateId, confidence, factors[] }`
- Trigger: Confidence scoring completes.
- Failure Behavior: None.

**LearningApproved**
- Publisher: Learning Evaluator
- Consumers: Dashboard Backend, Logger
- Payload: `{ candidateId, confidence, appliedPolicies[] }`
- Trigger: A candidate passes policy evaluation.
- Failure Behavior: None.

**LearningRejected**
- Publisher: Learning Evaluator
- Consumers: Dashboard Backend, Logger
- Payload: `{ candidateId, reason, violatedPolicies[] }`
- Trigger: A candidate fails policy evaluation or is explicitly rejected.
- Failure Behavior: None.

**LearningPromoted**
- Publisher: Promotion Manager
- Consumers: Dashboard Backend, Logger, (optionally) Knowledge Base/Model Registry/Router/Configuration Manager if they choose to subscribe for awareness — never as a trigger to auto-apply
- Payload: `{ learningId, version, scope, confidence }`
- Trigger: A candidate is promoted into a published artifact.
- Failure Behavior: Standard retry (3 attempts) — downstream modules that voluntarily track learning promotions should reliably observe them.

**LearningArchived**
- Publisher: Learning History Manager
- Consumers: Dashboard Backend, Logger
- Payload: `{ learningId, reason }`
- Trigger: An artifact is archived (superseded or retention-expired).
- Failure Behavior: None.

**RecommendationGenerated**
- Publisher: Recommendation Engine
- Consumers: Dashboard Backend, Logger, (optionally) the target module category for awareness
- Payload: `{ recommendationId, targetModule, learningId, confidence }`
- Trigger: A new or re-evaluated recommendation is produced.
- Failure Behavior: Standard.

**LearningPolicyUpdated**
- Publisher: Learning Policy Manager
- Consumers: Dashboard Backend, Logger
- Payload: `{ policyId, changeSummary }`
- Trigger: A policy definition changes (in response to `ConfigurationReloaded`).
- Failure Behavior: None.

**LearningHealthChanged**
- Publisher: Learning Health Monitor
- Consumers: Dashboard Backend, Logger
- Payload: `{ previousStatus, newStatus, details }`
- Trigger: The pipeline's health status transitions.
- Failure Behavior: High priority, standard retries.

**LearningMetricsUpdated**
- Publisher: Learning Metrics Manager
- Consumers: Dashboard Backend
- Payload: `{ metricsSnapshot }`
- Trigger: Periodic metrics emission.
- Failure Behavior: None.

---

## 10. Dependencies

The Learning Layer depends on:

| Dependency | Nature |
|---|---|
| Event Bus | Sole transport for both observation (subscribing) and output (publishing); never any other transport. |
| Configuration Manager | Supplies learning policy definitions and all `learning.*`/`promotion.*`/etc. configuration (Section 11). |
| Logger | Receives structured logs (Section 13) via standard Event Bus logging convention. |
| Memory Manager | Read-only, via its public interface only — never direct storage access — used as supplementary evidence context. |
| Knowledge Base | Read-only, via its public interface only — used as supplementary evidence context and as the target category for knowledge-related recommendations. |
| Review Engine | Source of `ReviewCompleted`-style events, consumed read-only. |
| Validation Engine | Source of `ValidationCompleted`-style events, consumed read-only. |
| Model Registry | Read-only, via its public interface only — used as supplementary evidence context for provider/model-related learning. |
| Repository interfaces | The `LearningStorePort` and related persistence ports, backed by the Database module. |

The Learning Layer **never** depends directly on any provider implementation, any provider SDK, or any general business logic — all such context arrives only as already-published platform events or through the explicitly-listed public interfaces above.

---

## 11. Configuration

### 11.1 `learning.*`

| Option | Default | Validation | Constraints | Notes |
|---|---|---|---|---|
| `learning.enabled` | `true` | boolean | — | Master enable/disable for the entire pipeline. |
| `learning.evidenceThreshold` | `3` | integer ≥ 1 | Must be positive | Minimum evidence count before a candidate is formed. |
| `learning.maxCandidateAgeMs` | `604800000` (7 days) | integer > 0 | — | Time after which an unformed/unscored candidate expires (Section 8.1). |

### 11.2 `promotion.*`

| Option | Default | Validation | Constraints | Notes |
|---|---|---|---|---|
| `promotion.minConfidence` | `0.75` | number 0.0–1.0 | Must be within range | Minimum confidence for automatic promotion eligibility. |
| `promotion.requireManualReviewBelow` | `0.85` | number 0.0–1.0 | Must be ≥ `minConfidence` | Candidates scoring between `minConfidence` and this value are held for manual review rather than auto-promoted. |
| `promotion.allowOverride` | `false` | boolean | — | Whether `promoteLearning()`'s administrative override path is permitted at all. |

### 11.3 `confidence.*`

| Option | Default | Validation | Constraints | Notes |
|---|---|---|---|---|
| `confidence.weights.evidenceVolume` | `0.3` | number 0.0–1.0 | All weights must sum to 1.0 | Weighting factor for the Confidence Engine's methodology. |
| `confidence.weights.evidenceConsistency` | `0.4` | number 0.0–1.0 | See above | — |
| `confidence.weights.sourceReliability` | `0.2` | number 0.0–1.0 | See above | — |
| `confidence.weights.recency` | `0.1` | number 0.0–1.0 | See above | — |

### 11.4 `recommendations.*`

| Option | Default | Validation | Constraints | Notes |
|---|---|---|---|---|
| `recommendations.minConfidenceToSurface` | `0.6` | number 0.0–1.0 | — | Recommendations below this confidence are retained internally but not surfaced via `getRecommendations()` by default. |
| `recommendations.reevaluationIntervalMs` | `3600000` (1 hour) | integer > 0 | — | Learning Scheduler interval for re-evaluating existing recommendations. |

### 11.5 `history.*`

| Option | Default | Validation | Constraints | Notes |
|---|---|---|---|---|
| `history.retainAllVersions` | `true` | boolean | — | Whether every historical version is retained indefinitely (subject to `retention.*`). |

### 11.6 `policies.*`

| Option | Default | Validation | Constraints | Notes |
|---|---|---|---|---|
| `policies.scopeDefault` | `"project"` | enum(`project`,`organization`,`global`) | — | Default scope for newly-defined policies absent an explicit scope. |

### 11.7 `retention.*`

| Option | Default | Validation | Constraints | Notes |
|---|---|---|---|---|
| `retention.evidenceRetentionDays` | `90` | integer > 0 | — | How long raw evidence is retained before cleanup (Section 7.2 stage 10); does not affect promoted artifact history. |
| `retention.rejectedCandidateRetentionDays` | `30` | integer > 0 | — | Retention for `REJECTED` candidates. |

### 11.8 `aggregation.*`

| Option | Default | Validation | Constraints | Notes |
|---|---|---|---|---|
| `aggregation.windowMs` | `60000` | integer > 0 | — | Event Aggregator's correlation window for grouping related events. |
| `aggregation.incrementalMode` | `true` | boolean | — | Whether aggregation runs incrementally (Section 16) vs. periodic full batch. |

### 11.9 `metrics.*`

| Option | Default | Validation | Constraints | Notes |
|---|---|---|---|---|
| `metrics.emissionIntervalMs` | `30000` | integer > 0 | — | Learning Metrics Manager emission interval. |

---

## 12. Error Handling

| Failure Mode | Handling Strategy |
|---|---|
| Evidence Failure | Malformed or unnormalizable evidence is rejected by the Evidence Collector (`InvalidEvidenceError`); logged and excluded from candidate formation, never silently dropped. |
| Promotion Failure | If the Promotion Manager fails to persist a finalized artifact, the candidate remains in `APPROVED` state and the operation is retried; it never transitions to `PROMOTED` without confirmed persistence (Section 8.5 write-then-publish ordering). |
| Confidence Failure | An internal error in the Confidence Engine leaves the candidate at `CANDIDATE_FORMED`; retried on the next scheduled evaluation pass rather than defaulting to a fabricated score. |
| Policy Failure | If the Learning Policy Manager cannot resolve applicable policy (e.g., Configuration Manager unreachable), the Learning Evaluator holds the candidate rather than approving/rejecting under uncertainty — a fail-safe default of "hold" rather than "approve." |
| Repository Failure | Persistence failures are retried with backoff; the in-memory Learning Registry never diverges from the durable store's eventual state (Section 8.5). |
| Duplicate Learning | The Learning Candidate Manager checks for an existing candidate/artifact covering materially the same evidence signature before forming a new one, merging additional evidence into the existing candidate rather than creating a duplicate. |
| Invalid Evidence | See Evidence Failure above. |
| Recovery Strategy | Every failure leaves the pipeline in its last successfully-persisted state (never a partial, ambiguous state) and is diagnosable via structured logs/events (Section 13, 9). |
| Retry Strategy | Transient failures (persistence, policy resolution) are retried with exponential backoff, consistent with the platform's Event Bus retry conventions. |
| Rollback Strategy | Because every state transition is persisted before its corresponding event publishes, "rollback" is never needed mid-transition — a failed transition simply never occurred; the candidate/artifact remains at its prior, valid state. |

---

## 13. Logging

- **Learning Events:** Every pipeline stage transition, with `candidateId`/`learningId`/`correlationId`.
- **Promotion Events:** Every promotion, with confidence and applied policies.
- **Rejected Learning:** Every rejection, with reason and violated policies.
- **Confidence Calculations:** Every scoring run, with the full factor breakdown for explainability.
- **Policy Decisions:** Every policy evaluation outcome.
- **Performance:** Pipeline stage latencies.
- **Audit:** Every public-interface mutating call (`recordOutcome`, `submitEvidence`, `evaluateLearning`, `promoteLearning`, `rejectLearning`, `publishLearning`) with actor/source.

All logs are emitted as `LoggingEvents`-category events via the Event Bus, carrying `correlationId`/`traceId`/`spanId` tying every stage of one learning pipeline run together.

---

## 14. Monitoring

| Metric | Description |
|---|---|
| Learning Candidates | Count of candidates currently in each lifecycle state (Section 8.1). |
| Promoted Learnings | Count of `PROMOTED`/`PUBLISHED` artifacts, overall and per scope. |
| Rejected Learnings | Count and rate of rejections, broken down by violated policy. |
| Confidence Distribution | Histogram of confidence scores across all scored candidates. |
| Recommendation Count | Count of `ACTIVE` recommendations, per target module category. |
| Learning Latency | End-to-end pipeline duration (Section 7), p50/p95/p99. |
| Aggregation Latency | Event Aggregator's correlation/windowing latency. |
| Promotion Rate | Ratio of promoted to total evaluated candidates. |
| Evidence Quality | A heuristic score reflecting evidence consistency/completeness across recent candidates, surfaced for administrative attention. |
| Policy Violations | Rate and breakdown of policy violations causing rejection or hold-for-review. |

Health monitoring and alerts are driven by the Learning Health Monitor (Section 5.2), which evaluates aggregation lag, evidence backlog size, and promotion throughput against configured thresholds, emitting `LearningHealthChanged` and platform-standard alerts when thresholds are breached.

---

## 15. Security

- **Learning Ownership:** All learning artifacts and recommendations are strictly owned by this module; no other module may write to Learning Layer storage, and this module never writes to any other module's storage.
- **Access Control:** Mutating interfaces (`promoteLearning` with override, `rejectLearning`) are restricted to authorized callers per the platform's standard authorization mechanism; `promotion.allowOverride` (Section 11.2) gates whether the override path exists at all.
- **Audit Logging:** Every mutating operation is logged with actor and timestamp (Section 13).
- **Evidence Integrity:** Evidence is immutable once collected; any correction requires new evidence, never in-place mutation, preserving the auditability of what informed a given learning outcome.
- **Provenance Validation:** The Provenance Manager (Section 5.2) guarantees every artifact's provenance chain is complete and resolvable back to real source events — an artifact with unresolvable provenance is rejected rather than published.
- **Tamper Detection:** Because learning artifacts are immutable and append-only-versioned (Section 8.2), any unexpected mutation of historical records is detectable via history-integrity checks, consistent with the Immutable Metadata History pattern established in the Model Registry MDD.
- **Sensitive Data Handling:** Evidence and artifacts are checked against the platform's sensitive-data redaction conventions before persistence/logging; the Learning Layer never stores raw sensitive payloads beyond what is strictly necessary for evidence provenance, and defers to the owning module's own data-classification policy for anything it reads.
- **Tenant Isolation:** Every candidate/artifact/recommendation carries a scope (`project`, `organization`, `global`); queries and policy evaluation are strictly scoped, preventing cross-tenant learning leakage unless a learning artifact is explicitly scoped `global` by policy.

---

## 16. Performance

- **Asynchronous Processing:** The entire pipeline (Section 7) runs asynchronously, fully decoupled from any request-serving path — this is an architectural invariant (Section 2.4), not merely a performance choice.
- **Batch Evaluation:** The Learning Scheduler (Section 5.2) may batch multiple pending candidates into a single evaluation pass rather than evaluating strictly one-at-a-time, where doing so does not compromise per-candidate correctness.
- **Incremental Aggregation:** Evidence accumulates incrementally per candidate (`aggregation.incrementalMode`, Section 11.8) rather than requiring full re-aggregation of all historical events on every pass.
- **Caching:** The Learning Cache (Section 5.2) serves high-frequency recommendation/history reads without hitting persistence on every call.
- **Parallel Evaluation:** Independent candidates (no shared evidence) are confidence-scored and policy-evaluated concurrently, bounded by a worker pool.
- **Memory Usage:** Evidence and candidate working sets are bounded by `retention.*`/`learning.maxCandidateAgeMs` configuration, preventing unbounded in-memory growth.
- **Scalability:** Every pipeline component is stateless per invocation (aside from the durable registry/history, which is externalized to the Persistence Adapter), enabling horizontal scaling of Learning Layer instances consistent with the pattern established in the Planner MDD's Enterprise Scalability section.

---

## 17. Data Flow

```
Platform Events (Event Bus)
        │
        ▼
Event Aggregator (correlate + window)
        │
        ▼
Evidence Collector (normalize + provenance)
        │
        ▼
Learning Candidate Manager (threshold check → LearningCandidate)
        │
        ▼
Confidence Engine (score + explain)
        │
        ▼
Learning Evaluator (Policy Evaluation)
        │
   ┌────┴────┐
   ▼         ▼
Rejected   Approved
   │         │
   ▼         ▼
History   Promotion Manager (finalize + version)
Manager       │
              ▼
     Recommendation Engine
              │
              ▼
   ┌──────────┴───────────────────────────────┐
   ▼                    ▼                     ▼
Knowledge Base    Model Registry / Router   Configuration Manager
(recommendation    (recommendation surfaced   (recommendation surfaced
 surfaced via       via getRecommendations()   via getRecommendations()
 getRecommendations(),                          — those modules choose
 that module chooses                             whether/how to apply it
 whether/how to apply it via ITS OWN interface)   via ITS OWN interface)
```

Every arrow into Knowledge Base / Model Registry / Router / Configuration Manager at the bottom is **advisory only**, delivered exclusively through this module's own read interfaces (`getRecommendations()`); the Learning Layer never calls a write method on any of those modules.

---

## 18. Interaction With Other Modules

All interactions occur either (a) passively, via Event Bus subscription, or (b) actively, via read-only calls to another module's public interface. The Learning Layer never bypasses ownership.

### 18.1 Event Bus

```
Review Engine / Validation Engine / etc.     Event Bus         Learning Layer (Event Aggregator)
              │ publish(ReviewCompleted)             │                       │
              │──────────────────────────────────────►│                       │
              │                                        │ dispatch                │
              │                                        │────────────────────────►│
```

### 18.2 Memory Manager (Read-Only Context)

```
Evidence Collector        Memory Manager
        │  getRelevantMemory(sessionId)  │
        │────────────────────────────────►│
        │◄────────────────────────────────│ (memory refs, read-only)
```

### 18.3 Knowledge Base (Read-Only Context + Recommendation Target)

```
Evidence Collector        Knowledge Base
        │  queryKnowledge(topic)  │
        │─────────────────────────►│
        │◄─────────────────────────│ (knowledge refs, read-only)

Knowledge Base           Learning Layer
        │  getRecommendations({targetModule:"KnowledgeBase"})  │
        │───────────────────────────────────────────────────────►│
        │◄───────────────────────────────────────────────────────│ (recommendations; Knowledge Base
        │                                                          decides whether/how to apply, via
        │                                                          its own write interface)
```

### 18.4 Model Registry (Read-Only Context)

```
Evidence Collector        Model Registry
        │  getModel(modelId)  │
        │──────────────────────►│
        │◄──────────────────────│ (model metadata, read-only)
```

### 18.5 Router (Recommendation Target)

```
Router                    Learning Layer
   │  getRecommendations({targetModule:"Router"})  │
   │─────────────────────────────────────────────────►│
   │◄─────────────────────────────────────────────────│ (routing recommendations; Router decides
   │                                                     whether/how to apply, via its own logic)
```

### 18.6 Configuration Manager (Policy Source + Recommendation Target)

```
Configuration Manager      Event Bus          Learning Policy Manager
       │ publish(ConfigurationReloaded) │                  │
       │────────────────────────────────►│                  │
       │                                  │ dispatch          │
       │                                  │─────────────────►│
       │                                  │                  │ re-fetches policy definitions

Configuration Manager      Learning Layer
       │  getRecommendations({targetModule:"ConfigurationManager"})  │
       │────────────────────────────────────────────────────────────►│
       │◄────────────────────────────────────────────────────────────│ (configuration recommendations)
```

### 18.7 Logger

Structured logs (Section 13) are emitted as `LoggingEvents`-category events consumed by the Logger module, per platform convention.

### 18.8 Orchestrator Core

Orchestrator Core does not directly interact with the Learning Layer in the request path (Section 2.4); it may, as an administrative/observability consumer, query `getHistory()`/`health()` for platform-wide status reporting, but never issues or receives synchronous calls tied to request execution.

---

## 19. Folder Structure

```
learning-layer/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── Evidence.ts                # Canonical evidence record (Section 6.2, 8)
│   │   │   ├── LearningCandidate.ts
│   │   │   ├── LearningArtifact.ts
│   │   │   ├── Recommendation.ts
│   │   │   └── LearningHistoryEntry.ts
│   │   ├── value-objects/
│   │   │   ├── ConfidenceScore.ts
│   │   │   ├── LearningScope.ts           # project/organization/global
│   │   │   ├── LearningStatus.ts          # Lifecycle state enum (Section 8)
│   │   │   └── Provenance.ts
│   │   ├── services/
│   │   │   ├── ConfidenceScoringStrategy.ts  # Pluggable methodology (Section 5.2, 22)
│   │   │   └── DuplicateDetector.ts          # Section 12
│   │   └── ports/
│   │       ├── LearningStorePort.ts
│   │       ├── EventSubscriberPort.ts
│   │       ├── EventPublisherPort.ts
│   │       ├── ConfigurationPort.ts
│   │       ├── MemoryManagerPort.ts       # read-only
│   │       ├── KnowledgeBasePort.ts       # read-only
│   │       └── ModelRegistryPort.ts       # read-only
│   │
│   ├── application/
│   │   ├── RecordOutcomeUseCase.ts
│   │   ├── SubmitEvidenceUseCase.ts
│   │   ├── EvaluateLearningUseCase.ts
│   │   ├── CalculateConfidenceUseCase.ts
│   │   ├── PromoteLearningUseCase.ts
│   │   ├── RejectLearningUseCase.ts
│   │   ├── GetLearningUseCase.ts
│   │   ├── GetRecommendationsUseCase.ts
│   │   ├── GetHistoryUseCase.ts
│   │   ├── SearchLearningUseCase.ts
│   │   ├── PublishLearningUseCase.ts
│   │   └── HealthUseCase.ts
│   │
│   ├── pipeline/
│   │   ├── LearningCoordinator.ts
│   │   ├── EventAggregator.ts
│   │   ├── EvidenceCollector.ts
│   │   ├── LearningCandidateManager.ts
│   │   ├── ConfidenceEngine.ts
│   │   ├── LearningEvaluator.ts
│   │   ├── PromotionManager.ts
│   │   └── RecommendationEngine.ts
│   │
│   ├── policy/
│   │   └── LearningPolicyManager.ts       # Section 11 policies.*
│   │
│   ├── history/
│   │   ├── LearningHistoryManager.ts
│   │   └── LearningRegistry.ts
│   │
│   ├── metadata/
│   │   ├── LearningMetadataManager.ts
│   │   └── ProvenanceManager.ts
│   │
│   ├── infrastructure/
│   │   ├── persistence/
│   │   │   └── LearningPersistenceAdapter.ts
│   │   ├── cache/
│   │   │   └── LearningCacheAdapter.ts
│   │   ├── events/
│   │   │   ├── EventBusSubscriberAdapter.ts
│   │   │   └── EventBusPublisherAdapter.ts
│   │   ├── memory/
│   │   │   └── MemoryManagerAdapter.ts
│   │   ├── knowledge/
│   │   │   └── KnowledgeBaseAdapter.ts
│   │   └── model-registry/
│   │       └── ModelRegistryAdapter.ts
│   │
│   ├── health/
│   │   └── LearningHealthMonitor.ts
│   │
│   ├── metrics/
│   │   └── LearningMetricsManager.ts
│   │
│   ├── scheduler/
│   │   └── LearningScheduler.ts
│   │
│   ├── errors/
│   │   ├── InvalidOutcomeError.ts
│   │   ├── InvalidEvidenceError.ts
│   │   ├── CandidateNotFoundError.ts
│   │   ├── InvalidCandidateStateError.ts
│   │   ├── UnauthorizedOverrideError.ts
│   │   ├── ArtifactNotFoundError.ts
│   │   ├── InvalidArtifactStateError.ts
│   │   └── InvalidSearchQueryError.ts
│   │
│   └── facade/
│       └── LearningLayerFacade.ts         # The single public entry point (Section 6)
│
├── schemas/
│   ├── evidence-schema.json
│   ├── learning-candidate-schema.json
│   └── learning-artifact-schema.json
│
├── config/
│   └── learning-layer.config.ts           # All namespaces from Section 11
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── learning-pipeline/
│   ├── confidence-engine/
│   ├── promotion/
│   ├── recommendation/
│   ├── performance/
│   ├── recovery/
│   └── concurrency/
│
└── docs/
    └── MDD.md                              # This document
```

---

## 20. File Responsibilities

| File | Purpose | Public API | Private Logic | Dependencies |
|---|---|---|---|---|
| `facade/LearningLayerFacade.ts` | The single entry point every other module imports. | All Section 6 methods. | Delegates to use cases; no business logic itself. | All `application/` use cases. |
| `pipeline/LearningCoordinator.ts` | Orchestrates the full pipeline. | None (internal). | Sequencing, error routing (Section 12). | All `pipeline/` components. |
| `pipeline/EventAggregator.ts` | Correlates raw events into outcome units. | None (internal). | Windowing/correlation algorithm. | `EventSubscriberPort`. |
| `pipeline/EvidenceCollector.ts` | Normalizes outcomes into `Evidence`. | None (internal). | Normalization rules per source type. | `MemoryManagerPort`, `KnowledgeBasePort`, `ModelRegistryPort` (read-only). |
| `pipeline/LearningCandidateManager.ts` | Forms candidates from evidence. | None (internal). | Threshold logic, duplicate detection. | `LearningStorePort`, `LearningCacheAdapter`. |
| `pipeline/ConfidenceEngine.ts` | Scores candidate confidence. | `calculateConfidence()` (via use case). | Weighted-factor scoring methodology (Section 11.3). | `ConfidenceScoringStrategy`. |
| `pipeline/LearningEvaluator.ts` | Applies policy to scored candidates. | None (internal). | Policy evaluation orchestration. | `LearningPolicyManager`. |
| `pipeline/PromotionManager.ts` | Finalizes promotion. | `promoteLearning()`, `rejectLearning()` (via use cases). | Versioning, finalization. | `LearningRegistry`, `LearningHistoryManager`. |
| `pipeline/RecommendationEngine.ts` | Derives recommendations from artifacts. | `getRecommendations()` (via use case). | Translation logic per target module category. | `LearningRegistry`. |
| `policy/LearningPolicyManager.ts` | Resolves/evaluates learning policy. | None (internal). | Policy applicability + evaluation. | `ConfigurationPort`. |
| `history/LearningHistoryManager.ts` | Durable, immutable history. | `getHistory()` (via use case). | Version linkage, immutability enforcement. | `LearningPersistenceAdapter`. |
| `history/LearningRegistry.ts` | In-memory active-artifact index. | `getLearning()`, `searchLearning()` (via use cases). | Indexing/query resolution. | `LearningHistoryManager`, `LearningCacheAdapter`. |
| `metadata/ProvenanceManager.ts` | Guarantees provenance completeness. | None (internal). | Provenance chain construction/validation. | Used across pipeline stages. |
| `infrastructure/persistence/LearningPersistenceAdapter.ts` | Implements durable storage. | Implements `LearningStorePort`. | Database-specific query logic. | Database module port. |
| `health/LearningHealthMonitor.ts` | Pipeline health tracking. | `health()` (via use case). | Threshold evaluation for aggregation lag/backlog. | Metrics from all pipeline stages. |
| `scheduler/LearningScheduler.ts` | Periodic pipeline triggers. | None (internal). | Interval-based invocation of `LearningCoordinator`. | `LearningCoordinator`. |

---

## 21. Testing Strategy

| Test Type | Focus |
|---|---|
| Unit Tests | Domain logic in isolation: confidence-scoring math, duplicate detection, provenance chain construction — against injected fakes for every port. |
| Integration Tests | Full facade-level flows: event observation → evidence → candidate → confidence → policy → promotion → recommendation, using real in-memory infrastructure adapters. |
| Contract Tests | Verifies every event this module subscribes to and publishes conforms to the platform's Event Bus envelope and this module's own schemas (Section 19 `schemas/`). |
| Learning Pipeline Tests | End-to-end pipeline correctness across a range of evidence shapes (single strong outcome, many weak outcomes accumulating, conflicting evidence). |
| Confidence Engine Tests | Verifies scoring methodology against known-weight fixtures, including boundary cases (all evidence maximally consistent vs. maximally conflicting). |
| Promotion Tests | Verifies promotion/rejection paths, including the administrative override path and its authorization gating (Section 15). |
| Recommendation Tests | Verifies recommendation generation and re-evaluation as underlying evidence/artifacts change over time. |
| Performance Tests | Pipeline throughput/latency under realistic event volume; cache hit/miss performance. |
| Recovery Tests | Simulated persistence/policy-resolution failures mid-pipeline, verifying the fail-safe "hold" behavior (Section 12) rather than incorrect promotion/rejection. |
| Concurrency Tests | Concurrent evidence submission for the same evolving candidate, verifying no lost updates and correct duplicate-detection behavior. |

---

## 22. Future Expansion

Every extension below is achievable **without modifying the public Facade contract (Section 6) or the core `Evidence`/`LearningArtifact`/`Recommendation` schemas' required fields**:

- **Federated Learning Across Deployments:** A future `LearningFederationPort` synchronizes promoted artifacts (never raw evidence, for tenant-isolation reasons) across deployments, layered on the existing Learning Registry/History design.
- **AI-Assisted Optimization:** Implemented as an alternative `ConfidenceScoringStrategy`/candidate-generation strategy behind the existing pluggable interfaces (Section 5.2, 20), selectable via configuration.
- **Reinforcement Learning Signals:** Additional evidence source types feeding the existing Evidence Collector pipeline, requiring only new event subscriptions, not new architecture.
- **Cross-Project / Team-Level / Organization-Wide Learning:** Already supported by the existing `LearningScope` value object (`project`/`organization`/`global`); broader scopes are a configuration/policy matter, not a schema change.
- **Multi-Tenant Learning:** Already architected for via scope-based tenant isolation (Section 15).
- **Learning Marketplace:** A governed, opt-in extension of federated learning (above), exposing promoted, sufficiently-general artifacts for cross-organization sharing subject to explicit governance policy.
- **Adaptive Policy Optimization:** The Learning Layer could itself become a subject of learning (e.g., recommending adjustments to `promotion.minConfidence`) — implemented as just another recommendation category (`targetModule: "LearningLayer"`), consumed by an administrator or a future governance process, never self-applied.
- **Continuous Quality Improvement:** An emergent property of the existing recommendation feedback loop across Router, Provider Manager, Configuration Manager, and Knowledge Base, requiring no new mechanism beyond what Sections 6, 9, and 17 already define.

---

## 23. Risks

| Risk Category | Risk | Mitigation |
|---|---|---|
| False Learning Promotion | Insufficient or unrepresentative evidence leads to a confidently-wrong learning artifact | Configurable `promotion.minConfidence`/`requireManualReviewBelow` thresholds (Section 11.2); full provenance (Section 15) enables post-hoc audit and correction via versioning. |
| Low-Quality Evidence | Noisy or inconsistent evidence degrades confidence scoring reliability | The Confidence Engine's `evidenceConsistency` weighting (Section 11.3) directly penalizes inconsistent evidence; Evidence Quality metric (Section 14) surfaces this for administrative attention. |
| Bias Amplification | Learning derived predominantly from one tenant/context could be inappropriately generalized | Strict scope tagging (`project`/`organization`/`global`) and policy-gated promotion to broader scopes (Section 11.6, 15) prevent unintended generalization. |
| Feedback Loops | A recommendation applied by a downstream module could generate new evidence that reinforces the same recommendation regardless of actual quality | Provenance tracking (Section 5.2) distinguishes evidence causally influenced by a prior recommendation's adoption from independent evidence, allowing the Confidence Engine to discount self-reinforcing signal (a defined future refinement of the `evidenceConsistency` factor). |
| Stale Learning | An artifact remains active after the conditions that justified it have changed | Periodic re-evaluation (`recommendations.reevaluationIntervalMs`, Section 11.4) and the Archival lifecycle stage (Section 7.2) retire outdated artifacts. |
| Duplicate Learning | Multiple candidates form for materially the same underlying pattern | Duplicate Detector (Section 5.2, 12) merges evidence into existing candidates rather than creating duplicates. |
| Overfitting to Local Behavior | Learning tuned too tightly to one project's idiosyncrasies is promoted to a broader scope inappropriately | Scope-gated promotion policy (Section 11.6) requires explicit, higher-bar policy criteria for organization/global scope promotion. |
| Excessive Recommendation Noise | Too many low-value recommendations overwhelm consuming modules/administrators | `recommendations.minConfidenceToSurface` (Section 11.4) filters low-confidence recommendations from the default surfaced set. |

---

## 24. Design Decisions

| Decision | Rationale | Trade-off / Alternatives Considered |
|---|---|---|
| The Learning Layer never writes to any other module's storage — only recommends | Enforces the platform's ownership/governance model; every state change remains auditable and reversible through its owning module's own controls | Adoption of a recommendation is voluntary and asynchronous, meaning beneficial learning may take longer to take effect than an auto-apply design would allow; judged the correct trade-off given the risk of an automated learning system silently mutating critical platform state |
| Every learning artifact is immutable, with updates as new versions | Matches the Immutable History pattern already established in the Model Registry and Planner MDDs; guarantees full auditability of what the platform "believed" at any point in time | Increases storage volume for frequently-revised learning; mitigated by standard retention policy (Section 11.7) |
| Confidence scoring uses an explainable, weighted-factor methodology rather than an opaque model (by default) | Directly satisfies the "explainable learning" goal (Section 2.1, 3.1); every score can be justified to a human reviewer | A weighted-factor approach may be less predictive than a more sophisticated model; the pluggable `ConfidenceScoringStrategy` (Section 5.2, 22) allows a more advanced (potentially less directly explainable) strategy to be substituted later without redesigning the pipeline |
| Recommendations are pulled (`getRecommendations()`) rather than pushed to consuming modules | Keeps the Learning Layer fully decoupled and asynchronous — no consuming module is ever blocked waiting on or interrupted by a Learning Layer push | Consuming modules must proactively poll or subscribe for awareness (via the optional `LearningPromoted`/`RecommendationGenerated` events) rather than being guaranteed synchronous delivery; acceptable since recommendations are, by design, never time-critical to request execution |
| A "hold" (rather than "approve" or "reject") is the fail-safe default when policy resolution fails | Prevents a transient Configuration Manager outage from either over-promoting (safety risk) or over-rejecting (losing legitimate learning) candidates | Adds a third terminal-adjacent state to the evaluator's outcome space, slightly increasing pipeline complexity; judged worthwhile for correctness under failure |

---

## 25. Diagrams

### 25.1 Component Diagram
See Section 5.1.

### 25.2 Sequence Diagram
See Section 7.3 and Section 18.1–18.8.

### 25.3 State Diagram
See Section 8.6.

### 25.4 Data Flow Diagram
See Section 17.

### 25.5 Class Diagram

```
┌─────────────────────┐        ┌─────────────────────┐        ┌─────────────────────┐
│      Evidence          │───────►│   LearningCandidate    │───────►│   LearningArtifact     │
├─────────────────────┤ 1    * ├─────────────────────┤ 1    1 ├─────────────────────┤
│ evidenceId             │        │ candidateId             │        │ learningId              │
│ sourceType             │        │ evidenceIds[]           │        │ version                 │
│ correlationId          │        │ status                  │        │ status                  │
│ payload                │        │ confidence              │        │ confidence              │
│ provenance             │        │ provenance              │        │ provenance              │
└─────────────────────┘        └─────────────────────┘        └──────────┬──────────┘
                                                                          │ 1
                                                                          ▼ *
                                                                ┌─────────────────────┐
                                                                │    Recommendation       │
                                                                ├─────────────────────┤
                                                                │ recommendationId        │
                                                                │ learningId              │
                                                                │ targetModule            │
                                                                │ confidence              │
                                                                │ status                  │
                                                                └─────────────────────┘
```

### 25.6 Folder Structure Diagram
See Section 19.

---

## Enterprise Learning Standards

### Identifiers

Every artifact/record propagates the relevant subset of: `learningId`, `candidateId`, `evidenceId`, `recommendationId`, `policyId`, `confidenceId`, `promotionId`, `requestId`, `sessionId`, `projectId`, `taskId`, `providerId`, `modelId`, `reviewId`, `validationId`, `correlationId`, `traceId`, `spanId`. Every event published by this module (Section 9) and every entity (Section 25.5) carries `correlationId`/`traceId` at minimum, plus whichever domain-specific identifiers apply to its content.

### Required Fields on Every Learning Artifact

Every `LearningArtifact` includes: `provenance` (full evidence/event chain), `confidence` (score plus factor breakdown), `evidenceReferences` (explicit `evidenceId[]`), `createdAt`, `promotedAt`, `sourceEvents` (the originating `eventId[]`/`correlationId[]`), `applicableScope` (`project`/`organization`/`global`), `version`, and `lifecycleState` (Section 8).

---

## Architectural Constraints (Restated for Emphasis)

- The Learning Layer never participates in synchronous request execution.
- The Learning Layer never automatically modifies other modules' state.
- All changes are applied through the owning module's public interfaces and governance policies — the Learning Layer only ever produces recommendations and learning artifacts.
- Learning is evidence-based and confidence-scored before promotion; nothing is promoted on assertion alone.
- Learning artifacts are immutable once published; any update creates a new, linked version.
- The Learning Layer is an orchestrator of learning, not a storage engine or a decision engine.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| Evidence | Normalized, provenance-tagged data derived from a platform outcome event, the atomic input to candidate formation. |
| Learning Candidate | An unconfirmed, evidence-backed hypothesis awaiting confidence scoring and policy evaluation. |
| Learning Artifact | A promoted, immutable, versioned, published unit of learning. |
| Recommendation | Advisory output derived from a learning artifact, surfaced to — never applied by — a target module. |
| Scope | The applicability boundary (`project`/`organization`/`global`) of a learning artifact or recommendation. |

---

**End of Module Design Document — Learning Layer**
