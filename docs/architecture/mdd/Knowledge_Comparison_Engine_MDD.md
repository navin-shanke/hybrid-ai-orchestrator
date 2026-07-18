# Knowledge Comparison Engine — Module Design Document (MDD)

**Module:** Knowledge Comparison Engine
**Parent System:** Hybrid AI Development Platform — Orchestrator Subsystem
**Document Type:** Module Design Document (MDD)
**Status:** Draft for Implementation
**Audience:** Senior Engineers, AI Coding Agents (Cursor, OpenCode, Roo Code, Claude Code)
**Related Documents:** PRD, SAD, API Specification, Database Design Document, Orchestrator Core MDD, Event Bus MDD, Request Manager MDD, Provider Manager MDD, Provider Plugin System MDD, Model Registry MDD, Capability Selector MDD, Router MDD, Memory Manager MDD, Knowledge Base MDD

> This document defines the Knowledge Comparison Engine module only. It does not restate decisions owned by other documents (memory orchestration, knowledge storage, embedding generation, vector indexing, planning, provider communication). This module is a pure analysis engine: it receives knowledge, analyzes it, and returns structured analytical results — it never stores anything and never decides what the platform should do with those results.

---

## 1. Executive Summary

### 1.1 Purpose

When the Memory Manager retrieves knowledge from one or more Knowledge Bases to serve a Planner's request, that raw knowledge is frequently incomplete, redundant, contradictory, of varying quality, and sourced from multiple origins with differing reliability. Handing this raw, unprocessed knowledge directly to the Planner would force planning logic to also become knowledge-quality logic — a violation of separation of concerns that would make the Planner harder to reason about and the knowledge-quality logic impossible to reuse or evolve independently.

The Knowledge Comparison Engine exists to sit between raw retrieval and consumption: it takes knowledge references handed to it by the Memory Manager, and produces a structured, deduplicated, conflict-resolved, ranked, and scored output — a single, trustworthy view of "what is actually known and how much should it be trusted" — ready for the Planner to consume without further analytical work.

### 1.2 Responsibilities

The Knowledge Comparison Engine is responsible for: comparing knowledge items against each other (similarity analysis), detecting and resolving conflicts, deduplicating near-identical knowledge, merging compatible knowledge into canonical records, and computing quality/confidence/priority scores that drive final ranking. It is explicitly **not** responsible for retrieving knowledge, storing knowledge, generating embeddings, maintaining vector indexes, or deciding how the Planner should act on its output.

### 1.3 Role

The Knowledge Comparison Engine is a **pure analysis/transformation layer** — stateless with respect to knowledge content (Section 4), receiving knowledge references and structured content as input and producing structured comparison results as output, with no durable side effects on the knowledge itself.

### 1.4 Architecture Position

```
Memory Manager (retrieval orchestration)
        |  raw knowledge set (from Knowledge Base)
        v
+---------------------------------------------------------------+
|                 KNOWLEDGE COMPARISON ENGINE                    |
|   (compare, deduplicate, detect/resolve conflicts, merge,      |
|    rank, score -- this document; analysis only, no storage)    |
+-------------------------+---------------------------------------+
                          |  structured, ranked, conflict-resolved knowledge
                          v
                     Planner (consumes results)
```

Knowledge Base owns storage and retrieval mechanics; Memory Manager owns retrieval orchestration and decides when/what to retrieve; the Knowledge Comparison Engine owns none of that — it is invoked with knowledge already in hand and returns analysis, nothing more. In Hexagonal Architecture terms, this module's driving port is invoked by the Memory Manager, and its driven ports (Section 4.3) reach out only to read-only, policy/configuration-supplying dependencies — never to storage.

---

## 2. Goals

### 2.1 Primary Goals

1. Provide one comprehensive comparison surface (`compareKnowledge()`) that evaluates similarity, detects conflicts, deduplicates, merges, ranks, and scores a knowledge set in one coordinated pass.
2. Guarantee that adding a new comparison algorithm, similarity strategy, or conflict-resolution policy requires **zero changes** to core engine source code — only a new plugin/strategy registration (Open/Closed Principle).
3. Produce deterministic, explainable comparison results — every score and resolution decision must be traceable to the specific policy/rule/evidence that produced it (Section 7, Section 9).
4. Support hyperscale throughput: billions of historical comparisons, millions of comparison requests, thousands of concurrent comparison workers, without architectural rework (Section 19).
5. Remain strictly read-only/non-persistent with respect to knowledge content — all outputs are transient analytical results returned to the caller, never written back to any store by this module.

### 2.2 Secondary Goals

1. Support configurable, organization-specific comparison policies without code changes (Section 9.8, Section 23).
2. Provide a comparison result cache to avoid redundant recomputation for identical/near-identical comparison requests within a bounded time window.
3. Expose confidence and quality metrics granular enough to support downstream explainability requirements (e.g., "why was this knowledge ranked first").
4. Support partial/incremental comparison (re-comparing only a delta of a previously compared knowledge set) for efficiency at scale.

### 2.3 Future Goals

1. AI-assisted comparison (using an AI-model call to assist judgment on ambiguous semantic conflicts) — explicitly deferred; see Section 23 for how this is added without breaking the analysis-only boundary conceptually, since any such call would itself go through the Provider Manager and be treated as an optional, pluggable comparator strategy.
2. Distributed comparison clusters and cross-region comparison coordination (Section 19).
3. Real-time/streaming comparison for continuously arriving knowledge (as opposed to batch comparison of a fixed retrieved set).
4. Plugin marketplace for organization-authored comparison algorithms.

### 2.4 Non-Goals

- The Knowledge Comparison Engine will **never** store knowledge, comparison history, or results beyond the lifetime of a request/response cycle and its explicitly-scoped cache (Section 2.2, Section 4.2).
- It will **never** orchestrate memory retrieval — it does not decide what to retrieve or when; it only analyzes what it is given.
- It will **never** generate embeddings or own/maintain a similarity/vector index — it consumes similarity primitives (e.g., precomputed embeddings, if supplied) but does not compute or persist them itself.
- It will **never** execute AI models directly, communicate with Provider Plugins, or perform routing/model selection.
- It will **never** perform planning, task execution, browser automation, or review of AI-generated output.

---

## 3. Responsibilities

### 3.1 Must Have (v1 scope)

1. Receive a knowledge set (references + content + metadata) from the Memory Manager and normalize it into one internal comparable shape.
2. Validate incoming knowledge items against structural/policy rules before comparison begins.
3. Compute pairwise and set-level similarity across knowledge items using configurable similarity strategies (Section 8).
4. Detect duplicate and near-duplicate knowledge items (Section 11).
5. Detect conflicts between knowledge items (contradictory claims, incompatible metadata) and classify conflict severity (Section 9).
6. Resolve conflicts according to configured policy (priority rules, merge rules, discard rules, or flag for manual resolution).
7. Merge compatible/duplicate knowledge into canonical records, preserving source references and evidence (Section 11.4).
8. Compute quality, confidence, freshness, source-reliability, and priority scores per knowledge item/merged record (Section 10).
9. Produce a final ranked, structured, deduplicated, conflict-resolved knowledge result set.
10. Publish comparison lifecycle events to the Event Bus (Section 13).
11. Support pluggable comparison policies sourced from Configuration Manager, applied without code changes.
12. Provide full traceability metadata (Section 7) on every output record so downstream consumers and auditors can see how a result was produced.

### 3.2 Should Have (near-term, v1.x)

1. Result caching for repeated/overlapping comparison requests within a configurable TTL.
2. Incremental comparison — comparing only newly added knowledge items against a previously computed comparison result, rather than recomputing the full set.
3. Configurable comparison timeouts and partial-result return (return best-effort ranked results if a full comparison would exceed a time budget).
4. Manual conflict resolution support surface — a queryable interface exposing unresolved/flagged conflicts for human or upstream-policy review.

### 3.3 Future Responsibilities (explicitly out of v1, see Section 23)

1. AI-assisted comparison strategies (via an optional, pluggable comparator that itself calls out through the Orchestrator Core/Provider Manager — this module still never talks to a provider directly).
2. Distributed comparison cluster coordination (Section 19).
3. Streaming/real-time comparison of continuously arriving knowledge.
4. Cross-region comparison result reconciliation.

---

## 4. Scope

### 4.1 Owns

- Comparison, similarity, conflict-detection, conflict-resolution, merge, ranking, scoring, and deduplication logic (Section 5).
- The Comparison Model / result schema (Section 7).
- Comparison Policies and Comparison Rules as a pluggable, evaluable rule set (Section 9.8, Section 20 Policy Engine).
- The transient Comparison Cache (Section 5, bounded TTL, not durable storage).
- Confidence/quality/priority scoring algorithms and their configuration surface.

