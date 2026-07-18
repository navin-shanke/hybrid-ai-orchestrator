# API Specification Document (ASD)
## Hybrid AI Development Platform — Orchestrator Core

**Version:** 1.1
**Status:** Draft for engineering review with governance appendix
**Companion to:** Orchestrator SDD v1.0

---

## 1. Overview

### 1.1 Purpose

This document defines every external and internal API surface of the Orchestrator: endpoint contracts, request/response formats, authentication, error handling, streaming behavior, versioning, and internal service-to-service calls. No implementation code is included — this is a contract specification.

### 1.2 API Philosophy

- **OpenAI-compatible at the edge.** The primary external surface mirrors `/v1/chat/completions` and `/v1/models` semantics so Roo Code, Continue, and any other OpenAI-compatible client work without custom integration.
- **Capability-transparent, provider-opaque.** Clients never see or select a specific vendor; they see models and capabilities.
- **Contract before code.** Every internal component exposes a narrow, documented interface (Purpose / Input / Output / Errors / Events) matching the ports defined in the SDD — no undocumented cross-component calls.
- **Streaming-first.** Long orchestration runs are assumed by default; synchronous non-streaming responses are the special case, not the norm.

### 1.3 REST vs Streaming

| Style | Used for |
|---|---|
| **REST (request/response)** | Resource management: tasks, projects, memory, configuration, providers, models list |
| **Streaming (SSE)** | Chat completions — content tokens interleaved with status tokens for live orchestration progress |

Both styles share the same authentication, versioning, and error-code conventions.

### 1.4 Versioning Strategy

- All endpoints are namespaced under `/v1/...`.
- Breaking changes are never introduced into `/v1`; they ship under a new `/v2` namespace, released alongside `/v1`, with `/v1` kept live through a deprecation window (see §10).
- Non-breaking additions (new optional fields, new endpoints) may land in `/v1` at any time.

### 1.5 Authentication Strategy

Local-first by default, extensible to team/enterprise auth without changing endpoint contracts. See §6 for full detail.

### 1.6 API Standards

