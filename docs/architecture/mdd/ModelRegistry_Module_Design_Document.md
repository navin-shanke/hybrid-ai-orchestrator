# Model Registry — Module Design Document (MDD)

**Document Type:** Module Design Document (MDD)
**Module Name:** Model Registry
**Parent System:** Hybrid AI Development Platform
**Status:** Implementation-Ready
**Audience:** Senior Software Engineers, AI Coding Agents (Cursor, Claude Code, OpenCode, Roo Code)
**Source-of-Truth Inputs:** PRD, SAD, API Specification, Database Design Document, Orchestrator Core MDD, Event Bus MDD, Request Manager MDD, Provider Manager MDD, Provider Plugin System MDD

---

## 1. Executive Summary

### 1.1 Purpose

The Model Registry is the platform's single, authoritative, provider-agnostic catalog of AI model metadata. Every model available anywhere in the platform — regardless of which provider plugin exposes it — has exactly one canonical metadata record here: its capabilities, context window, modalities, pricing metadata, availability, versioning, and lifecycle status. Any module that needs to know *what a model is capable of* consults the Model Registry; no module ever infers model capabilities by inspecting a provider SDK or a plugin directly.

### 1.2 Responsibilities

The Model Registry discovers model metadata (via the Provider Plugin System's manifest/model-listing abstractions, never via direct provider SDK calls), validates it, versions it, indexes it for fast lookup and search, tracks its lifecycle from discovery through deprecation and archival, and exposes it through a stable read-oriented public interface. It stores pricing *metadata* (list-price figures a provider publishes) but never calculates actual execution cost — that arithmetic, applied to real usage, belongs entirely to Provider Manager.

### 1.3 Role

The Model Registry is a **pure metadata service** — the platform's read-optimized "encyclopedia" of models. It is deliberately inert with respect to execution: it never runs a model, never talks to a provider SDK, never selects a provider, and never routes a request. Its sole contribution to any AI call is answering, ahead of time, "does model X support capability Y, and what are its limits?" so that Capability Selector, Router, and Provider Manager can make their own decisions using accurate, centralized data.

### 1.4 Architecture Position

```
┌───────────────────────────────────────────────────────────────────────────┐
│                              Orchestrator Core                              │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                           │ (events, via Event Bus)
        ┌──────────────────────────────────┼──────────────────────────────────┐
        ▼                                  ▼                                  ▼
┌───────────────┐               ┌───────────────────┐               ┌─────────────────┐
│ Capability      │  reads meta  │      Router          │  reads meta   │ Provider Manager  │
│ Selector        │◄─────────────┤                      │◄──────────────┤ (execution, cost) │
└───────┬────────┘               └──────────┬─────────┘               └─────────┬────────┘
        │reads                              │reads                              │reads (never writes)
        └──────────────────┬─────────────────┴──────────────────┬───────────────┘
                           ▼                                    ▼
                 ┌─────────────────────────────────────────────────────┐
                 │                    Model Registry (this module)        │
                 │   Catalog · Metadata · Versioning · Search · Lifecycle │
                 └───────────────────────────┬─────────────────────────┘
                                           │ discovers metadata via
                                 ┌───────────▼───────────┐
                                 │  Provider Plugin System  │
                                 │  (manifests, listModels)  │
                                 └───────────────────────┘
```

The Model Registry sits downstream of the Provider Plugin System (its only source of discovery data) and upstream of every module that needs model facts (Capability Selector, Router, Provider Manager, Dashboard Backend). It never sits in the execution path itself.

---

## 2. Goals

### 2.1 Primary Goals

1. Provide one authoritative, provider-agnostic metadata record per model, regardless of how many providers might expose similarly-named models.
2. Discover model metadata exclusively through the Provider Plugin System's abstractions (manifest `supportedModels`, `listModels()`), never through direct provider SDK/API calls.
3. Validate every piece of registered metadata against a strict, versioned schema before it becomes visible to consumers.
4. Track the complete lifecycle of every model from discovery through deprecation and archival.
5. Provide fast, indexed search and lookup by ID, provider, capability, modality, tag, and other structured fields.
6. Remain completely read-only from every module's perspective except its own internal discovery/synchronization pipeline — Provider Manager and all other consumers read, never write.

### 2.2 Secondary Goals

1. Support model aliases (e.g., a friendly name resolving to a specific versioned model ID).
2. Support semantic versioning of models and "latest version" resolution.
3. Support metadata caching for high-frequency read paths.
4. Support incremental, non-disruptive metadata refresh rather than full-catalog reloads.
5. Support tagging/classification for flexible querying beyond structured fields.

### 2.3 Future Goals

1. Support fine-tuned, private, marketplace, and enterprise-hosted model metadata alongside standard catalog models.
2. Support federated/multi-cluster registries for large, distributed deployments.
3. Support plugin-based metadata extensions (custom fields contributed by specialized provider plugins) without core schema changes.

### 2.4 Non-Goals

The Model Registry explicitly does **not**:

- Execute models, stream responses, or communicate with any provider SDK.
- Select a provider or model for a given request (Capability Selector/Router's responsibility).
- Perform retries or fallback of any kind.
- Monitor live provider/model health (Provider Manager's responsibility; the Registry's `availability` field is *declarative* metadata, not a live health signal).
- Track actual usage or calculate real execution cost (Provider Manager's responsibility; the Registry stores only published pricing metadata).
- Contain business logic, planning, memory, browser automation, or review logic.
- Manage authentication or provider connections.
- Normalize AI responses.

---

## 3. Responsibilities

### 3.1 Must Have

- Discover candidate model metadata via the Provider Plugin System (manifest data and `listModels()` results) — never directly from a provider.
- Validate discovered metadata against the canonical Metadata Schema (Section 7) before registration.
- Detect and resolve duplicate/conflicting model entries across providers or across repeated discovery runs.
- Maintain a versioned catalog: each model has a lifecycle state, a version, and a full change history.
- Index the catalog for fast lookup by model ID, provider, capability, modality, tag, and status.
- Expose a stable, read-oriented public interface (Section 13) to all consuming modules.
- Publish lifecycle and update events via the Event Bus (Section 14) for every meaningful state change.
- Support deprecation and archival workflows with replacement-model linkage.

### 3.2 Should Have

- Support alias resolution (friendly name → canonical model ID).
- Cache frequently-read metadata and search results with a defined invalidation strategy.
- Support incremental refresh (only re-validate/re-register models whose upstream metadata actually changed) rather than full re-synchronization on every cycle.
- Support custom/extensible metadata fields per provider without requiring core schema modification.

### 3.3 Future Responsibilities

- Federated registry synchronization across multiple platform deployments/clusters.
- Support for dynamically-changing metadata (e.g., a fine-tuned model whose metadata evolves as training progresses).
- Plugin-contributed metadata schema extensions validated against a plugin-declared sub-schema.

---

## 4. Scope

### 4.1 Owns

- The Model Registry/Catalog data structure and its full metadata schema (Section 7).
- Model discovery orchestration (calling into the Provider Plugin System's discovery/listing abstractions — never a provider directly).
- Model metadata validation, versioning, alias management, and deprecation/archival state.
- Search indexing and query execution over the catalog.
- Metadata caching and synchronization/refresh scheduling.
- All Model-Registry-specific events (Section 14).

### 4.2 Does Not Own

- Provider SDKs or provider plugin implementations (Provider Plugin System).
- Provider selection or routing decisions (Capability Selector, Router).
- Model execution, streaming, retries, or fallback (Provider Manager).
- Live health monitoring or usage/cost tracking (Provider Manager).
- Authentication or connection management to any provider (Provider Plugin System / Configuration Manager).
- Response normalization (Provider Manager).
- Business, planning, memory, or review logic of any kind.

### 4.3 Collaborates With

| Module | Nature of Collaboration |
|---|---|
| Provider Plugin System | Sole source of discovery data: manifest `supportedModels`, capability declarations, and `listModels()` results. The Registry never bypasses this abstraction to reach a provider directly. |
| Provider Manager | Read-only consumer: fetches model metadata (capabilities, limits, pricing metadata) to inform execution and cost calculation; never writes to the Registry. |
| Capability Selector | Read-only consumer: queries models by capability/modality to build candidate sets. |
| Router | Read-only consumer: queries metadata (availability, region, status) to inform routing constraints. |
| Configuration Manager | Supplies Registry configuration: discovery schedule, cache TTLs, validation strictness, search index settings. |
| Event Bus | Transport for all Registry events (Section 14); the Registry never calls other modules directly. |
| Dashboard Backend | Read-only consumer: displays catalog contents, lifecycle states, and synchronization status. |
| Logger | Receives structured Registry logs (Section 16) via the standard Event Bus logging convention. |

---

## 5. Internal Architecture

### 5.1 Component Overview

```
                             ┌──────────────────────────────────────────┐
                             │           Model Registry Facade             │
                             │ (registerModel/getModel/searchModels/etc.)  │
                             └───────────────────────┬────────────────────┘
                                                    │
        ┌────────────────────────────────────────────┼────────────────────────────────────────────┐
        │                                            │                                            │
┌───────▼────────┐                        ┌────────────▼────────────┐                  ┌────────────▼────────────┐
│Discovery Manager │                        │     Model Validator       │                  │    Metadata Manager        │
└───────┬────────┘                        └────────────┬────────────┘                  └────────────┬────────────┘
        │                                            │                                            │
        └────────────────────────────────────────────┼────────────────────────────────────────────┘
                                                    │
                                          ┌───────────▼───────────┐
                                          │    Model Catalog         │  ← the authoritative store
                                          │  (canonical records)      │
                                          └───────────┬───────────┘
                                                    │
        ┌────────────────────┬─────────────────────┼─────────────────────┬────────────────────┐
        │                    │                     │                     │                    │
┌───────▼──────┐   ┌─────────▼────────┐  ┌──────────▼──────────┐ ┌────────▼────────┐  ┌─────────▼─────────┐
│Capability Mgr │   │Provider Mapping   │  │  Version Manager      │ │Availability Mgr  │  │ Deprecation Mgr     │
│               │   │Manager            │  │  & Alias Manager       │ │                  │  │                    │
└───────────────┘   └──────────────────┘  └───────────────────────┘ └──────────────────┘  └────────────────────┘
                                                    │
                                          ┌───────────▼───────────┐
                                          │      Index Manager       │
                                          └───────────┬───────────┘
                                                    │
                                          ┌───────────▼───────────┐
                                          │      Search Engine        │
                                          └───────────┬───────────┘
                                                    │
                                          ┌───────────▼───────────┐
                                          │      Metadata Cache       │
                                          └───────────────────────┘

  Cross-cutting: Synchronization Manager · Compatibility Manager · Event Emission · Logging
```

### 5.2 Component Descriptions

Each component description follows: **Purpose · Responsibilities · Inputs · Outputs · Dependencies · Lifecycle**.

**Model Discovery Manager**
- *Purpose:* Orchestrate discovery of candidate model metadata exclusively through the Provider Plugin System.
- *Responsibilities:* Invoke `listModels()`/manifest queries against every registered plugin (via the Provider Plugin System's public interface), collect raw candidate metadata, and hand each candidate to the Model Validator.
- *Inputs:* Provider Plugin System's `listPlugins()`/`getPlugin()` results, manifest summaries.
- *Outputs:* A stream of raw `CandidateModelMetadata` objects.
- *Dependencies:* Provider Plugin System port (read-only); Synchronization Manager (for scheduling).
- *Lifecycle:* Runs on platform startup, on a configured schedule, and on-demand via `discoverModels()`/`refreshModels()`.

**Model Validator**
- *Purpose:* Enforce metadata correctness before anything enters the Catalog.
- *Responsibilities:* Schema validation, capability/compatibility/version/alias validation, duplicate detection (Section 9).
- *Inputs:* Raw candidate metadata from Discovery Manager, or explicit `registerModel()`/`updateModel()` calls.
- *Outputs:* `ValidationResult { valid, errors[] }`; valid candidates proceed to the Metadata Manager.
- *Dependencies:* Metadata Schema (Section 7); Model Catalog (for duplicate/conflict checks).
- *Lifecycle:* Invoked synchronously within every registration/update/discovery flow; stateless between invocations.

**Metadata Manager**
- *Purpose:* Own the canonical shape and merge semantics of a model's metadata record.
- *Responsibilities:* Construct the final `ModelMetadata` record, apply merge rules when updating an existing model (Section 10), and hand the finalized record to the Model Catalog for storage.
- *Inputs:* Validated candidate metadata; existing catalog record (if updating).
- *Outputs:* Finalized `ModelMetadata` record.
- *Dependencies:* Model Catalog, Version Manager, Alias Manager.
- *Lifecycle:* Invoked per registration/update; stateless.

**Model Catalog**
- *Purpose:* The authoritative, persistent store of every model's canonical metadata record and its full change history.
- *Responsibilities:* CRUD operations on model records (create/update only through validated flows; no direct external writes); maintains an append-only history per model for auditability (Section 18).
- *Inputs:* Finalized records from Metadata Manager.
- *Outputs:* Current and historical `ModelMetadata` records.
- *Dependencies:* The platform's Database module (via a `ModelCatalogStorePort`, per Hexagonal Architecture — the Database Design Document owns the actual schema/storage engine).
- *Lifecycle:* Long-lived; persists across restarts.

**Capability Manager**
- *Purpose:* Own the structured representation and querying of model capabilities (vision, tool calling, structured output, etc.).
- *Responsibilities:* Normalize capability declarations into a consistent internal representation; support capability-based filtering for Capability Selector queries.
- *Inputs:* Capability fields from a model's metadata.
- *Outputs:* Queryable capability index entries.
- *Dependencies:* Index Manager.
- *Lifecycle:* Updated whenever a model's capability metadata changes.

**Provider Mapping Manager**
- *Purpose:* Maintain the mapping between a canonical model record and the specific provider/plugin that exposes it.
- *Responsibilities:* Track `providerId`/`providerName` association; support "same model, multiple providers" scenarios (e.g., an open model available via both Together AI and Fireworks) as distinct catalog entries linked by model family.
- *Inputs:* `providerId` from discovery.
- *Outputs:* Provider-to-model and model-to-provider lookup indexes.
- *Dependencies:* Index Manager.
- *Lifecycle:* Updated on every discovery/registration cycle.

**Version Manager & Alias Manager**
- *Purpose:* Track semantic versions of a model and resolve friendly aliases to canonical, versioned model IDs.
- *Responsibilities:* Parse/compare model versions; maintain a "latest version" pointer per model family; register/validate/resolve aliases (Section 12).
- *Inputs:* `version` and `aliases` fields from metadata.
- *Outputs:* Version comparison results; alias resolution results.
- *Dependencies:* Model Catalog.
- *Lifecycle:* Updated on every version-bearing registration/update.

**Availability Manager**
- *Purpose:* Track declarative availability metadata (which regions/environments a model is published as available in) — not live health.
- *Responsibilities:* Store and expose `availability`/`supportedRegions` fields; flag models whose declared availability metadata has gone stale beyond a configured threshold.
- *Inputs:* `availability`, `supportedRegions`, `status` fields.
- *Outputs:* Availability query results.
- *Dependencies:* Index Manager.
- *Lifecycle:* Updated on every discovery/refresh cycle.

**Deprecation Manager**
- *Purpose:* Own the deprecation and archival workflow.
- *Responsibilities:* Transition a model's lifecycle status to `DEPRECATED`/`ARCHIVED`, link a `replacementModel` where declared, and enforce that deprecated models remain queryable (for historical/audit purposes) while being excluded from default "active models" queries.
- *Inputs:* Explicit deprecation calls, or discovery signals indicating a model is no longer listed by its provider.
- *Outputs:* Updated lifecycle status; `ModelDeprecated`/`ModelArchived` events.
- *Dependencies:* Model Catalog, Event Emission.
- *Lifecycle:* Triggered by discovery/refresh cycles or administrative action.

**Compatibility Manager**
- *Purpose:* Track compatibility metadata (e.g., minimum platform/API version required to use a given model's features).
- *Responsibilities:* Validate and expose `compatibilityMetadata` for consumers (e.g., Router) that need to filter models by platform compatibility.
- *Inputs:* Compatibility fields from metadata.
- *Outputs:* Compatibility query results.
- *Dependencies:* Index Manager.
- *Lifecycle:* Updated on registration/update.

**Index Manager**
- *Purpose:* Maintain all secondary indexes (by capability, provider, tag, modality, status, region) over the Catalog for O(1)/O(log n) lookup rather than linear scans.
- *Responsibilities:* Incrementally update indexes on every Catalog write; rebuild indexes on startup or on-demand.
- *Inputs:* Catalog write events (internal).
- *Outputs:* Index structures consumed by the Search Engine and direct lookup methods.
- *Dependencies:* Model Catalog.
- *Lifecycle:* Long-lived, incrementally maintained.

**Search Engine**
- *Purpose:* Execute structured and multi-field search queries (Section 11) against the indexes.
- *Responsibilities:* Parse a `ModelSearchQuery`, resolve it against the appropriate indexes, apply filters/sorting, and return matching records.
- *Inputs:* `ModelSearchQuery` from `searchModels()`.
- *Outputs:* Ranked/filtered list of `ModelMetadata` (or summaries).
- *Dependencies:* Index Manager, Metadata Cache.
- *Lifecycle:* Stateless per query; benefits from cache warm-up.

**Metadata Cache**
- *Purpose:* Serve high-frequency reads (single-model lookups, common search queries) without hitting the Catalog's backing store every time.
- *Responsibilities:* Cache individual model records and popular search results; invalidate entries on any write to the underlying record (Section 19).
- *Inputs:* Read requests; Catalog write notifications.
- *Outputs:* Cached `ModelMetadata`/search results.
- *Dependencies:* Model Catalog (as the source of truth on cache miss).
- *Lifecycle:* Ephemeral, in-memory (or a pluggable cache backend), rebuilt as needed.

**Synchronization Manager**
- *Purpose:* Own the scheduling, consistency, and conflict-resolution policy for discovery/refresh cycles.
- *Responsibilities:* Trigger full or incremental synchronization runs, detect and resolve conflicts between newly-discovered metadata and existing catalog records (Section 8), and emit `ProviderSynchronized`/`RegistryRefreshed` events.
- *Inputs:* Configuration (schedule, strategy), Discovery Manager output.
- *Outputs:* Synchronization run results/reports.
- *Dependencies:* Discovery Manager, Model Validator, Metadata Manager, Event Emission.
- *Lifecycle:* Runs periodically (configurable interval) and on-demand.

---

## 6. Model Lifecycle

### 6.1 Lifecycle Stages

```
DISCOVERED ──► VALIDATED ──► REGISTERED ──► INDEXED ──► AVAILABLE ──► UPDATED ──► DEPRECATED ──► ARCHIVED ──► REMOVED
                    │
                    ▼ (invalid)
               VALIDATION_FAILED (terminal for that discovery attempt)
```

### 6.2 Stage Definitions

1. **Discovered** — Discovery Manager retrieves candidate metadata from the Provider Plugin System.
2. **Validated** — Model Validator confirms schema, capability, compatibility, version, and alias correctness, and checks for duplicates/conflicts.
3. **Registered** — Metadata Manager finalizes the record and the Model Catalog persists it.
4. **Indexed** — Index Manager updates all secondary indexes to reflect the new/changed record.
5. **Available** — The model is now queryable via all public interfaces (`getModel()`, `searchModels()`, etc.) with `status: AVAILABLE`.
6. **Updated** — A subsequent discovery/refresh cycle or explicit `updateModel()` call changes the record; merge rules (Section 10) apply, and the record's history is appended.
7. **Deprecated** — Deprecation Manager transitions `status` to `DEPRECATED`, optionally linking a `replacementModel`; the model remains queryable but is excluded from default active-model queries.
8. **Archived** — The model is no longer discoverable from its provider and is moved to a read-only historical state; still queryable explicitly by ID for audit purposes.
9. **Removed** — A rare, explicit administrative action that permanently removes a record (distinct from Archived, which retains history); reserved for erroneous registrations, not normal provider-side model retirement.

### 6.3 Lifecycle Diagram

```
   ┌────────────┐
   │ DISCOVERED  │
   └─────┬──────┘
         │validate
   ┌─────▼──────┐   invalid   ┌─────────────────────┐
   │ VALIDATED   │────────────►│ VALIDATION_FAILED    │ (terminal for this attempt)
   └─────┬──────┘             └─────────────────────┘
         │register
   ┌─────▼──────┐
   │ REGISTERED  │
   └─────┬──────┘
         │index
   ┌─────▼──────┐
   │  INDEXED    │
   └─────┬──────┘
         │
   ┌─────▼──────┐   metadata change (re-discovery/explicit update)
   │ AVAILABLE   │◄────────────────────────────────────┐
   └─────┬──────┘                                       │
         │                                              │
         └──────────────────► ┌────────────┐ ───────────┘
                               │  UPDATED    │
                               └─────┬──────┘
                                     │provider stops listing / explicit deprecation
                               ┌─────▼──────┐
                               │ DEPRECATED  │
                               └─────┬──────┘
                                     │provider fully removes / retention period elapses
                               ┌─────▼──────┐
                               │  ARCHIVED   │
                               └─────┬──────┘
                                     │explicit admin action (rare)
                               ┌─────▼──────┐
                               │  REMOVED    │ (terminal)
                               └────────────┘
```

---

## 7. Metadata Schema

### 7.1 Canonical `ModelMetadata` Record

```
ModelMetadata {
  modelId                    : string   // canonical, globally unique, e.g. "anthropic.claude-sonnet-5"
  displayName                 : string
  providerId                  : string   // references the owning Provider Plugin System pluginId
  providerName                 : string
  modelFamily                 : string   // e.g. "claude", "gpt", "llama"
  version                     : string   // semantic or provider-native version string
  aliases                     : string[]
  description                 : string
  capabilities                : string[] // e.g. ["chat","vision","toolCalling"]
  contextWindow                : integer  // max input tokens
  maximumOutputTokens          : integer
  inputModalities              : string[] // e.g. ["text","image","audio"]
  outputModalities             : string[]
  streamingSupport             : boolean
  visionSupport                : boolean
  embeddingsSupport            : boolean
  toolCallingSupport           : boolean
  structuredOutputSupport      : boolean
  audioSupport                 : boolean
  imageGenerationSupport       : boolean
  reasoningSupport             : boolean
  jsonModeSupport              : boolean
  pricingMetadata              : PricingMetadata
  availability                : enum(AVAILABLE, LIMITED, UNAVAILABLE, UNKNOWN)
  supportedRegions             : string[]
  status                       : enum(DISCOVERED, VALIDATED, REGISTERED, AVAILABLE, DEPRECATED, ARCHIVED, REMOVED)
  tags                         : string[]
  documentation                : string   // URL or reference
  releaseDate                  : ISO-8601 date | null
  deprecationStatus             : DeprecationInfo | null
  replacementModel              : string | null  // modelId of the suggested successor
  customMetadata                : object   // provider/plugin-specific extension fields
  createdAt                    : ISO-8601 datetime
  updatedAt                    : ISO-8601 datetime
}

PricingMetadata {
  currency        : string
  inputPricePerUnit  : number | null
  outputPricePerUnit : number | null
  unit             : string   // e.g. "per 1M tokens"
  publishedAt       : ISO-8601 datetime | null
}

DeprecationInfo {
  deprecatedAt     : ISO-8601 datetime
  reason           : string
  sunsetDate        : ISO-8601 date | null
}
```

### 7.2 Field-by-Field Rationale

| Field | Rationale |
|---|---|
| `modelId` | The single canonical identifier every other module references; globally unique across all providers. |
| `displayName` | Human-readable label for UI/dashboard consumption. |
| `providerId` | Links the record to its owning plugin in the Provider Plugin System, without exposing the SDK itself. |
| `providerName` | Human-readable provider label, denormalized for convenient display without a join. |
| `modelFamily` | Enables grouping related versions/variants (e.g., all "claude" models) for version resolution and UI grouping. |
| `version` | Enables the Version Manager to determine ordering and resolve "latest." |
| `aliases` | Enables friendly-name resolution (Section 12) without consumers needing to know exact versioned IDs. |
| `description` | Human-readable summary for documentation/UI. |
| `capabilities` | The primary field Capability Selector filters on; a coarse list of supported feature names. |
| `contextWindow` | Critical planning input — Router/Provider Manager need this to validate a request fits within model limits. |
| `maximumOutputTokens` | Same rationale as `contextWindow`, for output-side limits. |
| `inputModalities` / `outputModalities` | Enables precise filtering beyond boolean capability flags (e.g., distinguishing which modalities a multimodal model accepts vs. produces). |
| `streamingSupport` | Direct boolean flag Router/Provider Manager check before attempting a streaming call. |
| `visionSupport` / `embeddingsSupport` / `toolCallingSupport` / `structuredOutputSupport` / `audioSupport` / `imageGenerationSupport` / `reasoningSupport` / `jsonModeSupport` | Fine-grained, individually queryable capability flags, mirroring the Provider Plugin System's `ProviderPlugin.supportsCapability()` semantics but centralized here for cross-provider querying without instantiating any plugin. |
| `pricingMetadata` | Stores the provider's *published* pricing figures for Provider Manager to use in its own cost calculations; the Registry never computes actual spend. |
| `availability` | Declarative, provider-published availability state — not a live health signal (that belongs to Provider Manager's health monitoring). |
| `supportedRegions` | Enables region-aware filtering for deployments with regional/data-residency constraints. |
| `status` | The lifecycle state (Section 6), queryable and filterable. |
| `tags` | Free-form classification for flexible querying beyond structured fields (e.g., `"cost-effective"`, `"long-context"`). |
| `documentation` | Reference link for engineers/administrators. |
| `releaseDate` | Supports "newest models" queries and lifecycle auditing. |
| `deprecationStatus` | Structured deprecation detail (reason, sunset date) once a model enters `DEPRECATED`. |
| `replacementModel` | Enables consumers to auto-suggest or auto-migrate to a successor model. |
| `customMetadata` | The designated extension point (Section 21, 23) for provider/plugin-specific fields without modifying the core schema. |
| `createdAt` / `updatedAt` | Standard auditability timestamps, paired with the Catalog's append-only history (Section 18). |

---

## 8. Model Discovery

- **Automatic Discovery:** On a configured schedule (via Synchronization Manager), the Discovery Manager iterates every plugin known to the Provider Plugin System (via `listPlugins()`) and retrieves each plugin's declared/dynamic model list.
- **Manual Registration:** Administrators may explicitly `registerModel()` a record (e.g., for a model not yet reflected in a plugin's manifest), subject to the same validation pipeline as discovered models.
- **Provider Synchronization:** A full synchronization run reconciles the Registry's current catalog against the latest data from every plugin, marking models no longer listed as candidates for deprecation (Section 6).
- **Metadata Refresh:** A targeted operation (`refreshModels()`) that re-fetches and re-validates metadata for a specific provider or model without touching unrelated catalog entries.
- **Incremental Refresh:** The Synchronization Manager compares a freshly-discovered candidate's content hash/`updatedAt` against the existing catalog record and skips re-validation/re-indexing work when nothing has changed, minimizing unnecessary churn.
- **Dynamic Discovery:** For plugins whose `listModels()` queries a live provider endpoint (rather than a static manifest list), discovery naturally reflects newly-added or removed models on the next scheduled/triggered cycle without any Registry code change.
- **Caching Strategy:** Discovery results themselves are not cached beyond the run's duration (freshness matters more than discovery-call performance); it is *read* access to already-registered metadata that is cached (Section 19), not discovery itself.
- **Consistency Strategy:** The Registry favors eventual consistency across a synchronization run — individual model records are validated/updated independently, so a failure validating one candidate never blocks or rolls back the others (Section 9, 15).
- **Conflict Resolution:** When two providers/plugins report models that collide on `modelId` (rare, since IDs are namespaced by provider) or when a re-discovered record disagrees with manually-registered data, the Synchronization Manager applies a configurable precedence policy (default: freshly-discovered provider data wins over stale manual data, but explicit `customMetadata` and manually-set `tags` are preserved via the merge rules in Section 10) and emits a `MetadataUpdated` event documenting the resolution.

---

## 9. Validation

- **Schema Validation:** Every candidate record is checked against the `ModelMetadata` JSON Schema (Section 7) — required fields present, correct types, valid enum values.
- **Metadata Validation:** Cross-field consistency checks (e.g., `maximumOutputTokens` must not exceed `contextWindow`; if `visionSupport` is true, `inputModalities` must include `"image"`).
- **Provider Validation:** Confirms `providerId` references a currently-known, valid plugin in the Provider Plugin System (via a read-only query, never a direct SDK check).
- **Duplicate Detection:** Confirms `modelId` uniqueness; if a duplicate is detected from a different provider, the Provider Mapping Manager links them as related entries under the same `modelFamily` rather than silently overwriting.
- **Capability Validation:** Confirms declared `capabilities` are recognized platform-wide capability identifiers (cross-referenced against a maintained capability taxonomy) and are internally consistent with the boolean support flags.
- **Compatibility Validation:** Confirms any declared `customMetadata`-based compatibility constraints are well-formed and do not conflict with platform-wide model-schema version expectations.
- **Version Validation:** Confirms `version` is well-formed (semantic or recognized provider-native format) so the Version Manager can order it correctly.
- **Alias Validation:** Confirms declared aliases do not collide with another model's `modelId` or existing alias, preventing ambiguous resolution.

---

## 10. Registration

- **Registration:** A new, previously-unseen model passes through the full pipeline (Discover → Validate → Register → Index → Available).
- **Updates:** A re-discovered or explicitly updated record for an existing `modelId` is merged into the existing record (see Metadata Merge below), producing a new `updatedAt` timestamp and a history entry.
- **Metadata Merge:** Default merge policy: fields sourced from provider discovery (capabilities, context window, pricing) are overwritten by the freshest discovered values; fields that are administrator-curated (`tags`, `customMetadata` additions, manually-set `replacementModel`) are preserved unless explicitly overwritten via `updateModel()`. The exact field-level merge policy is configurable per deployment via Configuration Manager.
- **Replacement:** When a model is superseded (e.g., a new version under a new `modelId`), an administrator or an automated rule (based on `modelFamily` + version comparison) may set `replacementModel` on the outgoing record without altering the new record.
- **Removal:** Reserved for explicit, rare administrative correction of erroneous data (Section 6.2); distinct from the normal Deprecated → Archived path.
- **Deprecation:** See Section 6.2 and the Deprecation Manager (Section 5.2).
- **Version Updates:** A new version of an existing model family is registered as a related, distinct catalog entry (its own `modelId`), linked via `modelFamily`, rather than mutating the prior version's record in place — preserving historical accuracy.
- **Synchronization:** See Section 8.

---

## 11. Search & Indexing

### 11.1 Searchable Fields

`modelId`, `providerId`/`providerName`, `capabilities`, `inputModalities`/`outputModalities`, `version`, `tags`, `pricingMetadata` (range queries on price), `availability`, `supportedRegions`, `status`, `customMetadata` (key-value match).

### 11.2 Index Design

The Index Manager maintains one inverted index per structured, filterable field (capability, provider, tag, modality, status, region) mapping field value → set of `modelId`s, plus a primary key index (`modelId` → full record) in the Model Catalog itself. Range-queryable fields (pricing) use a sorted structure (e.g., a B-tree-like ordered index) rather than a plain inverted index.

### 11.3 Lookup Strategy

- Single-field lookups (e.g., "all models with `visionSupport: true`") resolve directly against the relevant inverted index — O(1) index access plus O(k) result-set retrieval.
- Multi-field queries (e.g., "vision-capable models from provider X available in region Y") compute the intersection of the relevant index result-sets before hydrating full records.
- Full-text-style queries against `description`/`displayName`/`tags` use a lightweight tokenized index rather than requiring a full external search engine, appropriate to catalog sizes expected for this domain (hundreds to low thousands of models, not web-scale).

### 11.4 Caching

Popular/recent search queries and individually hot model records are cached by the Metadata Cache (Section 5.2, 19), keyed by a normalized representation of the query parameters; cache entries are invalidated whenever any underlying record they touch is updated (via a registry-internal invalidation event, not the platform Event Bus, to avoid unnecessary cross-module event volume for a purely internal cache concern).

### 11.5 Performance

Index updates are incremental (O(changed fields) per write, not a full rebuild); the Search Engine is stateless and read-only, so read throughput scales horizontally by simply serving reads from replicas of the same in-memory index structures without any coordination overhead (Section 19).

---

## 12. Version Management

- **Semantic Versioning:** Where a provider publishes semantic-version-style model versions, the Version Manager parses and compares them numerically; where a provider uses a native, non-semver scheme (e.g., date-stamped versions like `2026-01-15`), the Version Manager applies a configurable, provider-aware comparison strategy while still exposing a consistent `getLatestModel()` interface to consumers.
- **Aliases:** A model may declare aliases (e.g., `"claude-latest"` resolving to a specific dated `modelId`); the Alias Manager resolves aliases at query time and keeps the resolution up to date as the "latest" pointer moves.
- **Latest Version:** The Version Manager maintains a `modelFamily` → latest-`modelId` pointer, updated whenever a new version is registered and determined (via comparison) to be newer.
- **Historical Versions:** Prior versions remain fully queryable (by their specific `modelId`) even after a newer version becomes "latest" — nothing is overwritten, consistent with the Registration policy (Section 10) of treating new versions as new, linked records.
- **Migration:** When a model family's schema-relevant fields evolve in a way that affects how older records should be interpreted, a migration routine (run once, offline from the request-serving path) can backfill/reshape historical records without altering their historical `modelId`/version identity.
- **Backward Compatibility:** The `ModelMetadata` schema (Section 7) is treated as additive-only for required-field purposes across platform versions — new optional fields may be added; existing fields are never removed or repurposed without a major schema version bump, protecting all existing consumers.
- **Deprecation:** See Section 6, 10.
- **Replacement:** See Section 10.

---

## 13. Public Interfaces

### 13.1 `registerModel(metadata: ModelMetadataInput): Promise<ModelMetadata>`
- **Purpose:** Register a new model or explicitly register metadata outside the automatic discovery cycle.
- **Inputs:** A candidate metadata object (may omit system-managed fields like `createdAt`).
- **Outputs:** The finalized, persisted `ModelMetadata` record.
- **Validation:** Full validation pipeline (Section 9).
- **Errors:** `ModelValidationError`, `DuplicateModelError` (if not resolvable via the merge/linking policy).

### 13.2 `updateModel(modelId: string, updates: Partial<ModelMetadataInput>): Promise<ModelMetadata>`
- **Purpose:** Apply an explicit update to an existing model record.
- **Inputs:** `modelId`, partial metadata fields to change.
- **Outputs:** The updated `ModelMetadata` record.
- **Validation:** Full validation pipeline against the merged result.
- **Errors:** `ModelNotFoundError`, `ModelValidationError`.

### 13.3 `removeModel(modelId: string): Promise<void>`
- **Purpose:** Permanently remove an erroneous record (Section 6.2, 10).
- **Inputs:** `modelId`.
- **Outputs:** Resolves on completion.
- **Validation:** Must exist.
- **Errors:** `ModelNotFoundError`.

### 13.4 `discoverModels(providerId?: string): Promise<DiscoveryRunResult>`
- **Purpose:** Trigger a discovery run (all providers, or a single provider if specified).
- **Inputs:** Optional `providerId`.
- **Outputs:** `DiscoveryRunResult { discovered, registered, updated, failed }`.
- **Validation/Errors:** `ProviderNotFoundError` if an invalid `providerId` is given.

### 13.5 `refreshModels(modelId?: string): Promise<RefreshRunResult>`
- **Purpose:** Targeted re-validation/re-registration of one model or the full catalog.
- **Inputs:** Optional `modelId`.
- **Outputs:** `RefreshRunResult`.
- **Validation/Errors:** `ModelNotFoundError` if a specific, unknown `modelId` is given.

### 13.6 `validateModel(metadata: ModelMetadataInput): ValidationResult`
- **Purpose:** Pre-flight validation without persisting — useful for admin tooling or plugin authors checking manifest-declared model metadata ahead of time.
- **Inputs:** Candidate metadata.
- **Outputs:** `ValidationResult { valid, errors[] }`.
- **Validation/Errors:** Never throws; always returns a structured result.

### 13.7 `listModels(filter?: ModelFilter): ModelMetadata[]`
- **Purpose:** Retrieve models matching optional structured filters (status, provider, capability, etc.).
- **Inputs:** Optional `ModelFilter`.
- **Outputs:** Array of matching records.
- **Validation/Errors:** None; empty array on no matches.

### 13.8 `getModel(modelId: string): ModelMetadata | null`
- **Purpose:** Retrieve a single model by canonical ID (or resolvable alias).
- **Inputs:** `modelId` or alias.
- **Outputs:** The record, or `null` if not found.
- **Validation/Errors:** Never throws for a missing model.

### 13.9 `searchModels(query: ModelSearchQuery): ModelMetadata[]`
- **Purpose:** Execute a structured multi-field search (Section 11).
- **Inputs:** `ModelSearchQuery` (any combination of searchable fields, Section 11.1).
- **Outputs:** Ranked/filtered array of matching records.
- **Validation/Errors:** `InvalidSearchQueryError` for malformed query structure.

### 13.10 `getModelsByProvider(providerId: string): ModelMetadata[]`
- **Purpose:** Convenience accessor equivalent to `listModels({ providerId })`.
- **Inputs:** `providerId`.
- **Outputs:** Array of matching records (empty if none).

### 13.11 `getModelsByCapability(capability: string): ModelMetadata[]`
- **Purpose:** Convenience accessor equivalent to `listModels({ capability })`, the primary method Capability Selector uses.
- **Inputs:** Capability identifier.
- **Outputs:** Array of matching records.

### 13.12 `getLatestModel(modelFamily: string): ModelMetadata | null`
- **Purpose:** Resolve the current "latest" version within a model family.
- **Inputs:** `modelFamily`.
- **Outputs:** The latest record, or `null` if the family is unknown.
- **Validation/Errors:** Never throws for an unknown family.

---

## 14. Events

All events publish via the Event Bus under a `Model Registry` event category.

**ModelDiscovered**
- Publisher: Discovery Manager
- Subscribers: Logger, Dashboard Backend
- Payload: `{ modelId, providerId, discoveredAt }`
- Trigger: A candidate model is found during discovery.
- Retry Behaviour: None (notification-only).

**ModelValidated**
- Publisher: Model Validator
- Subscribers: Logger, Dashboard Backend
- Payload: `{ modelId, validationSummary }`
- Trigger: A candidate passes validation.
- Retry Behaviour: None.

**ModelRegistered**
- Publisher: Model Catalog
- Subscribers: Provider Manager, Capability Selector, Router, Dashboard Backend, Logger
- Payload: `{ modelId, providerId, capabilities, version }`
- Trigger: A new model is persisted for the first time.
- Retry Behaviour: Standard (3 attempts) — downstream consumers must reliably learn of new models.

**ModelUpdated**
- Publisher: Metadata Manager
- Subscribers: Provider Manager, Capability Selector, Router, Dashboard Backend, Logger
- Payload: `{ modelId, changedFields }`
- Trigger: An existing model's metadata changes.
- Retry Behaviour: Standard.

**ModelRemoved**
- Publisher: Model Catalog
- Subscribers: Provider Manager, Capability Selector, Router, Dashboard Backend, Logger
- Payload: `{ modelId, reason }`
- Trigger: Explicit `removeModel()` call.
- Retry Behaviour: Standard, high priority (downstream consumers must stop referencing this ID).

**ModelDeprecated**
- Publisher: Deprecation Manager
- Subscribers: Provider Manager, Router, Dashboard Backend, Logger
- Payload: `{ modelId, deprecationInfo, replacementModel }`
- Trigger: A model transitions to `DEPRECATED`.
- Retry Behaviour: Standard.

**ModelArchived**
- Publisher: Deprecation Manager
- Subscribers: Dashboard Backend, Logger
- Payload: `{ modelId, archivedAt }`
- Trigger: A deprecated model transitions to `ARCHIVED`.
- Retry Behaviour: Standard.

**MetadataUpdated**
- Publisher: Synchronization Manager
- Subscribers: Dashboard Backend, Logger
- Payload: `{ modelId, resolutionPolicy, conflictDetails }`
- Trigger: A conflict-resolution merge occurs during synchronization (Section 8).
- Retry Behaviour: None (informational).

**ProviderSynchronized**
- Publisher: Synchronization Manager
- Subscribers: Dashboard Backend, Logger
- Payload: `{ providerId, discovered, registered, updated, failed, durationMs }`
- Trigger: A per-provider synchronization run completes.
- Retry Behaviour: None.

**RegistryRefreshed**
- Publisher: Synchronization Manager
- Subscribers: Dashboard Backend, Logger
- Payload: `{ totalModels, discovered, registered, updated, deprecated, failed, durationMs }`
- Trigger: A full catalog refresh cycle completes.
- Retry Behaviour: None.

**VersionUpdated**
- Publisher: Version Manager
- Subscribers: Router, Dashboard Backend, Logger
- Payload: `{ modelFamily, previousLatest, newLatest }`
- Trigger: The "latest version" pointer for a model family changes.
- Retry Behaviour: Standard.

**AliasAdded / AliasRemoved**
- Publisher: Alias Manager
- Subscribers: Dashboard Backend, Logger
- Payload: `{ modelId, alias }`
- Trigger: An alias is registered/removed for a model.
- Retry Behaviour: None.

---

## 15. Error Handling

| Failure Mode | Handling Strategy |
|---|---|
| Duplicate Models | Resolved via the Provider Mapping Manager's family-linking policy (Section 9); a true unresolved collision (identical `modelId` from conflicting sources) raises `DuplicateModelError`, surfaced to administrators rather than silently overwritten. |
| Metadata Conflict | Handled by the Synchronization Manager's configurable precedence policy (Section 8); always emits `MetadataUpdated` documenting the resolution, never a silent overwrite. |
| Schema Failure | Rejected at Schema Validation (Section 9); candidate never reaches the Catalog; failure logged with the specific schema violation. |
| Provider Sync Failure | A failure to reach the Provider Plugin System for one plugin's model list does not halt synchronization for other plugins (Section 8 consistency strategy); the specific provider's failure is recorded in the `ProviderSynchronized` event and retried on the next scheduled cycle. |
| Validation Failure | See Schema/Metadata/Capability/Compatibility/Version/Alias Validation (Section 9); each failure type is distinctly logged for diagnosis. |
| Missing Metadata | Required-field absence is a Schema Failure; optional-field absence is accepted and stored as `null`/empty per the schema's optionality rules. |
| Version Conflict | Handled by the Version Manager's comparison strategy; an unparseable/ambiguous version string is flagged via Version Validation rather than guessed at. |
| Discovery Failure | Isolated per-provider (see Provider Sync Failure above); the overall discovery run reports partial success rather than failing wholesale. |
| Cache Failure | The Metadata Cache is strictly a performance optimization; any cache read/write failure transparently falls through to the Model Catalog as the source of truth, never surfaced as a user-facing error. |
| Index Failure | An index update failure triggers an automatic incremental re-index of the affected record; a full Index Manager rebuild is available as an administrative recovery action if incremental repair is insufficient. |
| Recovery Strategy | Every failure category above is designed to be non-blocking to the rest of the catalog (eventual consistency, Section 8) and fully diagnosable via structured logs/events — no failure is silent. |

---

## 16. Logging

- **Discovery Logs:** Per-provider discovery run start/end, candidate counts, and failures.
- **Synchronization Logs:** Full-run summaries (discovered/registered/updated/deprecated/failed counts, duration).
- **Validation Logs:** Per-candidate validation outcome, with specific rule violations on failure.
- **Registration Logs:** Every successful registration/update, with a diff of changed fields.
- **Update Logs:** Explicit `updateModel()` calls, including actor/source (discovery vs. administrative).
- **Search Logs:** Query patterns and result-set sizes, at a sampled rate for performance analysis (not full verbose logging of every search by default).
- **Audit Logs:** Every mutating operation (register/update/remove/deprecate/archive), with timestamp and source, feeding the Immutable Metadata History (Section 18).

All logs are emitted as `LoggingEvents`-category events via the Event Bus, per the platform's established logging convention, and carry `correlationId`/`traceId` where applicable (e.g., a synchronization run's `correlationId` ties together all per-model events within that run).

---

## 17. Monitoring

| Metric | Description |
|---|---|
| Registry Size | Total number of records in the Catalog, by status. |
| Model Count | Count of `AVAILABLE` models, broken down by provider/capability. |
| Provider Coverage | Number of distinct providers represented in the catalog vs. number of registered plugins in the Provider Plugin System (surfacing providers with zero discovered models). |
| Synchronization Status | Timestamp and outcome of the last synchronization run, per provider and overall. |
| Validation Failures | Rate and category breakdown of validation failures over time. |
| Metadata Quality | Heuristic completeness score (e.g., percentage of records with non-null `pricingMetadata`, `documentation`, `releaseDate`) surfaced for administrative attention. |
| Cache Performance | Hit/miss ratio and latency of the Metadata Cache. |
| Search Performance | Query latency distribution (p50/p95/p99) and result-set size distribution. |
| Registry Health | Aggregate health status exposed via a `healthCheck()`-style interface, considering synchronization staleness, validation failure rate, and index consistency. |

---

## 18. Security

- **Metadata Integrity:** Every write to the Catalog goes through the full validation pipeline (Section 9); no direct/unvalidated writes are possible through any public interface.
- **Registry Integrity:** The Catalog is the single source of truth; consumers (Provider Manager, Router, Capability Selector) are read-only by contract (Section 4.3) — enforced at the interface level (no write methods are exposed to those consumers) and by the deployment's access-control configuration.
- **Access Control:** Mutating operations (`registerModel`, `updateModel`, `removeModel`) may be restricted to specific trusted callers (Discovery Manager internally, and authorized administrative tooling) via the platform's standard authorization mechanism (owned by the platform's security infrastructure, consumed here rather than reimplemented).
- **Auditability:** Every mutating operation is logged (Section 16) with actor and timestamp, and recorded in the Catalog's append-only history.
- **Tamper Detection:** Because history entries are append-only and never edited in place, any unexpected mutation of historical records is detectable by history-integrity checks (e.g., periodic hash-chain verification, if configured).
- **Immutable Metadata History:** The Model Catalog retains every prior version of a record's metadata (not just the current state), enabling full point-in-time reconstruction of what any model's metadata looked like at any past moment — critical for audit and for diagnosing "why did routing behave differently last week."

---

## 19. Performance

- **Metadata Cache:** Hot single-model lookups and common search queries are served from an in-memory cache (Section 5.2, 11.4), with invalidation tied to the specific records changed rather than a blanket cache-clear on any write.
- **Search Index:** Maintained incrementally (Section 11.2, 11.5), never requiring a full catalog scan per query.
- **Lazy Loading:** Full model records (including verbose fields like `description`, `documentation`) may be lazily hydrated for list/summary views, with lightweight summary projections used for high-volume queries (e.g., `listPlugins()`-style capability filtering) to minimize payload size.
- **Incremental Updates:** Both discovery/synchronization (Section 8) and indexing (Section 11.5) are incremental by design, avoiding unnecessary full-catalog recomputation.
- **Parallel Synchronization:** Discovery across multiple providers/plugins is executed concurrently (bounded by a worker pool), since each provider's discovery is fully independent.
- **Fast Lookup:** Primary key (`modelId`) and alias lookups are O(1) via direct index access.
- **Memory Optimization:** Index structures store `modelId` references rather than duplicating full records; only the Metadata Cache and Model Catalog hold full record bodies.

---

## 20. Interaction With Other Modules

### 20.1 Provider Plugin System (Discovery)

```
Synchronization Manager    Discovery Manager        Provider Plugin System
        │  triggerSync()          │                            │
        │─────────────────────────►│                            │
        │                          │  listPlugins()               │
        │                          │───────────────────────────►│
        │                          │◄───────────────────────────│ (plugin summaries)
        │                          │  for each plugin: listModels()/manifest query
        │                          │───────────────────────────►│
        │                          │◄───────────────────────────│ (raw model candidates)
        │◄─────────────────────────│ (candidates)
```

### 20.2 Provider Manager (Read-Only Consumption)

```
Provider Manager        Model Registry
      │  getModel(modelId)  │
      │─────────────────────►│
      │◄─────────────────────│ (ModelMetadata incl. pricingMetadata, limits)
      │ (Provider Manager performs its own cost calculation and execution using this data)
```

### 20.3 Capability Selector

```
Capability Selector        Model Registry
        │  getModelsByCapability("vision")  │
        │───────────────────────────────────►│
        │◄───────────────────────────────────│ (candidate models)
        │ (Capability Selector applies its own selection logic — out of scope here)
```

### 20.4 Router

```
Router              Model Registry
   │  searchModels({availability:"AVAILABLE", region:"us-east"})  │
   │───────────────────────────────────────────────────────────►│
   │◄───────────────────────────────────────────────────────────│ (filtered candidates)
```

### 20.5 Configuration Manager

```
Configuration Manager      Event Bus          Model Registry
       │ publish(ConfigurationReloaded) │                  │
       │────────────────────────────────►│                  │
       │                                  │ dispatch          │
       │                                  │─────────────────►│
       │                                  │                  │ Synchronization Manager
       │                                  │                  │ re-reads schedule/cache/
       │                                  │                  │ validation-strictness config
```

### 20.6 Dashboard Backend

```
Dashboard Backend        Model Registry
       │  listModels({status:"DEPRECATED"})  │
       │─────────────────────────────────────►│
       │◄─────────────────────────────────────│ (records for display)
```

### 20.7 Event Bus

All events in Section 14 flow exclusively through the Event Bus; the Model Registry never calls any consuming module directly, including for the ModelRegistered/ModelUpdated notifications Provider Manager/Router/Capability Selector rely on.

### 20.8 Logger

Structured logs (Section 16) are emitted as `LoggingEvents`-category events consumed by the Logger module for persistence/indexing, consistent with platform-wide convention.

---

## 21. Folder Structure

```
model-registry/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── ModelMetadata.ts          # Canonical record (Section 7)
│   │   │   ├── PricingMetadata.ts
│   │   │   └── DeprecationInfo.ts
│   │   ├── value-objects/
│   │   │   ├── ModelId.ts
│   │   │   ├── SemanticVersion.ts
│   │   │   ├── ModelStatus.ts            # Lifecycle state enum (Section 6)
│   │   │   └── CapabilitySet.ts
│   │   ├── services/
│   │   │   ├── MetadataMerger.ts         # Merge rules (Section 10)
│   │   │   ├── VersionComparator.ts
│   │   │   └── ConflictResolver.ts       # Section 8
│   │   └── ports/
│   │       ├── ModelCatalogStorePort.ts   # Persistence contract (Database module)
│   │       ├── ProviderPluginSystemPort.ts # Read-only discovery contract
│   │       ├── EventPublisherPort.ts
│   │       └── CachePort.ts
│   │
│   ├── application/
│   │   ├── RegisterModelUseCase.ts
│   │   ├── UpdateModelUseCase.ts
│   │   ├── RemoveModelUseCase.ts
│   │   ├── DiscoverModelsUseCase.ts
│   │   ├── RefreshModelsUseCase.ts
│   │   ├── ValidateModelUseCase.ts
│   │   ├── ListModelsUseCase.ts
│   │   ├── GetModelUseCase.ts
│   │   ├── SearchModelsUseCase.ts
│   │   ├── GetModelsByProviderUseCase.ts
│   │   ├── GetModelsByCapabilityUseCase.ts
│   │   └── GetLatestModelUseCase.ts
│   │
│   ├── infrastructure/
│   │   ├── discovery/
│   │   │   └── PluginSystemDiscoveryAdapter.ts  # Implements ProviderPluginSystemPort
│   │   ├── persistence/
│   │   │   └── ModelCatalogStoreAdapter.ts       # Implements ModelCatalogStorePort
│   │   ├── cache/
│   │   │   └── InMemoryMetadataCache.ts
│   │   ├── events/
│   │   │   └── EventBusPublisherAdapter.ts
│   │   └── indexing/
│   │       ├── InvertedIndexStore.ts
│   │       └── RangeIndexStore.ts               # For pricing/date range queries
│   │
│   ├── validation/
│   │   ├── SchemaValidator.ts
│   │   ├── MetadataConsistencyValidator.ts
│   │   ├── ProviderValidator.ts
│   │   ├── DuplicateDetector.ts
│   │   ├── CapabilityValidator.ts
│   │   ├── CompatibilityValidator.ts
│   │   ├── VersionValidator.ts
│   │   └── AliasValidator.ts
│   │
│   ├── managers/
│   │   ├── CapabilityManager.ts
│   │   ├── ProviderMappingManager.ts
│   │   ├── VersionManager.ts
│   │   ├── AliasManager.ts
│   │   ├── AvailabilityManager.ts
│   │   ├── DeprecationManager.ts
│   │   └── CompatibilityManager.ts
│   │
│   ├── search/
│   │   ├── SearchEngine.ts
│   │   └── IndexManager.ts
│   │
│   ├── synchronization/
│   │   └── SynchronizationManager.ts
│   │
│   ├── errors/
│   │   ├── ModelValidationError.ts
│   │   ├── DuplicateModelError.ts
│   │   ├── ModelNotFoundError.ts
│   │   ├── ProviderNotFoundError.ts
│   │   └── InvalidSearchQueryError.ts
│   │
│   └── facade/
│       └── ModelRegistryFacade.ts        # The single public entry point (Section 13)
│
├── schemas/
│   └── model-metadata-schema.json        # Versioned JSON Schema for ModelMetadata (Section 7)
│
├── config/
│   └── model-registry.config.ts          # Sync schedule, cache TTLs, validation strictness, merge policy
│
├── tests/
│   ├── unit/
│   ├── validation/
│   ├── synchronization/
│   ├── search/
│   ├── performance/
│   ├── stress/
│   ├── regression/
│   └── mock-providers/
│       └── MockProviderPluginSystem.ts   # Simulated discovery source for tests
│
└── docs/
    └── MDD.md                             # This document
```

### 21.1 Folder Responsibility Summary

- `domain/` — Framework-agnostic core: the `ModelMetadata` entity, value objects, merge/comparison/conflict-resolution logic, and ports; zero I/O.
- `application/` — Use-case orchestration for each public operation (Section 13).
- `infrastructure/` — Concrete adapters: discovery (talking only to the Provider Plugin System port), persistence, caching, event publishing, and index storage.
- `validation/` — The full validation pipeline (Section 9), one focused validator per concern.
- `managers/` — The domain-specific managers described in Section 5.2 (capability, provider mapping, version, alias, availability, deprecation, compatibility).
- `search/` — Search execution and index maintenance (Section 11).
- `synchronization/` — Discovery/refresh scheduling and conflict resolution (Section 8).
- `errors/` — Typed error hierarchy referenced throughout Section 15.
- `facade/` — The only file other modules are permitted to import directly.
- `schemas/` — The versioned metadata schema — the actual contract artifact referenced throughout this document.
- `config/` — All tunable parameters — never hardcoded in domain logic.
- `tests/` — Mirrors the testing strategy in Section 22, including a mock discovery source to avoid any dependency on real provider plugins during testing.

---

## 22. Testing Strategy

| Test Type | Focus |
|---|---|
| Unit Tests | Domain logic in isolation: schema validation rules, version comparison, merge-rule application, conflict resolution — all against injected fakes for every port. |
| Integration Tests | Full facade-level flows: discover → validate → register → index → available, and update/deprecate/archive paths, using real in-memory infrastructure adapters and the Mock Provider Plugin System. |
| Validation Tests | Exhaustive coverage of every validation rule in Section 9, including boundary and malformed-input cases for each field in the schema. |
| Synchronization Tests | Multi-provider discovery runs with simulated partial failures, verifying isolated per-provider failure handling (Section 15) and correct incremental-refresh behavior. |
| Search Tests | Correctness of single- and multi-field queries against the index, including edge cases (empty results, wildcard-like tag matches, price range queries). |
| Performance Tests | Discovery/synchronization throughput across large simulated catalogs; search/lookup latency under realistic index sizes. |
| Stress Tests | Behavior under a very large number of models/providers, and under rapid concurrent registration/update calls. |
| Regression Tests | Fixed metadata fixtures representing previously-fixed bugs (e.g., a merge-policy edge case) permanently retained in the suite. |
| Mock Provider Tests | All tests exercising discovery use the `MockProviderPluginSystem`, never a real provider plugin, ensuring the Model Registry's test suite has zero dependency on live external providers. |

---

## 23. Future Expansion

Every extension below is achievable **without modifying the `ModelMetadata` schema's required fields (Section 7), the public Facade contract (Section 13), or existing source code**:

- **Fine-Tuned Models:** Represented as standard catalog entries with `modelFamily` linking to their base model and fine-tuning details captured in `customMetadata`.
- **Private Models:** Supported via `availability`/`supportedRegions` scoping and access-control configuration (Section 18), with no schema change required.
- **Marketplace Models:** A new discovery source feeding the same `ProviderPluginSystemPort`-mediated discovery pipeline (mirroring the Provider Plugin System's own marketplace extension point).
- **Enterprise Models:** Organization-scoped catalog partitions, layered on top of the existing `customMetadata` and access-control extension points.
- **Hosted Models:** Self-hosted/local models are already fully supported today via the existing `providerType`-aware discovery from the Provider Plugin System; no change needed.
- **Dynamic Metadata:** A model whose metadata legitimately changes over time (e.g., an evolving fine-tune) is handled by the existing Update/refresh pipeline (Sections 8, 10) at a higher refresh frequency, not a new mechanism.
- **Federated Registries:** A future `RegistrySynchronizationPort` allowing one Model Registry instance to pull/push records from a peer registry, reusing the existing conflict-resolution machinery (Section 8).
- **Multi-Cluster Registries:** Enabled by the same persistence-port abstraction (`ModelCatalogStorePort`) pointing at a distributed backing store, without changing any domain logic.
- **Plugin-Based Metadata Extensions:** The `customMetadata` field, combined with a plugin-declared sub-schema (validated by a pluggable extension to the Schema Validator), allows specialized provider plugins to contribute additional structured fields without altering the core `ModelMetadata` schema.

---

## 24. Risks

| Risk Category | Risk | Mitigation |
|---|---|---|
| Architecture | A consuming module bypasses the read-only contract and attempts to mutate registry state directly | Mutating interfaces are not exposed to read-only consumers at the interface level; access control (Section 18) enforces this at the platform boundary. |
| Consistency | Concurrent discovery/update operations produce a race condition in the Catalog | Per-record validation and merge operations are designed to be atomic at the individual-record level (Section 8, 10); the eventual-consistency model tolerates transient staleness rather than requiring global locks. |
| Performance | Large catalogs (many providers × many models × many versions) slow search/lookup | Incremental indexing and caching (Sections 11, 19) keep lookup cost independent of full catalog size for the common query patterns. |
| Scalability | A single-process Registry becomes a bottleneck as the platform and provider count grow | The persistence and cache ports (Section 21 folder structure) are designed as swappable adapters, enabling a move to distributed storage/caching without domain-logic changes. |
| Maintenance | Schema drift as new capabilities/modalities are introduced by providers over time | The schema is additive-only by policy (Section 12); `customMetadata` absorbs provider-specific novelty without forcing premature core-schema changes. |
| Consistency | Conflicting metadata from multiple providers for logically-the-same underlying model | Provider Mapping Manager's family-linking approach (Section 9) keeps such models as distinct, linked records rather than forcing an unsafe merge. |

---

## 25. Design Decisions

| Decision | Rationale | Trade-off / Alternatives Considered |
|---|---|---|
| Discovery only via the Provider Plugin System, never direct provider SDK access | Preserves the platform's Open/Closed boundary established by the Provider Plugin System MDD; the Registry remains provider-agnostic by construction | The Registry's data freshness is bounded by whatever `listModels()`/manifest data each plugin chooses to expose; acceptable since plugins are the platform's designated source of truth for provider capabilities |
| New model versions are new, linked catalog records rather than in-place mutations | Preserves full historical accuracy and auditability (Section 18); avoids ambiguity about "what did this model look like when a past request used it" | Slightly increases catalog size over time versus in-place version overwriting; mitigated by the Archived lifecycle stage and standard data-retention policies |
| Pricing metadata stored, but cost calculation explicitly excluded | Keeps a hard boundary between "what a provider publishes" (metadata, static) and "what a request actually cost" (computed, dynamic, usage-dependent) — a deliberate architectural requirement | Consumers needing actual cost must always combine Registry pricing metadata with Provider Manager's usage data themselves; acceptable since this composition is exactly Provider Manager's designated responsibility |
| Eventual consistency across synchronization runs (no global transaction) | Keeps individual provider/model failures isolated (Section 8, 15) and avoids a slow/failing provider blocking the entire catalog's freshness | Consumers may transiently see a partially-synchronized catalog during a run; acceptable given the non-execution-path nature of Registry reads (a brief staleness window does not break any in-flight AI call) |
| `customMetadata` as the sole schema-extension mechanism (versus provider-specific subtype schemas) | Keeps one uniform `ModelMetadata` shape across all consumers, avoiding type-branching logic in Router/Capability Selector/Provider Manager | Extension fields inside `customMetadata` are less strongly typed for consumers than first-class schema fields; acceptable since truly cross-cutting fields graduate into the core schema over time via normal schema evolution (Section 12) |

---

## 26. Diagrams

### 26.1 Component Diagram
See Section 5.1.

### 26.2 Module Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Model Registry                            │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐          │
│  │ Discovery │ │ Validator │ │  Catalog  │ │  Search   │          │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘          │
│      pure metadata service — no execution, no SDKs, no selection   │
└───────────────────────┬───────────────────────────┬───────────────┘
                         │ discovers via              │ read by
              ┌───────────▼───────────┐    ┌───────────▼──────────────┐
              │ Provider Plugin System  │    │ Provider Mgr / Router /   │
              │                          │    │ Capability Selector       │
              └─────────────────────────┘    └───────────────────────┘
```

### 26.3 Model Lifecycle Diagram
See Section 6.3.

### 26.4 Registration Flow

```
Candidate Metadata → Schema Validation → Metadata/Capability/Compatibility/Version/Alias Validation
        │ pass                                                    │ fail
        ▼                                                         ▼
Duplicate Detection ──linked as family──► Provider Mapping   ModelValidationError (logged, event emitted)
        │ unique/resolved
        ▼
Metadata Manager (merge if update) → Model Catalog write → Index Manager update → ModelRegistered/ModelUpdated event
```

### 26.5 Discovery Flow

```
Synchronization Manager (scheduled or triggered)
        │
        ▼
Discovery Manager → for each plugin: Provider Plugin System.listModels()
        │
        ▼
Candidate Stream → Registration Flow (per candidate, isolated failure handling)
        │
        ▼
ProviderSynchronized event (per provider) → RegistryRefreshed event (full run summary)
```

### 26.6 Synchronization Flow

```
Full Catalog Snapshot ──compare──► Freshly Discovered Candidates
        │                                    │
        ▼                                    ▼
Models missing from fresh data      New/changed models
        │                                    │
        ▼                                    ▼
Deprecation Manager (candidate for   Registration Flow (register/update)
DEPRECATED transition)
```

### 26.7 Search Flow

```
ModelSearchQuery → Query Parser → Index Manager (resolve per-field index sets) → Intersect result sets
        │
        ▼
Metadata Cache check (hit → return) ── miss ──► Hydrate full records from Model Catalog → Cache store → Return
```

### 26.8 Sequence Diagram
See Section 20.1–20.8.

### 26.9 Folder Structure Diagram
See Section 21.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| Catalog | The authoritative, persistent store of all `ModelMetadata` records. |
| Model Family | A grouping of related model versions/variants under one lineage (e.g., all Claude models). |
| Pricing Metadata | Provider-published price figures stored for reference; not a computed cost. |
| Availability (declarative) | A provider-published state, distinct from Provider Manager's live health monitoring. |
| Conflict Resolution | The Synchronization Manager's policy for reconciling disagreeing metadata from repeated discovery or multiple sources. |

---

## Architectural Constraints

The following architectural constraints are mandatory and immutable. They define the boundary of the Model Registry and ensure that it remains a pure metadata authority rather than a runtime execution component.

- Model Registry never executes AI models.
- Model Registry never communicates directly with provider SDKs.
- Model Registry never selects providers.
- Model Registry never performs routing.
- Model Registry never performs planning.
- Model Registry never performs inference.
- Model Registry never performs retries.
- Model Registry never performs fallback.
- Model Registry never monitors provider health.
- Model Registry never calculates execution cost.
- Model Registry never owns provider credentials.
- Model Registry never modifies Provider Plugin data directly.
- All discovery occurs exclusively through the Provider Plugin System.
- All consumers access metadata through the Registry interface.

These rules are not implementation preferences; they are architectural guarantees that preserve the separation of concerns between metadata governance, execution, and routing.

## Architectural Decision Records (ADR)

The following ADRs capture the enduring architectural decisions that govern the Model Registry. Each record is intended to remain stable unless a major platform-level architecture revision is explicitly approved.

### ADR-001 Canonical Model Registry
- **Decision:** The Model Registry is the single canonical repository of model metadata for the platform.
- **Context:** Multiple modules require consistent, provider-agnostic model facts, and direct provider inspection would introduce drift and duplication.
- **Alternatives Considered:** Per-provider metadata stores, distributed local caches, and in-module metadata duplication.
- **Rationale:** A single authoritative catalog minimizes inconsistency, simplifies governance, and keeps model facts consistent across Capability Selector, Router, and Provider Manager.
- **Consequences:** Consumers must depend on the Registry interface, and the Registry must remain metadata-focused.

### ADR-002 Provider-Agnostic Metadata
- **Decision:** Metadata is stored and exposed in a provider-agnostic form.
- **Context:** The platform must reason about capabilities and limits independent of organic provider-specific implementation details.
- **Alternatives Considered:** Provider-specific schema adaptation and direct provider object exposure.
- **Rationale:** Provider neutrality preserves long-term portability and prevents coupling to a single vendor SDK or plugin structure.
- **Consequences:** Providers contribute data through the plugin abstraction, while the Registry normalizes and preserves the platform view.

### ADR-003 Metadata-Only Service
- **Decision:** The Registry exists solely to manage metadata and lifecycle information.
- **Context:** The platform requires a stable source of model facts without coupling metadata services to execution semantics.
- **Alternatives Considered:** A service that also executes, routes, or monitors providers.
- **Rationale:** Separating metadata from runtime behavior improves clarity, ownership, and operational safety.
- **Consequences:** Runtime concerns remain with Provider Manager, Capability Selector, and Router.

### ADR-004 Manifest-Based Discovery
- **Decision:** Discovery is performed exclusively through Provider Plugin System manifests and model-listing abstractions.
- **Context:** Provider-specific discovery mechanisms are intentionally abstracted to preserve platform boundaries.
- **Alternatives Considered:** Direct SDK calls, ad hoc provider polling, and embedded provider logic inside the Registry.
- **Rationale:** Manifest-based discovery keeps the Registry compliant with the plugin architecture and avoids provider-specific implementation leakage.
- **Consequences:** Discovery freshness depends on the Provider Plugin System's published data model.

### ADR-005 Read-Optimized Architecture
- **Decision:** The Registry is optimized for read-heavy access patterns and stable consumer queries.
- **Context:** Consumers frequently request model facts for planning, selection, and routing decisions.
- **Alternatives Considered:** Write-heavy transactional data stores and runtime query execution against provider APIs.
- **Rationale:** Read-optimized access improves latency, predictability, and consistency for downstream consumers.
- **Consequences:** The Registry emphasizes indexed lookups, caching, and deterministic metadata retrieval.

### ADR-006 Event-Driven Synchronization
- **Decision:** Metadata refresh and catalog changes are driven by synchronization events and structured update notifications.
- **Context:** Catalog maintenance must be observable, incremental, and resilient to partial failures.
- **Alternatives Considered:** Polling-only updates and synchronous direct writes from providers.
- **Rationale:** Event-driven synchronization makes progress observable and keeps updates decoupled from direct provider coupling.
- **Consequences:** The Registry emits structured events and remains consistent with the platform event model.

### ADR-007 Versioned Metadata
- **Decision:** Every model metadata record is versioned and historical.
- **Context:** Models change over time, and the platform must preserve the history of prior metadata states.
- **Alternatives Considered:** Overwriting records in place and retaining only the latest state.
- **Rationale:** Versioned metadata protects auditability and supports historical reasoning.
- **Consequences:** The Registry maintains version lineage and historical records rather than replacing them silently.

### ADR-008 Incremental Synchronization
- **Decision:** Synchronization is incremental rather than full-catalog reloads whenever possible.
- **Context:** Large catalogs and repeated discovery cycles require efficient refresh behavior.
- **Alternatives Considered:** Full catalog rebuilds on every cycle and unconditional revalidation of all models.
- **Rationale:** Incremental updates reduce operational overhead and keep catalog maintenance efficient.
- **Consequences:** The Registry relies on change detection, targeted updates, and controlled revalidation.

### ADR-009 Append-Only History
- **Decision:** Metadata history is append-only and never rewritten in place.
- **Context:** The platform needs a reliable audit trail of metadata evolution.
- **Alternatives Considered:** Mutable history tables and snapshot-only retention.
- **Rationale:** Append-only history enables tamper detection, audit, and point-in-time reconstruction.
- **Consequences:** Historical records remain durable and queryable even after subsequent changes.

### ADR-010 Extensible Metadata Schema
- **Decision:** The metadata schema remains extensible through controlled extension points.
- **Context:** Providers may expose additional capabilities or attributes beyond the core canonical fields.
- **Alternatives Considered:** Hard-coding every possible provider-specific field into the core schema.
- **Rationale:** Controlled extensibility preserves compatibility while supporting future platform evolution.
- **Consequences:** The Registry uses structured extension mechanisms rather than frequent schema rewrites.

## Metadata Versioning Policy

The Model Registry applies a formal metadata versioning policy to preserve consistency, compatibility, and long-term maintainability.

- **Schema Versioning:** The canonical schema is versioned independently of individual catalog records so that validation rules can evolve without ambiguity.
- **Metadata Versioning:** Each model record may carry a metadata revision sequence reflecting internal updates and discoveries.
- **Semantic Versioning:** Model versions are interpreted using semantic versioning where possible; provider-native versions remain supported through a provider-aware comparison strategy.
- **Compatibility Rules:** Validation and registration must ensure that a new metadata version remains compatible with the expected consumer contract.
- **Backward Compatibility:** Existing fields and required semantics remain compatible unless an explicit major-schema transition is introduced.
- **Forward Compatibility:** The Registry must tolerate unknown extension fields or future optional metadata without breaking current consumers.
- **Breaking Changes:** Any change that alters the meaning of an existing required field or public interface is treated as a breaking change and must be governed explicitly.
- **Migration Strategy:** Non-breaking changes are applied through additive extension or versioned transformation; breaking changes require a coordinated rollout plan and documented migration guidance.

## Registry Governance

Governance of the Model Registry is a shared responsibility between platform architecture, platform operations, and authorized metadata administrators.

- **Metadata Ownership:** The Model Registry owns the canonical metadata record for each model, including its lifecycle state and version lineage.
- **Registration Approval:** New or materially changed registrations must be approved according to the configured validation and governance policy before they become fully active in the catalog.
- **Schema Evolution:** Schema changes are governed through a versioned review process, with additive changes preferred and breaking changes explicitly approved.
- **Conflict Resolution Ownership:** The Synchronization Manager owns conflict-resolution policy, while administrators retain authority for exceptional resolution decisions.
- **Catalog Consistency:** Catalog consistency is owned by the Registry's validation, indexing, and synchronization processes, with administrative oversight for unresolved conflicts.
- **Deprecation Governance:** Deprecation and archival transitions are governed by lifecycle policy and must preserve historical visibility and auditability.
- **Retention Governance:** Historical metadata and lifecycle history are retained according to platform retention policy and audit requirements.
- **Audit Governance:** All mutating operations, lifecycle transitions, and approvals must be captured in auditable history and linked to the relevant record and operation context.

## Ownership Matrix

Ownership boundaries are explicit and non-overlapping. Each component owns only the concerns assigned to it in this architecture.

- **Model Registry owns:** metadata, discovery orchestration, validation, catalog, versioning, search, indexes, lifecycle, synchronization, and alias management.
- **Provider Plugin System owns:** provider communication, SDK integration, manifest generation, and dynamic model listing.
- **Provider Manager owns:** execution, cost calculation, and health monitoring.
- **Capability Selector owns:** candidate selection.
- **Router owns:** routing decisions.

These boundaries are intentional. No component is permitted to assume responsibility for a neighboring component's domain in a way that blurs the architecture.

## Lifecycle Guarantees

The Model Registry provides the following lifecycle guarantees.

- Every model has one canonical metadata record.
- Every model has one lifecycle.
- Every model is validated before registration.
- Every registration is deterministic.
- Every update preserves history.
- Every removal is explicit.
- Every synchronization is observable.
- Every lifecycle transition is auditable.

These guarantees ensure that the catalog remains predictable, inspectable, and suitable for long-term governance.

## Registry Identity Model

The Registry uses a consistent identity model to preserve relationships between records, versions, aliases, and operational traces.

- **modelId:** The canonical identifier for a single model record.
- **providerId:** The identifier of the provider or plugin that contributed the metadata.
- **modelFamily:** The grouping identifier for related versions or variants of the same underlying model lineage.
- **versionId:** The identifier for a specific versioned metadata state or version lineage.
- **aliasId:** The identifier for a named alias that resolves to a canonical model.
- **catalogId (future):** A future catalog-level identifier for partitioning or federation scenarios.
- **correlationId:** An operation-level identifier that links related discovery, validation, and synchronization events.
- **traceId:** A distributed tracing identifier used to correlate operations across the platform.
- **spanId:** A finer-grained identifier used to isolate a specific sub-operation within a larger flow.

These identifiers are related but distinct: `modelId` identifies the canonical metadata record, `providerId` identifies the discovery source, `modelFamily` identifies lineage, and `versionId`/`aliasId` identify specific views over that canonical record.

## Operational Limits

The Model Registry uses configurable operational limits to preserve stability and predictability as the catalog grows.

- Maximum models
- Maximum providers
- Maximum aliases
- Maximum metadata size
- Maximum search depth
- Maximum synchronization duration
- Maximum cache size
- Maximum concurrent synchronizations
- Maximum index rebuild duration

All of these limits are configuration driven and must be tunable without changing the underlying architecture.

## Observability Standards

The Registry must emit structured telemetry suitable for monitoring, diagnosis, and operational review.

Required observability fields include:

- `modelId`
- `providerId`
- `version`
- `lifecycleState`
- `validationStatus`
- `registrationTime`
- `synchronizationDuration`
- `cacheHitRate`
- `searchLatency`
- `indexLatency`
- `failureReason`

This telemetry supports operational monitoring, anomaly detection, performance tuning, and root-cause analysis for discovery, validation, and catalog updates.

## Compatibility Governance

Compatibility governance ensures that the Registry remains interoperable across platform versions, metadata variants, provider data feeds, and schema evolution.

- **Platform compatibility:** The Registry must remain compatible with the platform's supported runtime and interface versions.
- **Metadata compatibility:** Metadata records must remain valid under the schema rules enforced by the Registry.
- **Provider compatibility:** Provider-provided data must remain compatible with the plugin abstraction and validation pipeline.
- **Schema compatibility:** Additive changes are preferred; breaking changes require explicit governance.
- **API compatibility:** Public interfaces must remain stable for existing consumers unless a governed versioned change is introduced.
- **Version negotiation:** Consumers and providers must be able to interpret the effective metadata version in a deterministic way.
- **Deprecation policy:** Deprecated fields, interfaces, or compatibility paths must be documented and phased out according to governance policy.
- **Migration strategy:** Compatibility changes must include a documented migration path with minimal disruption.

## Schema Evolution Strategy

The Registry adopts a controlled schema evolution strategy to preserve compatibility over time.

- **Optional fields:** New fields may be introduced as optional to avoid forcing immediate adoption.
- **Required fields:** Existing required fields remain required unless a governed major-version transition is approved.
- **Deprecated fields:** Fields planned for removal must be marked deprecated and remain supported for a defined migration window.
- **Future extensions:** New capabilities and metadata concerns are added through controlled extension points rather than ad hoc schema mutation.
- **Migration:** Migrations are performed through explicit transformation and validation procedures.
- **Backward compatibility:** Existing consumers remain supported unless a breaking change is explicitly approved.
- **Forward compatibility:** The Registry must tolerate unknown extension data without failing existing flows.

## Failure Recovery Guarantees

The Registry is designed to recover gracefully from partial failures without compromising catalog correctness.

- Validation failures never corrupt the catalog.
- Discovery failures never affect existing metadata.
- Synchronization failures are isolated.
- Index failures are recoverable.
- Cache failures never affect correctness.
- History is never lost.
- Consistency is preserved.

These principles ensure that the Registry remains trustworthy even under transient or partial system failures.

## Security Governance

Security governance extends the existing security posture of the Registry by making integrity, control, and assurance explicit.

- **Metadata integrity:** All catalog writes are validated before they become visible.
- **Schema integrity:** The Registry enforces approved schema rules to prevent malformed or malicious metadata from entering the catalog.
- **Catalog integrity:** The catalog remains the single source of truth and is protected from unauthorized mutation.
- **Access control:** Mutating operations are restricted to authorized callers and administrative tooling.
- **Audit trail:** Every relevant operation and lifecycle transition is recorded for investigation and compliance.
- **Tamper detection:** Append-only history and integrity checks support detection of unexpected changes.
- **Immutable history verification:** Historical metadata can be verified as part of operational assurance.
- **Administrative approval:** Material changes to metadata, lifecycle, or governance settings require approval according to policy.

## Future Scalability Considerations

The following capabilities are explicitly recognized as future enhancements and do not alter the current architecture.

- Distributed registries
- Regional registries
- Read replicas
- Distributed indexing
- Federated catalogs
- Incremental replication
- Distributed caching
- Marketplace federation
- Metadata federation

These enhancements are compatible with the current design because they preserve the same core responsibilities, interfaces, and ownership boundaries while expanding scale and distribution later.

---

**End of Module Design Document — Model Registry**
