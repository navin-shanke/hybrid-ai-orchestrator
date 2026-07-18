# Provider Manager — Module Design Document (MDD)

**Module:** Provider Manager
**Parent System:** Hybrid AI Development Platform — Orchestrator Subsystem
**Document Type:** Module Design Document (MDD)
**Status:** Draft for Implementation
**Audience:** Senior Engineers, AI Coding Agents (Cursor, OpenCode, Roo Code, Claude Code)
**Related Documents:** PRD, Software Architecture & Design Document (SAD), API Specification, Database Design Document, Orchestrator Core MDD, Event Bus MDD, Request Manager MDD

> This document defines the Provider Manager module only. It does not restate decisions owned by other documents (planning, routing intelligence, memory, task execution, review). Where the Orchestrator Core selects *which* provider/model to use for a given task, this document governs *how* that selection is executed, monitored, and normalized once handed to the Provider Manager — never the selection logic itself.

---

## 1. Executive Summary

### 1.1 Purpose

Every AI capability in the Hybrid AI Development Platform is ultimately fulfilled by an external AI provider — OpenAI, Anthropic, Gemini, NVIDIA, OpenRouter, a locally hosted Ollama/LM Studio/vLLM instance, Azure OpenAI, Cloudflare Workers AI, or any provider added in the future. These providers differ wildly in SDKs, authentication schemes, request/response shapes, streaming protocols, and capability surfaces (some support vision, some support tool calling, some don't support streaming at all).

The Provider Manager exists to absorb all of that variability behind one stable, abstract boundary. It operates exclusively through abstract provider interfaces and provider plugins — issue a call, stream a response, check health, retry on failure, fall back to an alternative — without ever knowing the concrete details of any specific provider's SDK or wire format. Those concrete details live entirely inside independently pluggable **Provider Plugins**, each implementing a shared **Provider Interface** (Section 7).

### 1.2 Responsibilities

The Provider Manager is responsible for the *operational lifecycle and execution mechanics* of provider plugins: loading them, registering them, health-checking them, executing requests against them, retrying and falling back when they fail, normalizing their heterogeneous responses into one internal shape, and collecting usage/cost/latency metrics. It is explicitly **not** responsible for deciding which provider or model *should* be used for a given task — that intelligence belongs to the Orchestrator Core's Router/Capability Selector, which calls into the Provider Manager only after a provider has already been selected (or with a prioritized candidate list, for fallback purposes).

### 1.3 Role

The Provider Manager is the **execution adapter layer** for all outbound AI-provider communication. It is the final internal module a request passes through before leaving the platform's trust boundary (an actual network call to a third-party or local inference endpoint), and the first internal module a raw provider response passes through on the way back in.

### 1.4 Architecture Position

```
Orchestrator Core (Planning, Routing, Memory, Review)
        |  selected provider/model + normalized execution request
        v
+---------------------------------------------------------------+
|                     PROVIDER MANAGER                          |
|   (lifecycle, execution coordination, health, retry,          |
|    fallback, normalization, metrics -- this document)         |
+-------------------------+---------------------------------------+
                          |  Provider Interface calls only
                          v
        +-----------------------------------------+
        |           PROVIDER PLUGIN SYSTEM           |
        |  (OpenAI Plugin, Anthropic Plugin, Gemini   |
        |   Plugin, Ollama Plugin, vLLM Plugin, ...)   |
        +-----------------------------------------+
                          |  provider-specific SDK/HTTP calls
                          v
              External / Local AI Provider Endpoints
```

The Provider Manager sits below the Orchestrator Core and above the Provider Plugin System, in Hexagonal Architecture terms acting as the application/use-case layer whose **driven port** is the Provider Interface (Section 7), implemented independently by each plugin. The Provider Manager never imports, references, or links against any provider SDK — plugins do, and are loaded polymorphically through that one interface.

---

## 2. Goals

### 2.1 Primary Goals

1. Provide one abstract execution surface (`execute()`, `stream()`) that the Orchestrator Core can call regardless of which provider was selected.
2. Guarantee that adding a new provider requires **zero changes** to Provider Manager source code — only a new plugin implementing the Provider Interface.
3. Normalize all provider responses (chat, streaming, tool calls, vision, embeddings, structured output, usage, errors) into one consistent internal shape.
4. Provide resilient execution: health-aware routing to *already-selected* providers, retry, timeout, and fallback to a next-candidate provider on failure.
5. Provide accurate, real-time usage, cost, and latency telemetry per provider/model/request.

### 2.2 Secondary Goals

1. Support hot-reloading of plugins (add/update/remove a provider without restarting the platform).
2. Support connection pooling and efficient resource reuse for high-throughput scenarios.
3. Provide a circuit-breaker mechanism so a persistently failing provider is automatically deprioritized without manual intervention.
4. Expose a capability-query surface (`supportsCapability()`) so the Orchestrator Core's Router can make informed selection decisions without duplicating provider capability knowledge.

### 2.3 Future Goals

1. Multi-region provider execution (routing the same provider across regional endpoints for latency/compliance reasons).
2. Distributed/remote worker execution (providers hosted on remote infrastructure the platform doesn't directly control, e.g., a fleet of local inference nodes).
3. Adaptive retry/fallback tuning based on historical reliability scoring per provider.
4. Cost-aware execution hints (e.g., soft budget ceilings enforced at the execution layer, with actual budget *policy* still owned by the Orchestrator Core).

### 2.4 Non-Goals

- The Provider Manager will **never** decide which provider to use for a task — it executes against providers it is told to use (or a candidate list for fallback).
- The Provider Manager will **never** implement provider-specific HTTP/SDK code directly in its own module tree — all such code lives in Provider Plugins.
- The Provider Manager will **never** perform planning, memory retrieval, task execution, browser automation, or review of AI output quality.
- The Provider Manager will **never** persist conversation content long-term — it emits usage/metrics records; durable content storage is the Database module's responsibility.

---

## 3. Responsibilities

### 3.1 Must Have (v1 scope)

1. Load and validate Provider Plugins conforming to the Provider Interface (Section 7).
2. Maintain a Provider Registry of all loaded, validated, and health-checked providers.
3. Resolve a provider instance by ID when instructed by the Orchestrator Core (provider *selection* is external; provider *resolution to a live instance* is internal).
4. Execute chat, streaming, vision, embeddings, tool-calling, and structured-output requests against the resolved provider via the Provider Interface.
5. Perform health checks (on-demand and periodic heartbeat) and maintain a live health/availability status per provider.
6. Apply configurable retry policy on transient failures.
7. Apply configurable fallback to a next-candidate provider when the primary is unhealthy or exhausts retries, when a candidate list is supplied.
8. Enforce configurable per-request and per-provider timeouts.
9. Normalize all provider responses (success and error) into one internal canonical response shape (Section 12).
10. Normalize streaming output into one internal streaming token/event shape, regardless of provider-specific streaming protocol (SSE, WebSocket, chunked HTTP, etc.).
11. Collect usage (tokens in/out), cost estimates, and latency metrics per execution.
12. Publish lifecycle and execution events to the Event Bus (Section 13).
13. Support cancellation of an in-flight execution (propagating a cancellation signal into the active plugin call).
14. Implement a circuit breaker per provider to stop routing to a provider that is persistently failing, and automatically recover it once health checks pass again.

### 3.2 Should Have (near-term, v1.x)

1. Hot-reload of plugins without full platform restart.
2. Connection pooling for providers that support persistent connections (e.g., WebSocket-based local inference servers).
3. Reliability scoring per provider (rolling success rate, latency percentile) exposed for the Router's informational use, without the Provider Manager itself making routing decisions.
4. Configurable rate limiting per provider (to respect provider-imposed quotas), independent of the platform-wide rate limiting owned by other modules.

### 3.3 Future Responsibilities (explicitly out of v1, see Section 23)

1. Multi-region execution routing within a single provider.
2. Distributed/remote worker provider hosting.
3. Adaptive, ML-informed retry/fallback tuning.
4. Cost-ceiling enforcement hooks (policy still owned upstream; this module would only enforce a supplied ceiling).

---

## 4. Scope

### 4.1 Owns

- The Provider Registry (loaded, validated, health-tracked provider instances).
- The abstract Provider Interface used for communication with provider plugins.
- Plugin integration into the Provider Manager, including loading, validation, registration, and operational lifecycle management.
- Execution coordination: retry, timeout, fallback, circuit breaker (Section 9, Section 10, Section 11).
- Response and streaming normalization (Section 12).
- Usage, cost, and latency metrics collection (Section 17).
- Provider health status and heartbeat scheduling.

### 4.2 Does Not Own

- Provider SDK implementations (owned by individual Provider Plugins).
- Provider/model *selection* logic — which provider is best for a task (owned by Orchestrator Core's Router/Capability Selector).
- Planning, memory, task execution, browser automation, review (owned by Orchestrator Core and its other subsystems).
- Credential *policy* (who is allowed to use which provider) — owned by Configuration Manager / Authorization; Provider Manager only *consumes* resolved credentials at execution time (Section 18).
- Long-term persistence of conversation/response content (owned by Database module).

### 4.3 Collaborates With

- **Router / Capability Selector** (within Orchestrator Core) — receives provider selection decisions and capability queries from it.
- **Model Registry** — consults it (read-only) to validate that a requested model is known/supported before execution, and to surface capability metadata used by `supportsCapability()`.
- **Event Bus** — publishes all lifecycle/execution events (Section 13); does not depend on specific subscribers.
- **Configuration Manager** — reads retry policy, timeout defaults, circuit breaker thresholds, plugin manifest locations, feature flags.
- **Logger** — structured logging at every execution stage.
- **Request Manager** — indirect collaborator; the Provider Manager receives execution requests that trace back to a `requestId`/`correlationId` originated by the Request Manager, propagating those IDs through for end-to-end tracing.
- **Orchestrator Core** — primary caller of the Provider Manager's public interfaces (Section 14); also the consumer of normalized responses and metrics.

---

## 5. Internal Architecture

```
+------------------------------------------------------------------------+
|                          PROVIDER MANAGER                              |
|                                                                          |
| +----------------------+   +----------------------+   +----------------------+ |
| | Orchestrator Core     |-->| Provider Manager     |-->| Provider Interface   | |
| +----------------------+   +----------------------+   +----------------------+ |
|                                                             |               |
|                                                             v               |
|                                             +----------------------+     |
|                                             | Provider Plugin       |     |
|                                             +----------+-----------+     |
|                                                        |               |
|                                                        v               |
|                                      +------------------------------+     |
|                                      | External AI Provider         |     |
|                                      +------------------------------+     |
|                                                          |               |
|         +------------------------------------------------+--------+   |
|         v                                                 v          |   |
| +---------------+                                +--------------+ |   |
| | Provider        |                                | Lifecycle      | |   |
| | Resolver        |                                | Manager        | |   |
| +-------+-------+                                +--------------+ |   |
|         |                                                            |   |
|         v                                                            |   |
| +---------------+   +------------------+   +--------------------+     |
| | Execution       |-->| Timeout            |-->| Retry Manager        |     |
| | Coordinator     |   | Controller         |   +----------+-----------+     |
| +-------+-------+   +------------------+              |               |
|         |                                                 v               |
|         |                                        +--------------------+|
|         |                                        | Fallback Manager      ||
|         |                                        +----------+-----------+|
|         v                                                    |           |
| +---------------+   +------------------+                    |           |
| | Connection      |   | Streaming          |<------------------+           |
| | Pool Manager    |   | Controller         |                                |
| +---------------+   +--------+---------+                                |
|                                v                                          |
|                       +------------------+                                |
|                       | Response            |                                |
|                       | Normalizer          |                                |
|                       +--------+---------+                                |
|                                v                                          |
| +---------------+   +------------------+   +--------------------+     |
| | Health Monitor  |   | Metrics Collector  |   | Usage Collector      |     |
| +-------+-------+   +------------------+   +--------------------+     |
|         |              +------------------+   +--------------------+     |
|         +------------->| Circuit Breaker    |   | Cost Collector       |     |
|                         +------------------+   +--------------------+     |
|                                                    +--------------------+     |
|                                                    | Latency Monitor       |     |
|                                                    +--------------------+     |
+------------------------------------------------------------------------+
```

The internal architecture consists of two categories of components:

1. Plugin Integration Components

These components are responsible only for discovering, loading, validating, registering, and exposing provider plugins.

They never perform provider execution, retry, routing, health management, response normalization, or business logic.

2. Operational Components

These components manage runtime provider execution, lifecycle, monitoring, retry, fallback, streaming, normalization, metrics, and health.

### 5.1 Plugin Loader

**Responsibility:** Discovers and loads Provider Plugins from configured plugin sources (local directory, package registry, or dynamically registered at runtime). Instantiates the plugin's entry point and hands it to the Capability Validator before it is ever placed in the Plugin Registry. Contains no knowledge of any specific plugin's internals — it only knows how to locate and instantiate something that *claims* to implement the Provider Interface.

The Plugin Loader only discovers, loads, instantiates, and exposes provider plugin instances to the Provider Manager.

It never performs provider execution, request processing, retry logic, fallback logic, health monitoring, or business logic.

### 5.2 Capability Validator

**Responsibility:** Verifies a loaded plugin actually implements the required Provider Interface methods (Section 7), reports its declared capabilities (`supportsCapability()` results), and passes a manifest/version compatibility check (Section 8). Rejects plugins that fail validation, preventing malformed or incompatible plugins from ever reaching the registry.

The Capability Validator validates interface compliance, capability declarations, compatibility, and configuration integrity only.

It never performs provider selection, execution decisions, retry decisions, or routing.

### 5.3 Plugin Registry

**Responsibility:** Holds the set of successfully loaded and validated plugin instances, keyed by provider ID, independent of their current health/readiness state. This is distinct from the Provider Registry Interface (5.4), which layers live operational state (health, circuit breaker status) on top of what the Plugin Registry holds.

The Plugin Registry stores plugin metadata and instantiated plugin references only.

The Plugin Registry acts as the internal source of plugin discovery for the Provider Registry Interface but never exposes provider execution state.

It does not manage runtime provider state, execution status, retries, circuit breakers, provider health, or provider lifecycle.

### 5.4 Provider Registry Interface

**Responsibility:** The authoritative, queryable view of all providers known to the system, combining static plugin identity (from Plugin Registry) with live operational state that belongs here rather than in the Plugin Registry. This component is responsible for runtime operational state including Ready, Unavailable, Health, Active Instance, Circuit Breaker State, and Reliability Score. This is what `listProviders()`, `getProvider()`, and the Provider Resolver query against.

### 5.5 Provider Resolver

**Responsibility:** Given a provider ID (and optionally a model ID) supplied by the caller (Orchestrator Core), resolves it to a concrete, ready-to-execute provider instance from the Provider Registry Interface. Confirms the provider is currently `Ready` (not `Unavailable`/circuit-broken) before handing it to the Execution Coordinator; if not ready, signals this back so the Fallback Manager can act if a candidate list was supplied.

### 5.6 Execution Coordinator

**Responsibility:** The central orchestrating component for a single execution request. Drives the sequence: resolve provider -> acquire connection -> apply timeout -> invoke plugin method (`chat()`/`stream()`/`vision()`/etc.) -> hand result to Response Normalizer -> record metrics -> return. Coordinates but does not itself implement retry, timeout, or fallback logic — those are delegated to their respective dedicated components, keeping this component focused purely on sequencing (Single Responsibility).

### 5.7 Timeout Controller

**Responsibility:** Wraps each plugin invocation with a configurable timeout (per-provider or per-request override). On timeout, cancels the underlying call (via the plugin's `cancel()` method) and raises a classified `ProviderTimeoutError` back to the Execution Coordinator, which then consults Retry Manager/Fallback Manager.

### 5.8 Retry Manager

**Responsibility:** Applies the configured retry policy (Section 11) to transient failures on a *single* resolved provider — e.g., retrying the same provider after a brief backoff for a classified-transient error (network blip, rate-limit-with-retry-after). Does not itself switch providers; that is Fallback Manager's job once retries on the current provider are exhausted.

### 5.9 Fallback Manager

**Responsibility:** When the current provider fails permanently (retries exhausted, or provider is `Unavailable`/circuit-broken) and the caller supplied a prioritized candidate list, selects the next candidate and hands it back to the Provider Resolver to restart the resolve -> execute cycle. Publishes `FallbackStarted`. Never invents a candidate not supplied by the caller — it has no provider-selection intelligence itself, only sequencing intelligence over a pre-ranked list.

### 5.10 Streaming Controller

**Responsibility:** Manages the lifecycle of a streaming execution — invokes the plugin's `stream()` method, receives provider-specific streaming chunks, and passes each chunk to the Response Normalizer for per-chunk normalization before relaying it onward (typically toward the Request Manager's registered stream channel, via the Orchestrator Core). Also handles stream-level cancellation and stream-level error classification (a failure mid-stream is handled differently from a failure at request initiation — see Section 11).

### 5.11 Response Normalizer

**Responsibility:** Converts a provider-specific response (or stream chunk) into the canonical internal response shape (Section 12), regardless of whether it originated from OpenAI's format, Anthropic's format, a local Ollama response, etc. This is the single place format-translation knowledge for the *response* side lives; each Provider Plugin is responsible for translating its own SDK's native response into an intermediate provider-declared shape, and the Response Normalizer maps that intermediate shape into the platform-canonical shape — see Section 12 for the precise division of responsibility.

### 5.12 Health Monitor

**Responsibility:** Runs periodic heartbeat health checks (via `healthCheck()`) against every registered provider on a configurable interval, and supports on-demand health checks triggered by the Provider Resolver before a critical execution. Updates each provider's health status in the Provider Registry Interface and feeds the Circuit Breaker.

### 5.13 Circuit Breaker

**Responsibility:** Tracks consecutive/rolling failure counts per provider. Trips to `Open` (provider marked `Unavailable`, no further execution attempts routed to it) once a configurable failure threshold is crossed, and periodically allows a `Half-Open` trial request through to test recovery, closing back to `Closed`/`Ready` on success (Section 10).

### 5.14 Metrics Collector

**Responsibility:** Aggregates and exposes operational metrics (Section 17) — execution counts, error rates, per-provider latency distributions — sourced from events published by other components, without embedding metrics logic inside those components (Observer pattern via the Event Bus, keeping Metrics Collector decoupled).

### 5.15 Usage Collector

**Responsibility:** Records token usage (input/output/total) per execution, extracted from the normalized response's usage block, and aggregates it per provider/model/project for reporting and downstream budget-policy consumption by other modules.

### 5.16 Cost Collector

**Responsibility:** Applies provider/model pricing data (sourced from Model Registry or Configuration Manager, never hardcoded here) to Usage Collector's token counts to produce a cost estimate per execution. Contains no pricing logic of its own beyond arithmetic — pricing tables are external, injected configuration.

### 5.17 Latency Monitor

**Responsibility:** Measures and records per-execution latency (time-to-first-token for streaming, total duration for non-streaming), feeding both the Metrics Collector and the Circuit Breaker's health signal.

### 5.18 Lifecycle Manager

**Responsibility:** Owns the Provider Lifecycle state machine (Section 6) — the sequence a provider moves through from `Loaded` to `Ready` to eventual `Shutdown`. All state transitions for a provider are funneled through this component, analogous to the Request Manager's Lifecycle Controller pattern.

### 5.19 Connection Pool Manager

**Responsibility:** For providers whose plugins declare support for persistent/pooled connections (e.g., a long-lived WebSocket to a local inference server), manages connection acquisition/release/reuse. For stateless HTTP-based providers, this is a no-op passthrough. Pooling policy (max pool size, idle timeout) is configuration-driven.

---

## 6. Provider Operational Lifecycle

### 6.1 Lifecycle Flow

```
   Plugin Loaded
        |
        v
    Validate            --(fails)-->  Rejected (never registered)
        |
        v
   Initialize            --(fails)-->  Failed
        |
        v
  Health Check            --(fails)-->  Unavailable (retry per Health Monitor schedule)
        |
        v
    Register
        |
        v
     Ready  <-----------------------------+
        |                                  |
        v                                  | recovery (Half-Open success)
    Execute --> Monitor --> back to Ready  |
        |                                  |
        | (repeated failures)              |
        v                                  |
   Circuit Open (Unavailable) -------------+
        |
        v
    Shutdown (explicit removal / plugin unload)
```

### 6.2 Lifecycle State Definitions

| State | Meaning |
|---|---|
| `Loaded` | Plugin instantiated by Plugin Loader; not yet validated. |
| `Validated` | Passed Capability Validator's interface/version checks. |
| `Initializing` | Plugin's `initialize()` invoked (e.g., establishing credentials, warming a connection pool). |
| `Failed` | Initialization or validation failed; provider is not registered and requires operator intervention or a corrected plugin/config before retry. |
| `HealthChecking` | Initial (or on-demand) health check in progress. |
| `Registered` | Present in Provider Registry Interface but not yet confirmed ready for traffic. |
| `Ready` | Healthy, registered, and available for execution. |
| `Executing` | Currently servicing one or more active requests (a provider can be `Ready` and `Executing` concurrently — this is a status flag, not mutually exclusive with `Ready`). |
| `Unavailable` | Circuit breaker open, or health check failing; not routed to for new executions until recovery. |
| `Shutdown` | Explicitly unloaded/removed; no longer present in Provider Registry Interface. |

### 6.3 Sequence Diagram — Plugin Load to Ready

```
ConfigManager    PluginLoader   CapabilityValidator   LifecycleManager   HealthMonitor   ProviderRegistry   EventBus
     |                  |                  |                   |                |                |              |
     |--plugin manifest->|                  |                   |                |                |              |
     |                  |--instantiate---->|                   |                |                |              |
     |                  |                  |--validate interface/version------->|                |              |
     |                  |                  |<--ValidationResult------------------|                |              |
     |                  |                  |                   |--initialize()-->|                |              |
     |                  |                  |                   |<--ok------------|                |              |
     |                  |                  |                   |                |--healthCheck()->|              |
     |                  |                  |                   |                |<--healthy--------|              |
     |                  |                  |                   |--register-------------------------------------->|              |
     |                  |                  |                   |--state=Ready------------------------------------------------------>|
     |                  |                  |                   |                |                |--ProviderReady-->|
```

---

## 7. Provider Interface

The Provider Manager communicates with every provider exclusively through an abstract Provider Interface.

Every provider plugin implements this interface.

The Provider Manager never communicates directly with provider SDKs or provider-specific implementations.

### 7.1 `initialize(config) -> InitResult`
- **Purpose:** Prepare the plugin for use (validate credentials, open pooled connections, load local model metadata for local providers).
- **Input:** `config` — provider-specific configuration block (credentials, base URL, pool settings), supplied by Configuration Manager but passed through opaquely by the Provider Manager without inspection.
- **Output:** `InitResult` (`success: boolean`, `error?: string`).
- **Validation:** Plugin-internal; Provider Manager only checks that `initialize()` resolves within a configurable init timeout.
- **Errors:** `InitializationError` propagated to Lifecycle Manager, resulting in `Failed` state.

### 7.2 `shutdown() -> void`
- **Purpose:** Gracefully release resources (close pooled connections, flush any plugin-internal buffers) when a provider is removed or the platform shuts down.
- **Input:** None.
- **Output:** None (best-effort; Provider Manager applies a shutdown timeout and proceeds regardless).
- **Errors:** Logged, not propagated as a blocking failure.

### 7.3 `chat(request) -> ChatResponse`
- **Purpose:** Execute a non-streaming chat/completion call.
- **Input:** Canonical `ExecutionRequest` (Section 9) containing messages, model ID, parameters (temperature, max tokens, etc.), tool definitions if applicable.
- **Output:** Provider-native response, which the plugin itself must translate into the intermediate provider-declared response shape (Section 12.1) before returning — the Provider Manager's Response Normalizer performs the *second* pass into the fully canonical shape.
- **Validation:** Plugin validates model ID is one it recognizes; Provider Manager validates the request against the Provider Interface's expected shape before calling.
- **Errors:** Classified errors per Section 15 (`AuthenticationError`, `ProviderTimeoutError`, `RateLimitError`, `InvalidRequestError`, `ProviderUnavailableError`).

### 7.4 `stream(request) -> AsyncIterable<StreamChunk>`
- **Purpose:** Execute a streaming chat/completion call, yielding incremental chunks.
- **Input:** Same `ExecutionRequest` shape as `chat()`, with `streaming: true` implied.
- **Output:** An async-iterable sequence of provider-native chunks (translated to intermediate shape by the plugin, per-chunk).
- **Validation:** Same as `chat()`; additionally the plugin declares via `supportsCapability("streaming")` whether this method is meaningfully implemented.
- **Errors:** Same classification as `chat()`, plus mid-stream failure is a distinct case handled by Streaming Controller (Section 11.4).

### 7.5 `vision(request) -> VisionResponse`
- **Purpose:** Execute a call involving image input.
- **Input:** `ExecutionRequest` extended with image attachment references/content.
- **Output:** Intermediate response shape, same normalization path as `chat()`.
- **Validation:** Requires the plugin to report `supportsCapability("vision") === true`; the Execution Coordinator rejects the call with `CapabilityNotSupportedError` before ever invoking the plugin if this capability is not declared.
- **Errors:** Same classification set as `chat()`.

### 7.6 `embeddings(request) -> EmbeddingsResponse`
- **Purpose:** Execute an embeddings-generation call.
- **Input:** Text(s) to embed, model ID.
- **Output:** Intermediate embeddings response (vector arrays + usage).
- **Validation:** Requires `supportsCapability("embeddings") === true`.
- **Errors:** Same classification set as `chat()`.

### 7.7 `toolCalling(request) -> ToolCallResponse`
- **Purpose:** Execute a call where the model may invoke declared tools/functions.
- **Input:** `ExecutionRequest` with `tools` definitions attached.
- **Output:** Intermediate response including any tool-call directives the model produced, in the plugin's native shape, prior to normalization (Section 12.2).
- **Validation:** Requires `supportsCapability("tool_calling") === true`.
- **Errors:** Same classification set, plus `ToolSchemaError` if the plugin reports the tool definitions were malformed for its provider's dialect.

### 7.8 `structuredOutput(request) -> StructuredResponse`
- **Purpose:** Execute a call constrained to a declared output schema (e.g., JSON schema-constrained generation).
- **Input:** `ExecutionRequest` with an output schema attached.
- **Output:** Intermediate structured response.
- **Validation:** Requires `supportsCapability("structured_output") === true`.
- **Errors:** Same classification set, plus `SchemaValidationError` if the provider's output fails to conform (some providers validate server-side; others require the plugin to validate client-side — either way, the plugin surfaces this uniformly).

### 7.9 `listModels() -> ModelDescriptor[]`
- **Purpose:** Report the set of models this provider currently exposes (used to cross-check against Model Registry, and to support dynamic model discovery for local providers like Ollama where the model set changes at runtime).
- **Input:** None.
- **Output:** Array of `ModelDescriptor` (model ID, declared capabilities, context window size).
- **Errors:** `ProviderUnavailableError` if the provider cannot currently be queried.

### 7.10 `healthCheck() -> HealthStatus`
- **Purpose:** Lightweight liveness/readiness probe.
- **Input:** None.
- **Output:** `HealthStatus` (`healthy: boolean`, `latencyMs`, optional `details`).
- **Errors:** Should not throw; a failed check is represented as `healthy: false`, not an exception, so Health Monitor can treat it uniformly.

### 7.11 `supportsCapability(capability) -> boolean`
- **Purpose:** Declarative capability query, used by both the Execution Coordinator (pre-call validation) and the Orchestrator Core's Router (selection-time query) to know what a provider can do without attempting a call.
- **Input:** `capability` (enum: `chat`, `streaming`, `vision`, `embeddings`, `tool_calling`, `structured_output`).
- **Output:** boolean.
- **Errors:** None — pure, synchronous, side-effect-free.

### 7.12 `estimateCost(request) -> CostEstimate`
- **Purpose:** Pre-execution cost estimate, used by Cost Collector and optionally surfaced to the Router for cost-aware selection (selection logic itself remains external).
- **Input:** `ExecutionRequest` (or a token-count approximation).
- **Output:** `CostEstimate` (`estimatedInputCost`, `estimatedOutputCost`, `currency`).
- **Errors:** None — returns a best-effort estimate; absence of pricing data yields a `null`/`unknown` estimate, not an exception.

### 7.13 `estimateLatency(request) -> LatencyEstimate`
- **Purpose:** Pre-execution latency estimate, informed by the plugin's own historical knowledge or static declaration (e.g., local models generally declare lower expected latency variance than remote providers under load).
- **Input:** `ExecutionRequest`.
- **Output:** `LatencyEstimate` (`estimatedMs`, `confidence`).
- **Errors:** None — best-effort.

### 7.14 `cancel(executionId) -> void`
- **Purpose:** Propagates a cancellation signal into an in-flight call (invoked by Timeout Controller on timeout, or by the Execution Coordinator on an upstream `CancellationToken` signal originating from the Request Manager).
- **Input:** `executionId` (correlates to the specific in-flight call, not the provider as a whole).
- **Output:** None (best-effort; not all provider SDKs support true mid-call cancellation — the plugin does its best and the Provider Manager treats the call as terminated on its side regardless).
- **Errors:** Logged, never blocking.

---

## 8. Provider Registration

### 8.1 Registration & Discovery

Providers are registered through the following sequence:

Receive provider plugin instance

↓

Validate interface

↓

Initialize provider

↓

Register provider

↓

Ready for execution

The Provider Manager operates exclusively through abstract provider interfaces and provider plugins during registration; it does not contain provider-specific implementations.

### 8.2 Plugin Loading

The Plugin Loader resolves a plugin package (via a configured module path or package identifier), instantiates its exported entry point, and hands the instance — untouched — to the Capability Validator. The Provider Manager never inspects plugin source; it only interacts with the instantiated object through the Provider Interface.

### 8.3 Plugin Unloading

`removeProvider()` (Section 14.2) transitions a provider to `Shutdown`: it is removed from the Provider Registry Interface (no longer resolvable for new executions), in-flight executions are allowed to complete or are cancelled per configured drain policy, `shutdown()` is invoked on the plugin, and it is removed from the Plugin Registry.

### 8.4 Versioning & Compatibility

Every plugin declares a `providerInterfaceVersion` it was built against. The Capability Validator checks this against the Provider Manager's currently supported interface version range (declared in Configuration Manager or a module constant) and rejects plugins outside the compatible range with a clear `VersionMismatchError`, preventing silent behavioral drift from an outdated plugin.

### 8.5 Dependencies

Plugins may declare dependency metadata (e.g., minimum SDK version bundled internally) — this is entirely internal to the plugin's own packaging and is never resolved or managed by the Provider Manager, preserving the boundary that provider-specific concerns never leak into this module.

### 8.6 Dynamic Registration & Hot Reload

Hot reload (`reload()`, Section 14.9) re-runs the full lifecycle for an already-registered provider ID — useful when plugin configuration changes (e.g., rotated API key) without requiring a full platform restart. The existing instance is drained and shut down, and a fresh instance is loaded, validated, initialized, and re-registered, with the Provider Registry Interface entry swapped atomically so in-flight resolution calls never observe a half-reloaded state.

---

## 9. Execution Flow

### 9.1 Flow Diagram

```
ExecutionRequest (from Orchestrator Core, provider already selected or candidate list supplied)
        |
        v
  Provider Resolver         -> resolves provider ID to live instance; checks Ready state
        |  (not ready & candidates remain) --> Fallback Manager --> next candidate --> (loop back)
        v
  Health Check (on-demand, if configured to check-before-execute)
        |
        v
  Connection Pool Manager    -> acquire connection/slot if pooling applies
        |
        v
  Timeout Controller          -> wraps the call
        |
        v
  Execution Coordinator       -> invokes plugin.chat() / .stream() / .vision() / etc.
        |  (transient failure) --> Retry Manager --> (retry same provider, bounded)
        |  (permanent failure / retries exhausted) --> Fallback Manager --> next candidate
        v
  Streaming Controller (if streaming)  -> per-chunk relay
        |
        v
  Response Normalizer          -> canonical response shape
        |
        v
  Metrics / Usage / Cost / Latency Collectors  -> recorded
        |
        v
  Response returned to caller (Orchestrator Core)
```

### 9.2 Sequence Diagram — Non-Streaming Execution (Happy Path)

```
OrchestratorCore  ProviderResolver  ExecutionCoordinator  TimeoutController  Plugin  ResponseNormalizer  MetricsCollector
       |                   |                   |                   |             |             |                 |
       |--execute(providerId, request)-------->|                   |             |             |                 |
       |                   |--resolve--------->|                   |             |             |                 |
       |                   |<--ProviderInstance-|                   |             |             |                 |
       |                                        |--run(withTimeout)->|             |             |                 |
       |                                        |                   |--chat(req)->|             |                 |
       |                                        |                   |<--native resp|             |                 |
       |                                        |<--native resp------|             |             |                 |
       |                                        |--normalize------------------------------------>|             |                 |
       |                                        |<--CanonicalResponse--------------------------- -|             |                 |
       |                                        |--record--------------------------------------------------------->|                 |
       |<--CanonicalResponse--------------------|                   |             |             |                 |
```

### 9.3 Sequence Diagram — Failure with Fallback

```
OrchestratorCore  ProviderResolver  ExecutionCoordinator  RetryManager  FallbackManager  Plugin(A)  Plugin(B)
       |--execute(candidates=[A,B], request)-->|                |              |             |           |
       |                   |--resolve(A)------>|                |              |             |           |
       |                                        |--chat(req)--------------------------------->|           |
       |                                        |<--ProviderTimeoutError------------------------|           |
       |                                        |--retry?------->|              |             |           |
       |                                        |<--exhausted-----|              |             |           |
       |                                        |--fallback------------------------->|             |           |
       |                   |<--resolve(B)------------------------------------------|             |           |
       |                                        |--chat(req)------------------------------------------------->|
       |                                        |<--native resp---------------------------------------------- |
       |<--CanonicalResponse (from B, fallbackUsed: true)-----------------------------------------------------|
```

---

## 10. Health Management

### 10.1 Health Checks & Heartbeat

Health Monitor runs `healthCheck()` on a configurable interval (default suggested: 30s) against every `Registered`/`Ready` provider, and supports on-demand checks triggered before critical executions if configured (`checkBeforeExecute: true` per provider, to trade a small latency cost for stronger guarantees on high-value calls).

### 10.2 Availability & Reliability Score

Each provider maintains a rolling reliability score derived from recent health check outcomes and recent execution success/failure rates (windowed, e.g., last N checks / last N minutes). This score is exposed read-only via `getProvider()`/`listProviders()` for the Router's informational use — the Provider Manager itself only uses it to drive the Circuit Breaker, never to make selection decisions.

### 10.3 Latency Tracking

Latency Monitor records health-check latency and execution latency separately, both feeding the reliability score and the Metrics Collector.

### 10.4 Failure Detection & Circuit Breaker

```
        +--------+   failure threshold crossed   +--------+
        | Closed  |------------------------------->|  Open   |
        | (Ready) |                                 |(Unavail)|
        +---+----+                                 +---+----+
            ^                                             |  cool-down elapsed
            |             success                          v
            |        +--------------+              +--------------+
            +--------| Half-Open     |<-------------|  Half-Open    |
                      | (trial call)  |              |  scheduled    |
                      +------+-------+              +--------------+
                              | failure
                              v
                          back to Open
```

- **Closed**: Normal operation; provider is `Ready` and routed to.
- **Open**: Failure threshold (configurable, e.g., 5 consecutive failures or >50% failure rate over a rolling window) crossed; provider marked `Unavailable`; no new executions routed to it; existing in-flight calls are allowed to complete.
- **Half-Open**: After a configurable cool-down period, one trial request (or health check) is allowed through; success closes the circuit (back to `Ready`), failure re-opens it and resets the cool-down timer (with optional exponential backoff on the cool-down duration itself).

### 10.5 Recovery

Recovery is fully automatic via the Half-Open trial mechanism; no manual intervention is required for transient outages. Operators can force a manual recovery attempt via `health()` (Section 14.7) or `reload()` if needed.

---

## 11. Retry & Fallback

### 11.1 Retry Policy

Configurable per provider (with a global default), covering:
- `maxRetries` (default suggested: 2, applied only to *transient* classified errors).
- Backoff strategy: exponential with jitter, base delay and max delay configurable.
- Respect for provider-supplied `Retry-After` hints when present in a classified `RateLimitError`.

### 11.2 Failure Classification

| Classification | Examples | Retryable on Same Provider? | Triggers Fallback? |
|---|---|---|---|
| **Transient** | Network blip, 5xx, connection reset | Yes (bounded by `maxRetries`) | Only after retries exhausted |
| **Rate Limited** | 429 with `Retry-After` | Yes, honoring `Retry-After`, bounded | Only after retries exhausted |
| **Timeout** | No response within configured timeout | Yes (bounded) | Only after retries exhausted |
| **Authentication** | 401/403, invalid credentials | No | Yes, immediately (credential issues won't resolve via retry) |
| **Invalid Request** | 400-class, malformed request the platform itself constructed incorrectly | No | No — this is a bug, not a provider issue; surfaces as `RequestFailed` upstream rather than silently falling back |
| **Provider Crash / Unavailable** | Connection refused, circuit already Open | No | Yes, immediately |
| **Capability Not Supported** | Plugin declares capability false | No | Yes, immediately (candidate without the capability should arguably not have been in the list — logged as a Router-side inconsistency, but Fallback Manager still attempts the next candidate defensively) |

### 11.3 Fallback Provider

Fallback only operates over a candidate list explicitly supplied by the caller (Orchestrator Core) at execution time — the Provider Manager holds no independent notion of "which provider is a good fallback for X." This preserves the boundary that selection intelligence lives entirely upstream (Section 2.4 Non-Goals).

### 11.4 Streaming Failure Handling

A failure *before* the first chunk is emitted is treated like a normal execution failure (retry/fallback rules apply in full). A failure *mid-stream* (after some chunks have already been relayed to the caller) is **not** silently retried or failed over — partial output has already been delivered downstream, and silently switching providers mid-stream would produce an incoherent response. Instead, the stream is terminated with a `StreamingFailedMidway` error event, and it is the Orchestrator Core's responsibility to decide whether to restart the operation as a fresh request.

### 11.5 Timeout

Enforced by Timeout Controller (Section 5.7), applied independently to each attempt (a retried call gets a fresh timeout window, not a shared budget across all attempts, unless an overall `maxTotalExecutionTime` ceiling is separately configured to bound worst-case fallback-chain latency).

### 11.6 Recovery

Covered by Circuit Breaker (Section 10.4); Retry/Fallback and Circuit Breaker are complementary: Retry/Fallback handle a single execution's resilience, while Circuit Breaker handles the provider's standing eligibility for *future* executions.

---

## 12. Response Normalization

Different providers return fundamentally different shapes. The Provider Manager guarantees callers always receive one canonical shape regardless of source. Normalization happens in two passes:

1. **Plugin-side pass**: Each Provider Plugin translates its native SDK response into an **intermediate provider-declared shape** — a lightweight, provider-authored mapping of its own fields into roughly-canonical field names, but still plugin-owned code.
2. **Provider-Manager-side pass** (Response Normalizer, Section 5.11): Takes the intermediate shape and produces the final, strictly-validated **canonical response**, filling defaults, validating types, and guaranteeing every consumer downstream sees exactly one contract regardless of which plugin produced the intermediate shape.

This two-pass design keeps provider-specific translation knowledge inside the plugin (where it belongs) while still giving the Provider Manager a strict enforcement point that guarantees consistency even if a plugin's intermediate translation is imperfect.

### 12.1 Canonical Response Shape (Chat/Vision/Structured Output)

| Field | Description |
|---|---|
| `content` | The primary text/structured output. |
| `role` | Always normalized to `assistant` for provider output. |
| `finishReason` | Normalized enum (`stop`, `length`, `tool_call`, `content_filter`, `error`) regardless of provider-specific terminology. |
| `usage` | `{ inputTokens, outputTokens, totalTokens }`. |
| `model` | The actual model that served the request (may differ from requested, e.g., provider-side aliasing). |
| `providerId` | Which provider ultimately served this (relevant after fallback). |
| `latencyMs` | Measured by Latency Monitor. |
| `raw` | The original plugin intermediate shape, retained for debugging only — downstream business logic must never depend on `raw`. |

### 12.2 Streaming

Canonical stream chunks: `{ delta: string, toolCallDelta?, finishReason?, chunkIndex }`, emitted uniformly regardless of whether the source protocol was SSE, WebSocket, or chunked HTTP — protocol-level differences are fully absorbed by the plugin before the chunk ever reaches the Streaming Controller.

### 12.3 Tool Calling

Canonical shape: `{ toolCalls: [{ id, name, arguments (parsed JSON) }] }`, with provider-specific function-calling dialects (e.g., differing argument-encoding conventions) resolved entirely within the plugin's intermediate translation.

### 12.4 Vision

Treated as a variant of the chat canonical shape; the *input* side (image encoding/format) is normalized on the way in by the plugin per its provider's expected format, while the *output* canonical shape is identical to Section 12.1.

### 12.5 Embeddings

Canonical shape: `{ embeddings: number[][], dimensions: number, model, usage }`.

### 12.6 Usage

Always normalized to `{ inputTokens, outputTokens, totalTokens }` even if a provider reports usage differently (e.g., character counts instead of tokens for some local models) — the plugin is responsible for the best-effort token approximation in that case, clearly flagged via a `usageApproximate: true` field passed through in the intermediate shape.

### 12.7 Metadata

Canonical metadata always includes `providerId`, `model`, `requestId`/`correlationId` (propagated from the originating `ExecutionRequest`), and `executionId` (unique per attempt, distinct from `requestId` since one request may span multiple attempts across retry/fallback).

### 12.8 Errors

All errors — regardless of provider origin — are normalized into the classification set from Section 11.2 (`ProviderTimeoutError`, `RateLimitError`, `AuthenticationError`, `InvalidRequestError`, `ProviderUnavailableError`, `CapabilityNotSupportedError`, etc.), each carrying a `providerId`, `originalMessage` (for debugging), and the classification enum used by Retry/Fallback logic.

---

## 13. Events

| Event | Publisher | Subscribers | Payload | Trigger | Retry Behaviour |
|---|---|---|---|---|---|
| `ProviderLoaded` | Plugin Loader (via Lifecycle Manager) | Monitoring, Logging | `{ providerId, pluginVersion }` | Plugin instantiated | None |
| `ProviderRegistered` | Lifecycle Manager | Router (cache invalidation), Monitoring | `{ providerId, capabilities }` | Provider passes validation/init/health and enters registry | None |
| `ProviderReady` | Lifecycle Manager | Router, Orchestrator Core, Monitoring | `{ providerId }` | Provider reaches `Ready` state | None |
| `ProviderHealthChanged` | Health Monitor | Monitoring, Circuit Breaker | `{ providerId, previousStatus, newStatus, latencyMs }` | Any health status transition | None |
| `ProviderUnavailable` | Circuit Breaker | Router, Orchestrator Core, Monitoring, Alerting | `{ providerId, reason }` | Circuit trips Open | None |
| `ProviderRecovered` | Circuit Breaker | Router, Orchestrator Core, Monitoring | `{ providerId, downtimeMs }` | Circuit closes after successful Half-Open trial | None |
| `ProviderExecutionStarted` | Execution Coordinator | Monitoring, Request Manager (status correlation) | `{ executionId, requestId, providerId, model }` | Plugin invocation begins | None |
| `ProviderExecutionCompleted` | Execution Coordinator | Monitoring, Usage/Cost Collectors, Request Manager | `{ executionId, requestId, providerId, latencyMs, usage }` | Successful response normalized | None |
| `ProviderExecutionFailed` | Execution Coordinator | Monitoring, Alerting, Request Manager | `{ executionId, requestId, providerId, errorClassification }` | Terminal failure (after retry/fallback exhausted) | None |
| `RetryStarted` | Retry Manager | Monitoring | `{ executionId, providerId, attempt, delayMs }` | A retry attempt begins | N/A (this event describes the retry, not itself retried) |
| `FallbackStarted` | Fallback Manager | Monitoring, Orchestrator Core | `{ executionId, fromProviderId, toProviderId, reason }` | Switching to next candidate | None |
| `StreamingStarted` | Streaming Controller | Request Manager (stream channel), Monitoring | `{ executionId, providerId }` | First chunk received from plugin | None |
| `StreamingCompleted` | Streaming Controller | Request Manager, Monitoring | `{ executionId, chunkCount, totalLatencyMs }` | Stream terminates (success or clean end) | None |
| `UsageRecorded` | Usage Collector | Cost Collector, Monitoring, Billing/Reporting (future) | `{ executionId, providerId, model, inputTokens, outputTokens }` | Every completed execution | None |
| `MetricsUpdated` | Metrics Collector | Monitoring Dashboard | `{ providerId, aggregateSnapshot }` | Periodic aggregation tick | None |

Event publication is best-effort/fire-and-forget (a publish failure is logged but never blocks execution flow), consistent with the Event Bus MDD's delivery guarantees.

---

## 14. Public Interfaces

### 14.1 `registerProvider(pluginRef, config) -> RegistrationResult`
- **Purpose:** Dynamically register a new provider at runtime.
- **Input:** `pluginRef` (module/package reference), `config` (provider-specific config block).
- **Output:** `RegistrationResult` (`providerId`, `status`).
- **Validation:** Full lifecycle validation (Section 6, Section 8).
- **Errors:** `PluginValidationError`, `VersionMismatchError`, `InitializationError`, `DuplicateProviderIdError`.

### 14.2 `removeProvider(providerId, options) -> RemovalResult`
- **Purpose:** Unregister and shut down a provider.
- **Input:** `providerId`, `options` (`drainTimeoutMs` — how long to wait for in-flight executions before forced cancellation).
- **Output:** `RemovalResult` (`success`, `drainedExecutionCount`, `cancelledExecutionCount`).
- **Validation:** Provider must exist.
- **Errors:** `ProviderNotFoundError`.

### 14.3 `getProvider(providerId) -> ProviderDescriptor`
- **Purpose:** Read-only lookup of a provider's current registry entry (status, capabilities, reliability score).
- **Errors:** `ProviderNotFoundError`.

### 14.4 `listProviders(filter?) -> ProviderDescriptor[]`
- **Purpose:** Enumerate all registered providers, optionally filtered by status/capability — primarily consumed by the Router for candidate discovery.
- **Errors:** None (empty array if no matches).

### 14.5 `execute(executionRequest) -> CanonicalResponse`
- **Purpose:** The primary non-streaming execution entry point. `executionRequest` includes either a single `providerId` or a prioritized `candidateProviderIds` list, plus the canonical request payload (messages, model, capability type, parameters).
- **Output:** `CanonicalResponse` (Section 12.1) or a thrown classified error if all candidates are exhausted.
- **Validation:** Model/capability cross-checked against Model Registry and `supportsCapability()` before invocation.
- **Errors:** Full classification set from Section 11.2, plus `AllCandidatesExhaustedError` when fallback chain is exhausted.
- **Side Effects:** Publishes the full execution event sequence (Section 13); records metrics/usage/cost.

### 14.6 `stream(executionRequest) -> StreamHandle`
- **Purpose:** The primary streaming execution entry point, returning a handle the caller consumes as an async-iterable of canonical stream chunks.
- **Output:** `StreamHandle` wrapping the normalized chunk stream.
- **Validation/Errors:** Same as `execute()`, with mid-stream failure handling per Section 11.4.

### 14.7 `health(providerId?) -> HealthStatus | HealthStatus[]`
- **Purpose:** On-demand health check — single provider if `providerId` given, otherwise all registered providers.
- **Errors:** `ProviderNotFoundError` if a specific ID is given and not found.

### 14.8 `shutdown() -> void`
- **Purpose:** Graceful shutdown of the entire Provider Manager module (platform shutdown path) — drains and shuts down every registered provider.
- **Side Effects:** Calls `removeProvider()` semantics for every provider; publishes no further events after completion.

### 14.9 `reload(providerId) -> RegistrationResult`
- **Purpose:** Hot-reload a specific provider (Section 8.6).
- **Errors:** Same as `registerProvider()`, plus `ProviderNotFoundError` if the target doesn't currently exist.

### 14.10 `validate(pluginRef) -> ValidationResult`
- **Purpose:** Dry-run validation of a plugin without registering it — useful for CI/pre-deployment checks on new provider plugins.
- **Output:** `ValidationResult` (interface compliance, version compatibility, declared capabilities) without side effects on the live registry.

### 14.11 `cancelExecution(executionId) -> void`
- **Purpose:** Propagate cancellation into an in-flight execution (called by the Orchestrator Core when the originating Request Manager `CancellationToken` fires).
- **Errors:** `ExecutionNotFoundError` (already completed or unknown ID — logged, not treated as fatal since cancellation races with completion are expected/benign).

---

## 15. Error Handling

| Error Condition | Handling |
|---|---|
| **Connection Failure** | Classified `Transient` (Section 11.2); Retry Manager applies backoff; Fallback Manager engages if retries exhausted and candidates remain. |
| **Authentication Failure** | Classified non-retryable; immediate fallback if candidates exist; otherwise surfaced as `AuthenticationError` with `providerId`, logged at `error` level and flagged for operator attention (bad/expired credential), since retry cannot resolve it. |
| **Provider Timeout** | Timeout Controller cancels the call via `cancel()`; classified `Timeout`; Retry Manager/Fallback Manager engage per policy. |
| **Provider Crash** (process/connection-level failure distinct from a normal error response) | Classified `Provider Crash/Unavailable`; immediate fallback; Health Monitor triggers an out-of-cycle health check on that provider. |
| **Streaming Failure** | Pre-first-chunk: standard retry/fallback. Mid-stream: terminated cleanly with `StreamingFailedMidway`, no silent provider switch (Section 11.4). |
| **Plugin Failure** (plugin throws an unexpected/unclassified exception) | Caught at the Execution Coordinator boundary, wrapped as `UnclassifiedProviderError`, treated conservatively as non-retryable to avoid repeatedly hitting a broken plugin, and logged with full detail for operator investigation. |
| **Initialization Failure** | Lifecycle Manager transitions provider to `Failed`; `ProviderRegistered`/`ProviderReady` never fire; provider is not resolvable for execution; visible via `listProviders()` with `status: Failed`. |
| **Version Mismatch** | Capability Validator rejects at load time; provider never enters the registry; `registerProvider()`/`validate()` returns `VersionMismatchError` with the required vs. found version range. |
| **Invalid Plugin** (fails to implement required interface methods) | Capability Validator rejects at load time with `PluginValidationError` listing missing/malformed methods. |
| **Retry Exhausted** | Retry Manager signals exhaustion to Execution Coordinator, which hands off to Fallback Manager; if no candidates remain, `AllCandidatesExhaustedError` is raised to the caller with the full attempt history attached for diagnostics. |
| **Recovery Strategy** | Fully automated via Circuit Breaker Half-Open trials (Section 10.4); no manual reset required for transient outages, though `reload()` is available for operator-forced recovery after a credential fix or plugin update. |

---

## 16. Logging

| Log Category | Contents |
|---|---|
| **Provider Logs** | Lifecycle transitions per provider (`Loaded`->`Ready`->...), always including `providerId`. |
| **Execution Logs** | One entry per execution attempt: `executionId`, `requestId`, `correlationId`, `providerId`, `model`, outcome, duration. |
| **Health Logs** | Every health check result (periodic and on-demand), including latency and pass/fail. |
| **Performance Logs** | Per-stage timing within Execution Coordinator (resolve time, connection-acquire time, plugin call time, normalization time). |
| **Debug Logs** | Raw intermediate provider responses (redacted of any secrets) — gated to non-production log levels given potential sensitive content in prompts/responses. |
| **Audit Logs** | Provider registration/removal/reload events, always including the acting identity (from Configuration Manager / Authorization context) for compliance traceability. |

All logs include `correlationId` propagated from the originating request (Request Manager) so a single trace ID spans API Layer -> Request Manager -> Orchestrator Core -> Provider Manager -> Provider Plugin.

---

## 17. Monitoring

| Metric | Description |
|---|---|
| **Latency** | p50/p95/p99 execution latency per provider/model, plus time-to-first-token for streaming. |
| **Availability** | Uptime percentage per provider, derived from Health Monitor history. |
| **Error Rate** | Failed executions / total executions, broken down by error classification and provider. |
| **Cost Tracking** | Aggregated estimated cost per provider/model/project over configurable windows (hour/day/month), sourced from Cost Collector. |
| **Usage Tracking** | Token counts (input/output) per provider/model/project, sourced from Usage Collector. |
| **Streaming Performance** | Chunk delivery rate, time-to-first-token, total stream duration distributions. |
| **Provider Health Dashboard** | Real-time view combining current status, reliability score, circuit breaker state, and recent latency for every registered provider — backed by `listProviders()` plus the Metrics Collector's aggregate snapshots. |

---

## 18. Security

| Concern | Handling |
|---|---|
| **Credential Management** | Provider Manager never stores raw credentials itself — `initialize(config)` receives a config block resolved by Configuration Manager (which in turn integrates with a Secret Store), and each plugin holds credentials only in its own initialized instance memory. |
| **Secret Storage** | Owned entirely outside this module (Configuration Manager / Secret Store); the Provider Manager's responsibility is limited to passing opaque config through without logging or persisting it. |
| **API Keys / OAuth Tokens** | Passed to `initialize()` as part of `config`; never included in any event payload, log line above `debug`, or metrics record. |
| **Token Rotation** | Supported via `reload()` (Section 8.6, 14.9) — a rotated credential triggers a hot reload of the affected provider without downtime for other providers. |
| **Access Control** | The Provider Manager assumes the caller (Orchestrator Core) has already been authorized to request a given provider/capability at a higher layer (Authorization, per SAD) — it does not re-implement per-user provider access policy itself, avoiding duplicated authorization logic. |
| **Encryption** | All provider communication occurs over TLS at the plugin/SDK level (a plugin implementation requirement, enforced by code review / plugin certification process, not by Provider Manager runtime logic, since it never makes the network call itself). |
| **Provider Isolation** | Each plugin instance is isolated in its own object/module scope; a crash or misbehavior in one plugin (e.g., an unhandled exception) is caught at the Execution Coordinator boundary and cannot corrupt state belonging to another provider's plugin instance. |

---

## 19. Performance

| Concern | Approach |
|---|---|
| **Connection Pooling** | Connection Pool Manager provides pooling for plugins that declare support for persistent connections; stateless HTTP-based plugins bypass pooling with a lightweight passthrough. |
| **Async Processing** | All Provider Interface methods are async/non-blocking by contract; the Execution Coordinator never blocks a thread awaiting a provider response. |
| **Streaming** | Streaming Controller relays chunks with minimal buffering (no full-response accumulation for the sole purpose of streaming), keeping per-chunk latency low. |
| **Parallel Requests** | Multiple executions across different providers (or the same provider, if it supports concurrent calls) proceed concurrently; the Provider Manager holds no global lock across executions — concurrency control is scoped per-provider only where connection pooling requires it. |
| **Caching** | `listModels()` results may be cached with a short TTL (configurable) to avoid redundant provider queries on every Router capability check; `estimateCost()`/`estimateLatency()` results are not cached (cheap, synchronous/local computations). |
| **Load Distribution** | Out of scope for this module in v1 (no built-in load balancing across multiple instances of the *same* provider) — candidate-list fallback provides basic distribution when the Router supplies multiple equivalent candidates; true load balancing is a Future Expansion item (Section 23). |
| **Rate Limiting** | Per-provider rate limit awareness (respecting `Retry-After`, Section 11.2) is built in; proactive client-side rate limiting (staying under a known quota before hitting a 429) is a Should-Have (Section 3.2) implemented as a lightweight token-bucket per provider, configuration-driven. |

---

## 20. Interaction With Other Modules

### 20.1 Router / Capability Selector

- **Inbound to Provider Manager:** Calls `execute()`/`stream()` with a resolved `providerId` or `candidateProviderIds` list; calls `listProviders()`/`getProvider()` and `supportsCapability()` (via a resolved provider instance, or a capability pre-check surfaced through `ProviderDescriptor`) at selection time.
- **Outbound from Provider Manager:** Publishes `ProviderReady`/`ProviderUnavailable`/`ProviderRecovered` so the Router's candidate pool stays current without polling.

### 20.2 Model Registry

- Provider Manager consults Model Registry (read-only) to cross-validate requested model IDs and to source capability/context-window metadata surfaced via `ProviderDescriptor` — Provider Manager does not own or write model metadata.

### 20.3 Event Bus

- Provider Manager is a pure publisher for all events in Section 13; it does not require guaranteed subscriber acknowledgment (fire-and-forget), consistent with the Event Bus MDD's at-most-once/best-effort delivery model for non-critical-path notifications.

### 20.4 Configuration Manager

- Source of: retry policy, timeout defaults, circuit breaker thresholds, plugin manifests, pricing tables (for Cost Collector), rate-limit settings.

### 20.5 Logger

- Consumed via injected interface for all logging categories in Section 16.

### 20.6 Request Manager

- No direct call relationship; correlation is via `requestId`/`correlationId` propagated through the Orchestrator Core into every `ExecutionRequest`, enabling end-to-end tracing without a direct dependency edge between Request Manager and Provider Manager.

### 20.7 Orchestrator Core

- The primary caller of every public interface in Section 14, and the consumer of `CanonicalResponse`/stream chunks. Also the originator of `cancelExecution()` calls, propagating a Request Manager-issued `CancellationToken` signal downward.

### 20.8 Sequence Diagram — Router Selection Then Execution

```
Router              ProviderManager           Plugin
  |--listProviders(capability=vision)-->|               |
  |<--[ProviderDescriptor,...]-----------|               |
  |  (Router applies its own selection logic -- out of scope here)
  |--execute({providerId: "openai", ...})->|               |
  |                                       |--vision(req)->|
  |                                       |<--native resp--|
  |<--CanonicalResponse-------------------|               |
```

---

## 21. Folder Structure

```
provider-manager/
├── domain/
│   ├── entities/
│   │   ├── ExecutionRequest.ts          # Canonical request shape passed into execute()/stream()
│   │   ├── CanonicalResponse.ts          # Section 12.1
│   │   ├── ProviderDescriptor.ts
│   │   └── HealthStatus.ts
│   ├── value-objects/
│   │   ├── ProviderId.ts
│   │   ├── ExecutionId.ts
│   │   └── CapabilityType.ts             # enum: chat, streaming, vision, embeddings, tool_calling, structured_output
│   └── state-machine/
│       ├── ProviderLifecycleStateMachine.ts   # Section 6
│       └── CircuitBreakerStateMachine.ts       # Section 10.4
│
├── application/
│   ├── use-cases/
│   │   ├── RegisterProviderUseCase.ts
│   │   ├── RemoveProviderUseCase.ts
│   │   ├── ExecuteUseCase.ts
│   │   ├── StreamUseCase.ts
│   │   ├── HealthCheckUseCase.ts
│   │   ├── ReloadProviderUseCase.ts
│   │   └── CancelExecutionUseCase.ts
│   └── ports/                            # Interfaces this module depends on (driven ports)
│       ├── IProvider.ts                 # The contract every plugin implements (Section 7)
│       ├── PluginRegistryPort.ts
│       ├── ProviderRegistryPort.ts
│       ├── EventBusPort.ts
│       ├── ConfigurationPort.ts
│       ├── LoggerPort.ts
│       ├── ModelRegistryPort.ts
│       └── SecretResolverPort.ts
│
├── components/                           # Internal components from Section 5
│   ├── PluginLoader.ts                # Plugin integration infrastructure
│   ├── CapabilityValidator.ts         # Plugin integration infrastructure
│   ├── PluginRegistry.ts              # Plugin integration infrastructure
│   ├── ProviderRegistryInterface.ts
│   ├── ProviderResolver.ts
│   ├── ExecutionCoordinator.ts
│   ├── TimeoutController.ts
│   ├── RetryManager.ts
│   ├── FallbackManager.ts
│   ├── StreamingController.ts
│   ├── ResponseNormalizer.ts
│   ├── HealthMonitor.ts
│   ├── CircuitBreaker.ts
│   ├── MetricsCollector.ts
│   ├── UsageCollector.ts
│   ├── CostCollector.ts
│   ├── LatencyMonitor.ts
│   ├── LifecycleManager.ts
│   └── ConnectionPoolManager.ts
│
├── infrastructure/                       # Adapters implementing the ports
│   ├── registry/
│   │   └── InMemoryProviderRegistry.ts
│   ├── event-bus/
│   │   └── EventBusAdapter.ts
│   ├── logging/
│   │   └── StructuredLoggerAdapter.ts
│   └── plugin-loading/
│       └── DynamicPluginLoaderAdapter.ts   # Module/package resolution mechanics only -- no provider-specific code
│
├── interface/                            # Driving adapters -- how callers invoke this module
│   └── core/
│       └── ProviderManagerFacade.ts       # Implements the public interfaces from Section 14
│
├── config/
│   └── provider-manager.config.schema.ts  # Retry/timeout/circuit-breaker defaults, plugin manifest schema
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── mock-providers/                    # In-repo fake plugins implementing ProviderInterface for tests
│   ├── contract/
│   ├── performance/
│   └── stress/
│
└── README.md
```

**Note:** No folder in this structure contains any provider-specific SDK code. Actual Provider Plugins (OpenAI, Anthropic, Gemini, Ollama, vLLM, etc.) live in a **separate, independently versioned Provider Plugin System** repository/package tree, each implementing `application/ports/IProvider.ts` and nothing more from this module's perspective.

---

## 22. Testing Strategy

| Test Type | Coverage |
|---|---|
| **Unit Tests** | Every component in Section 5 tested in isolation with mocked ports — e.g., Retry Manager tested against a table of failure classifications and attempt counts without a real plugin; Circuit Breaker tested through every state transition with synthetic health signals. |
| **Integration Tests** | Full `execute()`/`stream()` pipeline exercised against **Mock Providers** (Section 22.3) wired through real internal components (Resolver, Coordinator, Retry, Fallback, Normalizer), confirming correct end-to-end behavior within the module boundary. |
| **Mock Providers** | A set of in-repo fake plugins implementing `ProviderInterface` with configurable behavior (always succeed, fail N times then succeed, always timeout, simulate mid-stream failure, declare specific capability sets) — used across unit, integration, and stress tests without ever depending on real external providers or network access. |
| **Performance Tests** | Measure Provider Manager overhead (resolve + coordinate + normalize time) independent of actual provider latency, using Mock Providers with near-zero simulated latency, to isolate this module's own performance characteristics. |
| **Failure Tests** | Explicit fault injection for every condition in Section 15 (auth failure, timeout, mid-stream failure, plugin throwing unclassified exceptions, version mismatch at load time) confirming correct classification, correct event emission, and correct fallback/retry behavior for each. |
| **Stress Tests** | High-concurrency execution bursts across multiple Mock Providers to validate Connection Pool Manager behavior, Circuit Breaker correctness under load, and that Metrics/Usage/Cost Collectors remain accurate under concurrent writes. |
| **Contract Tests** | Verify every shipped Provider Plugin (real ones, run in a separate test suite gated behind credentials/CI secrets) correctly implements `ProviderInterface` and that its intermediate response shape is correctly normalized by Response Normalizer into the canonical shape — run against real provider sandboxes/test accounts where available, or recorded fixture responses otherwise. |

---

## 23. Future Expansion

Designed so the following require **no changes to Provider Manager source code**, only new plugins, new configuration, or new adapter implementations behind existing ports:

- **New Providers:** Any new provider (present or future — Mistral, Cohere, a new startup's API, etc.) is added purely as a new plugin implementing `ProviderInterface`; the Plugin Loader, Registry, Execution Coordinator, and Normalizer require zero modification.
- **New Protocols:** A plugin using a novel transport (gRPC, a custom binary protocol) is entirely free to do so internally — the Provider Manager only ever sees the same `ProviderInterface` method signatures regardless of what happens inside `chat()`/`stream()`.
- **Local Providers:** Already supported identically to cloud providers (Ollama, LM Studio, vLLM are just plugins) — no special-casing exists or is needed in this module for "local vs. cloud."
- **Cloud Providers:** Same uniform treatment as above.
- **Distributed Providers:** A plugin representing a *pool* of remote worker nodes can implement its own internal load distribution while still exposing one `ProviderInterface` surface to the Provider Manager — the Connection Pool Manager's pluggable design (Section 5.19) already anticipates this.
- **Remote Workers:** Same pattern as Distributed Providers — the Provider Manager's abstraction does not distinguish "one endpoint" from "a plugin-managed fleet behind one endpoint" as long as the interface contract is honored.
- **Multi-Region Providers:** A plugin can implement internal region selection/failover, or the platform can register the same provider multiple times under distinct `providerId`s (e.g., `openai-us`, `openai-eu`) with the Router supplying region-aware candidate lists — either approach requires zero Provider Manager code changes, only configuration/plugin design choices.

The single architectural guarantee underpinning all of the above is that `ProviderInterface` (Section 7) is the **only** contact surface between this module and any provider-specific concern, and that contract is deliberately capability-oriented (not protocol- or vendor-specific), so it does not need to change as new provider categories emerge.

---

## 24. Risks

| Risk Category | Description | Mitigation |
|---|---|---|
| **Performance** | A slow or hanging provider could exhaust concurrency resources (connections, in-flight execution slots) if Timeout Controller misconfiguration allows unbounded waits. | Timeouts are mandatory (never optional) on every plugin invocation, with a conservative platform-wide default ceiling enforced even if a specific provider's configured timeout is missing/misconfigured. |
| **Reliability** | Over-aggressive Circuit Breaker thresholds could mark a genuinely healthy provider `Unavailable` due to transient blips, unnecessarily reducing available capacity. | Thresholds are configurable and tuned per environment; Half-Open recovery is fast (short cool-down default) to minimize the cost of a false trip; `ProviderHealthChanged` events allow operators to observe and tune thresholds empirically. |
| **Security** | A misbehaving or malicious plugin could attempt to exfiltrate credentials or crash the host process. | Plugin validation (Section 8.4) enforces interface compliance; Provider Isolation (Section 18) contains plugin-level exceptions at the Execution Coordinator boundary; credential handling is minimized to pass-through only, never logged or cached by this module. |
| **Scalability** | In-memory Provider Registry (v1) means registry state is not shared across multiple Provider Manager instances in a horizontally scaled deployment. | `ProviderRegistryPort` is an interface from day one (Section 21), enabling a future swap to a shared/distributed backend without touching business logic, mirroring the same pattern used in the Request Manager MDD's Registry design. |
| **Maintenance** | As the number of supported providers grows, the Provider Plugin System (external to this module) could become large and inconsistent in quality if plugin authors interpret `ProviderInterface` loosely. | Contract tests (Section 22) and the `validate()` public interface (14.10) provide an enforceable, automatable certification gate for any new or updated plugin before it is trusted in production. |
| **Coupling Drift** | Contributors might be tempted to add provider-specific conditionals (`if providerId === "openai"`) directly into Provider Manager components for convenience. | This document's explicit "MUST NOT contain provider-specific logic" constraint (Purpose section) and code review discipline treat any such conditional as a design violation requiring escalation, exactly mirroring the Coupling Drift guardrail established in the Request Manager MDD. |

---

## 25. Design Decisions

| Decision | Rationale | Trade-off / Alternative Considered |
|---|---|---|
| **All providers implemented as external plugins behind one `ProviderInterface`, never as internal Provider-Manager code** | Guarantees the "unlimited future providers without modifying Provider Manager source code" requirement; keeps this module's cohesion high (it only knows execution mechanics, never vendor specifics). | Alternative: built-in support for a few "core" providers (e.g., OpenAI, Anthropic) directly in this module, with plugins only for "extra" providers — rejected because it creates two different extension paths and inevitably tempts special-casing (Coupling Drift risk, Section 24). |
| **Two-pass normalization (plugin intermediate shape -> canonical shape)** | Keeps provider-specific format knowledge in the plugin while still giving the Provider Manager one strict enforcement point, rather than trusting every plugin to independently produce a perfectly canonical shape. | Alternative: require plugins to directly produce the final canonical shape — rejected because it pushes canonical-schema-versioning concerns into every plugin's responsibility, making platform-wide schema evolution harder to coordinate across independently maintained plugins. |
| **Fallback strictly limited to caller-supplied candidate lists, no independent provider-selection intelligence** | Preserves the hard boundary that selection intelligence belongs to the Orchestrator Core's Router; prevents this module from silently growing into a second, competing routing system. | Alternative: Provider Manager maintains its own "best alternative" heuristic — rejected as a direct violation of the stated Non-Goal (Section 2.4) and a duplication of Router responsibility. |
| **Circuit Breaker per provider, independent of Retry/Fallback per execution** | Separates two different time horizons of resilience: per-execution transient recovery (Retry/Fallback) vs. standing provider eligibility over time (Circuit Breaker) — conflating them would make both harder to reason about and tune independently. | Alternative: a single unified retry/backoff mechanism with no separate circuit concept — rejected because it would either retry too aggressively against a truly down provider (wasting resources) or fail too fast against a merely blip-affected provider (losing availability unnecessarily). |
| **Mid-stream failures never silently trigger fallback** | Switching providers mid-stream after partial output has already reached the caller would produce an incoherent, potentially confusing composite response; explicit termination + upstream decision is safer and more predictable. | Alternative: attempt to "resume" the stream on a fallback provider — rejected as infeasible in general (different providers don't share continuation state) and rejected even where technically possible due to output-coherence risk. |
| **In-memory Provider Registry for v1, behind a port interface (mirroring Request Manager's Registry pattern)** | Fast to implement, consistent with the platform's existing v1 single-instance deployment target (per PRD), and cheaply reversible later via the port abstraction. | Alternative: distributed registry from day one — rejected as premature for v1 scope, consistent with the same reasoning already established in the Request Manager MDD. |

---

## 26. Diagrams

### 26.1 Component Diagram
See Section 5 for the full internal component diagram.

### 26.2 Provider Operational Lifecycle Diagram
See Section 6.1.

### 26.3 Execution Flow Diagram
See Section 9.1.

### 26.4 Sequence Diagrams
See Section 6.3 (load-to-ready), Section 9.2 (happy path execution), Section 9.3 (failure with fallback), Section 20.8 (Router selection then execution).

### 26.5 Plugin Architecture Diagram

```
+-----------------------------------------------------------+
|                    PROVIDER MANAGER                       |
|         (depends only on ProviderInterface -- a port)     |
+-------------------------+---------------------------------+
                          | implements
        +------------------+------------------+------------------+
        v                 v                    v                  v
+---------------+ +---------------+ +---------------+ +---------------+
| OpenAI Plugin   | | Anthropic       | | Ollama Plugin   | | ... (any       |
|                 | | Plugin          | | (local)         | | future plugin) |
+---------------+ +---------------+ +---------------+ +---------------+
        |                 |                    |                  |
        v                 v                    v                  v
   OpenAI SDK        Anthropic SDK      Ollama local API     (vendor SDK)
```

### 26.6 State Diagram
See Section 6.2 (Provider Lifecycle states) and Section 10.4 (Circuit Breaker states).

### 26.7 Folder Structure Diagram
See Section 21.

---

## 27. Architectural Constraints

This section defines mandatory architectural rules that govern the Provider Manager's role and boundaries. These constraints are not optional design preferences; they are mandatory operating rules for the module.

- Provider Manager never selects providers.
- Provider Manager never performs routing.
- Provider Manager never performs planning.
- Provider Manager never performs memory retrieval.
- Provider Manager never performs knowledge comparison.
- Provider Manager never executes browser automation.
- Provider Manager never reviews AI output.
- Provider Manager never validates AI output.
- Provider Manager never performs business logic.
- Provider Manager never directly communicates with provider SDKs.
- Provider Manager only communicates through Provider Interface.
- Provider Manager never bypasses Provider Plugin System.

These constraints are mandatory architectural rules and must remain unchanged as the platform evolves.

## 28. Architectural Decision Records

This section records the major architectural decisions that shape the Provider Manager and its operating model. Each decision is kept concise so it can be used as a governance reference during implementation and review.

### 28.1 ADR-001 Provider Plugin Architecture
- **Decision:** Provider-specific execution logic is implemented in Provider Plugins behind a single Provider Interface.
- **Context:** The platform must support heterogeneous providers without embedding provider-specific logic into Provider Manager.
- **Alternatives Considered:** Built-in provider implementations inside Provider Manager; provider-specific branches inside the core module.
- **Rationale:** This preserves extensibility and keeps the Provider Manager focused on coordination and normalization.
- **Consequences:** New providers are added through plugins rather than by changing Provider Manager code.

### 28.2 ADR-002 Provider Interface Abstraction
- **Decision:** All provider interactions occur through a stable Provider Interface.
- **Context:** Provider SDKs and wire formats are incompatible across vendors.
- **Alternatives Considered:** Direct SDK calls from the Provider Manager; a collection of provider-specific adapters scattered across the core module.
- **Rationale:** A single abstraction reduces coupling and keeps execution flow uniform.
- **Consequences:** Provider Manager depends only on the contract, not on vendor-specific implementations.

### 28.3 ADR-003 Two-Pass Response Normalization
- **Decision:** Provider responses are normalized in two passes: plugin translation followed by Provider Manager canonical normalization.
- **Context:** Provider-native responses vary greatly and must still produce one platform-wide contract.
- **Alternatives Considered:** Allowing every plugin to emit the final canonical shape directly.
- **Rationale:** The two-pass approach localizes provider-specific translation while preserving platform-wide consistency.
- **Consequences:** The Provider Manager enforces a universal response contract without owning provider-specific parsing logic.

### 28.4 ADR-004 Retry Before Fallback
- **Decision:** Transient failures are retried on the same provider before switching to another candidate.
- **Context:** Some failures are temporary and should not trigger unnecessary provider changes.
- **Alternatives Considered:** Immediate fallback on the first failure; retrying after fallback.
- **Rationale:** This improves resilience while preserving the caller's intended provider preference where possible.
- **Consequences:** Retry and fallback remain distinct and deterministic.

### 28.5 ADR-005 Circuit Breaker Pattern
- **Decision:** A circuit breaker is maintained per provider to protect the system from repeatedly routing to unhealthy providers.
- **Context:** Persistently failing providers should be deprioritized automatically.
- **Alternatives Considered:** Pure retry-only behavior; manual operator intervention for every outage.
- **Rationale:** The circuit breaker reduces load and improves overall stability.
- **Consequences:** Providers recover automatically through controlled health-based transitions.

### 28.6 ADR-006 Stateless Execution Coordination
- **Decision:** Execution coordination is stateless with respect to provider-specific execution details.
- **Context:** The Provider Manager must support concurrency and multiple execution attempts without hidden shared state.
- **Alternatives Considered:** Embedding execution state inside provider instances; a central monolithic execution engine.
- **Rationale:** Stateless coordination improves concurrency safety and simplifies reasoning about retries and fallbacks.
- **Consequences:** Execution flow remains explicit, traceable, and testable.

### 28.7 ADR-007 Clean Architecture
- **Decision:** The module is structured around domain entities, application use cases, ports, and adapters.
- **Context:** The Provider Manager must remain maintainable as the platform grows.
- **Alternatives Considered:** A tightly coupled monolithic implementation.
- **Rationale:** Clean Architecture improves separation of concerns and testability.
- **Consequences:** Internal components remain focused on well-defined responsibilities.

### 28.8 ADR-008 Hexagonal Architecture
- **Decision:** Provider Manager interacts with the outside world through ports and adapters.
- **Context:** The module must integrate with registries, event buses, logging, and plugins without becoming tightly coupled to them.
- **Alternatives Considered:** Direct in-module dependencies on every external subsystem.
- **Rationale:** Hexagonal architecture keeps the core execution logic independent from infrastructure concerns.
- **Consequences:** Interfaces can evolve without forcing broad changes to execution logic.

### 28.9 ADR-009 Plugin Isolation
- **Decision:** Each provider plugin is isolated behind its own implementation boundary and cannot directly affect other providers.
- **Context:** Misbehaving plugins must not corrupt the execution environment of unrelated providers.
- **Alternatives Considered:** Shared plugin runtime state; direct coupling between plugin instances.
- **Rationale:** Isolation improves resilience and simplifies failure containment.
- **Consequences:** Plugin failures remain localized to the relevant execution path.

### 28.10 ADR-010 Provider SDK Isolation
- **Decision:** Provider Manager never imports or depends directly on provider SDKs.
- **Context:** SDK dependencies create coupling and complicate support for new providers.
- **Alternatives Considered:** Embedding SDK dependencies in the core module.
- **Rationale:** SDK isolation preserves the separation between orchestration and provider-specific implementation.
- **Consequences:** Provider-specific code remains entirely within the plugin system.

## 29. Provider Interface Versioning Policy

The Provider Interface is a long-lived contract and must evolve in a controlled manner. The following rules govern its evolution.

### 29.1 Interface Versioning
- Provider plugins declare the Provider Interface version they were built against.
- Provider Manager validates the declared version before registration or execution.
- Version compatibility is checked against a supported version range defined by configuration or module constants.

### 29.2 Backward Compatibility
- Additive changes to the interface are preferred over breaking changes.
- Existing plugin implementations remain valid when new optional methods or fields are added without altering existing semantics.
- Backward-compatible changes must not require Provider Manager source changes.

### 29.3 Forward Compatibility
- New Provider Manager versions must continue to honor older plugin contracts where the contract remains semantically compatible.
- Plugins should avoid relying on behavior not explicitly guaranteed by the interface contract.

### 29.4 Breaking Changes
- Breaking changes are allowed only through a new interface version.
- Breaking changes must be documented, tested, and communicated before deployment.
- Existing plugins must be explicitly migrated when a new interface version supersedes the old one.

### 29.5 Deprecated Interface Methods
- Deprecated methods remain supported for a defined transition window.
- Deprecation must be visible in plugin documentation and release notes.
- Deprecated methods must not be removed until all supported plugins have migrated.

### 29.6 Migration Strategy
- Provider Manager supports migration through versioned plugin validation and compatibility checks.
- Plugin authors should follow a staged migration path from old interface methods to new ones.
- A plugin that cannot migrate within the required window is rejected for production use.

### 29.7 Plugin Compatibility Matrix
- A compatibility matrix tracks supported Provider Interface versions per plugin.
- The matrix is used during registration, validation, and release approval.
- Plugins outside the supported compatibility range are not admitted into the runtime registry.

## 30. Plugin Certification Policy

All provider plugins intended for production use must pass a certification process before they are trusted by the platform.

- **Interface compliance:** The plugin must implement the required Provider Interface methods and return the expected shapes.
- **Contract testing:** The plugin must pass automated contract tests against the Provider Manager's normalization and execution expectations.
- **Security validation:** The plugin must demonstrate safe credential handling, secure transport use, and isolated execution behavior.
- **Capability validation:** Declared capabilities must match actual behavior and be verifiable through test fixtures or live validation runs.
- **Performance validation:** The plugin must meet minimum latency and resource usage expectations under normal and stress conditions.
- **Compatibility verification:** The plugin must be verified against the supported Provider Interface version range and current Provider Manager runtime expectations.
- **Release approval:** A plugin is not released to production without passing the required review gate and certification evidence.
- **Plugin certification process:** Certification is a formal release gate that combines validation, review, testing, and operational readiness checks.

## 31. Plugin Ownership Rules

Ownership boundaries are explicit and non-overlapping. This rule prevents responsibility drift and preserves the separation of concerns defined by the architecture.

- **Provider Manager owns:** execution coordination, retry, timeout, fallback, metrics, and health.
- **Provider Plugin owns:** SDK implementation, HTTP requests, authentication implementation, request translation, response translation, and streaming protocol handling.
- **Provider Registry owns:** provider state, provider availability, and reliability information.

Ownership never overlaps. If a concern is operational and execution-oriented, it belongs to Provider Manager. If it is provider-specific and implementation-oriented, it belongs to the plugin. If it is registry state and availability, it belongs to the Provider Registry.

## 32. Execution Guarantees

The Provider Manager guarantees the following properties for every execution lifecycle.

- Every execution receives an executionId.
- Every execution belongs to exactly one request.
- Every execution has exactly one provider.
- Every execution is fully traceable.
- Every execution reaches a terminal state.
- Every response is normalized.
- Every failure is classified.

These guarantees are mandatory design properties and are enforced by the execution pipeline.

## 33. Provider Registry Governance

The Provider Registry is a governed runtime component and must follow explicit lifecycle and state-management rules.

- **Retention policy:** Registry entries remain available while the provider is active or relevant to the runtime, and are removed on shutdown or explicit removal.
- **Cleanup policy:** Stale providers, failed providers, and retired plugins are removed according to configured cleanup rules and operational policy.
- **Synchronization strategy:** Registry state is kept consistent with plugin loading, health checks, registration, and removal events.
- **Future distributed registry:** A distributed registry is a future enhancement and does not alter the current architectural contract.
- **Consistency guarantees:** Registry state is consistent with the current lifecycle and health state visible to the Provider Manager.
- **Registry ownership:** Provider state and runtime availability remain the responsibility of the Provider Registry; Provider Manager uses this state but does not own its semantics independently.

## 34. Correlation Model

The Provider Manager uses a consistent identifier model to support observability, debugging, and future distributed tracing.

- **requestId:** Identifies the originating request.
- **executionId:** Identifies one execution attempt within a request lifecycle.
- **correlationId:** Connects related events across modules and execution stages.
- **providerId:** Identifies the provider that served or attempted the execution.
- **modelId:** Identifies the model invoked by the provider.
- **sessionId:** Identifies the user or session context associated with the request.
- **projectId:** Identifies the owning project or tenant context.
- **traceId (future):** Supports distributed tracing across service boundaries.
- **spanId (future):** Supports finer-grained tracing within a distributed execution chain.

These identifiers enable end-to-end observability and ensure the Provider Manager can be correlated with upstream request flows.

## 35. Operational Limits

Operational limits are configuration-driven and must be enforced consistently across executions and providers.

- Maximum concurrent executions
- Maximum provider timeout
- Maximum retries
- Maximum fallback depth
- Maximum streaming duration
- Maximum connection pool size
- Maximum health-check frequency
- Maximum plugin initialization timeout
- Maximum response size

These limits are policy controls rather than hardcoded assumptions, and they are configured per environment or per provider where appropriate.

## 36. Observability Standards

Every execution must emit telemetry sufficient for monitoring, diagnosis, and operational review.

- executionId
- requestId
- correlationId
- providerId
- pluginId
- modelId
- capability
- latency
- retry count
- fallback count
- circuit breaker state
- outcome

This telemetry is used to monitor health, diagnose failures, and support debugging of provider execution behavior over time.

## 37. Provider Capability Governance

Capabilities are governed as first-class operational contracts and must remain stable during execution.

- **Capability ownership:** Capability declarations are owned by the provider plugin and validated by Provider Manager.
- **Capability validation:** The Provider Manager verifies that declared capabilities are compatible with the requested execution.
- **Capability evolution:** Capability definitions may evolve over time, but must do so through documented interface and compatibility governance.
- **Capability deprecation:** Deprecated capabilities are marked as such and eventually removed through the versioning policy.
- **Capability compatibility:** Capabilities must be compatible with the provider's actual execution behavior and current interface version.
- **Capability negotiation:** The Provider Manager uses declared capabilities to validate whether a provider can satisfy the request.
- **Capability verification:** Capability claims are verified during plugin validation and before execution.

Capabilities are immutable during execution. A provider's capability set must not change mid-flight for a single execution attempt.

## 38. Response Normalization Guarantees

The Response Normalizer enforces strict guarantees for provider output.

- Every provider response produces one canonical response.
- The canonical schema never depends on provider.
- Plugins never expose SDK objects.
- Downstream modules never inspect provider-native responses.
- Raw provider responses are retained only for diagnostics.

This ensures downstream business logic, orchestration logic, and review modules consume a stable internal contract.

## 39. Failure Recovery Guarantees

Recovery behavior is deterministic and governed by explicit policy rather than ad hoc handling.

- Retries never bypass timeout.
- Fallback never changes request intent.
- Circuit Breaker never retries indefinitely.
- Recovery is deterministic.
- Execution history is preserved.
- Failures remain traceable.

These guarantees preserve predictability and make recovery behavior observable and auditable.

## 40. Security Governance

Security governance applies to plugin trust boundaries, credentials, isolation, and operational review.

- **Plugin trust boundaries:** Provider plugins are treated as untrusted execution boundaries until validated and certified.
- **Credential ownership:** Credentials are owned by configuration and secret-management infrastructure, not by Provider Manager runtime logic.
- **Plugin isolation:** Plugins must not share mutable state that can compromise another provider's execution context.
- **Secure communication requirements:** Provider communication must use secure transport and follow platform security policy.
- **Secret handling:** Secrets must never be logged, persisted, or exposed through execution events.
- **Audit requirements:** Registration, removal, reload, and failure events must be auditable.
- **Security review expectations:** New or modified plugins must pass security review before production release.

## 41. Future Scalability Considerations

The following items are future enhancements and do not change the current architecture. They are explicitly documented as growth paths for later implementation.

- Distributed Provider Registry
- Regional provider clusters
- Provider federation
- Distributed execution
- Shared health state
- Shared circuit breaker state
- Provider discovery service

These capabilities may be introduced later through configuration, adapter changes, or new registry implementations without altering the existing Provider Manager responsibilities or execution model.

## Appendix A — Consistency Notes

- The `ExecutionRequest`/`CanonicalResponse` shapes referenced throughout this document are the Provider Manager's own domain entities (Section 21 `domain/entities/`), distinct from — but populated from — the `Request` object defined in the Request Manager MDD; the Orchestrator Core is responsible for the translation between the two, not this module.
- `capabilitiesRequested`, `routingPreferences`, and `executionProfile`, defined as opaque pass-through fields in the Request Manager MDD, are the fields the Orchestrator Core's Router interprets to ultimately produce the `providerId`/`candidateProviderIds` and capability-typed call this module receives — this module never re-interprets them itself.
- Pricing tables consumed by Cost Collector (Section 5.16) and model capability metadata consumed by Capability Validator/Provider Resolver are sourced from the Model Registry and Configuration Manager per the Database Design Document's schema for provider/model metadata; this document does not redefine that schema.
- Event delivery semantics (best-effort, no publisher-side retry) referenced in Section 13 and Section 20.3 follow the guarantees already established in the Event Bus MDD and are not re-specified here.
