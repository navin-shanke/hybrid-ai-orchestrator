# Request Manager — Module Design Document (MDD)

**Module:** Request Manager
**Parent System:** Hybrid AI Development Platform — Orchestrator Subsystem
**Document Type:** Module Design Document (MDD)
**Status:** Draft for Implementation
**Audience:** Senior Engineers, AI Coding Agents (Cursor, OpenCode, Roo Code, Claude Code)
**Related Documents:** PRD, Software Architecture & Design Document (SAD), API Specification, Database Design Document, Orchestrator Core MDD

> This document defines the Request Manager module only. It does not redefine or restate decisions already made in the PRD, SAD, API Specification, Database Design Document, or Orchestrator Core MDD. Where those documents govern a concern (e.g. provider routing, planning, memory retrieval), this document references them rather than re-specifying them.

---

## 1. Executive Summary

### 1.1 Why the Request Manager Exists

Every request entering the Hybrid AI Development Platform — whether from Roo Code, Continue, a CLI client, or a future remote client — arrives in a raw, untrusted, heterogeneous form: an HTTP payload with variable shape, partial metadata, and no guarantee of internal consistency. Before any orchestration intelligence (planning, provider routing, memory retrieval, execution) can safely operate on that request, the system needs a single, authoritative boundary that:

- Confirms the request is structurally valid and authenticated.
- Normalizes it into one canonical internal shape, regardless of which client or API dialect produced it.
- Resolves the identity context around it (session, project, conversation).
- Assigns it a traceable identity (Request ID, Correlation ID) that will follow it through the entire system.
- Establishes its lifecycle record so every other module can observe and react to its state without polling the origin transport (HTTP connection, SSE stream, etc.).
- Hands off a well-formed, trustworthy `Request` object to the Orchestrator Core via a single, well-defined event/interface boundary.

The Request Manager is this boundary. It is the front door of the orchestration pipeline — the module every request must pass through, and the only module permitted to touch a request in its raw, external form.

### 1.2 Role in the Architecture

The Request Manager sits between the API Layer (which terminates the OpenAI-compatible `/v1/chat/completions`-style HTTP/SSE transport, per the API Specification) and the Orchestrator Core (which owns planning, provider routing, memory retrieval, execution, and review, per the Orchestrator Core MDD).

```
Client (Roo Code / Continue / CLI)
        │  HTTP / SSE
        ▼
   API Layer  (transport termination, auth token extraction)
        │  raw payload
        ▼
 ┌──────────────────────┐
 │   REQUEST MANAGER     │  ← this document
 │  (receive → validate  │
 │   → normalize →       │
 │   initialize →        │
 │   forward)             │
 └──────────────────────┘
        │  canonical Request object (event)
        ▼
   Orchestrator Core  (plan → route → execute → review)
```

The Request Manager is a **Clean Architecture boundary layer** (an adapter/use-case layer, in Hexagonal terms) — it converts external, transport-specific input into an internal domain object (`Request`), and converts internal lifecycle state back into transport-appropriate signals (status updates, streaming tokens, error codes) via the API Layer. It contains no orchestration intelligence itself.

### 1.3 Why It Is Separated From the Orchestrator Core

Separation is a direct application of **Single Responsibility Principle** and **Separation of Concerns**:

| Concern | Owner |
|---|---|
| Is this request valid, authenticated, well-formed? | Request Manager |
| What session/project/conversation does it belong to? | Request Manager |
| What is its lifecycle status right now? | Request Manager |
| How should the AI accomplish what it asks? | Orchestrator Core (Planning) |
| Which provider/model should handle it? | Orchestrator Core (Routing) |
| What memory/context is relevant? | Orchestrator Core (Memory) |
| Did the output meet quality bar? | Orchestrator Core (Review) |

Collapsing these into one module would violate high cohesion (mixing transport/validation concerns with AI-orchestration intelligence), make unit testing exponentially harder (mocking an entire orchestration pipeline just to test validation logic), and block independent scaling — the Request Manager is I/O-bound and cheap; the Orchestrator Core is compute/AI-call-bound and expensive. Keeping them separate allows each to evolve, scale, and be replaced independently, and allows the Request Manager to be reused unchanged if the Orchestrator Core's internal design changes.

---

## 2. Responsibilities

### 2.1 Must Have (v1 scope)

1. Receive incoming requests handed off from the API Layer in their raw, dialect-specific form (OpenAI-compatible chat completion payload).
2. Authenticate the request (delegating actual credential verification to the Authentication dependency; the Request Manager enforces that authentication occurred and attaches identity).
3. Validate request structure, required fields, size limits, and content-type correctness.
4. Normalize heterogeneous input (different client dialects, optional fields, legacy shapes) into one canonical internal `Request` domain object.
5. Resolve or create the Session associated with the request.
6. Resolve or create the Project context associated with the request.
7. Generate a unique Request ID and a Correlation ID (or propagate an inbound Correlation ID for distributed tracing).
8. Build request metadata (timestamps, client info, streaming flag, capabilities requested, routing preferences as *declared by the client*, not resolved).
9. Register the request in the Request Registry with initial lifecycle state.
10. Publish lifecycle events (`RequestReceived`, `RequestValidated`, `RequestInitialized`, `RequestForwarded`, etc.) to the Event Bus.
11. Forward the finalized `Request` object to the Orchestrator Core via the defined hand-off interface.
12. Track and expose request status for polling/streaming clients (`getRequest()`, `updateStatus()`).
13. Handle cancellation requests and propagate cancellation signals.
14. Initialize streaming session state (SSE token channel setup) when the client requests streaming, without producing the tokens itself.
15. Handle duplicate-request detection (idempotency) at the transport boundary.
16. Emit structured logs and metrics for every stage of the request lifecycle it owns.

### 2.2 Should Have (near-term, v1.x)

1. Request size-based backpressure signaling to the API Layer (reject or queue when system is saturated).
2. Configurable per-client / per-project rate limiting hooks (enforcement may live in a dedicated Rate Limiter dependency; Request Manager integrates with it).
3. Priority tagging on requests (based on client-declared priority or project tier), used later by the Orchestrator Core's scheduler.
4. Soft validation warnings (non-fatal) surfaced back to the client without blocking the request.
5. Configurable request timeout defaults per project/client.

### 2.3 Future Responsibilities (explicitly out of v1, designed for extensibility — see Section 19)