### 4.2 Does Not Own

- Knowledge storage or persistence of any kind (owned by Knowledge Base).
- Memory retrieval orchestration — what to retrieve, when, from which sources (owned by Memory Manager).
- Embedding generation or vector index maintenance (owned by Knowledge Base / a dedicated embedding subsystem per the Knowledge Base MDD); this module *consumes* precomputed similarity primitives (e.g., embedding vectors, if supplied as part of knowledge metadata) but never computes or stores them.
- Planning or task execution (owned by Planner / Orchestrator Core).
- Provider communication, provider SDKs, or model execution (owned by Provider Manager / Provider Plugin System).
- Routing or model selection (owned by Router / Capability Selector).
- Any durable audit trail storage — this module emits audit-relevant events (Section 13, Section 15) but does not persist the audit log itself.

### 4.3 Collaborates With

- **Memory Manager** — the primary caller; supplies the knowledge set to compare and consumes the structured comparison results. All retrieval orchestration happens before this module is invoked.
- **Knowledge Base** — indirect; the Knowledge Comparison Engine never queries the Knowledge Base directly, only receives knowledge already retrieved by the Memory Manager, preserving the strict "analysis only, no storage access" boundary.
- **Planner** — the ultimate consumer of comparison results, though never a direct caller; the Memory Manager mediates between Planner requests and this module's output.
- **Configuration Manager** — supplies comparison policies, rule definitions, scoring weights, and plugin registration manifests.
- **Event Bus** — publisher of all comparison lifecycle events (Section 13).
- **Logger** — structured logging at every comparison stage.
- **Dashboard Backend** — read-only consumer of aggregated comparison metrics (via Metrics/Monitoring surface, Section 16), not a driver of engine behavior.

---

## 5. Internal Architecture

```
+-------------------------------------------------------------------------+
|                     KNOWLEDGE COMPARISON ENGINE                          |
|                                                                            |
|  +-------------------+   +------------------+   +----------------------+ |
|  | Comparison          |-->| Validation         |-->| Metadata Analyzer     | |
|  | Coordinator          |   | Engine             |   |                       | |
|  +-------------------+   +------------------+   +-----------+-----------+ |
|                                                                | |
|                                                                v |
|  +-------------------+   +------------------+   +----------------------+ |
|  | Policy Engine        |<->| Knowledge          |-->| Similarity Engine      | |
|  |                       |   | Comparator         |   |                       | |
|  +-------------------+   +------------------+   +-----------+-----------+ |
|                                                                | |
|                                          +---------------------+---+ |
|                                          v                          v |
|                              +------------------+     +----------------------+ |
|                              | Deduplication      |     | Conflict Detector      | |
|                              | Engine             |     |                       | |
|                              +---------+--------+     +-----------+-----------+ |
|                                        |                            | |
|                                        v                            v |
|                              +------------------+     +----------------------+ |
|                              | Merge Engine        |<----| Conflict Resolver      | |
|                              +---------+--------+     +----------------------+ |
|                                        | |
|                                        v |
|  +-------------------+   +------------------+   +----------------------+ |
|  | Quality Evaluator    |-->| Scoring Engine     |-->| Confidence Calculator  | |
|  +-------------------+   +------------------+   +-----------+-----------+ |
|                                                                | |
|                                                                v |
|                                          +----------------------+ |
|                                          | Ranking Engine          | |
|                                          +-----------+-----------+ |
|                                                       | |
|                                                       v |
|                                          +----------------------+ |
|                                          | Aggregation Engine      | |
|                                          +-----------+-----------+ |
|                                                       | |
|                                          +----------------------+ |
|                                          | Comparison Cache        |  (transient, TTL-bounded) |
|                                          +----------------------+ |
+-------------------------------------------------------------------------+
```

### 5.1 Comparison Coordinator

- **Purpose:** Top-level orchestrator for a single comparison request; drives the Comparison Lifecycle (Section 6) end to end.
- **Responsibilities:** Sequences calls to Validation, Metadata Analyzer, Policy Engine, Knowledge Comparator, Deduplication Engine, Conflict Detector/Resolver, Merge Engine, Scoring/Ranking, and Aggregation Engine; enforces timeouts/partial-result policy (Section 3.2).
- **Inputs:** Raw knowledge set + comparison options (policy overrides, timeout, requested output granularity) from the caller.
- **Outputs:** Final `ComparisonResult` (Section 7).
- **Dependencies:** All other internal components (via injected interfaces).
- **Lifecycle:** Instantiated per comparison request (stateless across requests); holds no knowledge state beyond the current request's execution.

### 5.2 Validation Engine

- **Purpose:** Ensures incoming knowledge items are structurally valid and complete enough to be compared before any comparison work begins.
- **Responsibilities:** Schema validation of each knowledge item; rejects or flags malformed items (missing required fields, invalid source references) per configured strictness policy.
- **Inputs:** Raw knowledge items.
- **Outputs:** `ValidationResult` per item (`valid`, `errors`, `warnings`).
- **Dependencies:** Configuration Manager (validation schema/policy).
- **Lifecycle:** Stateless, invoked once per comparison request.

### 5.3 Metadata Analyzer