- JSON request/response bodies (`application/json`), except SSE streams (`text/event-stream`).
- All timestamps ISO-8601 UTC.
- All identifiers (`taskId`, `sessionId`, `projectId`) are opaque strings (UUIDv4 recommended).
- All list endpoints support `limit`/`cursor` pagination.
- All endpoints return a `requestId`/`correlationId` in both success and error responses for log tracing (ties directly to the Orchestrator's Event Bus correlation IDs from the SDD).

---

## 2. External API — Summary

These are the APIs exposed to Roo Code, Continue, or any other client.

| Resource | Endpoints |
|---|---|
| Chat | `POST /v1/chat/completions` |
| Models | `GET /v1/models` |
| Providers | `GET /v1/providers` |
| Tasks | `POST /v1/tasks`, `GET /v1/tasks/{id}`, `DELETE /v1/tasks/{id}` |
| Projects | `POST /v1/projects`, `GET /v1/projects`, `PATCH /v1/projects/{id}` |
| Memory | `GET /v1/memory`, `POST /v1/memory`, `DELETE /v1/memory` |
| Configuration | `GET /v1/config`, `PATCH /v1/config` |
| Review | `POST /v1/review` |
| Browser | `POST /v1/browser/run` |
| Validation | `POST /v1/validate` |

Full specification for the primary endpoint (`/v1/chat/completions`) is given as the reference template in §4; all other endpoints follow the same template and are specified in §2.1–§2.9 in abbreviated form (full field-by-field validation rules to be finalized per-endpoint during implementation).

### 2.1 `GET /v1/models`

- **Purpose**: Return the orchestrator's Model Registry contents — every model currently known across all configured providers.
- **Request**: no body. Optional query params: `capability` (filter by tag, e.g. `?capability=vision`), `provider`.
- **Response**: `{ "object": "list", "data": [ { "id", "provider", "capabilities": [], "context_window", "health" } ] }` — shaped to satisfy OpenAI client expectations while carrying orchestrator-specific extra fields.
- **Errors**: `500` on registry read failure.
- **Events**: none (read-only, no orchestration triggered).

### 2.2 `GET /v1/providers`

- **Purpose**: List all configured Provider Plugins and their live health status.
- **Response**: `{ "data": [ { "providerId", "type": "cloud"|"local", "enabled", "health": "healthy"|"degraded"|"unreachable"|"unknown", "lastCheckedAt" } ] }`.
- **Errors**: `500` on Provider Manager query failure.

### 2.3 `POST /v1/tasks`, `GET /v1/tasks/{id}`, `DELETE /v1/tasks/{id}`

- **Purpose**: Direct management of long-running development tasks outside the chat-turn flow (e.g., a background refactor triggered independently of a live chat exchange).
- **Create Request**: `{ "projectId", "description", "requiredCapabilities": [], "priority" }`.
- **Create Response**: `{ "taskId", "status": "Pending" }` (status values match the Task state machine in the SDD §25).
- **Get Response**: full task state including current stage, review/validation results if available.
- **Delete**: cancels an in-flight task; maps to Task Queue `cancel(sessionId/taskId)`.
- **Errors**: `404` unknown task, `409` if attempting to delete an already-`Completed` task.
- **Events**: `TaskCreated` on create, `TaskCompleted`/task cancellation event on delete.

### 2.4 `POST /v1/projects`, `GET /v1/projects`, `PATCH /v1/projects/{id}`

- **Purpose**: Manage the project scope that Project Memory and Knowledge Base entries are namespaced under.
- **Create Request**: `{ "name", "repoPath" (optional), "defaultRoutingProfile" (optional) }`.
- **Patch Request**: partial update, e.g. `{ "defaultRoutingProfile" }`.
- **Errors**: `400` invalid name/path, `404` unknown project on patch.

### 2.5 `GET /v1/memory`, `POST /v1/memory`, `DELETE /v1/memory`

- **Purpose**: Inspect and manage Live Memory / Project Memory contents for a session or project (debugging, manual correction, explicit forget requests).
- **Get**: query params `sessionId` or `projectId`; returns current memory records.
- **Post**: `{ "scope": "session"|"project", "id", "record" }` — manual memory injection (e.g., pinning a fact).
- **Delete**: query params identifying scope + optional record id; without a record id, clears the full scope (used sparingly, e.g. "forget this session").
- **Errors**: `404` unknown session/project, `400` malformed record.
- **Events**: `MemoryUpdated`.

### 2.6 `GET /v1/config`, `PATCH /v1/config`

- **Purpose**: Read/update runtime configuration — the same schema the Configuration Manager loads from YAML (SDD §13), exposed for the future dashboard and for scripted setup.
- **Get Response**: current effective config (secrets redacted).
- **Patch Request**: partial config diff, schema-validated before applying; triggers Configuration Manager hot-reload.
- **Errors**: `400` schema violation (returns the specific validation failure), `403` if a field is marked immutable-at-runtime (e.g., listen port).

### 2.7 `POST /v1/review`

- **Purpose**: Explicitly trigger a Review Engine pass on a given artifact/output outside the normal task pipeline (e.g., "review this code I pasted").
- **Request**: `{ "content", "intent" (optional context), "reviewerCapabilities" (optional override) }`.
- **Response**: `ReviewResult` — `{ "approved": bool, "notes": [], "reviewerModel" }`.
- **Errors**: `503` if no reviewer candidate available.
- **Events**: `ReviewCompleted`.

### 2.8 `POST /v1/browser/run`

- **Purpose**: Explicitly trigger the Browser Automation / Vision Pipeline against a target URL or local dev server, independent of a validation task.
- **Request**: `{ "url", "actions": [] (optional scripted steps), "captureScreenshot": bool }`.
- **Response**: `{ "state": { "dom summary", "screenshotRef" }, "durationMs" }`.
- **Errors**: `408` navigation timeout, `502` browser engine failure.
- **Events**: `BrowserValidationStarted`.

### 2.9 `POST /v1/validate`

- **Purpose**: Explicitly trigger Knowledge Comparison ("expected vs. actual") against a provided or referenced expected-state definition.
- **Request**: `{ "expected" (inline or KB reference), "actual" (inline or browser/run reference) }`.
- **Response**: `ValidationResult` — `{ "pass": bool, "diff": [], "severity" }`.
- **Errors**: `422` if expected/actual states are unparseable (returns `Inconclusive`, not treated as a hard failure per SDD §18).
- **Events**: `RegressionDetected` (on mismatch).

---

## 3. Internal APIs

Not exposed externally. These map directly to the component public interfaces defined in the SDD (§6) and are documented here purely as contracts — no transport/protocol details, since these are in-process port calls, not network APIs.

### `Router.selectProvider(task)`
- **Purpose**: Choose a `(Provider, Model)` pair for a task via capability matching.
- **Input**: `Task` (with `requiredCapabilities[]`).
- **Output**: `{ providerId, modelId }`.
- **Errors**: `NoCandidateAvailable`.
- **Events produced**: `ProviderSelected`.

### `Planner.createPlan(request, context)`
- **Purpose**: Decompose a request into a task DAG.
- **Input**: normalized request + hydrated memory/KB context.
- **Output**: `Plan` (task graph).
- **Errors**: `PlanningFailed` (triggers single-task fallback plan per SDD §18).
- **Events produced**: `PlannerStarted`, `TaskCreated` (per task).

### `Memory.loadContext(sessionId, projectId)`
- **Purpose**: Hydrate Live Memory + relevant Knowledge Base records.
- **Input**: session/project identifiers.
- **Output**: bounded context object.
- **Errors**: `MemoryLoadFailed` (non-fatal, degrades to empty context).
- **Events produced**: `MemoryLoaded`.

### `Knowledge.compare(expected, actual)`
- **Purpose**: Diff expected vs. actual state.
- **Input**: two normalized state objects.
- **Output**: `{ match: bool, diff[], severity }`.
- **Errors**: `Inconclusive`.
- **Events produced**: `RegressionDetected` (on mismatch), `KnowledgeUpdated` (if diff promotes new knowledge).

### `Provider.execute(providerModel, payload)`
- **Purpose**: Uniform execution call into a Provider Plugin via `ChatCompletionPort`.
- **Input**: `{ providerId, modelId, payload }`.
- **Output**: normalized stream of `{ type: "content"|"tool_call"|"usage", ... }` chunks.
- **Errors**: `ProviderTimeout`, `ProviderError`, `ProviderUnavailable`.
- **Events produced**: `LocalExecutionStarted` or `CloudReviewStarted` (context-dependent).

### `Review.start(taskOutput, intent)`
- **Purpose**: Run a review pass on a task's output.
- **Input**: output + original intent.
- **Output**: `ReviewResult`.
- **Errors**: `ReviewerUnavailable` (skips per configured strictness).
- **Events produced**: `ReviewCompleted`.

### `TaskQueue.enqueue(plan)`
- **Purpose**: Schedule a plan's tasks respecting the dependency DAG and concurrency limits.
- **Input**: `Plan`.
- **Output**: none (async); results delivered via events/subscription.
- **Errors**: `QueueFull` (backpressure, per SDD §21).
- **Events produced**: task lifecycle events per node (`TaskCompleted`, etc.).

### `Logger.write(entry)`
- **Purpose**: Emit a structured, correlated log line.
- **Input**: `{ sessionId, taskId, component, event, level, payload }` (secrets pre-redacted by caller or Security Layer).
- **Output**: none.
- **Errors**: logging failures are swallowed with a best-effort fallback (never propagate to the caller).

### `EventBus.publish(event)`
- **Purpose**: Broadcast a domain event to all subscribers.
- **Input**: `{ type, sessionId, taskId, timestamp, payload }`.
- **Output**: none (fire-and-forget to subscribers; each subscriber failure isolated per SDD §18).
- **Errors**: none surfaced to publisher.

---

## 4. Endpoint Specification Template (Reference: `POST /v1/chat/completions`)

### Endpoint
`POST /v1/chat/completions`

### Purpose
Generate AI responses through the orchestrator — the single entry point used by Roo Code / Continue for all chat-driven development interaction.

### Request

**Required fields**
- `messages[]` — array of `{ role: "system"|"user"|"assistant"|"tool", content }`, OpenAI-compatible.

**Optional fields**
- `model` — advisory only; the orchestrator's Router makes the actual capability-based selection, but a client-supplied hint (e.g., "prefer local") may be honored as a routing preference.
- `tools[]` — OpenAI-style tool/function definitions available to the assistant.
- `stream` — boolean, default `true` for this orchestrator (long-running orchestration favors streaming).
- `projectId` / `sessionId` — for memory/context scoping; auto-created if omitted.
- `routingPreferences` — `{ privacy, maxCost, maxLatencyMs }` optional per-request override of default routing weights.
- `metadata` — free-form client metadata, passed through to logs only.

**Validation rules**
- `messages[]` must be non-empty and end with a `user` or `tool` role message.
- `tools[]`, if present, must be valid JSON-schema function definitions.
- `stream=false` requests are still internally orchestrated as a stream and buffered server-side into a single response — the client-visible contract is synchronous, the internal execution is not.

### Response

**Non-streaming success (`stream:false`)**
```
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": <unix ts>,
  "model": "<resolved model id>",
  "choices": [{ "index":0, "message": {...}, "finish_reason":"stop" }],
  "usage": {...},
  "orchestrator_metadata": {
    "sessionId", "taskCount", "providersUsed": [], "reviewPassed": bool, "validationPassed": bool
  }
}
```
The `orchestrator_metadata` block is an additive, non-breaking extension — standard OpenAI clients ignore unrecognized top-level fields.

**Streaming response**: see §5.

### Error Responses

| Scenario | HTTP Code | Body shape |
|---|---|---|
| Invalid Request (schema/validation failure) | 400 | `{ "error": { "type":"invalid_request", "message", "requestId" } }` |
| Authentication Failed | 401 | `{ "error": { "type":"authentication_error", "message" } }` |
| Provider Timeout (all fallback candidates exhausted) | 504 | `{ "error": { "type":"provider_timeout", "message", "providersAttempted":[] } }` |
| Model Unavailable (no capable candidate) | 503 | `{ "error": { "type":"model_unavailable", "requiredCapabilities":[] } }` |
| Memory Not Found (invalid sessionId/projectId reference) | 404 | `{ "error": { "type":"memory_not_found", "message" } }` |

For `stream:true` requests, errors that occur *after* streaming has begun are delivered as a terminal SSE `error` event (see §5), not an HTTP status change, since headers are already committed.

### Timeout Rules

| Execution path | Timeout |
|---|---|
| Local model (Ollama/vLLM/etc.) | Configurable, default 120s per task (local hardware variance is high) |
| Cloud provider | Configurable, default 60s per task |
| Browser validation | Configurable, default 30s per navigation/action |
| Overall session (all tasks) | Configurable soft ceiling, default 10 minutes, emits a warning status token as it approaches |

### Retry Strategy

- **Automatic retries**: up to 2 retries per provider call on transient errors (timeout, 5xx, connection reset), with exponential backoff (base 500ms, factor 2, jittered).
- **Provider failover**: after retry exhaustion on the selected candidate, the Router is re-invoked excluding the failed candidate, per the fallback chain defined in the SDD §11. This repeats until candidates are exhausted or a success occurs.
- **No retry** on 4xx-class provider errors (e.g., invalid request rejected by the provider itself) — these are treated as terminal for that candidate and immediately trigger failover rather than retry.

### Events

`RequestReceived` → `MemoryLoaded` → `PlannerStarted` → `TaskCreated` (×N) → `ProviderSelected` (per task) → `LocalExecutionStarted`/`CloudReviewStarted` → `ReviewCompleted` → `BrowserValidationStarted` (if applicable) → `RegressionDetected` (if applicable) → `TaskCompleted` (×N) → `ResponseGenerated`.

(Full catalog and consumers in the SDD §8.)

---

## 5. Streaming API

### SSE Transport
Response `Content-Type: text/event-stream`. Each event is a standard SSE frame (`data: {...}\n\n`).

### Chunk Format
Two delta types are interleaved, both nested inside the standard OpenAI `choices[0].delta` shape for client compatibility:

```
data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"orchestrator_status":{"stage":"routing","detail":"Selecting provider..."}}}]}
```

- **Content deltas**: standard `delta.content` token text — safe for any OpenAI-compatible client to render as-is.
- **Status deltas**: carried in the non-standard `delta.orchestrator_status` field, ignorable by clients that don't understand it, consumable by status-aware UIs to show live progress (`planning`, `routing`, `executing`, `reviewing`, `validating`).

### Completion Event
Final frame: `data: {"choices":[{"delta":{},"finish_reason":"stop"}], "orchestrator_metadata": {...}}` followed by the standard SSE terminator `data: [DONE]\n\n`.

### Cancellation
Client disconnect (or explicit `DELETE /v1/tasks/{id}` for the underlying task) triggers immediate Task Queue cancellation and Provider Manager abort of any in-flight provider calls; a best-effort `PartiallyCompleted` state is persisted to memory.

### Heartbeats
A comment-only SSE line (`: heartbeat\n\n`) is sent every 15s during long silent stretches (e.g., waiting on a slow local model) to prevent proxy/idle-timeout disconnects, per standard SSE keep-alive practice.

---

## 6. Authentication

| Mode | Description | Status |
|---|---|---|
| **Local Development Mode** | No auth, or a static local token, bound to `localhost` only | Available at launch (default) |
| **API Keys** | Bearer token issued per client, validated by the Security Layer | Available at launch |
| **Service Tokens** | Machine-to-machine tokens for CI/automation callers | Planned, near-term |
| **OAuth** | For future multi-user/team deployment (dashboard, hosted mode) | Planned, future |

All modes converge on the same internal `AuthContext` passed to the Request Handler, so authorization logic downstream of the API Layer is auth-mode-agnostic.

---

## 7. Error Codes

| Code | Meaning | Typical source |
|---|---|---|
| 400 | Invalid Request | Schema/validation failure at API Layer |
| 401 | Unauthorized | Missing/invalid credentials |
| 403 | Forbidden | Valid credentials, insufficient permission (e.g., immutable config field) |
| 404 | Resource Not Found | Unknown task/project/session/memory reference |
| 408 | Timeout | Client-side request timeout before orchestrator responded |
| 409 | Conflict | e.g., deleting an already-completed task |
| 422 | Unprocessable | Validation/comparison state unparseable (`Inconclusive`) |
| 429 | Rate Limited | Client exceeded configured request rate |
| 500 | Internal Error | Unclassified orchestrator fault |
| 503 | Provider Unavailable | No capable/healthy candidate found by Router |
| 504 | Provider Timeout | All retry/fallback candidates timed out |

Every error body includes `requestId` for correlation with orchestrator logs/events.

---

## 8. Provider Adapter Contract

Every Provider Plugin — regardless of vendor — implements the same contract, matching the `ChatCompletionPort` (and related ports) from the SDD §6.8/§10. The orchestrator's Provider Manager only ever calls this contract; it never talks to OpenAI, NVIDIA, Ollama, LM Studio, or any other vendor API directly.

| Capability | Contract method (conceptual) | Required? |
|---|---|---|
| Connect | `connect(config)` — establish/validate credentials and reachability | Yes |
| Chat | `chat(messages, options)` — non-streaming completion | Yes |
| Stream | `streamChat(messages, options)` — streaming completion, yields normalized chunks | Yes (if `streamingSupport: true` in registry) |
| Vision | `chatWithImages(messages+images, options)` | Only if `visionSupport: true` |
| Embeddings | `embed(text)` | Only if plugin declares embedding capability |
| Tool Calling | normalized `tool_calls[]` in/out per plugin's native tool format | Only if `toolSupport: true` |
| List Models | `listModels()` — used to auto-populate/refresh the Model Registry | Yes |
| Health Check | `healthCheck()` — lightweight reachability probe, feeds `ModelEntry.health` | Yes |

**Contract rules**:
- All output — content, tool calls, usage — must be normalized to the orchestrator's internal schema before returning; provider-native formats never leak past the adapter boundary.
- All errors must be wrapped into the standard `ProviderError` taxonomy (`Timeout`, `AuthError`, `RateLimited`, `InvalidRequest`, `Unavailable`) so the Provider Manager's retry/failover logic (§4) works identically across every provider.
- A plugin declares its supported capabilities in its manifest (SDD §9); the Provider Manager and Model Registry never assume a capability that wasn't declared.

---

## 9. Web Dashboard APIs (Future)

These extend the same `/v1` resource model rather than introducing a parallel API surface — the dashboard is a client of the orchestrator's existing Configuration Manager, Model Registry, and Task Queue, plus a few read-only aggregation endpoints.

| Endpoint | Purpose |
|---|---|
| `GET /dashboard/providers` | Provider list + health, dashboard-friendly shape of `GET /v1/providers` |
| `GET /dashboard/models` | Model Registry view, dashboard-friendly shape of `GET /v1/models` |
| `PATCH /dashboard/config` | Writes through to the same schema as `PATCH /v1/config` |
| `GET /dashboard/logs` | Paginated structured log query (filterable by `sessionId`/`taskId`/`level`) |
| `GET /dashboard/tasks` | Task list view (aggregates `GET /v1/tasks`) |
| `POST /dashboard/review` | Thin wrapper over `POST /v1/review` for manual dashboard-triggered reviews |
| `GET /dashboard/health` | Aggregate system health (providers + queue depth + memory/KB store status) |

No dashboard endpoint introduces new state or bypasses the Configuration Manager / Event Bus — this guarantees the CLI/config-file workflow and the future GUI can never drift out of sync.

---

## 10. API Versioning

- **`/v1`**: current and only stable version at this stage. All endpoints in this document are `/v1`.
- **`/v2` (future)**: reserved for any breaking change — e.g., a restructured response envelope, removal of a deprecated field, or a fundamentally different streaming chunk format.
- **Non-breaking changes** (new optional request fields, new response fields, new endpoints) ship into `/v1` directly and are always additive/ignorable by existing clients, consistent with the `orchestrator_metadata` / `orchestrator_status` extension pattern used throughout this document.
- **Breaking-change policy**: when `/v2` ships, `/v1` remains live for a published deprecation window (minimum one full release cycle), during which both versions are served simultaneously. Deprecation notices are surfaced via a `Deprecation` response header on `/v1` calls once `/v2` is available, per standard HTTP deprecation practice.
- **Internal API versioning**: internal ports (§3) are versioned implicitly by the Domain Layer's interface definitions — changing a port's signature is itself a domain-layer change requiring all implementing plugins to update, tracked the same way any breaking internal refactor would be, independent of the external `/v1`/`/v2` surface.

---

## 11. API Governance

### 11.1 Ownership Matrix
- **External API surface**: owned by the API Platform / Experience team and reviewed by the Architecture Review Board.
- **Domain-facing internal APIs**: owned by the owning domain module (Planning, Memory, Provider Management, Review, Browser, Validation).
- **Provider Adapter contracts**: owned jointly by the Provider Integration team and the domain owner for the affected capability.
- **Cross-cutting concerns** (auth, telemetry, security, versioning): owned by the Platform Services team.

### 11.2 Endpoint Ownership
- Every public endpoint must have a named owner, an alternate owner, and a documented SLA/operational expectation.
- Internal interfaces must also identify an implementation owner and a consumer owner to prevent untracked drift.

### 11.3 Contract Review Process
- Any change to a public or internal contract requires review from the owning team, the API governance owner, and the architecture review board when the change is breaking or cross-cutting.
- Changes must include impact analysis for compatibility, observability, security, and provider adapter behavior.

### 11.4 Breaking Change Approval
- Breaking changes require explicit approval, migration guidance, a sunset plan, and a published deprecation window.
- The default stance is that all changes are additive unless explicitly approved as breaking.

### 11.5 Deprecation Governance
- Deprecated fields, endpoints, and behaviors must remain supported for a minimum of one full release cycle or a published period agreed by governance.
- Deprecation notices must be emitted through headers, docs, and changelog entries.

### 11.6 Lifecycle Management
- Endpoints and internal ports enter states of `experimental`, `stable`, `deprecated`, or `retired`.
- `stable` contracts cannot be removed or significantly altered without a versioned migration path.

## 12. Contract Version Governance

### 12.1 Semantic Versioning Policy
- **Major**: breaking changes to request/response semantics, transport behavior, or required fields.
- **Minor**: additive fields, new optional capabilities, or new non-breaking endpoints.
- **Patch**: bug fixes and clarification without behavioral change.

### 12.2 Schema Version Identifiers
- All externally visible payloads should carry a documented `schemaVersion` or equivalent contract identifier where practical.
- Internal contracts should use interface versioning and explicit compatibility tests.

### 12.3 Compatibility Matrix
- The platform shall maintain a published compatibility matrix for client versions, provider adapters, and orchestrator versions.
- Minimum supported client version and minimum supported adapter version must be documented for each release.

### 12.4 Backward Compatibility Guarantees
- `/v1` must remain backward-compatible for non-breaking changes.
- Existing clients must continue to function when they ignore unknown fields and when supported fields retain their meaning.

### 12.5 Forward Compatibility Expectations
- Clients should ignore unknown fields and tolerate additive response extensions without failing.
- Servers should not depend on clients sending unknown fields in a specific order or format beyond defined contract semantics.

### 12.6 Client Support Policy
- A current stable client version and the prior stable version are the expected support targets.
- Older clients may receive warnings or be routed to compatibility modes, but not silently broken.

## 13. API Identity Model

The following identifiers are standard across the platform and must be propagated wherever relevant:

| Identifier | Purpose | Propagation Expectation | Lifecycle |
|---|---|---|---|
| `requestId` | Unique request-level identifier | Present on every request and response envelope | Single request lifecycle |
| `correlationId` | Cross-component tracing | Propagated through events, logs, and internal calls | Across the full orchestration span |
| `traceId` | Distributed tracing context | Included in logs and telemetry | End-to-end request trace |
| `spanId` | Per-operation trace segment | Recorded for each major internal step | Sub-span of a trace |
| `sessionId` | Conversation or execution session | Propagated across chat, memory, and task operations | Persists for session lifecycle |
| `projectId` | Project-scoped namespace | Present on project-scoped operations and memory | Persists until project deletion |
| `taskId` | Task instance identifier | Propagated through queue, execution, and review events | Persists until task completion/cancellation |
| `planId` | Logical plan or DAG identifier | Attached to plan execution and associated tasks | Persists through plan lifecycle |
| `providerId` | Provider plugin instance | Used in provider selection and adapter operations | Stable for configured provider |
| `modelId` | Resolved model identifier | Used in execution and observability records | Stable for model registration |
| `reviewId` | Review run identifier | Propagated through review events and result records | Persists through review lifecycle |
| `validationId` | Validation run identifier | Attached to validation and regression events | Persists until validation completion |
| `browserSessionId` | Browser automation run identifier | Propagated through browser actions and artifacts | Persists for browser workflow |
| `artifactId` | Output artifact identifier | Attached to generated artifacts, screenshots, or files | Persists until artifact retirement |
| `knowledgeId` | Knowledge entity identifier | Used in knowledge base and validation operations | Stable for knowledge entry |
| `memoryId` | Memory record identifier | Used for explicit memory mutation or retrieval | Persists until memory deletion |
| `eventId` | Event emission identifier | Attached to every event emitted through the Event Bus | Single event lifecycle |

### 13.1 Identity Rules
- Identifiers must be opaque strings and should be UUIDv4-compatible where practical.
- The API layer must preserve and propagate identifiers without interpreting them.
- Correlation identifiers must be present in logs, events, and error envelopes for troubleshooting.

## 14. Observability Standards

The following telemetry is required for every major request path and orchestration lifecycle:

| Metric | Required on | Notes |
|---|---|---|
| Request latency | All endpoints | Measure end-to-end API latency |
| Endpoint latency | All endpoints | Separate per-endpoint timing for SLO tracking |
| SSE session duration | Streaming endpoints | Track active stream lifetime |
| Stream completion rate | Streaming endpoints | Measure success vs. aborted/failed streams |
| Stream cancellation rate | Streaming endpoints | Track explicit and client-aborted cancellations |
| Provider latency | Provider execution path | Measure adapter and upstream provider time |
| Validation latency | Validation and browser flows | Track expected vs. actual diff runtime |
| Browser execution latency | Browser automation | Track page load and action time |
| Queue latency | Task queue | Track waiting time before execution |
| Response size | All relevant responses | Track payload bloat and growth |
| Throughput | Peak-load metrics | Track requests and tokens per second |
| Error rate | All endpoints | Segment by error class and endpoint |
| Retry count | Provider and task retry paths | Track transient vs. terminal failures |

### 14.1 Logging and Tracing Expectations
- Structured logs must include `requestId`, `correlationId`, `sessionId`, and relevant domain IDs where available.
- Metrics must be emitted by the API layer, domain services, queue, provider adapter, and review/validation pipeline.

## 15. API Processing Guarantees

### 15.1 Request Correlation
- Every request must carry a stable correlation chain across API, internal ports, events, and logs.

### 15.2 Idempotency
- Idempotency keys are required for mutating operations where retries may occur, especially task creation and config changes.
- The implementation must guarantee replay-safe behavior for retried requests where applicable.

### 15.3 Ordering
- Ordering guarantees apply only where the domain contract explicitly requires them; otherwise, the system may process tasks concurrently.
- Event ordering should be preserved within a single aggregate or correlation context where possible.

### 15.4 Streaming Completion
- A stream must either complete with a terminal event or an explicit error event; silent termination is not acceptable.
- The final frame must always include a deterministic completion marker or terminal state.

### 15.5 Timeout and Cancellation
- Timeouts must be deterministic, documented, and propagated to downstream providers and queue workers.
- Cancellation must propagate to in-flight tasks, provider calls, and associated SSE sessions.

### 15.6 Error Envelope Consistency
- All errors must be emitted in a consistent envelope with `requestId` and a standardized `error.type` field.

### 15.7 Deterministic Response Contracts
- Responses must be deterministic for the same request and state snapshot whenever contract semantics allow it.
- Non-deterministic fields, if present, must be clearly identified as such.

## 16. Security Governance

### 16.1 API Key Lifecycle
- API keys must be issued, rotated, revoked, and audited through a controlled lifecycle process.
- Expired or revoked keys must fail closed.

### 16.2 Token Rotation
- Rotations must not require a breaking API contract change; rotation windows should be configurable.

### 16.3 TLS Requirements
- All production traffic must use TLS 1.2+ and validated certificates.
- Local development mode may use loopback-only or self-signed transport where appropriate.

### 16.4 CORS Policy
- Browser-origin access must be explicitly allowlisted and not broad by default.

### 16.5 Rate-Limiting Governance
- Rate limits must be configurable per client identity, auth mode, and endpoint class.
- 429 responses must include actionable retry guidance.

### 16.6 Audit Logging
- Security-relevant actions (auth changes, config edits, key issuance/revocation, admin mutations) must be logged in immutable audit trails.

### 16.7 Request Signing (Future)
- A future signing mechanism may be introduced for sensitive machine-to-machine integrations and should be additive to current auth.

### 16.8 Tenant Isolation
- Multi-tenant deployments must ensure strict separation of memory, config, and task state by tenant context.

### 16.9 Secret Management
- Secrets must never be embedded in logs, traces, or responses and must be stored through a managed secret store.

## 17. Operational Limits

The platform must define and enforce the following operational limits by default or configuration:

| Limit | Default or Guidance |
|---|---|
| Maximum request size | Configurable; should be bounded to prevent abuse |
| Maximum message count | Bounded per chat request |
| Maximum tool count | Bounded per request to avoid expensive planning |
| Maximum streaming duration | Configurable timeout ceiling |
| Maximum concurrent streams | Configurable per client and service |
| Maximum upload size | Bounded by storage and security policy |
| Maximum browser actions | Bounded per automation run |
| Maximum validation payload | Bounded to keep validation tractable |
| Pagination limits | Enforce a hard max page size |

## 18. API Reliability Governance

### 18.1 SLOs and SLAs
- SLOs must be defined for API availability, error rate, streaming reliability, and provider failure handling.
- SLA commitments must be documented separately for external and internal services.

### 18.2 Retry Governance
- Retry behavior must be explicit and consistent across providers and internal services.
- Retries must be bounded to avoid amplification and resource starvation.

### 18.3 Circuit Breaker Expectations
- Providers and dependency services must expose circuit breaker behavior or be wrapped by a resilience policy that degrades gracefully.

### 18.4 Graceful Degradation Policy
- If a dependency is unavailable, the system must degrade in a controlled way and preserve a consistent error contract.

### 18.5 Maintenance Mode Behavior
- During planned maintenance, the API must return clear, documented responses or otherwise degrade safely without ambiguous failures.

### 18.6 Health Endpoint Guarantees
- Health endpoints must provide readiness, liveness, and dependency health signals sufficient for orchestration and deployment automation.

## 19. Compliance & Audit

### 19.1 Audit Event Requirements
- All security-relevant and lifecycle-relevant actions must be recorded as audit events with principal, timestamp, target, and outcome.

### 19.2 Request Retention
- Retention policies must be documented for logs, request metadata, and event store data.

### 19.3 Access Logging
- Access logging must capture successful and failed authentication, authorization, and admin operations.

### 19.4 Security Audit Trails
- Security audit trails must be immutable, tamper-evident, and accessible to authorized operators.

### 19.5 Privacy Considerations
- Personal or sensitive content must be redacted or handled according to policy before logging or telemetry emission.

### 19.6 Data Retention Mapping
- Data retention rules must map each API event or payload to its storage lifecycle and disposal process.

## 20. Architectural Constraints

The following architectural constraints are normative and must be preserved as the system evolves:

- The API Layer contains no orchestration logic.
- The API Layer never selects providers or models.
- The API Layer never accesses storage directly.
- The API Layer communicates only through public module interfaces.
- Internal APIs remain implementation-agnostic and transport-neutral.
- Provider-specific payloads never cross the adapter boundary.

---

*End of document.*