1. Batch request ingestion (multiple prompts submitted as one transport call).
2. Multi-tenant / multi-user session isolation at scale.
3. Distributed request registry (shared across multiple Orchestrator instances).
4. Priority queue scheduling logic (Request Manager will continue to only *tag* priority; actual queuing/scheduling remains Orchestrator Core's concern unless explicitly re-scoped in a future MDD revision).
5. Plugin-based request preprocessors (e.g., PII redaction, custom enrichment) registered by third parties.

### 2.4 Explicitly Not Responsibilities

The Request Manager **must not** implement or contain logic for:

- Planning or task decomposition.
- Provider/model selection or routing logic.
- Memory retrieval or context assembly beyond attaching *references* (IDs) — it does not fetch or rank memory content.
- Response review, scoring, or validation of AI output quality.
- Browser automation or tool execution of any kind.
- Task execution of any kind.
- Persisting conversation content long-term (it registers metadata; the Database/Storage module owns durable content persistence).

Any code that appears to do the above belongs in the Orchestrator Core or another module and must not be added to this module, even for convenience.

---

## 3. Scope

### 3.1 Owns

- The `Request` domain object schema and its construction logic.
- The Request Registry (in-memory/backing-store record of active and recently completed requests and their lifecycle state).
- The Request Lifecycle State Machine (Section 8).
- Validation and normalization rule sets for inbound requests.
- Correlation ID / Request ID generation strategy.
- Cancellation token issuance and propagation initiation.
- Streaming session initialization (channel setup, not token generation).
- Its own internal component boundaries (Section 4).

### 3.2 Does Not Own

- Session persistence logic beyond resolving/creating a session reference (owned by Session Manager / Session Store).
- Project persistence logic beyond resolving/creating a project reference (owned by Project Manager / Project Store).
- Authentication credential verification (owned by Authentication module; Request Manager consumes its result).
- The Event Bus implementation (owned by platform infrastructure; Request Manager is a publisher/subscriber).
- Orchestration logic of any kind (owned by Orchestrator Core).
- Long-term storage of request/response content (owned by Database/Storage module).

### 3.3 Collaborates With

- **API Layer** — receives raw payloads from it; sends status/streaming signals back through it.
- **Orchestrator Core** — forwards finalized `Request` objects to it; receives lifecycle updates from it (e.g., `RequestCompleted`, `RequestFailed`) to update the Registry.
- **Event Bus** — publishes lifecycle events; subscribes to Orchestrator-originated status events.
- **Configuration Manager** — reads validation rules, size limits, timeout defaults, feature flags.
- **Logger** — structured logging at every lifecycle transition.
- **Authentication** — verifies identity/token validity for each request.
- **Session Store / Session Manager** — resolves or creates session records.
- **Project Store / Project Manager** — resolves or creates project records.

### 3.4 Boundaries

The Request Manager's boundary is crossed exactly twice per request under normal operation:

1. **Inbound boundary**: API Layer → Request Manager (`createRequest()` call with raw payload).
2. **Outbound boundary**: Request Manager → Orchestrator Core (event publication / direct interface call with canonical `Request` object).

All other interactions (status queries, cancellation, streaming updates) are side-channel calls into the Request Manager's public interface and do not re-cross these two boundaries in the primary data-flow sense.

---

## 4. Internal Architecture

The Request Manager is internally decomposed into single-responsibility components, each independently testable and independently replaceable, wired together via Dependency Injection. No component calls another's internals directly — all cross-component communication goes through interfaces defined in Section 7 or via the internal Event Bus.

```
┌───────────────────────────────────────────────────────────────┐
│                        REQUEST MANAGER                         │
│                                                                   │
│  ┌─────────────────┐   ┌───────────────────┐  ┌───────────────┐ │
│  │ Request Receiver │──▶│ Request Validator  │─▶│ Request         │
│  └─────────────────┘   └───────────────────┘  │ Normalizer      │ │
│                                                  └───────┬────────┘ │
│                                                          ▼          │
│  ┌─────────────────┐   ┌───────────────────┐  ┌───────────────┐ │
│  │ Correlation ID   │◀──│ Metadata Builder   │◀─│ Session         │ │
│  │ Generator        │   └───────────────────┘  │ Resolver        │ │
│  └─────────────────┘            ▲               └───────┬────────┘ │
│                                  │                       ▼          │
│                          ┌───────────────────┐  ┌───────────────┐ │
│                          │ Context            │◀─│ Project         │ │
│                          │ Initializer        │  │ Resolver        │ │
│                          └────────┬───────────┘  └───────────────┘ │
│                                   ▼                                 │
│                          ┌───────────────────┐                     │
│                          │ Lifecycle          │                     │
│                          │ Controller         │                     │
│                          └────────┬───────────┘                     │
│                                   ▼                                 │
│  ┌─────────────────┐   ┌───────────────────┐  ┌───────────────┐ │
│  │ Request Registry │◀─▶│ Status Manager     │◀▶│ Cancellation    │ │
│  └─────────────────┘   └───────────────────┘  │ Handler         │ │
│                                                  └───────────────┘ │
│                          ┌───────────────────┐                     │
│                          │ Streaming          │                     │
│                          │ Initializer        │                     │
│                          └───────────────────┘                     │
└───────────────────────────────────────────────────────────────┘
```

### 4.1 Request Receiver

**Responsibility:** Sole entry point for raw inbound payloads from the API Layer. Wraps the raw payload in an internal `RawRequestEnvelope` and kicks off the pipeline. Performs no validation — only transport-shape acceptance (e.g., confirms it received bytes/JSON, not that the JSON is semantically valid).

### 4.2 Request Validator

**Responsibility:** Applies structural and policy validation rules (required fields present, types correct, size within limits, content-type supported, auth token present). Produces either a `ValidationResult.Success` (passes the envelope onward) or a `ValidationResult.Failure` (list of validation errors, short-circuits the pipeline). Rules are configuration-driven (read from Configuration Manager) so limits can change without code changes.

### 4.3 Request Normalizer

**Responsibility:** Transforms a validated, dialect-specific payload into the canonical internal `Request` shape (Section 6). Handles differences between client dialects (e.g., Roo Code's exact OpenAI-compatible shape vs. Continue's, vs. any future client), default-fills optional fields, and resolves aliases (e.g., `model` vs. `model_name`). This is the single place dialect knowledge lives — no other component should need to know about client-specific payload quirks.

### 4.4 Session Resolver

**Responsibility:** Given identity/metadata from the normalized request, resolves an existing Session or triggers creation of a new one via the Session Store dependency. Returns a `SessionReference` (ID + minimal descriptor), never full session content.

### 4.5 Project Resolver

**Responsibility:** Resolves or creates the Project context via the Project Store dependency. Returns a `ProjectReference`. Independent of Session Resolver so either can be swapped or reused (e.g., a session may span projects in future multi-project support).

### 4.6 Correlation ID Generator

**Responsibility:** Generates a unique `Request ID` for every request. Generates a `Correlation ID` if none is supplied inbound (e.g., via an `X-Correlation-Id` header), or propagates the inbound value if present, to support distributed tracing across the API Layer, Request Manager, and Orchestrator Core.

### 4.7 Metadata Builder

**Responsibility:** Assembles the `RequestMetadata` sub-object: timestamps, client type/version, declared capabilities, declared routing preferences (unresolved — just what the client asked for), streaming flag, priority tag, timeout value. Pulls defaults from Configuration Manager where the client did not specify a value.

### 4.8 Context Initializer

**Responsibility:** Assembles `ContextReferences` — pointers (IDs only) to conversation history, prior request chain, and any client-supplied attachments — without fetching or resolving their content. Actual memory/context retrieval is explicitly the Orchestrator Core's Memory subsystem's job (per Orchestrator Core MDD); this component only ensures the *references* are correctly captured and attached.

### 4.9 Lifecycle Controller

**Responsibility:** Owns transitions through the Request Lifecycle State Machine (Section 8). Every other component that needs to change a request's state does so by calling the Lifecycle Controller, never by mutating state directly. Responsible for enforcing legal state transitions and rejecting illegal ones (e.g., cannot go from `Cancelled` to `Executing`).

### 4.10 Status Manager

**Responsibility:** Public-facing read/query surface for request status (`getRequest()`, status polling support). Reads from the Request Registry. Also responsible for translating internal lifecycle states into API-Layer-appropriate status responses (e.g., mapping to OpenAI-compatible `status` fields or SSE event types).

### 4.11 Request Registry

**Responsibility:** The authoritative in-memory (v1) store of all active and recently completed request records, keyed by Request ID. Provides CRUD-like access used internally by Lifecycle Controller, Status Manager, and Cancellation Handler. Designed with a pluggable storage backend interface so it can later be backed by Redis or a database for distributed deployments (see Section 19) without changing its consumers.

### 4.12 Cancellation Handler

**Responsibility:** Accepts cancellation requests (`cancelRequest()`), validates that the target request is in a cancellable state, issues the cancellation signal (via the request's `CancellationToken`), updates lifecycle state, and publishes `RequestCancelled`. Propagation of the cancellation into the Orchestrator Core's active execution is done by the Orchestrator Core reacting to the event/token — the Request Manager does not reach into the Orchestrator Core's internals to stop work directly.

### 4.13 Streaming Initializer

**Responsibility:** When a request declares `stream: true`, sets up the streaming session record (a channel/subscription identifier that the API Layer will use to relay tokens produced by the Orchestrator Core back to the client). Does not generate, buffer, or transform tokens — purely establishes the plumbing and registers it against the Request ID.

---

## 5. Request Lifecycle

### 5.1 Lifecycle Flow (Happy Path)

```
Incoming HTTP Request (API Layer)
        │
        ▼
  Request Receiver          → RawRequestEnvelope created
        │
        ▼
  Authentication check      → identity attached or reject (401)
        │
        ▼
  Request Validator         → structural validation
        │  (fail → RequestFailed, HTTP 400, stop)
        ▼
  Request Normalizer        → canonical Request shape (partial)
        │
        ▼
  Correlation ID Generator  → Request ID + Correlation ID assigned
        │
        ▼
  Session Resolver          → SessionReference attached
        │
        ▼
  Project Resolver          → ProjectReference attached
        │
        ▼
  Metadata Builder          → RequestMetadata attached
        │
        ▼
  Context Initializer       → ContextReferences attached
        │
        ▼
  Lifecycle Controller       → state = Initialized
        │
        ▼
  Streaming Initializer      → (if stream=true) channel registered
        │
        ▼
  Request Registry           → record persisted (Received..Initialized history)
        │
        ▼
  Event Bus                  → RequestInitialized published
        │
        ▼
  Forward to Orchestrator Core → state = Forwarded
        │
        ▼
  Event Bus                  → RequestForwarded published
```

### 5.2 Sequence Diagram — Standard Request

```
Client        API Layer      RequestReceiver  Validator   Normalizer  SessionResolver  ProjectResolver  MetadataBuilder  LifecycleCtrl  Registry  EventBus  OrchestratorCore
  │  POST /v1/chat/completions │                 │            │            │                │                │               │              │         │             │
  │───────────────────────────▶│                 │            │            │                │                │               │              │         │             │
  │                             │──createRequest─▶│            │            │                │                │               │              │         │             │
  │                             │                 │──raw envelope──────────▶│                │                │               │              │         │             │
  │                             │                 │            │──validate─▶│                │                │               │              │         │             │
  │                             │                 │            │◀──result───│                │                │               │              │         │             │
  │                             │                 │            │            │──normalize────▶│                │               │              │         │             │
  │                             │                 │            │            │            │──resolve session─▶│                │               │              │         │             │
  │                             │                 │            │            │            │◀──SessionRef───────│                │               │              │         │             │
  │                             │                 │            │            │            │                    │──resolve proj─▶│               │              │         │             │
  │                             │                 │            │            │            │                    │◀──ProjectRef────│               │              │         │             │
  │                             │                 │            │            │            │                    │                │──build meta──▶│              │         │             │
  │                             │                 │            │            │            │                    │                │◀──Metadata─────│              │         │             │
  │                             │                 │            │            │            │                    │                │                │──set state──▶│         │             │
  │                             │                 │            │            │            │                    │                │                │             │──persist─▶│             │
  │                             │                 │            │            │            │                    │                │                │             │           │──publish──▶│
  │                             │                 │            │            │            │                    │                │                │             │           │             │──forward Request──▶│
  │                             │◀──202/streaming ack (Request ID)──────────────────────────────────────────────────────────────────────────────────────────────────────────│
```

### 5.3 Failure Path (Validation Failure Example)

```
Client → API Layer → Request Receiver → Request Validator
                                              │ (fails)
                                              ▼
                                    Lifecycle Controller (state = Failed)
                                              │
                                              ▼
                                    Request Registry (record Failed)
                                              │
                                              ▼
                                    Event Bus (RequestFailed published)
                                              │
                                              ▼
                            API Layer returns HTTP 400 with structured error body
```

---

## 6. Request Object Design

The `Request` object is the canonical internal domain representation produced by this module and consumed by the Orchestrator Core. It is immutable once handed off to `Forwarded` state; subsequent status changes are tracked in the Registry against the Request ID, not by mutating the object itself.

| Field | Type | Why It Exists |
|---|---|---|
| `requestId` | string (UUID) | Unique identity for this request across the entire system; primary key in the Registry and all logs/events. |
| `correlationId` | string (UUID) | Ties this request to a broader trace (e.g., a multi-request conversation turn, or a client-side trace ID), enabling distributed tracing across API Layer → Request Manager → Orchestrator Core → Providers. |
| `sessionId` | string (UUID / SessionReference) | Associates the request with a conversational session so history and continuity can be resolved by downstream modules. |
| `projectId` | string (UUID / ProjectReference) | Associates the request with a project context (codebase, config, provider preferences at the project level) per the Database Design Document. |
| `conversationId` | string (UUID) | Identifies the specific conversation thread within a session, since a session may contain multiple conversations. |
| `userPrompt` | string | The core content the client is asking the system to act on; the primary payload the Orchestrator Core will plan against. |
| `attachments` | array of `AttachmentReference` | References (not content) to files, images, or context blobs supplied by the client; content resolution is deferred to modules that need it. |
| `metadata` | `RequestMetadata` (see 6.1) | Non-content descriptive information needed for routing, auditing, and lifecycle handling. |
| `capabilitiesRequested` | array of string | Declares what the client is asking for (e.g., `code_edit`, `tool_use`, `vision`) so the Orchestrator Core's routing logic has explicit signal, without the Request Manager making routing decisions itself. |
| `routingPreferences` | object (opaque to Request Manager) | Client-declared preferences (e.g., preferred provider, preferred model) passed through verbatim; the Request Manager does not interpret or enforce these — only the Orchestrator Core's Router does. |
| `streaming` | boolean | Signals whether the client expects a streaming response, driving Streaming Initializer behavior and downstream token-relay behavior. |
| `priority` | enum (`low`, `normal`, `high`) | Client- or project-tier-declared priority tag; consumed by Orchestrator Core scheduling in the future (Section 19), not acted upon by Request Manager beyond tagging. |
| `timeout` | integer (ms) | Maximum time this request is allowed to remain in a non-terminal state before the system force-fails it; protects system resources from stuck requests. |
| `cancellationToken` | `CancellationToken` | A propagatable signal object that downstream modules poll/subscribe to, allowing cooperative cancellation without the Request Manager reaching into their internals. |
| `status` | enum (see Section 8) | Current lifecycle state; also duplicated in the Registry for query efficiency, but included on the object for consumers that receive the object directly (e.g., Orchestrator Core at hand-off time). |
| `timestamps` | object (`received`, `validated`, `initialized`, `forwarded`, …) | Per-stage timestamps enabling latency breakdown and SLA measurement (Section 13). |
| `contextReferences` | `ContextReferences` | Pointers to prior conversation turns / memory anchors; actual retrieval is out of scope for this module (Orchestrator Core's Memory subsystem). |
| `retryCount` | integer | Tracks how many times this logical request has been retried (e.g., after a transient provider failure upstream), used for retry-limit enforcement and audit. |
| `executionProfile` | object (opaque) | Client- or project-level execution constraints (e.g., max tokens, temperature, cost ceiling) passed through to the Orchestrator Core without interpretation by this module. |

### 6.1 `RequestMetadata` Sub-object

| Field | Purpose |
|---|---|
| `clientType` | Identifies originating client (Roo Code, Continue, CLI, future clients) — used for dialect-specific formatting on the way out. |
| `clientVersion` | Enables compatibility handling for older client versions. |
| `receivedAt` | Wall-clock time the Request Receiver accepted the payload. |
| `sourceIp` / `sourceIdentity` | Auditing and rate-limiting support. |
| `authIdentity` | The verified identity attached by the Authentication dependency. |

---

## 7. Public Interfaces

All interfaces are exposed as part of the Request Manager's public port (Hexagonal Architecture: this is the "driving" port consumed by the API Layer, and the "driven" port it uses to call the Orchestrator Core is defined separately in Section 10).

### 7.1 `createRequest(rawPayload, transportContext) → RequestHandle`

- **Purpose:** Primary entry point; ingests a raw payload and drives it through receive → validate → normalize → initialize → forward.
- **Input:** `rawPayload` (raw JSON body), `transportContext` (headers, auth token, client IP, inbound correlation ID if present).
- **Output:** `RequestHandle` containing `requestId`, `correlationId`, initial `status`, and (if streaming) a `streamChannelId`.
- **Validation:** Delegates to Request Validator; short-circuits on failure.
- **Errors:** `ValidationError` (400-class), `AuthenticationError` (401-class), `PayloadTooLargeError` (413-class), `DuplicateRequestError` (409-class, if idempotency key collision detected).
- **Side Effects:** Creates a Registry record; publishes `RequestReceived`, `RequestValidated`, `RequestInitialized`, `RequestForwarded` events (or `RequestFailed` on early exit); calls the Orchestrator Core hand-off interface on success.

### 7.2 `validateRequest(rawPayload) → ValidationResult`

- **Purpose:** Exposed independently (in addition to being invoked internally by `createRequest`) to allow the API Layer or tests to pre-validate without triggering full processing.
- **Input:** Raw payload.
- **Output:** `ValidationResult` (`valid: boolean`, `errors: ValidationError[]`).
- **Validation:** Applies all structural/policy rules from Configuration Manager.
- **Errors:** None thrown; failures are represented in the result object.
- **Side Effects:** None (pure function relative to system state).

### 7.3 `normalize(validatedPayload) → PartialRequest`

- **Purpose:** Exposed for testability and for advanced API Layer use cases (e.g., dry-run normalization preview).
- **Input:** A payload that has already passed validation.
- **Output:** A `PartialRequest` (canonical shape, pre-ID-assignment).
- **Validation:** Assumes input already validated; does not re-validate.
- **Errors:** `NormalizationError` if a dialect-specific transform fails unexpectedly.
- **Side Effects:** None.

### 7.4 `cancelRequest(requestId, reason) → CancellationResult`

- **Purpose:** Allows a client (or internal system) to request cancellation of an in-flight request.
- **Input:** `requestId`, optional human-readable `reason`.
- **Output:** `CancellationResult` (`accepted: boolean`, current `status`).
- **Validation:** Confirms `requestId` exists and is in a cancellable state (see Section 8).
- **Errors:** `RequestNotFoundError`, `InvalidStateTransitionError` (e.g., already `Completed`).
- **Side Effects:** Signals the `CancellationToken`; transitions state to `Cancelled`; publishes `RequestCancelled`.

### 7.5 `getRequest(requestId) → RequestStatusView`

- **Purpose:** Read-only status query for polling clients or internal diagnostics.
- **Input:** `requestId`.
- **Output:** `RequestStatusView` (subset of `Request` safe for external exposure: status, timestamps, error summary if failed).
- **Validation:** Confirms existence.
- **Errors:** `RequestNotFoundError`.
- **Side Effects:** None.

### 7.6 `updateStatus(requestId, newStatus, details) → void`

- **Purpose:** Internal-facing interface used by the Orchestrator Core (via the driven port / event subscription) to report lifecycle progress back into the Request Manager's Registry (e.g., `Executing`, `Completed`, `Failed`).
- **Input:** `requestId`, `newStatus`, optional `details` (error info, partial result summary).
- **Output:** None (void) — or `StateTransitionResult` for confirmation.
- **Validation:** Enforced via Lifecycle Controller's state machine rules; illegal transitions rejected.
- **Errors:** `InvalidStateTransitionError`, `RequestNotFoundError`.
- **Side Effects:** Updates Registry; publishes corresponding lifecycle event.

### 7.7 `completeRequest(requestId, resultSummary) → void`

- **Purpose:** Explicit terminal-state interface, distinguished from generic `updateStatus` for clarity and to allow completion-specific side effects (e.g., closing streaming channels).
- **Input:** `requestId`, `resultSummary` (metadata only — token counts, duration, final provider used — not full response content, which the Orchestrator Core/Database module persists separately).
- **Output:** None.
- **Validation:** Request must be in `Executing` state.
- **Errors:** `InvalidStateTransitionError`, `RequestNotFoundError`.
- **Side Effects:** Transitions to `Completed`; closes streaming channel if open; publishes `RequestCompleted`; schedules Registry record for eventual eviction/archival.

---

## 8. State Management

### 8.1 State Machine

```
        ┌──────────┐
        │ Received │
        └────┬─────┘
             │ validate() success
             ▼
        ┌──────────┐        validate() failure
        │ Validated│───────────────────────────┐
        └────┬─────┘                            │
             │ normalize()                       │
             ▼                                   │
        ┌───────────┐                            │
        │Normalized │                            │
        └────┬──────┘                            │
             │ session/project/metadata resolved │
             ▼                                   │
        ┌────────────┐                           │
        │ Initialized│                           │
        └────┬───────┘                           │
             │ forward() success                  │
             ▼                                    │
        ┌───────────┐    forward() failure        │
        │ Forwarded │─────────────────────────────┤
        └────┬──────┘                              │
             │ Orchestrator reports start           │
             ▼                                      │
        ┌───────────┐                               │
        │ Executing │───cancel()───┐                │
        └────┬──────┘              │                │
             │ completeRequest()    │                │
             ▼                      ▼                ▼
        ┌───────────┐        ┌────────────┐    ┌────────┐
        │ Completed │        │ Cancelled  │    │ Failed │
        └───────────┘        └────────────┘    └────────┘
```

**Rules:**
- `Received`, `Validated`, `Normalized`, `Initialized`, `Forwarded`, `Executing` are non-terminal.
- `Completed`, `Failed`, `Cancelled` are terminal — no transitions permitted out of these states.
- `Cancelled` is reachable from any non-terminal state (`Received` through `Executing`) via `cancelRequest()`.
- `Failed` is reachable from `Received` through `Forwarded` on internal errors (validation, normalization, resolution, forwarding failures), and from `Executing` if the Orchestrator Core reports failure via `updateStatus()`.
- All transitions are enforced exclusively by the Lifecycle Controller; no other component may write `status` directly.

### 8.2 State Definitions

| State | Meaning |
|---|---|
| `Received` | Payload accepted by Request Receiver; no processing done yet. |
| `Validated` | Passed structural/policy validation. |
| `Normalized` | Transformed into canonical `Request` shape. |
| `Initialized` | Session, project, metadata, context references, and IDs fully attached; object is complete. |
| `Forwarded` | Handed off to Orchestrator Core successfully. |
| `Executing` | Orchestrator Core has confirmed active processing has begun. |
| `Completed` | Orchestrator Core reported successful completion. |
| `Failed` | Terminated due to error at any stage. |
| `Cancelled` | Terminated due to explicit cancellation request. |

---

## 9. Events

All events are published to the platform Event Bus using a standard envelope: `{ eventType, requestId, correlationId, timestamp, payload }`.

| Event | Publisher | Subscribers | Payload | Trigger | Failure Behaviour | Retry Behaviour |
|---|---|---|---|---|---|---|
| `RequestReceived` | Request Receiver (via Lifecycle Controller) | Logging/Audit, Monitoring | `{ requestId, clientType, receivedAt }` | Raw payload accepted | N/A (best-effort event; publish failure is logged, does not block pipeline) | None — this is a point-in-time notification |
| `RequestValidated` | Request Validator (via Lifecycle Controller) | Logging/Audit | `{ requestId, validatedAt }` | Validation passes | N/A | None |
| `RequestInitialized` | Lifecycle Controller | Orchestrator Core (optional pre-fetch), Monitoring | `{ requestId, sessionId, projectId, correlationId }` | All initialization components complete | N/A | None |
| `RequestForwarded` | Lifecycle Controller | Monitoring, API Layer (ack correlation) | `{ requestId, forwardedAt }` | Successful hand-off to Orchestrator Core | If forwarding itself fails, `RequestFailed` is published instead | Forwarding retried up to configured `maxForwardRetries` (Section 11) before failing |
| `RequestCancelled` | Cancellation Handler | Orchestrator Core, API Layer (to close stream), Monitoring | `{ requestId, reason, cancelledAt }` | `cancelRequest()` invoked on a cancellable request | N/A | None |
| `RequestCompleted` | Lifecycle Controller (on `completeRequest()`) | API Layer, Monitoring, Audit | `{ requestId, durationMs, resultSummary }` | Orchestrator Core reports success | N/A | None |
| `RequestFailed` | Lifecycle Controller | API Layer, Monitoring, Audit, Alerting | `{ requestId, stage, errorCode, errorMessage }` | Any unrecoverable error at any stage | N/A | None (failure is terminal; retry is a new request unless retry policy explicitly re-submits, see Section 11) |

Event publication itself is treated as best-effort/fire-and-forget with logging on failure — a failed event publish must never block or fail the underlying request pipeline (the Event Bus is a driven dependency, not a blocking gate on core lifecycle progress), except in the specific case of `RequestForwarded`/hand-off to the Orchestrator Core, which is a direct interface call, not just an event, and therefore does follow retry rules per Section 11.

---

## 10. Dependencies

| Dependency | Why It Exists |
|---|---|
| **API Layer** | Upstream caller; source of raw payloads and destination for status/streaming signals. Request Manager depends on it only via the inbound interface contract (Section 7), not on its internals. |
| **Orchestrator Core** | Downstream consumer of finalized `Request` objects; also the source of lifecycle updates (`Executing`, `Completed`, `Failed`) fed back via `updateStatus()`/`completeRequest()`. Interaction is via a defined driven port (interface), enabling the Orchestrator Core implementation to change without impacting this module, per Dependency Inversion Principle. |
| **Event Bus** | Decouples the Request Manager from every consumer of lifecycle events (Monitoring, Audit, other future modules) — publishers don't need to know subscribers exist. |
| **Configuration Manager** | Supplies validation rules, size limits, timeout defaults, feature flags (e.g., enabling/disabling idempotency checks) — externalizes policy from code. |
| **Logger** | Structured, correlation-ID-tagged logging at every lifecycle stage for observability and debugging. |
| **Authentication** | Verifies the identity/token attached to a request; Request Manager consumes a verified-identity result rather than implementing credential verification itself (Separation of Concerns). |
| **Session Store** | Durable resolution/creation of session records; Request Manager only holds a reference, not session content. |
| **Project Store** | Durable resolution/creation of project records; same reference-only pattern. |

All dependencies are injected via constructor/factory injection (Dependency Injection) and consumed strictly through interfaces defined at the Request Manager's boundary — never through concrete implementation types — so any dependency can be swapped (e.g., Session Store backed by Postgres today, DynamoDB tomorrow) without changes to Request Manager internals.

---

## 11. Error Handling

| Error Condition | Handling |
|---|---|
| **Invalid Request** (fails structural validation) | Request Validator returns `ValidationResult.Failure`; Lifecycle Controller transitions to `Failed`; `RequestFailed` published with `stage: "validation"`; API Layer returns HTTP 400 with itemized validation errors. |
| **Malformed JSON** | Caught at Request Receiver before validation; treated as a validation failure (`stage: "parsing"`); same 400-class response. |
| **Authentication Failure** | Detected before validation proceeds; short-circuits to `Failed` with `stage: "authentication"`; API Layer returns HTTP 401. No Registry record is retained beyond a minimal audit log entry (to avoid storing unauthenticated junk requests indefinitely). |
| **Missing Session** (cannot resolve or create) | Session Resolver raises `SessionResolutionError`; Lifecycle Controller transitions to `Failed`, `stage: "session_resolution"`; API Layer returns HTTP 424 (Failed Dependency) or 500 depending on root cause (client-supplied invalid session ID → 400-class; store unavailable → 500-class). |
| **Missing Project** | Same pattern as Missing Session, via Project Resolver, `stage: "project_resolution"`. |
| **Timeout** (request stuck in a non-terminal state beyond `timeout` value) | A background sweep in the Lifecycle Controller (or a scheduled job) detects requests exceeding their `timeout` and force-transitions them to `Failed` with `stage: "timeout"`, publishing `RequestFailed`; the Orchestrator Core is signaled via the request's `CancellationToken` to stop any in-flight work. |
| **Duplicate Request** | If idempotency is enabled (Configuration Manager flag) and an inbound idempotency key matches an existing non-terminal or recently-terminal request, `createRequest()` returns the existing `RequestHandle` instead of creating a new record (or rejects with `DuplicateRequestError`, per configured policy) rather than double-processing. |
| **Cancelled Request** (operations attempted against an already-cancelled request) | Any interface call (`updateStatus`, `completeRequest`) against a `Cancelled` request raises `InvalidStateTransitionError`, logged and ignored (no state change) — cancellation is final. |
| **Streaming Failure** (channel setup fails) | Streaming Initializer raises `StreamingInitializationError`; the request is *not* automatically failed — falls back to non-streaming mode if configured to do so, otherwise transitions to `Failed` with `stage: "streaming_init"` per Configuration Manager policy. |
| **Unexpected Exception** (any unhandled error at any internal component) | Caught at the outermost `createRequest()` boundary by a top-level error handler; logged with full stack trace and correlation ID; request transitioned to `Failed` with `stage: "internal_error"` and a generic, non-leaking error message returned to the client (HTTP 500); internal details retained only in logs. |

### 11.1 Retry Strategy

- **Hand-off to Orchestrator Core** (`RequestForwarded` step): retried up to `maxForwardRetries` (configurable, default suggested: 3) with exponential backoff, since this is typically a transient network/availability issue between internal services. If retries are exhausted, the request transitions to `Failed`, `stage: "forwarding"`.
- **Session/Project Store resolution failures**: retried up to `maxResolutionRetries` (configurable) only for errors classified as transient (e.g., connection timeout); non-transient errors (e.g., invalid ID format) fail immediately without retry.
- **No retry** is performed for validation, authentication, or normalization failures — these are deterministic and retrying without a payload change will not succeed.
- Retries are the Request Manager's own operational retries (for its own dependency calls) and are distinct from any user-facing "retry this request" feature, which would be a new `createRequest()` call initiated by the client or a higher-level policy, tracked via `retryCount` on the new `Request` object.

### 11.2 Rollback Strategy

Because the Request Manager's operations up through `Initialized` are primarily additive (creating a Registry record, resolving references) rather than destructive, "rollback" here means **cleanup**, not undo of external state:

- If a request fails after Session/Project resolution but before successful forwarding, the Session/Project records themselves are **not** rolled back (they may be legitimately reused by a future request) — only the Registry record for this specific `requestId` is marked `Failed`.
- If forwarding to the Orchestrator Core fails after retries are exhausted, no compensating action is needed against the Orchestrator Core (it never received the request), but the Streaming Initializer, if a channel was opened, must close it to avoid leaking an open SSE channel.
- Terminal-state Registry records are retained for a configurable retention window (for audit/debugging) and then evicted/archived (Section 19 covers scaling this to a distributed store).

---

## 12. Logging

All logs are structured (JSON) and must include `requestId` and `correlationId` on every entry to enable cross-module tracing.

| Log Category | Contents |
|---|---|
| **Request Logs** | One entry per lifecycle transition (`Received`, `Validated`, …), including stage name, timestamp, and outcome. |
| **Performance Logs** | Per-stage duration (e.g., time spent in Validator, time spent in Session Resolver), enabling latency breakdown per component. |
| **Audit Logs** | Identity (`authIdentity`), source IP, action taken (created/cancelled/failed), retained per compliance/retention policy — distinct stream from debug logs, potentially routed to a separate durable sink. |
| **Debug Logs** | Verbose, dev/staging-only detail (raw payload shape post-redaction, intermediate object states) — gated behind a log-level configuration flag, never enabled by default in production due to potential sensitive content exposure. |
| **Correlation IDs** | Present on every log line across every category; propagated to the Orchestrator Core and beyond so a single ID can be used to trace a request end-to-end across all modules and, where applicable, provider API calls. |
| **Latency Tracking** | Explicit `durationMs` field logged at `RequestCompleted`/`RequestFailed`, plus per-stage latency as above, feeding directly into the Monitoring metrics in Section 13. |
| **Request Tracing** | Full stage-by-stage timestamp trail retained on the Registry record (not just logs) so `getRequest()` can optionally expose a trace view for debugging tools. |

Sensitive content (raw `userPrompt`, attachment content, auth tokens) is **never** logged at `info` level or above; only redacted/truncated previews are permitted, and only at `debug` level.

---

## 13. Monitoring

| Metric | Description |
|---|---|
| **Request Throughput** | Requests received per second/minute, tagged by client type and project. |
| **Latency (per stage)** | p50/p95/p99 duration for each pipeline stage (validation, normalization, session/project resolution, forwarding). |
| **End-to-End Latency (Request Manager portion)** | Time from `Received` to `Forwarded` — the Request Manager's own overhead, distinct from Orchestrator Core execution time. |
| **Queue Size** | Number of requests currently in non-terminal states (`Received` through `Executing`) — a proxy for system load. |
| **Error Rate** | Failed requests / total requests, broken down by `stage` (from `RequestFailed.stage`) to pinpoint failure hotspots. |
| **Active Requests** | Live count of requests in `Executing` state — directly informs capacity planning and backpressure decisions. |
| **Cancellation Rate** | Cancelled requests / total requests — a signal for UX issues (e.g., clients giving up due to slowness). |
| **Duplicate Request Rate** | Frequency of idempotency-key collisions — signals client-side retry storms. |

### 13.1 Health Checks

A `/health` (or module-level health probe) reports:
- Registry store connectivity (if backed by external storage in future distributed deployments).
- Event Bus connectivity.
- Dependency reachability (Session Store, Project Store, Authentication) with a lightweight ping, not a full round-trip request.
- Current Active Requests count vs. configured capacity threshold, to signal degraded (but not down) status under load.

---

## 14. Security

| Concern | Handling |
|---|---|
| **Authentication** | Every request must carry a verifiable credential (per Authentication module contract); Request Manager rejects unauthenticated requests before any other processing occurs, minimizing attack surface exposed to unauthenticated input. |
| **Authorization** | Request Manager attaches verified identity to the request but defers fine-grained authorization decisions (e.g., "can this identity access this project?") to the Project Resolver / Project Store, which is the authoritative owner of project access rules. |
| **Input Validation** | All fields are validated against strict schemas (type, length, allowed-value sets) before normalization; unknown/unexpected fields are rejected or stripped per configured policy (fail-closed by default) to prevent injection of unexpected structures downstream. |
| **Rate Limiting** | Request Manager integrates with a Rate Limiter dependency (hook point defined even if enforcement is deferred to v1.x) keyed by identity/project, rejecting requests that exceed configured thresholds with HTTP 429 before consuming further pipeline resources. |
| **Request Size Limits** | Enforced at Request Validator using Configuration-Manager-supplied max payload size; oversized requests rejected with HTTP 413 before normalization is attempted (avoids memory pressure from unbounded payloads). |
| **File Upload Validation** | Attachment references are validated for declared type/size against policy before being accepted as `AttachmentReference`s; actual file content scanning (malware, content policy) is delegated to a dedicated attachment-handling dependency, not implemented in this module. |
| **Prompt Injection Prevention** | Out of scope for structural mitigation at this layer (this is a content-semantics concern, owned by the Orchestrator Core / provider-level safety layers per the SAD) — the Request Manager's contribution is limited to ensuring `userPrompt` is treated strictly as data (never interpolated into any Request Manager-internal command or query) and enforcing size limits that bound worst-case injection payloads. |
| **Secret Handling** | Auth tokens and any credentials are never persisted in the Registry record or included in logs above `debug` level; they are used transiently during Authentication and then discarded from the in-memory request-processing context. |

---

## 15. Performance

| Concern | Approach |
|---|---|
| **Async Processing** | All I/O-bound steps (Session Resolver, Project Resolver, forwarding to Orchestrator Core, event publication) are implemented as asynchronous, non-blocking operations to avoid holding threads/resources idle on I/O. |
| **Concurrency** | The Request Manager is designed to be stateless per-request beyond the Registry (which is itself a concurrency-safe store); multiple requests are processed concurrently with no shared mutable state between them outside the Registry's controlled access patterns. |
| **Streaming** | Streaming Initializer sets up channel plumbing without buffering token content in the Request Manager itself — token relay happens directly between Orchestrator Core and API Layer via the registered channel, keeping the Request Manager out of the hot path for token throughput. |
| **Back Pressure** | When Active Requests / Queue Size approaches configured capacity thresholds, `createRequest()` begins rejecting new requests with HTTP 429 (or a configurable queuing behavior) rather than accepting unbounded work and degrading the whole system. |
| **Memory Usage** | Registry records store metadata and references only — never full prompt/response content — bounding per-request memory footprint regardless of payload size. |
| **Caching** | Session/Project resolution results may be cached (short TTL, via the Session/Project Store's own caching layer, not a Request-Manager-owned cache) to reduce repeated store round-trips for rapid successive requests within the same session. |
| **Resource Limits** | Configuration Manager exposes tunable ceilings (`maxConcurrentRequests`, `maxPayloadSize`, `defaultTimeout`) so operators can tune the module's resource envelope without code changes. |

---

## 16. Interaction With Other Modules

### 16.1 API Layer

- **Inbound:** API Layer calls `createRequest()` with the raw payload and transport context immediately after terminating the HTTP connection and extracting headers.
- **Outbound:** Request Manager returns a `RequestHandle` synchronously (fast — this call does not wait for orchestration to complete); for streaming requests, the API Layer then subscribes to the registered stream channel to relay tokens as the Orchestrator Core produces them.
- **Status:** API Layer may call `getRequest()` for polling-style clients, or subscribe to `RequestCompleted`/`RequestFailed` events for push-style updates.

### 16.2 Orchestrator Core

- **Outbound (from Request Manager):** After `Initialized` state is reached, the Request Manager calls the Orchestrator Core's driven-port hand-off interface (e.g., `orchestratorCore.acceptRequest(request)`), synchronously confirming acceptance (not completion) before transitioning to `Forwarded`.
- **Inbound (to Request Manager):** The Orchestrator Core calls `updateStatus()` and `completeRequest()` on the Request Manager as execution progresses, keeping the Registry as the single source of truth for lifecycle status regardless of where in the pipeline a request currently sits.

### 16.3 Event Bus

- Request Manager is a **publisher** for all events in Section 9.
- Request Manager is a **subscriber** to Orchestrator-Core-originated internal events only where they map to lifecycle status changes it must record (implementation may choose direct interface calls instead of event subscription for this specific inbound path, per the driven-port design in 16.2 — the Event Bus subscription path is an acceptable alternative wiring, not a second parallel mechanism).

### 16.4 Configuration Manager, Logger, Session Manager, Project Manager

- Consumed via standard injected interfaces at component construction time (Section 10); no direct, ad hoc instantiation anywhere in the module.

### 16.5 Sequence Diagram — Cross-Module Cancellation

```
Client → API Layer → RequestManager.cancelRequest(requestId)
                              │
                              ▼
                     Cancellation Handler validates state
                              │
                              ▼
                     CancellationToken.signal()
                              │
                              ▼
                     Lifecycle Controller → state = Cancelled
                              │
                              ▼
                     Event Bus publishes RequestCancelled
                              │
                              ├──────────────▶ Orchestrator Core (observes token, halts work)
                              └──────────────▶ API Layer (closes stream channel, returns ack to client)
```

---

## 17. Folder Structure

```
request-manager/
├── domain/
│   ├── entities/
│   │   ├── Request.ts                 # Canonical Request object definition (Section 6)
│   │   ├── RequestMetadata.ts
│   │   ├── ContextReferences.ts
│   │   └── CancellationToken.ts
│   ├── value-objects/
│   │   ├── RequestId.ts
│   │   ├── CorrelationId.ts
│   │   ├── SessionReference.ts
│   │   └── ProjectReference.ts
│   └── state-machine/
│       └── RequestLifecycleStateMachine.ts   # Legal-transition rules (Section 8)
│
├── application/                        # Use cases — orchestrate domain + ports, no framework code
│   ├── use-cases/
│   │   ├── CreateRequestUseCase.ts
│   │   ├── ValidateRequestUseCase.ts
│   │   ├── NormalizeRequestUseCase.ts
│   │   ├── CancelRequestUseCase.ts
│   │   ├── GetRequestStatusUseCase.ts
│   │   ├── UpdateRequestStatusUseCase.ts
│   │   └── CompleteRequestUseCase.ts
│   └── ports/                          # Interfaces this module depends on (driven ports)
│       ├── SessionStorePort.ts
│       ├── ProjectStorePort.ts
│       ├── AuthenticationPort.ts
│       ├── EventBusPort.ts
│       ├── ConfigurationPort.ts
│       ├── LoggerPort.ts
│       ├── RequestRegistryPort.ts
│       └── OrchestratorCoreHandoffPort.ts
│
├── components/                         # Internal components from Section 4
│   ├── RequestReceiver.ts
│   ├── RequestValidator.ts
│   ├── RequestNormalizer.ts
│   ├── SessionResolver.ts
│   ├── ProjectResolver.ts
│   ├── CorrelationIdGenerator.ts
│   ├── MetadataBuilder.ts
│   ├── ContextInitializer.ts
│   ├── LifecycleController.ts
│   ├── StatusManager.ts
│   ├── CancellationHandler.ts
│   └── StreamingInitializer.ts
│
├── infrastructure/                     # Adapters implementing the ports (driven side)
│   ├── registry/
│   │   └── InMemoryRequestRegistry.ts  # v1 implementation; swappable per Section 19
│   ├── event-bus/
│   │   └── EventBusAdapter.ts
│   ├── logging/
│   │   └── StructuredLoggerAdapter.ts
│   └── orchestrator/
│       └── OrchestratorCoreClientAdapter.ts
│
├── interface/                          # Driving adapters — how the outside world calls in
│   └── api/
│       └── RequestManagerFacade.ts     # Implements the public interfaces from Section 7
│
├── config/
│   └── request-manager.config.schema.ts # Validation rules, limits, defaults (schema only; values from Configuration Manager)
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   └── stress/
│
└── README.md
```

**Rationale:** The `domain/` layer has zero dependencies on frameworks or other modules (pure business objects/rules). The `application/` layer orchestrates domain objects via `ports/` interfaces only — never concrete infrastructure. `infrastructure/` provides the concrete, swappable implementations of those ports. `interface/` is the only layer aware of how external callers (API Layer) invoke this module. This strictly follows Hexagonal/Clean Architecture: dependencies point inward, domain knows nothing about infrastructure.

---

## 18. Testing Strategy

| Test Type | Coverage |
|---|---|
| **Unit Tests** | Every component in Section 4 tested in isolation with mocked ports (e.g., Request Validator tested against a table of valid/invalid payloads without a real Configuration Manager; Lifecycle Controller tested against every legal and illegal state transition). |
| **Integration Tests** | Full `createRequest()` pipeline exercised against real (or realistic in-memory) implementations of Session Store, Project Store, Event Bus, and Registry — confirming the components wire together correctly end-to-end within this module's boundary. |
| **Contract Tests** | Verify the `Request` object handed to the Orchestrator Core's `acceptRequest()` port always conforms to the schema the Orchestrator Core MDD expects; verify the raw payload shapes accepted from the API Layer match what the API Specification defines for each supported client dialect. |
| **Stress Tests** | High-concurrency `createRequest()` bursts to validate backpressure behavior (Section 15), Registry consistency under concurrent writes, and that latency degrades gracefully (not catastrophically) as load approaches configured capacity. |
| **Failure Tests** | Explicit fault injection for every error condition in Section 11 (simulated Session Store timeout, simulated Orchestrator Core hand-off failure, malformed payloads, oversized payloads, duplicate idempotency keys) confirming correct terminal state, correct event emission, and correct client-facing error code for each. |

## Architectural Constraints

This section documents the mandatory architectural rules that govern the Request Manager module. These constraints are architectural invariants and are not optional implementation preferences.

- Request Manager never performs planning.
- Request Manager never performs routing.
- Request Manager never executes AI providers.
- Request Manager never executes browser automation.
- Request Manager never retrieves memory.
- Request Manager never performs knowledge comparison.
- Request Manager never validates AI output.
- Request Manager never reviews AI output.
- Request Manager never executes workflows.
- Request Manager never stores long-term conversation history.
- Request Manager never makes provider decisions.
- Request Manager never bypasses the Orchestrator Core.

These rules preserve the module's intended boundary, prevent scope creep, and ensure that orchestration intelligence remains centralized in the Orchestrator Core rather than being distributed across the Request Manager.

## Architectural Decision Records

The following ADRs capture the major architectural decisions that define the Request Manager module and its relationship to the broader platform.

### ADR-001 Independent Request Manager Module
- **Decision:** The Request Manager is a distinct module with a defined boundary between transport ingestion and orchestration.
- **Context:** Raw, heterogeneous client requests must be normalized and lifecycle-managed before orchestration begins.
- **Alternatives Considered:** Embedding request handling inside the Orchestrator Core, or merging it into the API Layer.
- **Rationale:** Separation improves cohesion, testability, scalability, and independent evolution.
- **Consequences:** The Request Manager owns request admission, normalization, lifecycle, and registry concerns, while orchestration remains elsewhere.

### ADR-002 Canonical Request Object
- **Decision:** All inbound requests are converted into a single canonical internal `Request` object.
- **Context:** Different clients emit different payload shapes and dialects.
- **Alternatives Considered:** Allowing multiple client-specific request representations inside the platform.
- **Rationale:** A canonical object simplifies downstream processing and prevents client-specific logic from spreading through the platform.
- **Consequences:** Downstream modules interact with one stable contract.

### ADR-003 Stateless Request Processing
- **Decision:** Request processing is stateless per request, with lifecycle state persisted in the Request Registry rather than embedded in mutable service state.
- **Context:** The platform must support concurrency and resilience without coupling request progress to a single runtime instance.
- **Alternatives Considered:** In-memory process-local request state only.
- **Rationale:** Stateless processing improves scalability and failure recovery.
- **Consequences:** The Request Registry becomes the authoritative record of progress and status.

### ADR-004 Request Lifecycle State Machine
- **Decision:** Request progress is governed by a formal lifecycle state machine.
- **Context:** Requests must transition through a predictable and auditable path from receipt to terminal completion or failure.
- **Alternatives Considered:** Ad hoc status strings or unstructured lifecycle flags.
- **Rationale:** A state machine prevents illegal transitions and supports consistent operational behavior.
- **Consequences:** Lifecycle transitions are explicit, validated, and observable.

### ADR-005 Event-Driven Request Lifecycle
- **Decision:** Request lifecycle changes are emitted as lifecycle events to the platform Event Bus.
- **Context:** Multiple modules need visibility into request progress without direct coupling.
- **Alternatives Considered:** Polling-based status propagation alone.
- **Rationale:** Event-driven propagation supports decoupling, modularity, and operational observability.
- **Consequences:** Lifecycle updates are distributed to monitoring, audit, and downstream consumers.

### ADR-006 Request Registry Abstraction
- **Decision:** The Request Registry is exposed through an abstraction and can be implemented by different storage backends.
- **Context:** The module needs a durable and replaceable state store for active and recent requests.
- **Alternatives Considered:** Hard-coding a single in-memory registry implementation.
- **Rationale:** Abstraction allows the platform to evolve from in-memory to distributed storage without changing consumers.
- **Consequences:** Request Manager internals remain stable while storage strategy evolves.

### ADR-007 Cooperative Cancellation
- **Decision:** Cancellation is cooperative rather than invasive.
- **Context:** The Request Manager must allow clients to stop work without directly reaching into downstream module internals.
- **Alternatives Considered:** Forceful termination of in-flight work from the Request Manager itself.
- **Rationale:** Cooperative cancellation is safer, more predictable, and preserves module boundaries.
- **Consequences:** Cancellation flows through lifecycle state and cancellation tokens rather than direct imperative interruption.

### ADR-008 Clean Architecture
- **Decision:** The Request Manager is structured according to Clean Architecture principles.
- **Context:** The module must remain independent of frameworks, transport details, and infrastructure decisions.
- **Alternatives Considered:** Layering request logic directly into infrastructure code.
- **Rationale:** Clean Architecture preserves testability and long-term maintainability.
- **Consequences:** Domain rules remain isolated from implementation-specific concerns.

### ADR-009 Hexagonal Architecture
- **Decision:** The module is designed with explicit ports and adapters.
- **Context:** The Request Manager depends on external services such as Session Store, Project Store, and Event Bus.
- **Alternatives Considered:** Direct coupling to concrete infrastructure implementations.
- **Rationale:** Ports and adapters minimize coupling and support future substitutions.
- **Consequences:** The module can evolve its infrastructure implementation without changing its core logic.

### ADR-010 Dependency Injection
- **Decision:** All major dependencies are injected rather than instantiated directly inside the module.
- **Context:** The module must remain testable and swappable across environments.
- **Alternatives Considered:** Global service locators and hard-coded wiring.
- **Rationale:** Dependency injection improves configurability, isolation, and replaceability.
- **Consequences:** The Request Manager is easier to test and evolve over time.

## Request Versioning Policy

The Request object evolves through a formal versioning policy so that downstream modules remain stable even as the platform grows.

### Request Schema Versioning
- Every canonical `Request` object carries an explicit schema version so that the Request Manager can distinguish between supported and incompatible representations.
- Schema version changes are treated as controlled compatibility events rather than ad hoc schema drift.

### Backward Compatibility
- Additive changes are preferred. New optional fields may be introduced without breaking existing consumers.
- Existing modules must continue to process older request variants when the new fields are absent or ignored.

### Forward Compatibility
- Downstream consumers must tolerate unrecognized optional fields and ignore them when they are not relevant.
- The Request Manager must not require consumers to understand every future field in order to process requests correctly.

### Breaking Changes
- Breaking changes require an explicit major-version schema change, documented migration guidance, and coordinated rollout across dependent modules.
- Breaking changes are avoided for normal feature evolution and are reserved for cases where the existing contract can no longer express the required semantics.

### Deprecated Fields
- Fields that are no longer recommended are marked as deprecated in the schema and documentation.
- Deprecated fields remain readable for a defined transition period before removal.

### Migration Strategy
- When a schema change is introduced, the Request Manager supports dual-read behavior where older and newer representations are accepted during migration.
- If a transformation is required, it is applied centrally at normalization time so that downstream modules do not need to implement compatibility logic.

### Schema Evolution
- The Request object evolves through additive, versioned changes that preserve the canonical contract and avoid breaking downstream modules.
- The Request Manager is responsible for normalizing inbound variants into the canonical schema version used by the platform.

## Request Ownership Rules

Ownership boundaries are explicit and non-overlapping. These rules are mandatory and must be preserved during implementation and future changes.

- Request Manager owns the request lifecycle, request normalization, request validation, request metadata, and request registration.
- Memory Manager owns memory, session memory, and context retrieval.
- Orchestrator owns planning, workflow coordination, and orchestration intent.
- Provider Manager owns provider execution and provider-specific invocation.
- Database owns long-term persistence and durable storage of platform data.

No ownership boundary overlaps. If one module needs data or behavior from another domain, it must do so through the defined interface boundary rather than by taking ownership of the same responsibility.

## Request Processing Guarantees

The Request Manager implements the following operational guarantees for every accepted request.

- Every accepted request receives a Request ID.
- Every request receives a Correlation ID.
- Every request has exactly one lifecycle owner.
- Every lifecycle transition is atomic.
- Every request is fully traceable.
- Every accepted request eventually reaches a terminal state.
- Invalid requests never enter orchestration.

These guarantees ensure that request processing is predictable, auditable, and safe for production operation.

## Request Registry Governance

The Request Registry is the authoritative record of request lifecycle state and must be governed as a critical platform component.

- **Retention policy:** Active requests are retained while non-terminal; terminal requests are retained for a configured audit window before being evicted or archived.
- **Eviction policy:** Records that exceed the retention window are removed from the hot registry store to preserve memory and storage efficiency.
- **Cleanup strategy:** A background cleanup process removes stale terminal records and closes any abandoned streaming channels associated with expired requests.
- **Archival strategy:** Expired records may be exported to a durable archival store for audit and debugging rather than deleted immediately.
- **Distributed synchronization strategy:** In future distributed deployments, registry state will be synchronized through a shared backend or event-driven replication strategy that preserves request-level consistency.
- **Consistency guarantees:** The registry guarantees monotonic state progression per request ID and rejects out-of-order or illegal state transitions.
- **Future distributed registry considerations:** A distributed registry must preserve request identity, support partitioning by request ID or shard key, and avoid introducing duplicate lifecycle ownership conflicts.

## Request Correlation Model

The Request Manager uses a set of identifiers to support observability, debugging, and distributed tracing across modules.

- `requestId` identifies a single request instance and is the primary key for registry records and lifecycle events.
- `correlationId` ties a request to a broader trace across API Layer, Request Manager, Orchestrator Core, and downstream providers.
- `sessionId` associates the request with a conversational session and supports continuity across turns.
- `conversationId` distinguishes a specific conversation thread within a session when multiple conversations exist.
- `projectId` associates the request with the relevant project context.
- `traceId` and `spanId` are reserved for future distributed tracing integration and will be used when the platform expands beyond single-process observability.

These identifiers support end-to-end tracing, incident investigation, and cross-module correlation of activity at runtime.

## Validation Categories

Validation is classified into explicit categories so that each validation concern is owned and applied in the correct place.

- **Structural Validation:** Confirms the inbound payload has the required shape, field types, and allowable structure.
- **Authentication Validation:** Confirms the request carries a valid credential or identity context recognized by the platform.
- **Authorization Validation:** Confirms the caller has the right to access the requested session, project, or resource context.
- **Configuration Validation:** Confirms the request complies with current policy, feature flags, and configuration-driven limits.
- **Attachment Validation:** Confirms each attachment reference is structurally valid, within policy limits, and acceptable for the current request context.
- **Business Validation (where applicable):** Confirms request-level business rules or domain-specific constraints that are relevant to the current deployment.

Each category is applied in a way that preserves the Request Manager's role as a boundary gate without extending it into downstream business logic ownership.

## Operational Limits

The Request Manager enforces configurable operational limits to protect system stability and prevent resource exhaustion.

- Maximum payload size
- Maximum attachments
- Maximum metadata size
- Maximum request timeout
- Maximum concurrent requests
- Maximum context references
- Maximum retry count
- Maximum request age

These limits are configuration-driven and must be read from the platform configuration layer rather than hard-coded into business logic.

## Observability Standards

Every request is instrumented according to a common observability model so that operations, debugging, and tracing are consistent across the platform.

The Request Manager captures the following telemetry for every request:

- `requestId`
- `correlationId`
- `sessionId`
- `projectId`
- `clientType`
- `priority`
- `lifecycle state`
- `latency`
- `processing stage`
- `outcome`

These fields support monitoring dashboards, incident response, performance analysis, and distributed tracing. They also allow the platform to correlate failures, latency spikes, and lifecycle anomalies to a specific request path.

| **Mock Strategy** | All driven ports (Section 17 `ports/`) are mocked via interface-based test doubles in unit tests; integration tests use lightweight in-memory adapters (e.g., `InMemoryRequestRegistry`) rather than full external services; contract tests use schema-validation fixtures shared with (or generated from) the API Specification and Orchestrator Core MDD to prevent drift. |

---

## 19. Future Expansion

The module is deliberately designed so the following can be added **without modifying existing internal component logic**, only by adding new components/adapters or extending configuration:

- **Batch Requests:** A new `BatchRequestReceiver` component can decompose a batch payload into multiple individual `Request` objects, reusing the existing Validator → Normalizer → … pipeline per sub-request unchanged; only a new entry-point component and a batch-aggregation response path in the API Layer are needed.
- **Multi-user Sessions:** Session Resolver's interface (`SessionStorePort`) already returns only a reference; supporting multi-user session ownership/isolation is a change confined to the Session Store implementation and the Authentication/Authorization dependency, not to the Request Manager's internals.
- **Distributed Execution:** The `RequestRegistryPort` is already an interface (Section 17); swapping `InMemoryRequestRegistry` for a Redis- or database-backed implementation enables multiple Request Manager instances to share state, with zero change to any component that consumes `RequestRegistryPort`.
- **Priority Queues:** The `priority` field already exists on `Request` (Section 6); actual queue-scheduling logic is intentionally kept in the Orchestrator Core (or a future dedicated Scheduler module) — the Request Manager needs no change to support richer scheduling downstream since it only tags, never enforces, priority.
- **Remote Clients:** New client dialects are handled entirely within Request Normalizer by adding a new dialect-transform strategy (e.g., a Strategy Pattern keyed by `clientType`); no other component needs awareness of the new client.
- **Multiple APIs:** If a non-OpenAI-compatible transport is added (e.g., a native WebSocket protocol), only a new `interface/api/` adapter and a corresponding Normalizer strategy are required; `domain/` and `application/` layers remain untouched.
- **Plugin Extensions:** A `RequestPreprocessorPort` (extension point) can be introduced between Normalizer and Session Resolver, allowing registered plugins (PII redaction, custom enrichment) to run without altering the core pipeline order or existing component code — this is a natural Open/Closed Principle extension point to add when the first real plugin use case arrives, rather than speculatively building it now.

---

## 20. Risks

| Risk Category | Description | Mitigation |
|---|---|---|
| **Performance** | Registry implemented in-memory (v1) becomes a bottleneck or single point of failure under high concurrency or on process restart (state loss). | Registry access is fully abstracted behind `RequestRegistryPort` from day one (Section 17), enabling a low-risk swap to a persistent/distributed backend (Section 19) without touching business logic; monitor Queue Size and Active Requests metrics to detect the threshold where this migration becomes necessary. |
| **Security** | Overly permissive validation or normalization could allow malformed/oversized/malicious payloads to reach downstream modules. | Fail-closed validation policy (unknown fields rejected by default), strict size limits enforced before normalization, and contract tests (Section 18) pinning the exact schema handed to the Orchestrator Core. |
| **Reliability** | A stuck or crashed Orchestrator Core could leave requests permanently in `Forwarded`/`Executing` state, leaking resources and confusing clients. | Timeout sweep (Section 11) force-fails requests exceeding their `timeout`; health checks (Section 13) monitor Orchestrator Core reachability so degraded states are surfaced early. |
| **Concurrency** | Race conditions on the Registry under high concurrent writes (e.g., simultaneous `updateStatus()` and `cancelRequest()` calls for the same request). | All state transitions are funneled exclusively through the Lifecycle Controller, which enforces atomic, validated transitions against the state machine (Section 8), preventing illegal or lost updates regardless of call ordering. |
| **Maintenance** | Dialect-specific normalization logic could grow unbounded and become a maintenance burden as more clients are added. | Strategy Pattern isolation (Section 19) keeps each client dialect's transform logic in its own, independently testable unit, preventing a single monolithic "if client == X" block from forming. |
| **Coupling Drift** | Over time, contributors might be tempted to add orchestration logic (routing, planning shortcuts) directly into Request Manager for convenience, eroding the architectural boundary defined in Section 2.4. | This document's explicit "Not Responsibilities" list (2.4) and contract tests (Section 18) act as a standing guardrail; code review should treat any PR adding routing/planning/memory logic to this module as a design violation requiring escalation, not a normal review comment. |

---

## 21. Design Decisions

| Decision | Rationale | Trade-off / Alternative Considered |
|---|---|---|
| **Separate Request Manager from Orchestrator Core as distinct modules (not layers within one module)** | Enables independent scaling (I/O-bound vs. compute-bound), independent testing, and enforces Single Responsibility at the module boundary, not just the class boundary. | Alternative: a single "Orchestrator" module with internal request-handling classes — rejected because it blurs the boundary over time (see Coupling Drift risk, Section 20) and complicates independent deployment/scaling later. |
| **Canonical internal `Request` object, normalized away from client dialect immediately** | Ensures every downstream module (starting with the Orchestrator Core) works against one stable shape regardless of how many client dialects exist upstream, isolating dialect churn to one component (Request Normalizer). | Alternative: pass the raw payload through and let the Orchestrator Core normalize per-dialect — rejected because it would duplicate dialect knowledge across modules and violate DRY/SRP. |
| **In-memory Request Registry for v1, behind a port interface** | Fastest to implement and sufficiently performant for initial single-instance deployment, while the port abstraction removes migration risk later. | Alternative: build a distributed (Redis-backed) registry from day one — rejected as premature optimization for v1 given the PRD's initial single-instance deployment target; the port interface exists specifically so this decision is cheap to reverse later. |
| **Cancellation via cooperative `CancellationToken` rather than the Request Manager directly halting Orchestrator Core work** | Preserves module boundary — Request Manager has no business reaching into Orchestrator Core internals to forcibly stop execution; cooperative cancellation is the standard pattern for cross-module, async-safe cancellation. | Alternative: a direct `orchestratorCore.forceStop(requestId)` call — rejected because it assumes internal knowledge of how the Orchestrator Core manages execution, violating encapsulation and Dependency Inversion. |
| **Context references only, no content resolution, in Context Initializer** | Keeps memory/context retrieval logic — which is genuinely complex and belongs to the "expected vs. actual state" regression/memory system per the Orchestrator Core MDD — entirely out of this module, preserving high cohesion. | Alternative: have Request Manager pre-fetch recent conversation history to "help" the Orchestrator Core — rejected as scope creep; this module would then need to understand memory relevance/ranking, which is explicitly Orchestrator Core's domain. |
| **Validation rules and limits externalized to Configuration Manager rather than hardcoded** | Allows operators to tune limits (payload size, timeouts) per environment/project without code deployment, and supports future per-project-tier policy differences. | Alternative: hardcode sane defaults in code — rejected because it was explicitly called out as insufficiently flexible for a platform intended to support multiple clients/projects with potentially different policies. |

---

## 22. Diagrams

### 22.1 Component Diagram
See Section 4 for the full internal component diagram.

### 22.2 Sequence Diagrams
See Section 5.2 (standard request), Section 5.3 (validation failure), and Section 16.5 (cancellation).

### 22.3 State Diagram
See Section 8.1.

### 22.4 Request Lifecycle Diagram
See Section 5.1.

### 22.5 Class Relationship Diagram (Conceptual)

```
                 ┌───────────────────┐
                 │      Request       │
                 │ (domain entity)    │
                 └─────────┬──────────┘
                            │ contains
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                     ▼
┌───────────────┐  ┌─────────────────┐   ┌───────────────────┐
│RequestMetadata │  │ ContextReferences│   │ CancellationToken │
└───────────────┘  └─────────────────┘   └───────────────────┘
        │
        │ references (not owns)
        ▼
┌───────────────────┐      ┌───────────────────┐
│ SessionReference    │      │ ProjectReference    │
└───────────────────┘      └───────────────────┘

┌────────────────────────┐
│ RequestLifecycleState   │  (enum, Section 8.2)
│ Machine                  │
└──────────┬───────────────┘
            │ governs transitions of
            ▼
┌───────────────────┐
│ Request.status      │
└───────────────────┘
```

### 22.6 Folder Structure Diagram
See Section 17.

---

## Appendix A — Consistency Notes

- This document assumes the OpenAI-compatible `/v1/chat/completions`-style endpoint contract defined in the API Specification for inbound transport shape; any change to that contract requires a corresponding review of Request Normalizer's dialect-transform strategies (Section 4.3, Section 19).
- The `Request` object's `capabilitiesRequested`, `routingPreferences`, and `executionProfile` fields are intentionally opaque/pass-through at this layer; their interpretation is fully defined in the Orchestrator Core MDD and must not be duplicated or re-interpreted here.
- The "expected vs. actual state" regression comparison logic referenced in the platform's memory system is explicitly out of scope for this module (Section 2.4, Section 4.8) and lives in the Orchestrator Core's Memory/Knowledge Base subsystem per the Orchestrator Core MDD.
- Streaming/status-token relay mechanics at the transport level (SSE formatting, token chunking) are owned by the API Layer per the API Specification; this module's Streaming Initializer only establishes the channel identifier and registers it against the Request ID.