- **Purpose:** Extracts and normalizes structured metadata signals (source, timestamp, author/origin, declared reliability, tags, relationships) from each knowledge item into a uniform internal shape used by downstream scoring and similarity components.
- **Responsibilities:** Metadata normalization only — no content-level semantic analysis (that is Similarity Engine's job).
- **Inputs:** Validated knowledge items.
- **Outputs:** `NormalizedMetadata` per item.
- **Dependencies:** None beyond Configuration Manager for metadata-field mapping rules (to accommodate differing Knowledge Base schemas).

### 5.4 Policy Engine

- **Purpose:** The single source of truth for which comparison policies, rules, and scoring weights apply to a given comparison request (Section 9.8).
- **Responsibilities:** Resolves the effective policy set (global defaults + organization-specific overrides + per-request overrides) and exposes it to every other component that needs policy-driven behavior (similarity thresholds, conflict severity thresholds, merge eligibility rules, scoring weights).
- **Inputs:** Comparison request context (organization/project ID, explicit overrides).
- **Outputs:** Resolved `PolicySet`.
- **Dependencies:** Configuration Manager.
- **Lifecycle:** Resolved once per comparison request, cached for the duration of that request's processing.

### 5.5 Knowledge Comparator

- **Purpose:** Drives pairwise/set-level comparison across the normalized knowledge set, delegating actual similarity computation to the Similarity Engine and conflict detection to the Conflict Detector.
- **Responsibilities:** Determines the comparison strategy (full pairwise O(n²), indexed/bucketed comparison for large sets, or incremental comparison against a prior result) based on set size and configured performance policy (Section 18).
- **Inputs:** Normalized knowledge items, resolved `PolicySet`.
- **Outputs:** A set of pairwise `ComparisonPair` results feeding Similarity Engine/Conflict Detector.
- **Dependencies:** Similarity Engine, Conflict Detector, Policy Engine.

### 5.6 Similarity Engine

- **Purpose:** Computes similarity scores between knowledge item pairs using one or more configured, pluggable similarity strategies (Section 8).
- **Responsibilities:** Executes exact-match, near-match, structural, metadata, relationship, and (if supplied) semantic/embedding-based similarity strategies, and combines them per configured weighting into a single hybrid similarity score per pair.
- **Inputs:** Knowledge item pairs, precomputed embeddings if present in metadata (never computed here), resolved `PolicySet` (weights/thresholds).
- **Outputs:** `SimilarityResult` per pair (per-strategy scores + combined score).
- **Dependencies:** Policy Engine (weighting configuration); a registry of pluggable similarity strategy implementations (Section 8.9).

### 5.7 Conflict Detector

- **Purpose:** Identifies knowledge pairs/groups whose content or metadata is contradictory rather than merely similar or dissimilar.
- **Responsibilities:** Applies conflict-detection rules (Section 9.1) to flag contradictions (e.g., two knowledge items asserting incompatible facts about the same entity) and classifies conflict severity.
- **Inputs:** `SimilarityResult`s, normalized knowledge content/metadata, resolved `PolicySet`.
- **Outputs:** `ConflictRecord`s (Section 9.2).
- **Dependencies:** Policy Engine, Similarity Engine (a high similarity score on conflicting fields is itself a conflict signal).

### 5.8 Conflict Resolver

- **Purpose:** Applies configured resolution strategy to each detected conflict (Section 9).
- **Responsibilities:** Executes priority rules, merge rules, discard rules, or override policies per `ConflictRecord`; flags conflicts that cannot be automatically resolved for manual resolution (Section 9.7).
- **Inputs:** `ConflictRecord`s, resolved `PolicySet`.
- **Outputs:** `ConflictResolution`s (resolved or flagged).
- **Dependencies:** Policy Engine, Merge Engine (for merge-based resolutions).

### 5.9 Deduplication Engine

- **Purpose:** Identifies exact and near-duplicate knowledge items and determines merge candidacy (Section 11).
- **Responsibilities:** Uses `SimilarityResult`s against a configurable duplicate threshold to flag duplicate/near-duplicate pairs, distinct from Conflict Detector (duplicates are *redundant*, not *contradictory*).
- **Inputs:** `SimilarityResult`s, resolved `PolicySet` (duplicate threshold).
- **Outputs:** `DuplicateGroup`s.
- **Dependencies:** Policy Engine, Similarity Engine.

### 5.10 Merge Engine

- **Purpose:** Produces canonical merged records from duplicate groups and merge-resolved conflicts.
- **Responsibilities:** Selects/synthesizes a canonical representation per group per configured canonical-selection policy (Section 11.3), preserving full source/evidence lineage rather than discarding contributing records' provenance.
- **Inputs:** `DuplicateGroup`s, merge-type `ConflictResolution`s, resolved `PolicySet`.
- **Outputs:** `MergedKnowledgeRecord`s.
- **Dependencies:** Policy Engine.

### 5.11 Quality Evaluator

- **Purpose:** Assesses intrinsic quality signals of a knowledge item/merged record independent of comparison against other items (completeness, structural soundness, metadata richness).
- **Responsibilities:** Computes a `QualityScore` per item, feeding the overall Scoring Engine.
- **Inputs:** Normalized knowledge items/merged records, resolved `PolicySet` (quality weighting).
- **Outputs:** `QualityScore`.
- **Dependencies:** Metadata Analyzer output, Policy Engine.

### 5.12 Scoring Engine

- **Purpose:** Combines Quality Evaluator output, Confidence Calculator output, freshness, source reliability, and evidence strength into a composite score set per record (Section 10).
- **Responsibilities:** Applies configured weighting formulas; produces the `PriorityScore` used by Ranking Engine.
- **Inputs:** `QualityScore`, `ConfidenceScore`, metadata (freshness, source reliability), resolved `PolicySet`.
- **Outputs:** Full score bundle per record (Section 7).
- **Dependencies:** Quality Evaluator, Confidence Calculator, Policy Engine.

### 5.13 Confidence Calculator

- **Purpose:** Computes a `ConfidenceScore` reflecting how trustworthy a given knowledge item/merged record is, based on evidence strength, source reliability, corroboration across independent sources, and conflict resolution outcome.
- **Responsibilities:** Isolated from general Quality Evaluator scoring to keep "is this well-formed" (quality) distinct from "should this be trusted" (confidence) — two genuinely different questions that must remain independently tunable.
- **Inputs:** Normalized knowledge, `ConflictResolution` outcomes (an item that survived conflict resolution unscathed scores differently than one that was partially overridden), resolved `PolicySet`.
- **Outputs:** `ConfidenceScore`.
- **Dependencies:** Policy Engine, Conflict Resolver output.

### 5.14 Ranking Engine

- **Purpose:** Produces the final ordered ranking of the (deduplicated, conflict-resolved, merged) knowledge result set.
- **Responsibilities:** Sorts by `PriorityScore` (with configurable tie-breaking rules), attaches a `Ranking` field per Section 7.
- **Inputs:** Scored, merged, conflict-resolved knowledge records.
- **Outputs:** Ranked knowledge list.
- **Dependencies:** Scoring Engine, Policy Engine (tie-break rules).

### 5.15 Aggregation Engine

- **Purpose:** Assembles the final `ComparisonResult` (Section 7) from all upstream component outputs into the single structured object returned to the caller.
- **Responsibilities:** Combines ranked records, conflict summary, duplicate summary, applied-policy metadata, and per-record traceability into one coherent response shape.
- **Inputs:** All upstream outputs.
- **Outputs:** `ComparisonResult`.
- **Dependencies:** None beyond receiving upstream outputs — pure assembly, no new analysis logic.

### 5.16 Comparison Cache

- **Purpose:** Transient, TTL-bounded cache of recent comparison results keyed by a deterministic hash of (knowledge set identity + resolved policy set), to avoid redundant recomputation.
- **Responsibilities:** Cache lookup before Comparison Coordinator begins full processing; cache write after successful comparison. This is explicitly **not** durable knowledge storage — entries expire and are safe to lose at any time without correctness impact (a cache miss simply triggers recomputation).
- **Inputs/Outputs:** `ComparisonResult` keyed by request hash.
- **Dependencies:** Configuration Manager (TTL, size limits).

---

## 6. Comparison Lifecycle

### 6.1 Lifecycle Flow

```
  Receive Knowledge (from Memory Manager)
        |
        v
    Normalize            (Metadata Analyzer)
        |
        v
    Validate              (Validation Engine)   --(fails)--> ComparisonFailed, invalid items excluded/flagged
        |
        v
     Compare               (Knowledge Comparator -> Similarity Engine)
        |
        v
  Detect Similarity        (Similarity Engine results feed both paths below)
        |
        +-----------------------------+
        v                               v
  Detect Conflicts              Detect Duplicates
  (Conflict Detector)           (Deduplication Engine)
        |                               |
        v                               v
  Resolve Conflicts              Identify Merge Candidates
  (Conflict Resolver)                   |
        |                               |
        +---------------+---------------+
                          v
                       Merge              (Merge Engine)
                          |
                          v
                        Score              (Quality Evaluator -> Confidence Calculator -> Scoring Engine)
                          |
                          v
                        Rank                (Ranking Engine)
                          |
                          v
                     Aggregate              (Aggregation Engine)
                          |
                          v
              Return Structured ComparisonResult
```

### 6.2 Sequence Diagram — Full Comparison Request

```
MemoryManager   ComparisonCoordinator  ValidationEngine  KnowledgeComparator  ConflictDetector/Resolver  MergeEngine  ScoringEngine  RankingEngine  AggregationEngine
     |                    |                   |                  |                        |                   |             |               |                  |
     |--compareKnowledge->|                   |                  |                        |                   |             |               |                  |
     |                    |--normalize+validate->|                  |                        |                   |             |               |                  |
     |                    |<--ValidationResult----|                  |                        |                   |             |               |                  |
     |                    |--compare-------------------------------->|                        |                   |             |               |                  |
     |                    |<--SimilarityResults------------------------|                        |                   |             |               |                  |
     |                    |--detect+resolve conflicts-------------------------------------------->|                   |             |               |                  |
     |                    |<--ConflictResolutions----------------------------------------------------|                   |             |               |                  |
     |                    |--merge-------------------------------------------------------------------------------------->|             |               |                  |
     |                    |<--MergedRecords-------------------------------------------------------------------------------|             |               |                  |
     |                    |--score--------------------------------------------------------------------------------------------------->|               |                  |
     |                    |<--ScoredRecords----------------------------------------------------------------------------------------------|               |                  |
     |                    |--rank------------------------------------------------------------------------------------------------------------------->|                  |
     |                    |<--RankedRecords-----------------------------------------------------------------------------------------------------------|                  |
     |                    |--aggregate---------------------------------------------------------------------------------------------------------------------------------->|
     |                    |<--ComparisonResult-----------------------------------------------------------------------------------------------------------------------------|
     |<--ComparisonResult-|                   |                  |                        |                   |             |               |                  |
```

---

## 7. Comparison Model

The `ComparisonResult` and its constituent `KnowledgeComparisonRecord` entries are the canonical output shape of this module.

| Field | Description |
|---|---|
| `comparisonId` | Unique identifier for this comparison run, used for tracing, caching, and audit correlation. |
| `knowledgeReferences` | The set of input knowledge item IDs that were compared (references only — no content duplication of what the Knowledge Base already owns). |
| `similarityScore` | Per-pair or per-group similarity score(s) (Section 8), retained for explainability. |
| `confidenceScore` | Computed by Confidence Calculator (Section 5.13) — how trustworthy this record is. |
| `qualityScore` | Computed by Quality Evaluator (Section 5.11) — intrinsic well-formedness/completeness. |
| `priorityScore` | Composite score from Scoring Engine (Section 10) driving final ranking. |
| `conflictLevel` | Enum (`none`, `low`, `medium`, `high`) reflecting the severity of any conflict this record was involved in, per Conflict Detector classification. |
| `mergeStatus` | Enum (`unmerged`, `merged`, `mergeSource`) — whether this record is a standalone item, a canonical merged record, or a contributing source to a merged record. |
| `duplicateStatus` | Enum (`unique`, `duplicate`, `nearDuplicate`, `canonical`) per Deduplication Engine findings. |
| `ranking` | Final position (integer) assigned by Ranking Engine within this comparison result set. |
| `sourceReferences` | The originating Knowledge Base source(s) and, for merged records, every contributing source — full provenance preserved even after merge. |
| `evidence` | The specific signals/facts that supported this record's scores (e.g., "corroborated by 3 independent sources," "flagged as stale, last updated 400 days ago") — used for explainability. |
| `metadata` | Normalized metadata block from Metadata Analyzer (source, timestamp, author/origin, tags). |
| `policiesApplied` | The exact `PolicySet` (or policy IDs/versions) used to produce this result, ensuring reproducibility and auditability. |
| `timestamp` | When this comparison record was produced. |
| `customMetadata` | Extension point for organization-specific fields carried through without this module needing to understand their semantics (Open/Closed Principle applied to the data model itself). |

### 7.1 Every Field's Purpose, Explained

- `comparisonId`, `timestamp`: correlate this result across logs, events, caching, and audits.
- `knowledgeReferences`, `sourceReferences`: guarantee this module never duplicates knowledge content ownership — it always refers back to the Knowledge Base's authoritative records.
- `similarityScore`, `conflictLevel`, `duplicateStatus`: the direct outputs of the three core analytical passes (similarity, conflict, dedup) that justify every downstream decision.
- `confidenceScore`, `qualityScore`, `priorityScore`: the three-tier scoring model (Section 10) that together drive `ranking`, kept as separate fields rather than one blended number so downstream consumers (and auditors) can see *why* something ranked where it did.
- `mergeStatus`: essential for the Planner to know whether it's looking at an original item or a synthesized canonical record, since provenance-sensitive consumers may need to trace back to originals.
- `evidence`, `policiesApplied`: the explainability backbone of the whole module — without these, a "trust me" black-box score would be operationally unacceptable for an enterprise knowledge system.
- `customMetadata`: the module's designated, safe extension point, preventing future organization-specific requirements from forcing schema-breaking changes to the core model.

---

## 8. Similarity Analysis

The Similarity Engine (Section 5.6) supports a pluggable set of similarity strategies, combined per configured weights into one hybrid score. Each strategy is independently swappable/extensible (Open/Closed Principle) via the strategy registry (Section 8.9).

### 8.1 Exact Match
Byte-for-byte or normalized-string equality on core content fields — the cheapest, highest-confidence duplicate signal, always computed first as a fast path.

### 8.2 Near Match
Fuzzy string comparison (edit distance, token-overlap) on content fields, tunable via a configured threshold, to catch near-identical knowledge with minor wording differences.

### 8.3 Semantic Similarity
Consumes precomputed embedding vectors *if present* in the supplied knowledge metadata (this module never generates them) and computes vector-space similarity (e.g., cosine similarity) as one strategy input. If no embeddings are supplied, this strategy is skipped for that comparison, with the hybrid weighting automatically renormalizing across the remaining available strategies (a graceful-degradation rule enforced by the Policy Engine).

### 8.4 Structural Similarity
Compares the shape/structure of knowledge items (schema, field composition, relationship graph shape) independent of literal content — useful for identifying knowledge items that represent "the same kind of fact" even with different values.

### 8.5 Metadata Similarity
Compares normalized metadata fields (source, tags, category, entity references) — often a strong, cheap signal for pre-filtering candidate pairs before more expensive content-level comparison is attempted (Section 18 performance optimization).

### 8.6 Relationship Similarity
Compares the knowledge item's declared relationships to other entities/knowledge (if the Knowledge Base schema exposes a relationship graph) — two items referencing the same relationship structure are a similarity signal even without literal content overlap.

### 8.7 Hybrid Similarity
The combined, weighted result across all applicable strategies (8.1–8.6), computed by the Similarity Engine per the resolved `PolicySet`'s weighting configuration. This is the score stored as `similarityScore` in the Comparison Model.

### 8.8 Weighted Similarity
Weighting itself is fully configuration-driven (Policy Engine), never hardcoded — organizations can emphasize semantic similarity over structural similarity, or vice versa, without any code change.

### 8.9 Custom Algorithms
New similarity strategies are added by registering a new implementation of the `SimilarityStrategyPort` (Section 21) — the Similarity Engine discovers and invokes registered strategies polymorphically, identical in spirit to the Provider Manager's plugin pattern (per the Provider Manager MDD), applied here to comparison algorithms instead of AI providers.

---

## 9. Conflict Resolution

### 9.1 Conflict Detection

The Conflict Detector flags a pair/group as conflicting when normalized content on the *same logical field/entity* diverges beyond a configured tolerance while metadata similarity remains high (i.e., "these are clearly about the same thing, but they disagree") — distinct from low similarity overall, which is simply unrelated knowledge, not a conflict.

### 9.2 Conflict Classification

| Severity | Criteria (policy-configurable) | Default Handling |
|---|---|---|
| `low` | Minor factual divergence, non-critical field, or fully explainable by recency (older record vs. newer record) | Auto-resolved via priority rules (freshness wins) |
| `medium` | Divergence on a moderately important field, sources of comparable reliability | Auto-resolved via priority rules (source reliability, corroboration count) where possible; flagged if rules are inconclusive |
| `high` | Direct contradiction on a critical field, or divergence between highly-reliable sources | Flagged for manual resolution by default unless an explicit override policy exists |

### 9.3 Priority Rules

Configurable ordered rule chain (e.g., `sourceReliability` > `freshness` > `corroborationCount` > `explicitOverride`) evaluated by Conflict Resolver until one rule yields a decisive winner; if none do, the conflict is flagged (Section 9.7).

### 9.4 Merge Rules

For conflicts classified as *compatible-but-divergent* (e.g., complementary rather than contradictory information), the Conflict Resolver routes to Merge Engine instead of a discard/priority decision, producing a merged record that retains both pieces of information rather than picking a "winner."

### 9.5 Discard Rules

For conflicts where policy dictates one side is simply invalid (e.g., a source explicitly marked deprecated/untrusted below a configured reliability floor), the losing record is excluded from the final ranked result but retained in `evidence`/audit trail (never silently vanished — see Section 17 Auditability).

### 9.6 Override Policies

Organization-defined override rules (e.g., "knowledge from Source X always wins regardless of other signals") are supported as a distinct, highest-precedence policy tier evaluated before generic priority rules, sourced from Configuration Manager.

### 9.7 Manual Resolution Support

Conflicts that remain unresolved after all automatic rules are exhausted are marked `conflictLevel: high` with `mergeStatus`/resolution left explicitly pending, and surfaced via a queryable interface (Section 12.5, `resolveConflicts()`) so an upstream system (or human-in-the-loop workflow, outside this module's scope) can supply an explicit resolution which this module then applies and re-scores.

### 9.8 Organization Policies

All of Sections 9.1–9.7's thresholds, rule orderings, and severity classifications are sourced entirely from the Policy Engine (Section 5.4), which resolves Configuration-Manager-supplied, organization-specific policy documents — no conflict-resolution behavior is hardcoded in this module's source.

---

## 10. Ranking & Scoring

Three independently-computed, then combined, score tiers:

### 10.1 Quality Score
Computed by Quality Evaluator (Section 5.11) from: metadata completeness, structural soundness, and adherence to expected knowledge schema — an intrinsic property of the record itself, independent of comparison against others.

### 10.2 Confidence Score
Computed by Confidence Calculator (Section 5.13) from: source reliability, evidence strength, corroboration across independent sources, and conflict-resolution outcome (survived unscathed vs. partially overridden vs. flagged).

### 10.3 Freshness Score
A time-decay function (configurable decay curve) applied to the knowledge item's declared timestamp/last-updated metadata — recency contributes to, but does not solely determine, overall priority.

### 10.4 Source Reliability
A configured or historically-derived reliability weight per knowledge source (sourced from Configuration Manager or, in future, informed by a reliability-tracking mechanism outside this module's scope — this module only consumes the weight, never computes long-term source reputation itself, to avoid duplicating what would otherwise be a persistence/statistics concern).

### 10.5 Metadata Completeness
A sub-signal of Quality Score reflecting how many of the expected metadata fields are populated and well-formed.

### 10.6 Relationship Quality
Reflects how well-connected/corroborated a knowledge item is within the supplied relationship graph (if present), feeding both Quality and Confidence scoring.

### 10.7 Evidence Strength
An aggregate signal combining corroboration count, source reliability, and conflict-resolution outcome into one normalized sub-score feeding Confidence Score.

### 10.8 Priority Score
The final composite computed by Scoring Engine (Section 5.12): a configurable weighted formula over Quality, Confidence, Freshness, and Evidence Strength — e.g., `priorityScore = w1*quality + w2*confidence + w3*freshness + w4*evidenceStrength`, with weights (`w1..w4`) fully policy-driven.

### 10.9 Overall Ranking
Ranking Engine (Section 5.14) sorts the final knowledge set by `priorityScore` descending, applying configured tie-break rules (e.g., prefer higher confidence on ties, then most recent) to guarantee deterministic, reproducible ordering given the same inputs and policy set.

---

## 11. Deduplication

### 11.1 Duplicate Detection
Deduplication Engine flags pairs as exact duplicates when Similarity Engine's Exact Match (Section 8.1) strategy returns a perfect/near-perfect score on core content fields.

### 11.2 Near Duplicate Detection
Pairs whose Hybrid Similarity (Section 8.7) score exceeds a configured near-duplicate threshold (but is not an exact match) are grouped as near-duplicates, distinct from true duplicates in that the Merge Engine may need to reconcile minor differences rather than simply picking one.

### 11.3 Merge Candidates & Canonical Record Selection
Every `DuplicateGroup` is evaluated by Merge Engine to select or synthesize a canonical record: canonical-selection policy (configurable) may prefer the highest-quality-scored member, the most recent member, the member from the most reliable source, or a field-by-field synthesized composite — with the exact strategy chosen entirely by Policy Engine configuration, not hardcoded.

### 11.4 Duplicate Resolution Policies
The resulting `MergedKnowledgeRecord` always retains `sourceReferences` for every contributing original record (Section 7), ensuring deduplication never silently discards provenance even when it does discard redundant content from the final ranked view.

---

## 12. Public Interfaces

### 12.1 `compareKnowledge(knowledgeSet, options) -> ComparisonResult`
- **Purpose:** The primary, comprehensive entry point — runs the full Comparison Lifecycle (Section 6) and returns the complete structured result.
- **Input:** `knowledgeSet` (array of knowledge items/references + content + metadata), `options` (policy overrides, timeout, requested output granularity).
- **Output:** `ComparisonResult` (Section 7).
- **Validation:** Delegates to Validation Engine; invalid items are excluded/flagged per configured strictness, never silently dropped without a trace.
- **Errors:** `InvalidKnowledgeError`, `ComparisonTimeoutError` (with partial-result option per Section 3.2), `PolicyResolutionError`.

### 12.2 `rankKnowledge(scoredKnowledgeSet, options) -> RankedKnowledgeList`
- **Purpose:** Exposed independently for callers that have already obtained scored knowledge (e.g., from a cached prior comparison) and only need re-ranking, e.g., after a policy change.
- **Input:** Pre-scored knowledge records, ranking options (tie-break override).
- **Output:** `RankedKnowledgeList`.
- **Errors:** `InvalidScoreDataError`.

### 12.3 `mergeKnowledge(duplicateGroup, options) -> MergedKnowledgeRecord`
- **Purpose:** Exposed independently to allow the caller to trigger a merge for a specific, already-identified duplicate/conflict group without re-running full comparison.
- **Input:** `duplicateGroup` (knowledge item references belonging to one group), merge policy options.
- **Output:** `MergedKnowledgeRecord`.
- **Errors:** `MergeConflictError` (if the group contains an unresolved conflict that blocks merging), `InvalidGroupError`.

### 12.4 `detectDuplicates(knowledgeSet, options) -> DuplicateGroup[]`
- **Purpose:** Standalone duplicate-detection pass, useful for lighter-weight callers who only need dedup information without full scoring/ranking.
- **Input:** `knowledgeSet`, similarity threshold override.
- **Output:** Array of `DuplicateGroup`.
- **Errors:** `InvalidKnowledgeError`.

### 12.5 `resolveConflicts(conflictRecords, resolutionInput) -> ConflictResolution[]`
- **Purpose:** Applies automatic resolution rules to a supplied set of conflicts, or accepts explicit manual resolution input (Section 9.7) for previously-flagged conflicts.
- **Input:** `conflictRecords`, optional `resolutionInput` (explicit human/upstream decision per conflict ID).
- **Output:** `ConflictResolution[]`.
- **Errors:** `UnresolvableConflictError` (if no rule applies and no manual input supplied — returned as a still-flagged result, not a thrown exception, since this is an expected outcome, not a system failure).

### 12.6 `calculateConfidence(knowledgeItem, context) -> ConfidenceScore`
- **Purpose:** Standalone confidence computation for a single knowledge item, useful for callers needing a quick trust assessment without full comparison against a set.
- **Input:** `knowledgeItem`, `context` (relevant corroborating items/sources, if known).
- **Output:** `ConfidenceScore`.
- **Errors:** `InvalidKnowledgeError`.

---

## 13. Events

| Event | Publisher | Subscribers | Payload | Trigger | Retry Behaviour |
|---|---|---|---|---|---|
| `KnowledgeCompared` | Comparison Coordinator | Monitoring, Dashboard Backend | `{ comparisonId, itemCount }` | A comparison request begins processing | None |
| `ComparisonCompleted` | Comparison Coordinator | Memory Manager, Monitoring, Dashboard Backend | `{ comparisonId, resultSummary, durationMs }` | Full `ComparisonResult` produced | None |
| `ConflictDetected` | Conflict Detector | Monitoring, Dashboard Backend, Audit | `{ comparisonId, conflictId, severity }` | A conflict is classified | None |
| `ConflictResolved` | Conflict Resolver | Monitoring, Audit | `{ comparisonId, conflictId, resolutionType }` | A conflict is automatically or manually resolved | None |
| `KnowledgeMerged` | Merge Engine | Monitoring, Audit | `{ comparisonId, mergedRecordId, sourceCount }` | A canonical merged record is produced | None |
| `KnowledgeRanked` | Ranking Engine | Monitoring, Dashboard Backend | `{ comparisonId, rankedCount }` | Final ranking is computed | None |
| `DuplicatesDetected` | Deduplication Engine | Monitoring, Dashboard Backend | `{ comparisonId, duplicateGroupCount }` | Duplicate groups identified | None |
| `QualityEvaluated` | Quality Evaluator | Monitoring | `{ comparisonId, averageQualityScore }` | Quality scoring pass completes | None |

Event publication is best-effort/fire-and-forget, consistent with the Event Bus MDD's delivery guarantees; a publish failure is logged but never blocks comparison processing.

---

## 14. Error Handling

| Error Condition | Handling |
|---|---|
| **Invalid Knowledge** | Validation Engine flags/excludes malformed items per configured strictness (`strict`: fail the whole request; `lenient`: exclude the item and continue, noting the exclusion in `ComparisonResult` metadata). |
| **Comparison Failure** | An unexpected exception during Knowledge Comparator/Similarity Engine execution for a specific pair is isolated (caught at the pair level) so one bad pair does not fail the entire comparison; the failure is recorded and the pair is excluded from similarity conclusions, logged at `error` level. |
| **Merge Failure** | Merge Engine failing to produce a canonical record (e.g., an unresolvable field-level synthesis conflict) results in the group being left `unmerged` with a `MergeConflictError` attached to the group's evidence, rather than blocking the entire comparison. |
| **Conflict Resolution Failure** | Handled per Section 9.7 — an inconclusive resolution is not an error state but an expected, explicitly flagged outcome (`UnresolvableConflictError` is returned as data, not thrown, from `resolveConflicts()`). |
| **Metadata Failure** | Metadata Analyzer failing to normalize a specific item's metadata (malformed source schema) results in that item proceeding with a `metadataIncomplete: true` flag, reducing its Quality Score rather than failing the whole request. |
| **Policy Failure** | Policy Engine failing to resolve a valid `PolicySet` (missing/malformed configuration) is a hard failure — `PolicyResolutionError` — since comparison cannot proceed safely without a defined policy; this fails fast rather than silently falling back to undocumented defaults. |
| **Recovery Strategy** | Per-item/per-pair isolation (as above) ensures partial failures degrade gracefully rather than failing the entire comparison; `ComparisonTimeoutError` supports a configured partial-result return so a slow comparison over a very large set can still yield a best-effort ranked result within a time budget. |

---

## 15. Logging

| Log Category | Contents |
|---|---|
| **Comparison Logs** | One entry per comparison request lifecycle stage, including `comparisonId`, item count, duration. |
| **Merge Logs** | Every merge decision, including which records were merged, canonical-selection policy applied, and resulting `mergedRecordId`. |
| **Conflict Logs** | Every detected conflict, its classification, and its resolution outcome (or flagged-pending status). |
| **Ranking Logs** | Final ranking order and the score bundle that produced it, per comparison request. |
| **Policy Logs** | Which `PolicySet` (with version/ID) was resolved and applied for a given comparison request. |
| **Audit Logs** | All conflict resolutions, discards, and merges, always including enough detail (source records, applied policy) to reconstruct why a given final ranking was produced — supporting Section 17 Auditability. |

All logs include `comparisonId` (and, where available, the originating `requestId`/`correlationId` propagated from the Memory Manager) for cross-module tracing consistent with the Request Manager and Provider Manager MDDs' logging conventions.

---

## 16. Monitoring

| Metric | Description |
|---|---|
| **Comparison Throughput** | Comparisons processed per second/minute, and total knowledge items compared. |
| **Comparison Latency** | p50/p95/p99 duration per comparison request, broken down by lifecycle stage (Section 6). |
| **Merge Rate** | Merged records produced / total duplicate groups identified. |
| **Conflict Rate** | Conflicts detected / total comparison pairs, broken down by severity. |
| **Duplicate Rate** | Duplicate/near-duplicate items detected / total items compared. |
| **Ranking Performance** | Time spent in Ranking Engine per request, particularly for large result sets. |
| **Cache Performance** | Comparison Cache hit rate, average cache entry age at hit time, eviction rate. |

---

## 17. Security

| Concern | Handling |
|---|---|
| **Data Integrity** | The engine never mutates source knowledge — all transformations produce new, clearly-provenanced result records (`MergedKnowledgeRecord`, etc.), never in-place edits to Knowledge Base content, since this module has no write access to storage in the first place (Section 4.2). |
| **Policy Integrity** | Resolved `PolicySet`s are versioned/identified (Section 7 `policiesApplied`) so any comparison result can be traced back to the exact policy configuration in effect at the time, preventing silent policy drift from going unnoticed. |
| **Access Control** | The engine assumes the caller (Memory Manager) has already authorized the underlying knowledge access; this module performs no independent access-control decisions on knowledge content, avoiding duplicated authorization logic (consistent with the Provider Manager MDD's pattern of deferring authorization upstream). |
| **Auditability** | Every discard, merge, and conflict resolution is logged and event-published with full evidence trail (Section 15, Section 13) — nothing is silently dropped from the final result without a recoverable audit record. |
| **Tamper Detection** | Out of scope for direct implementation in this module (no cryptographic signing of knowledge content is performed here) — if the platform requires tamper-evidence on knowledge content, that is a Knowledge Base/storage-layer concern; this module's contribution is limited to never being a vector for silent, unlogged modification of comparison outcomes. |

---

## 18. Performance

| Concern | Approach |
|---|---|
| **Parallel Comparison** | Pairwise comparisons within Knowledge Comparator are parallelized across available compute resources (bounded by configured concurrency limits), since individual pair comparisons are independent and side-effect-free. |
| **Batch Comparison** | Large knowledge sets are processed in configurable batches to bound peak memory usage rather than materializing all pairwise results simultaneously. |
| **Incremental Comparison** | Supports comparing only newly-added items against a previously cached/computed result set (Section 3.2), avoiding full O(n²) recomputation when only a small delta has changed. |
| **Distributed Comparison** | For very large sets, comparison work is partitionable across multiple engine instances/workers (Section 19) — the Comparison Coordinator's sequencing logic is designed to be shardable without algorithmic changes. |
| **Caching** | Comparison Cache (Section 5.16) avoids redundant recomputation for repeated/overlapping requests within a configured TTL; Metadata Similarity (cheap) is used as a pre-filter before more expensive Semantic/Structural similarity strategies are invoked, reducing unnecessary computation (lazy evaluation). |
| **Lazy Evaluation** | Expensive similarity strategies (e.g., embedding-based semantic similarity) are only invoked for candidate pairs that pass cheaper pre-filters (exact/near-match, metadata similarity), rather than being computed unconditionally for every pair. |
| **Memory Optimization** | Knowledge content is streamed/processed in bounded batches rather than fully materialized in memory for very large comparison sets; intermediate pairwise results are discarded once aggregated into per-item scores, not retained beyond their immediate use. |

---

## 19. Enterprise Scalability

The Knowledge Comparison Engine is architected to scale from a single-instance deployment to a hyperscale, multi-region deployment without source-code changes, by treating scale as a deployment/configuration concern layered on top of a stateless core.

### 19.1 Horizontal & Vertical Scaling
The engine's core components (Section 5) are stateless per comparison request (aside from the TTL-bounded, safely-losable Comparison Cache) — any number of engine instances can run concurrently behind a load-balanced entry point, and individual instances can be vertically scaled for CPU/memory-bound similarity computation without any code change.

### 19.2 Distributed Comparison & Comparison Clusters
For extremely large knowledge sets, the Comparison Coordinator's batching/partitioning logic (Section 18) is designed to be extended, via a pluggable `DistributionStrategyPort`, to a cluster-coordinator implementation that partitions a single large comparison request across multiple worker instances (a cluster), aggregating partial results back into one `ComparisonResult` — this is a Future Expansion (Section 23) enabled by an already-present extension point, not a v1 requirement.

### 19.3 Work Distribution, Task Partitioning, Sharding
Task partitioning follows natural boundaries already present in the architecture: knowledge sets can be sharded by source, by entity/topic, or by arbitrary batch boundaries, with each shard's pairwise comparison assigned to a worker; cross-shard conflict/duplicate detection (items in different shards that are actually duplicates of each other) is handled by a reconciliation pass over each shard's boundary candidates — a standard distributed-comparison pattern the architecture anticipates via the same `DistributionStrategyPort`.

### 19.4 Distributed Cache
The Comparison Cache's storage backend is abstracted behind a port (mirroring the Provider Manager MDD's and Request Manager MDD's registry-port pattern), allowing the default in-memory implementation to be swapped for a distributed cache (e.g., Redis) when multiple engine instances need to share cache state.

### 19.5 Load Balancing, Fault Tolerance, High Availability
Because engine instances are stateless with respect to knowledge content, standard load-balancing and instance-replacement patterns apply without special handling in this module — a failed instance mid-comparison simply results in the caller (Memory Manager) retrying the request against a healthy instance, since no partial, uncommitted state exists to reconcile (the engine never writes anything until it returns a complete `ComparisonResult`).

### 19.6 Elastic Scaling & Capacity Planning
Comparison Throughput and Comparison Latency metrics (Section 16) directly inform autoscaling policy (external to this module, e.g., a Kubernetes HPA or equivalent) — the engine exposes the signals; it does not implement autoscaling itself.

### 19.7 Supporting the Stated Scale Targets
- **Billions of knowledge comparisons / millions of comparison requests:** Supported via horizontal scaling of stateless instances plus the Comparison Cache reducing redundant work; no architectural ceiling exists since no component holds unbounded in-process state across requests.
- **Thousands of concurrent comparisons:** Supported via per-request isolation (Comparison Coordinator instantiated per request, Section 5.1) and configurable concurrency limits within each instance's parallel comparison execution (Section 18).
- **Unlimited knowledge sources / unlimited comparison policies:** Both are consumed as configuration/data (Policy Engine, Metadata Analyzer field-mapping) rather than being enumerated in code — adding a new source or policy is a configuration change, never a code change.

---

## 20. Interaction With Other Modules

### 20.1 Memory Manager

- **Inbound to this module:** Calls `compareKnowledge()` (primary) or the standalone interfaces (Section 12.2–12.6) with knowledge already retrieved from the Knowledge Base.
- **Outbound from this module:** Returns `ComparisonResult`; publishes `ComparisonCompleted` which the Memory Manager may also subscribe to for asynchronous coordination patterns if needed.

### 20.2 Knowledge Base

- No direct call relationship — this module never queries the Knowledge Base. All knowledge arrives pre-retrieved via the Memory Manager, preserving the "analysis only, no storage access" boundary explicitly required by the Purpose section.

### 20.3 Planner

- No direct call relationship — the Planner consumes `ComparisonResult` data as forwarded/exposed by the Memory Manager, never calling this module directly, keeping the Planner decoupled from comparison-engine implementation details.

### 20.4 Configuration Manager

- Source of all comparison policies, rule definitions, scoring weights, validation schemas, and plugin/strategy registration manifests (Policy Engine's sole external dependency for policy resolution).

### 20.5 Event Bus

- Pure publisher for all events in Section 13; no subscriptions required for this module's own operation.

### 20.6 Logger

- Consumed via injected interface for all logging categories (Section 15).

### 20.7 Dashboard Backend

- Read-only consumer of aggregated Monitoring metrics (Section 16) and relevant events (Section 13); never a caller of this module's comparison interfaces.

### 20.8 Sequence Diagram — Memory Manager Requesting Comparison

```
MemoryManager        KnowledgeComparisonEngine        ConfigurationManager       EventBus
     |--compareKnowledge(knowledgeSet)--->|                        |                  |
     |                                    |--resolve policy------->|                  |
     |                                    |<--PolicySet-------------|                  |
     |                                    |  (full lifecycle, Section 6)                |
     |                                    |--publish ComparisonCompleted--------------->|
     |<--ComparisonResult------------------|                        |                  |
```

---

## 21. Folder Structure

```
knowledge-comparison-engine/
├── domain/
│   ├── entities/
│   │   ├── ComparisonResult.ts            # Section 7
│   │   ├── KnowledgeComparisonRecord.ts
│   │   ├── ConflictRecord.ts
│   │   ├── DuplicateGroup.ts
│   │   ├── MergedKnowledgeRecord.ts
│   │   └── PolicySet.ts
│   ├── value-objects/
│   │   ├── ComparisonId.ts
│   │   ├── SimilarityScore.ts
│   │   ├── ConfidenceScore.ts
│   │   ├── QualityScore.ts
│   │   └── ConflictSeverity.ts             # enum: none, low, medium, high
│   └── rules/
│       └── ComparisonLifecycleStages.ts    # Section 6 stage definitions
│
├── application/
│   ├── use-cases/
│   │   ├── CompareKnowledgeUseCase.ts
│   │   ├── RankKnowledgeUseCase.ts
│   │   ├── MergeKnowledgeUseCase.ts
│   │   ├── DetectDuplicatesUseCase.ts
│   │   ├── ResolveConflictsUseCase.ts
│   │   └── CalculateConfidenceUseCase.ts
│   └── ports/                              # Interfaces this module depends on (driven ports)
│       ├── SimilarityStrategyPort.ts       # Pluggable similarity algorithms (Section 8.9)
│       ├── ComparisonCachePort.ts
│       ├── PolicyResolverPort.ts           # Configuration Manager integration
│       ├── EventBusPort.ts
│       ├── LoggerPort.ts
│       └── DistributionStrategyPort.ts     # Future: distributed comparison (Section 19.2)
│
├── components/                             # Internal components from Section 5
│   ├── ComparisonCoordinator.ts
│   ├── ValidationEngine.ts
│   ├── MetadataAnalyzer.ts
│   ├── PolicyEngine.ts
│   ├── KnowledgeComparator.ts
│   ├── SimilarityEngine.ts
│   ├── ConflictDetector.ts
│   ├── ConflictResolver.ts
│   ├── DeduplicationEngine.ts
│   ├── MergeEngine.ts
│   ├── QualityEvaluator.ts
│   ├── ScoringEngine.ts
│   ├── ConfidenceCalculator.ts
│   ├── RankingEngine.ts
│   ├── AggregationEngine.ts
│   └── ComparisonCache.ts
│
├── strategies/                             # Pluggable similarity/scoring strategy implementations
│   ├── similarity/
│   │   ├── ExactMatchStrategy.ts
│   │   ├── NearMatchStrategy.ts
│   │   ├── SemanticSimilarityStrategy.ts   # consumes precomputed embeddings only
│   │   ├── StructuralSimilarityStrategy.ts
│   │   ├── MetadataSimilarityStrategy.ts
│   │   └── RelationshipSimilarityStrategy.ts
│   └── scoring/
│       ├── FreshnessScoringStrategy.ts
│       └── SourceReliabilityScoringStrategy.ts
│
├── infrastructure/                         # Adapters implementing the ports
│   ├── cache/
│   │   └── InMemoryComparisonCache.ts      # v1; swappable for distributed cache (Section 19.4)
│   ├── event-bus/
│   │   └── EventBusAdapter.ts
│   ├── logging/
│   │   └── StructuredLoggerAdapter.ts
│   └── policy/
│       └── ConfigurationManagerPolicyAdapter.ts
│
├── interface/                              # Driving adapters — how callers invoke this module
│   └── core/
│       └── KnowledgeComparisonEngineFacade.ts   # Implements the public interfaces from Section 12
│
├── config/
│   └── comparison-engine.config.schema.ts  # Policy/threshold/weight schema (values sourced externally)
│
├── tests/
│   ├── unit/
│   ├── comparison/
│   ├── merge/
│   ├── conflict/
│   ├── ranking/
│   ├── similarity/
│   ├── performance/
│   ├── stress/
│   └── regression/
│
└── README.md
```

**Note:** `strategies/` contains only comparison-algorithm logic (no storage, no provider communication, no embedding generation) — each strategy implements `SimilarityStrategyPort` and is independently addable without modifying `components/` or `domain/`, directly satisfying the Open/Closed requirement for pluggable comparison algorithms (Section 23).

---

## 22. Testing Strategy

| Test Type | Coverage |
|---|---|
| **Unit Tests** | Every component in Section 5 tested in isolation with mocked ports — e.g., Conflict Resolver tested against a table of `ConflictRecord`s and policy configurations without a real Policy Engine; Ranking Engine tested against synthetic score bundles for deterministic ordering. |
| **Comparison Tests** | End-to-end `compareKnowledge()` runs against curated knowledge-set fixtures (known duplicates, known conflicts, known unrelated items) verifying the full lifecycle produces expected `ComparisonResult` shapes. |
| **Merge Tests** | Merge Engine tested against duplicate/near-duplicate group fixtures under every configured canonical-selection policy, verifying provenance (`sourceReferences`) is always fully preserved. |
| **Conflict Tests** | Conflict Detector/Resolver tested against fixtures spanning every severity classification (Section 9.2) and every resolution path (priority, merge, discard, override, manual-flag). |
| **Ranking Tests** | Ranking Engine tested for deterministic, reproducible ordering given identical inputs and policy sets, including tie-break rule correctness. |
| **Similarity Tests** | Each similarity strategy (Section 8) tested independently against known-similar/known-dissimilar fixture pairs; Hybrid Similarity tested for correct weighted combination and graceful degradation when an input (e.g., embeddings) is absent. |
| **Performance Tests** | Measure comparison latency/throughput at varying knowledge-set sizes to validate the O(n²)-mitigation strategies (pre-filtering, batching, caching, Section 18) behave as designed. |
| **Stress Tests** | High-concurrency comparison request bursts to validate per-request isolation (no cross-request state leakage) and Comparison Cache correctness under concurrent reads/writes. |
| **Regression Tests** | A fixed corpus of previously-observed comparison scenarios (including prior production edge cases, once available) re-run on every change to comparison/scoring logic to catch unintended ranking/resolution drift. |

---

## 23. Future Expansion

Designed so the following require **no changes to core engine source code**, only new strategy registrations, new configuration, or new adapter implementations behind existing ports:

- **AI-assisted comparison:** A new `SimilarityStrategyPort` or dedicated `ConflictResolutionStrategyPort` implementation that, internally, issues a call through the Orchestrator Core (and therefore the Provider Manager) for ambiguous-case judgment — the Knowledge Comparison Engine's core remains provider-agnostic and never gains a direct provider dependency; the strategy plugin is the only new code, and it is optional/pluggable.
- **Custom comparison plugins:** Any new `SimilarityStrategyPort`, scoring strategy, or `DistributionStrategyPort` implementation is addable under `strategies/` without touching `components/` or `domain/`.
- **Organization-specific comparison policies:** Already fully supported in v1 via Policy Engine + Configuration Manager (Section 9.8) — no further architectural work needed, only policy documents.
- **Distributed comparison clusters / cross-region comparison:** Enabled by the `DistributionStrategyPort` extension point (Section 19.2, 19.3) already present in the architecture.
- **Streaming / real-time comparison:** A new driving adapter (in `interface/`) that feeds knowledge items incrementally into the existing Incremental Comparison capability (Section 3.2, 18) rather than requiring a new comparison model.
- **Plugin-based comparison algorithms / future comparison strategies:** The `strategies/` folder structure and `SimilarityStrategyPort` contract are the designated, permanent extension surface for this — no other extension mechanism should ever be introduced for this purpose, to avoid fragmenting the plugin model.

---

## 24. Risks

| Risk Category | Description | Mitigation |
|---|---|---|
| **Architecture** | Confusing this module's boundary with Memory Manager's (e.g., tempting it to trigger its own re-retrieval when knowledge seems insufficient) would violate the "analysis only" constraint and duplicate Memory Manager responsibility. | The Purpose section's explicit "never orchestrates memory" constraint, combined with the absence of any Knowledge Base port in this module's dependency list (Section 4.2, Section 21), makes such a violation structurally difficult, not just policy-discouraged. |
| **Performance** | Naive O(n²) pairwise comparison could become a bottleneck for very large knowledge sets retrieved for broad queries. | Cheap-first pre-filtering (metadata/exact-match before semantic similarity), batching, caching, and the distributed-comparison extension point (Section 18, Section 19) directly address this. |
| **Consistency** | Non-deterministic ranking (e.g., unstable tie-breaking, or floating-point score instability) could produce different results for identical inputs across runs, undermining explainability and trust. | Ranking Engine's tie-break rules are explicitly deterministic and policy-defined (Section 10.9); `policiesApplied` and `evidence` fields (Section 7) make every result reproducible and auditable given the same inputs and policy version. |
| **Scalability** | In-memory Comparison Cache (v1) does not share state across multiple engine instances, potentially reducing cache-hit efficiency in a horizontally scaled deployment. | `ComparisonCachePort` is an interface from day one (Section 21), enabling a swap to a distributed cache backend (Section 19.4) without touching business logic — the same pattern already established in the Request Manager and Provider Manager MDDs. |
| **Maintenance** | As the number of pluggable similarity/scoring strategies grows, inconsistent strategy implementations (differing score ranges, differing assumptions) could degrade Hybrid Similarity quality. | Strategy contract tests (Section 22) and a documented score-normalization requirement (all strategies must return scores in a common normalized range, enforced at strategy registration) prevent inconsistent strategies from silently corrupting the hybrid combination. |
| **Coupling Drift** | Contributors might be tempted to add direct Knowledge Base queries or embedding-generation calls into this module "for convenience" when a comparison seems to need more context. | This document's explicit ownership boundaries (Section 4) and code review discipline treat any such addition as a design violation requiring escalation, exactly mirroring the Coupling Drift guardrails already established in the Request Manager and Provider Manager MDDs. |

---

## 25. Design Decisions

| Decision | Rationale | Trade-off / Alternative Considered |
|---|---|---|
| **Strictly analysis-only module with zero storage/embedding/provider dependencies** | Keeps this module's cohesion extremely high (pure transformation logic) and makes it trivially horizontally scalable (Section 19) since it holds no durable state; also makes it independently testable without any external service dependency beyond configuration. | Alternative: allow the engine to fetch supplementary knowledge or trigger embedding generation itself when comparison quality would benefit — rejected because it would blur the boundary with Memory Manager/Knowledge Base and reintroduce the exact coupling this module's Purpose section explicitly forbids. |
| **Three-tier scoring model (Quality, Confidence, Priority) kept as separate, independently-weighted fields rather than one blended score** | Preserves explainability — a consumer or auditor can see *why* something ranked where it did (well-formed but untrusted? trusted but stale?) rather than reverse-engineering a single opaque number. | Alternative: a single unified score — rejected as it would be simpler to compute but far less explainable and harder to independently tune (e.g., an organization wanting to weight trust higher than completeness couldn't do so cleanly with a pre-blended score). |
| **Two-tier similarity computation (cheap pre-filter, then expensive strategies only for surviving candidates)** | Directly addresses the O(n²) performance risk (Section 18, Section 24) without requiring distributed infrastructure for moderate-scale deployments, deferring true distribution to Section 19's extension point only when actually needed. | Alternative: always compute all similarity strategies for all pairs — rejected as wasteful, especially for expensive semantic similarity, and would force premature adoption of distributed infrastructure even for small-to-medium knowledge sets. |
| **Conflicts and duplicates handled as structurally distinct concepts (Conflict Detector vs. Deduplication Engine) rather than one "difference engine"** | Conflicts (contradictory) and duplicates (redundant) require fundamentally different resolution logic (resolve-a-disagreement vs. pick-or-merge-a-redundancy); conflating them would force one component to carry two different responsibilities, violating Single Responsibility. | Alternative: a single "divergence" concept with one resolution pipeline — rejected because it would make policy configuration (Section 9.8) far more complex, since duplicate-threshold tuning and conflict-severity tuning are genuinely independent policy concerns for most organizations. |
| **Pluggable strategy pattern for similarity/scoring/distribution (ports under `application/ports/`), mirroring the Provider Manager MDD's plugin architecture** | Directly satisfies the Open/Closed requirement for unlimited comparison policies and plugin-based algorithms (Purpose section, Section 23) without inventing a new extension pattern — reuses an already-validated approach from a sibling module for architectural consistency across the platform. | Alternative: a monolithic, config-flag-driven comparator with all strategies built in and toggled by configuration — rejected because it would still require code changes for genuinely new algorithms, failing the "unlimited comparison policies... without modifying source code" requirement. |
| **In-memory Comparison Cache for v1, behind a port interface** | Fast to implement, consistent with the platform's established v1 single-instance deployment pattern (per PRD and sibling MDDs), and cheaply reversible later via the port abstraction (Section 19.4). | Alternative: distributed cache from day one — rejected as premature for v1 scope, consistent with the identical reasoning already established in the Request Manager and Provider Manager MDDs. |

---

## 26. Diagrams

### 26.1 Component Diagram
See Section 5 for the full internal component diagram.

### 26.2 Comparison Architecture Diagram
See Section 1.4 (architecture position) and Section 5 (internal component diagram) together represent the full comparison architecture — external position plus internal structure.

### 26.3 Comparison Lifecycle Diagram
See Section 6.1.

### 26.4 Conflict Resolution Flow

```
ConflictDetected
        |
        v
  Classify Severity (Section 9.2)
        |
        +--> low/medium: Priority Rules (9.3) --> resolved? --yes--> ConflictResolved
        |                                              |no
        |                                              v
        |                                       Override Policies (9.6) --> resolved? --yes--> ConflictResolved
        |                                              |no
        +--> compatible-but-divergent: Merge Rules (9.4) --> MergeEngine --> ConflictResolved (merged)
        |
        +--> invalid/deprecated source: Discard Rules (9.5) --> ConflictResolved (discarded, audited)
        |
        +--> high severity, no rule decisive: Manual Resolution Support (9.7) --> flagged pending
```

### 26.5 Merge Flow

```
DuplicateGroup / merge-type ConflictResolution
        |
        v
  Canonical Selection Policy (11.3)
        |
        +--> "highest quality" / "most recent" / "most reliable source" --> pick one member as canonical
        |
        +--> "field-by-field synthesis" --> compose new canonical record from multiple members
        |
        v
  MergedKnowledgeRecord (sourceReferences preserved for all contributing members)
```

### 26.6 Ranking Flow

```
Scored Records (Quality, Confidence, Freshness, Evidence Strength per record)
        |
        v
  Scoring Engine: priorityScore = w1*quality + w2*confidence + w3*freshness + w4*evidenceStrength
        |
        v
  Ranking Engine: sort by priorityScore desc, apply tie-break rules
        |
        v
  Final Ranked List (ranking field assigned)
```

### 26.7 Sequence Diagram
See Section 6.2 (full comparison request) and Section 20.8 (Memory Manager interaction).

### 26.8 Folder Structure Diagram
See Section 21.

---

## Appendix A — Consistency Notes

- This module never queries the Knowledge Base directly and never generates or stores embeddings; where the Similarity Engine's Semantic Similarity strategy (Section 8.3) references embedding vectors, those vectors must already be present in the knowledge metadata supplied by the Memory Manager, per the Knowledge Base MDD's embedding-generation and metadata-attachment design — this document does not redefine that schema.
- `sourceReferences`, `knowledgeReferences`, and all provenance fields in the Comparison Model (Section 7) are reference-only (IDs), consistent with the reference-not-content pattern already established for `AttachmentReference`/`ContextReferences` in the Request Manager MDD and `ProviderDescriptor` in the Provider Manager MDD.
- Policy resolution (Policy Engine, Section 5.4) assumes the Configuration Manager exposes an organization/project-scoped policy resolution mechanism consistent with how retry/timeout/circuit-breaker policy is resolved per-provider in the Provider Manager MDD — this document does not redefine Configuration Manager's own resolution mechanics, only how this module consumes their output.
- Event delivery semantics (best-effort, no publisher-side retry) referenced in Section 13 and Section 20.5 follow the guarantees already established in the Event Bus MDD and are not re-specified here.
- The Comparison Model's output feeds the Planner strictly via the Memory Manager (Section 20.3); the exact translation from `ComparisonResult` into whatever internal shape the Planner consumes is owned by the Memory Manager/Planner boundary, not by this document.
