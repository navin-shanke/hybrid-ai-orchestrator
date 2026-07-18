# Event Bus Module — Module Design Document (MDD)

**Document Type:** Module Design Document (MDD)
**Module Name:** Event Bus
**Parent System:** Hybrid AI Development Platform / Orchestrator Core
**Status:** Implementation-Ready
**Audience:** Senior Software Engineers, AI Coding Agents (Cursor, Claude Code, OpenCode, Roo Code)
**Source-of-Truth Inputs:** PRD, SDD/SAD, API Specification, Database Design Document, Orchestrator Core Module Design Document

---

## 1. Executive Summary

### 1.1 Purpose

The Event Bus is the sole communication backbone of the Hybrid AI Development Platform. It exists to decouple every module in the system — Orchestrator Core, Planner, Router, Provider Manager, Task Queue, Memory Manager, Knowledge Base, Review Engine, Validation Engine, Browser Automation, Git Manager, Configuration Manager, Logger, and Dashboard — from one another so that no module ever calls another module directly.

Instead of Module A invoking Module B's methods, Module A **publishes an event** describing "something happened," and Module B (or any number of modules) **subscribes** to that event category and reacts independently. The Event Bus is the only component in the system aware that publishers and subscribers exist; publishers and subscribers are never aware of each other.

### 1.2 Role in the Architecture

The Event Bus sits at the center of the platform's Hexagonal Architecture as a **first-class infrastructure port**. Every other module depends on the Event Bus's published interface (a port), while the Event Bus's internal implementation (the adapter/core) is fully hidden. Modules interact with the bus only through:

- A `publish()` / `publishAsync()` / `publishSync()` contract
- A `subscribe()` / `unsubscribe()` contract
- A well-defined, versioned Event schema

No module — including the Orchestrator Core — is permitted to reach into the Event Bus's internals, query its internal queue state directly, or bypass the pub/sub contract for direct invocation.

### 1.3 Why the Event Bus Exists

Without an Event Bus, the Orchestrator would require direct method calls between every pair of modules that need to communicate. As the platform grows (new providers, new validators, new automation modules, new dashboard widgets), the number of direct dependencies grows combinatorially. This produces:

- Tight coupling that makes modules impossible to test or replace in isolation
- A brittle system where a change in one module ripples into unrelated modules
- No single place to observe, trace, replay, or audit system behavior
- No natural way to add new functionality (e.g., a new Learning Module) without modifying existing modules to call it

The Event Bus solves this by inverting the dependency: modules depend only on the event contract, never on each other.

### 1.4 Benefits

| Benefit | Description |
|---|---|
| Loose Coupling | Modules never hold references to each other. |
| Extensibility | New modules can subscribe to existing events without modifying publishers. |
| Observability | Every event is centrally logged, traced, and measurable. |
| Testability | Modules can be tested by publishing synthetic events and asserting on emitted events. |
| Resilience | Failures in one subscriber do not cascade to publishers or other subscribers. |
| Replayability | Persisted events can be replayed for debugging, recovery, or audit. |
| Scalability Path | The in-process bus can evolve into a distributed bus (Section 21) without changing module contracts. |

---

## 2. Goals

### 2.1 Primary Goals

1. Provide a reliable publish/subscribe mechanism for all inter-module communication.
2. Support both synchronous (request-style, blocking) and asynchronous (fire-and-forget, queued) event delivery.
3. Guarantee at-least-once delivery to all registered, healthy subscribers.
4. Provide full traceability of every event via correlation IDs, request IDs, and trace IDs.
5. Isolate subscriber failures so they cannot affect publishers or other subscribers.
6. Provide a versioned, strongly-typed Event schema shared across the entire platform.
7. Provide complete observability: metrics, logs, health checks.

### 2.2 Secondary Goals

1. Support wildcard and hierarchical topic subscriptions (e.g., `task.*`, `provider.#`).
2. Support middleware pipelines for cross-cutting concerns (logging, validation, tracing) without embedding business logic.
3. Support a Dead Letter Queue (DLQ) for events that repeatedly fail delivery or processing.
4. Support configurable retry policies per event category.
5. Support event persistence for replay and audit purposes.
6. Support plugin-based extension of the bus's middleware and transport layer.

### 2.3 Future Goals

1. Support a distributed Event Bus across multiple processes/machines (Section 21).
2. Support clustering and horizontal scaling of dispatch workers.
3. Support cloud-native transports (e.g., message brokers) behind the same interface.
4. Support schema registry and automatic schema-version negotiation.

### 2.4 Non-Goals

The Event Bus explicitly does **not**:

- Make business decisions of any kind (planning, routing, provider selection).
- Perform validation of business rules (only structural/event-schema validation).
- Retrieve or manage memory/knowledge data.
- Execute tasks, browser automation, or Git operations.
- Own configuration values (it only reacts to `ConfigurationReloaded` events).
- Persist business/domain data (it may persist events themselves for replay, but not domain state).
- Act as a database, cache, or workflow engine.

---

## 3. Responsibilities

### 3.1 Must Have

- Accept event publication requests from any module.
- Validate event structure (schema conformance) before acceptance.
- Maintain a Subscriber Registry mapping topics/categories to handlers.
- Dispatch events to all matching subscribers, synchronously or asynchronously as requested.
- Guarantee delivery ordering **per topic, per publisher** is preserved (FIFO within a topic partition).
- Retry failed deliveries per a configurable policy.
- Route permanently failed events to a Dead Letter Queue.
- Emit lifecycle telemetry (metrics, logs, traces) for every event.
- Expose health-check status of the bus itself.
- Provide a plugin/middleware pipeline for cross-cutting infrastructure concerns only.

### 3.2 Should Have

- Support wildcard topic subscriptions.
- Support priority-based dispatch ordering.
- Support event persistence and replay.
- Support batch publishing for high-throughput producers.
- Support back-pressure signaling to publishers when queues approach capacity.

### 3.3 Future Responsibilities

- Distributed dispatch across worker processes/nodes.
- Cross-process/cross-machine transport adapters (e.g., Kafka, NATS, Redis Streams) behind the existing `EventTransport` port.
- Schema registry integration for automatic compatibility checks.

---

## 4. Scope

### 4.1 What the Event Bus Owns

- The Event schema/envelope definition (structure, not domain payload semantics).
- The Subscriber Registry (who is subscribed to what).
- The internal queue(s), dispatch mechanism, and retry/backoff logic.
- The Dead Letter Queue.
- Event-level validation (structural, not business).
- Event serialization/deserialization.
- Correlation/trace ID propagation.
- Bus-level metrics, logs, and health status.
- Middleware pipeline execution order and plugin lifecycle.

### 4.2 What the Event Bus Never Owns

- Business logic of any kind.
- The semantic meaning or correctness of a payload (e.g., whether a `TaskCreated` payload represents a *valid* task per business rules).
- Data persistence for domain entities (tasks, plans, memory, provider state).
- Decision-making: what to do in response to an event is entirely the subscriber's responsibility.
- Cross-module orchestration logic (that belongs to Orchestrator Core, which itself communicates only via events).

### 4.3 What Other Modules Own

| Module | Owns |
|---|---|
| Orchestrator Core | Overall workflow coordination, reacting to and publishing high-level lifecycle events |
| Planner | Plan generation logic, publishes `PlanCreated`, etc. |
| Router | Provider/task routing decisions |
| Provider Manager | Provider selection, health, failover |
| Task Queue | Task scheduling and execution state (distinct from the Event Bus's internal queue) |
| Memory Manager | Memory retrieval/storage |
| Knowledge Base | Knowledge comparison, regression detection |
| Review Engine | Code/output review logic |
| Validation Engine | Business/domain validation |
| Configuration Manager | Configuration values and reload triggers |
| Logger | Long-term log storage and querying (the Event Bus emits log *events*, the Logger module persists/indexes them) |
| Dashboard | Presentation of system state to users |

---

## 5. Internal Architecture

The Event Bus follows Hexagonal Architecture internally: a pure **domain core** (event routing/dispatch logic) surrounded by **ports** (interfaces) and **adapters** (concrete implementations for in-memory queues, persistence, transports).

### 5.1 Component Overview

```
                         ┌─────────────────────────────────────────┐
                         │              Event Bus Facade             │
                         │   (Public Interface: publish/subscribe)    │
                         └───────────────────┬─────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                                │                                │
     ┌────────▼────────┐            ┌──────────▼──────────┐          ┌────────▼─────────┐
     │  Event Validator │            │  Middleware Pipeline │          │ Correlation Mgr   │
     └────────┬────────┘            └──────────┬──────────┘          └────────┬─────────┘
              │                                │                                │
              └───────────────────────────────┼───────────────────────────────┘
                                              │
                                    ┌──────────▼──────────┐
                                    │   Event Serializer   │
                                    └──────────┬──────────┘
                                              │
                                    ┌──────────▼──────────┐
                                    │       Publisher       │
                                    └──────────┬──────────┘
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        │                                             │
              ┌─────────▼─────────┐                        ┌──────────▼──────────┐
              │    Event Queue      │◄──────────────────────►│   Priority Queue     │
              └─────────┬─────────┘                        └──────────┬──────────┘
                        │                                             │
                        └─────────────────────┬─────────────────────┘
                                              │
                                    ┌──────────▼──────────┐
                                    │   Event Dispatcher    │
                                    └──────────┬──────────┘
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        │                     │                       │
              ┌─────────▼────────┐  ┌─────────▼────────┐   ┌─────────▼─────────┐
              │ Subscriber Registry│  │  Retry Manager    │   │ Dead Letter Queue  │
              └─────────┬────────┘  └─────────┬────────┘   └───────────────────┘
                        │                     │
                        └──────────┬──────────┘
                                   │
                         ┌─────────▼─────────┐
                         │  Subscriber Handlers │
                         │ (external modules)   │
                         └───────────────────┘

     Cross-cutting (attached at multiple points):
     Trace Manager · Metrics Collector · Health Monitor · Persistence Adapter · Plugin Manager · Lifecycle Manager
```

### 5.2 Component Descriptions

**Publisher**
Entry point used by modules to submit events. Accepts a raw Event, hands it to the Event Validator, then the Middleware Pipeline, then serializes and enqueues it. Exposes `publish()`, `publishAsync()`, `publishSync()`, and `publishBatch()`.

**Subscriber Registry**
An in-memory (later: distributed) registry mapping topic patterns (exact or wildcard) to a list of registered handler references, each with metadata (subscriber ID, priority, filter predicate, registration timestamp). Supports dynamic registration/removal at runtime. This is the concrete implementation of the Observer Pattern: the registry is the "Subject" bookkeeping, and each subscriber handler is an "Observer."

**Event Dispatcher**
Pulls events off the Event Queue/Priority Queue and resolves the list of matching subscribers via the Subscriber Registry. Invokes each subscriber's handler either synchronously (blocking, for `publishSync`) or asynchronously (via the async execution pool, for `publishAsync`). Applies isolation: each subscriber invocation is wrapped so one subscriber's exception cannot affect another's execution or the publisher.

**Event Queue**
The default FIFO queue used for asynchronous, non-prioritized event delivery. Guarantees per-topic ordering.

**Priority Queue**
A parallel queue structure used when an event declares a non-default `priority`. The Dispatcher drains the Priority Queue before the standard Event Queue, subject to starvation-prevention rules (Section 17).

**Retry Manager**
Tracks delivery attempts per (event, subscriber) pair. On subscriber handler failure, applies the configured backoff strategy (Section 13) and re-enqueues the event for that specific subscriber until the retry limit is reached, at which point it hands the event to the Dead Letter Queue.

**Dead Letter Queue (DLQ)**
A durable holding area for events that could not be delivered/processed after exhausting retries, or that failed validation/serialization irrecoverably. Supports manual or automated inspection and reprocessing via administrative interfaces (not business logic).

**Middleware Pipeline**
An ordered chain of infrastructure-only interceptors that every event passes through on publish and/or dispatch (e.g., structural logging, trace-ID injection, metrics tagging). Middleware must never alter business meaning of the payload and must never make routing decisions based on payload semantics.

**Event Validator**
Validates that an incoming event conforms to the Event Schema (Section 6): required fields present, correct types, valid enum values, payload within size limits, valid category/version. Rejects malformed events before they enter the queue.

**Event Serializer**
Converts Event objects to/from the wire format (JSON by default) for queuing, persistence, and (in the future) network transport. Enforces schema versioning during deserialization.

**Correlation Manager**
Ensures every event carries a `correlationId` that ties together all events belonging to a single logical operation (e.g., one user request end-to-end). If a publisher does not supply one, the Correlation Manager generates one or inherits it from the causing event (if the publish call is made within the context of processing another event).

**Trace Manager**
Manages distributed-tracing-style span creation for each publish/dispatch/handle cycle, enabling end-to-end timing and causality visualization (event A caused event B caused event C).

**Metrics Collector**
Aggregates counters, gauges, and histograms (throughput, queue depth, latency, retry counts, DLQ size) and exposes them to the Monitoring subsystem (Section 15).

**Health Monitor**
Periodically evaluates the internal state of the bus (queue depths, dispatcher liveness, DLQ growth rate) and exposes a health status (`healthy`, `degraded`, `unhealthy`) via a `healthCheck()` interface.

**Persistence Adapter**
An optional, pluggable adapter (port + adapter pattern) that persists events (all, or a configured subset) to durable storage for replay/audit. Default implementation may be a lightweight append-only store; production implementations may target the platform's Database module — but the Event Bus does not own or design that schema itself; it depends on a `EventStore` port defined in the Database Design Document.

**Plugin Manager**
Loads, registers, and manages the lifecycle of pluggable middleware/transport extensions. The Plugin Manager never executes event handlers. It only manages middleware plugins and transport plugins, and it never performs business logic, planning, routing, orchestration, provider execution, browser automation, or business-rule validation. It enforces that plugins can only hook into the Middleware Pipeline or Transport port — never inject business logic into the dispatch path.

**Lifecycle Manager**
Manages the Event Bus's own startup, shutdown, and drain sequences: on shutdown, stops accepting new publishes, drains in-flight events (up to a configurable timeout), and emits `SystemShutdown`-related events before halting.

---

## 6. Event Model

### 6.1 Standard Event Envelope

Every event in the system, regardless of category, is wrapped in a single canonical envelope:

```
Event {
  eventId          : UUID
  eventName        : string
  category         : string
  version          : string
  timestamp        : ISO-8601 datetime
  correlationId    : UUID
  requestId        : UUID | null
  sessionId        : UUID | null
  projectId         : UUID | null
  sourceModule     : string
  targetModule     : string | null
  priority         : enum(LOW, NORMAL, HIGH, CRITICAL)
  status           : enum(CREATED, VALIDATED, QUEUED, DISPATCHED, PROCESSING, ACKNOWLEDGED, COMPLETED, FAILED, DEAD_LETTERED, ARCHIVED)
  payload          : object (domain-specific, opaque to the bus)
  metadata         : object (key-value, infrastructure annotations)
  retryCount       : integer
  ttl              : integer (seconds) | null
  expiration       : ISO-8601 datetime | null
  eventType        : enum(COMMAND, NOTIFICATION, QUERY_RESULT)
  persistenceFlag  : boolean
}
```

### 6.2 Field-by-Field Rationale

| Field | Why It Exists |
|---|---|
| `eventId` | Uniquely identifies this specific event instance; used for idempotency checks and DLQ tracking. |
| `eventName` | The specific event type (e.g., `TaskCreated`); used by the Subscriber Registry for topic matching. |
| `category` | Coarse-grained grouping (e.g., `Task Events`) used for wildcard subscriptions and monitoring rollups (Section 9). |
| `version` | Schema version of the payload shape, enabling backward-compatible evolution and safe deserialization. |
| `timestamp` | When the event was created; used for ordering, TTL calculation, and tracing. |
| `correlationId` | Ties together every event belonging to one logical end-to-end operation, across module boundaries. |
| `requestId` | Identifies the specific inbound user/API request that triggered this chain of events, distinct from correlationId when one request spawns multiple correlated flows. |
| `sessionId` | Identifies the user/agent session, for session-scoped observability and cleanup. |
| `projectId` | Identifies which project/workspace context the event belongs to, for multi-tenant isolation. |
| `sourceModule` | The publishing module's identifier; required for traceability and for middleware/authorization decisions. |
| `targetModule` | Optional explicit target for point-to-point-style events (most events are broadcast and leave this null). |
| `priority` | Determines queue placement (Priority Queue vs standard Event Queue) and dispatch ordering. |
| `status` | Tracks the event's current lifecycle stage (Section 7) for observability and state-diagram enforcement. |
| `payload` | The domain-specific data; intentionally opaque to the bus — the bus never inspects or interprets its contents beyond size/structure limits. |
| `metadata` | Free-form infrastructure annotations (e.g., trace span ID, originating host, feature flags) added by middleware, not business logic. |
| `retryCount` | Tracks how many delivery attempts have been made, used by the Retry Manager against the configured max. |
| `ttl` | Optional time-to-live in seconds; events exceeding TTL before dispatch are expired rather than delivered. |
| `expiration` | Computed absolute expiration timestamp (timestamp + ttl), checked by the Dispatcher before delivery. |
| `eventType` | Distinguishes Commands (imperative, expects a single logical handler) from Notifications (broadcast, any number of handlers) from Query Results (response-style events), informing dispatch and validation rules. |
| `persistenceFlag` | Indicates whether this specific event should be persisted by the Persistence Adapter (not all events warrant durable storage, e.g., high-frequency `HealthPing` events). |

---

## 7. Event Lifecycle

### 7.1 Lifecycle Stages

```
CREATE ──► VALIDATE ──► PUBLISH ──► QUEUE ──► DISPATCH ──► RECEIVE ──► PROCESS ──► ACKNOWLEDGE ──► COMPLETE ──► ARCHIVE
                │                                                        │
                ▼ (invalid)                                              ▼ (exception)
             REJECTED                                                 RETRY ──► (exhausted) ──► DEAD_LETTER
```

### 7.2 Stage Definitions

1. **Create** — A module constructs an Event object (typically via a helper/factory provided by the bus client library, which auto-fills `eventId`, `timestamp`, `correlationId` inheritance).
2. **Validate** — The Event Validator checks schema conformance. Invalid events are rejected immediately with a synchronous error returned to the publisher; they never enter the queue.
3. **Publish** — The Middleware Pipeline runs (trace injection, metrics tagging, structural logging), then the Event Serializer prepares the event for queuing.
4. **Queue** — The event is placed on the Event Queue or Priority Queue based on its `priority` field.
5. **Dispatch** — The Event Dispatcher resolves matching subscribers from the Subscriber Registry and hands the event to each one (respecting sync/async semantics).
6. **Receive** — Each subscriber handler receives the event.
7. **Process** — The subscriber's own logic executes (fully opaque to the bus).
8. **Acknowledge** — The subscriber signals success/failure back to the Dispatcher via the handler's return value/exception.
9. **Complete** — Once all subscribers have acknowledged (or the sync caller receives its result), the event's status is marked COMPLETED.
10. **Archive** — If `persistenceFlag` is true, the Persistence Adapter stores the finalized event record; otherwise it is discarded from active memory.

### 7.3 Sequence Diagram — Asynchronous Publish

```
Publisher Module        Event Bus Facade      Validator   Middleware   Queue   Dispatcher   Subscriber(s)
      │                        │                  │            │         │         │              │
      │  publishAsync(event)   │                  │            │         │         │              │
      │───────────────────────►│                  │            │         │         │              │
      │                        │  validate(event) │            │         │         │              │
      │                        │─────────────────►│            │         │         │              │
      │                        │◄─────────────────│  (valid)   │         │         │              │
      │                        │  run pipeline     │            │         │         │              │
      │                        │──────────────────────────────►│         │         │              │
      │                        │◄──────────────────────────────│         │         │              │
      │                        │  enqueue(event)                        │         │              │
      │                        │─────────────────────────────────────────►│        │              │
      │◄───────── ack(eventId) │  (immediate return, no wait)             │        │              │
      │                        │                                         │  dequeue │              │
      │                        │                                         │─────────►│              │
      │                        │                                         │          │ resolve subs │
      │                        │                                         │          │─────────────►│
      │                        │                                         │          │  invoke each  │
      │                        │                                         │          │──────────────►│
      │                        │                                         │          │◄──────────────│ (ack/error)
```

### 7.4 Sequence Diagram — Synchronous Publish

```
Publisher Module        Event Bus Facade      Validator   Dispatcher   Subscriber (single, blocking)
      │                        │                  │            │              │
      │  publishSync(event)    │                  │            │              │
      │───────────────────────►│                  │            │              │
      │                        │  validate         │            │              │
      │                        │─────────────────►│            │              │
      │                        │◄─────────────────│            │              │
      │                        │  dispatch directly (bypasses queue)          │
      │                        │──────────────────────────────►│              │
      │                        │                                │  invoke      │
      │                        │                                │─────────────►│
      │                        │                                │◄─────────────│ (result)
      │◄──────── result/error ─│◄──────────────────────────────│              │
```

---

## 8. Publish / Subscribe Architecture

### 8.1 Publisher Registration

Publishers do not register in advance — any module holding a reference to the Event Bus Facade may publish any event at any time. The bus enforces only structural validity and (optionally) an allow-list of `sourceModule` identifiers via the Security layer (Section 16), not a formal registration handshake. This keeps publisher-side coupling minimal, consistent with the Pub/Sub pattern.

### 8.2 Subscriber Registration

Subscribers register explicitly, providing:

- Topic pattern (exact event name, category wildcard, or hierarchical wildcard)
- Handler reference (callback/function)
- Optional filter predicate (structural filter on metadata/payload fields — not business logic evaluation by the bus itself; the predicate is supplied and owned by the subscribing module)
- Priority (affects dispatch ordering among multiple subscribers to the same event)
- Delivery mode preference (sync-capable or async-only)

Registration returns a `subscriptionId` used later for `unsubscribe()`.

### 8.3 Subscription Rules

- A subscriber may register for multiple topics independently.
- Multiple subscribers may register for the same topic; all matching, healthy subscribers receive the event (broadcast semantics) unless the event's `eventType` is `COMMAND`, in which case exactly one subscriber (the highest-priority registrant) is expected to handle it — configuration of this behavior is explicit, never inferred.
- Subscriptions are dynamic: modules may subscribe/unsubscribe at runtime (e.g., Dashboard connecting/disconnecting).

### 8.4 Topic Routing

Topics follow a dot-delimited hierarchical naming convention:

```
<category>.<entity>.<action>
e.g. task.task.created, provider.provider.selected, review.review.completed
```

The Subscriber Registry maintains a trie/prefix-index structure over topic segments to efficiently resolve matching subscribers, including wildcard matches, in O(depth) time rather than a linear scan.

### 8.5 Filtering

Subscribers may attach a structural filter predicate (e.g., "only events where `metadata.projectId == X`"). Filters operate only on envelope fields and declared metadata — never on deep business interpretation of the payload. Filtering happens in the Dispatcher immediately before invoking a specific handler, so filtered-out events never reach subscriber code but are still counted in metrics as "filtered."

### 8.6 Priority

Dispatch order among multiple subscribers to the same event follows descending subscriber priority. Independently, the event's own `priority` field determines its position in the Priority Queue relative to other events.

### 8.7 Wildcard Topics

Two wildcard tokens are supported:

- `*` — matches exactly one segment (e.g., `task.*.created` matches `task.task.created` but not `task.subtask.item.created`)
- `#` — matches one or more trailing segments (e.g., `task.#` matches all task-category events regardless of depth)

### 8.8 Event Categories

See Section 9. Category is a first-class envelope field enabling category-level wildcard subscription (e.g., subscribing to `category == "Health Events"` regardless of specific `eventName`).

### 8.9 Dynamic Registration

The Subscriber Registry supports registration/removal without restarting the bus or any other module, using thread-safe/concurrency-safe data structures (Section 17) to avoid dispatch-time races.

### 8.10 Plugin Registration

Plugins register middleware or transport implementations through the Plugin Manager at bus startup (or dynamically, if hot-plugging is enabled), never through the Subscriber Registry. Plugins are infrastructure-only and are explicitly forbidden from registering as business-logic subscribers.

---

## 9. Event Categories

| Category | Description |
|---|---|
| Request Events | Inbound user/API request lifecycle (received, validated, forwarded) |
| Planning Events | Planner module activity |
| Task Events | Task creation, queuing, execution lifecycle |
| Memory Events | Memory load/update operations |
| Provider Events | AI provider selection, failure, recovery |
| Router Events | Routing decisions |
| Review Events | Code/output review lifecycle |
| Validation Events | Validation lifecycle |
| Browser Events | Browser automation lifecycle |
| Git Events | Git checkpoint/versioning operations |
| Configuration Events | Configuration reload/change notifications |
| Dashboard Events | Dashboard connection/subscription activity |
| Learning Events | Learning/feedback loop updates |
| Logging Events | Structural log emission (errors, warnings) |
| System Events | Bus/platform startup, shutdown |
| Health Events | Health check pings/results |
| Security Events | Auth/authorization-related occurrences |
| Lifecycle Events | Generic module lifecycle transitions (started, stopped, degraded) |

Each category is purely a classification label owned by convention across the platform; the Event Bus does not enforce category-specific behavior beyond what is configured generically (retry policy, priority defaults) per category (Section 10).

---

## 10. Event Catalog

For each event: **Publisher**, **Subscribers**, **Payload (shape only)**, **Trigger**, **Retry Policy**, **Failure Behaviour**.

### 10.1 Request Events

**RequestReceived**
- Publisher: Request Manager
- Subscribers: Orchestrator Core, Logger, Dashboard
- Payload: `{ requestId, rawInput, source, timestamp }`
- Trigger: An inbound request arrives at the platform boundary.
- Retry Policy: None (notification-only, no delivery retry beyond standard transient retry).
- Failure Behaviour: Logged; does not block request intake.

**RequestValidated**
- Publisher: Request Manager
- Subscribers: Orchestrator Core, Logger
- Payload: `{ requestId, validationResult }`
- Trigger: Structural validation of inbound request completes.
- Retry Policy: Standard (3 attempts, exponential backoff).
- Failure Behaviour: DLQ after exhaustion; Orchestrator Core degrades gracefully via its own timeout logic.

**RequestForwarded**
- Publisher: Request Manager
- Subscribers: Orchestrator Core
- Payload: `{ requestId, targetModule }`
- Trigger: Request Manager hands off to Orchestrator Core.
- Retry Policy: Standard.
- Failure Behaviour: DLQ; alert raised (Section 15).

### 10.2 Planning Events

**PlannerStarted**
- Publisher: Planner
- Subscribers: Orchestrator Core, Dashboard, Logger
- Payload: `{ requestId, planningContextRef }`
- Trigger: Planner begins plan generation.
- Retry Policy: None (notification).
- Failure Behaviour: Logged only.

**PlanCreated**
- Publisher: Planner
- Subscribers: Orchestrator Core, Task Queue, Logger, Dashboard
- Payload: `{ planId, requestId, taskGraphRef }`
- Trigger: Planner completes a plan.
- Retry Policy: Standard (3 attempts).
- Failure Behaviour: DLQ; Orchestrator Core re-requests plan on DLQ alert.

### 10.3 Task Events

**TaskCreated**
- Publisher: Orchestrator Core / Task Queue
- Subscribers: Task Queue, Logger, Dashboard
- Payload: `{ taskId, planId, taskSpecRef }`
- Trigger: A task is derived from a plan.
- Retry Policy: Standard.
- Failure Behaviour: DLQ.

**TaskQueued**
- Publisher: Task Queue
- Subscribers: Dashboard, Logger, Metrics Collector (internal)
- Payload: `{ taskId, queuePosition }`
- Trigger: Task placed into execution queue.
- Retry Policy: None.
- Failure Behaviour: Logged.

**TaskStarted**
- Publisher: Task Queue
- Subscribers: Orchestrator Core, Dashboard, Logger
- Payload: `{ taskId, workerRef, startTime }`
- Trigger: Execution begins.
- Retry Policy: None.
- Failure Behaviour: Logged.

**TaskCompleted**
- Publisher: Task Queue
- Subscribers: Orchestrator Core, Review Engine, Learning Module, Dashboard, Logger
- Payload: `{ taskId, resultRef, duration }`
- Trigger: Task execution finishes successfully.
- Retry Policy: Standard.
- Failure Behaviour: DLQ; Orchestrator Core alerted.

**TaskFailed**
- Publisher: Task Queue
- Subscribers: Orchestrator Core, Provider Manager, Dashboard, Logger
- Payload: `{ taskId, errorRef, retryEligible }`
- Trigger: Task execution fails.
- Retry Policy: Standard, high priority.
- Failure Behaviour: DLQ; escalated to Health Events.

### 10.4 Provider Events

**ProviderSelected**
- Publisher: Router / Provider Manager
- Subscribers: Task Queue, Logger, Dashboard
- Payload: `{ taskId, providerId, reasonCode }`
- Trigger: A provider is chosen for a task.
- Retry Policy: Standard.
- Failure Behaviour: DLQ.

**ProviderFailed**
- Publisher: Provider Manager
- Subscribers: Router, Orchestrator Core, Dashboard, Logger
- Payload: `{ providerId, errorRef }`
- Trigger: Provider call fails.
- Retry Policy: High priority, standard retries.
- Failure Behaviour: DLQ; triggers Health Events.

**ProviderRecovered**
- Publisher: Provider Manager
- Subscribers: Router, Dashboard, Logger
- Payload: `{ providerId, recoveryTime }`
- Trigger: A previously failed provider becomes healthy again.
- Retry Policy: None.
- Failure Behaviour: Logged.

### 10.5 Memory Events

**MemoryLoaded**
- Publisher: Memory Manager
- Subscribers: Orchestrator Core, Planner, Logger
- Payload: `{ requestId, memoryRef }`
- Trigger: Memory retrieval completes.
- Retry Policy: Standard.
- Failure Behaviour: DLQ.

**MemoryUpdated**
- Publisher: Memory Manager
- Subscribers: Knowledge Base, Logger
- Payload: `{ memoryId, changeRef }`
- Trigger: Memory store is updated.
- Retry Policy: Standard.
- Failure Behaviour: DLQ.

**KnowledgeCompared**
- Publisher: Knowledge Base
- Subscribers: Review Engine, Dashboard, Logger
- Payload: `{ comparisonId, resultRef }`
- Trigger: Knowledge comparison completes.
- Retry Policy: Standard.
- Failure Behaviour: DLQ.

**RegressionDetected**
- Publisher: Knowledge Base
- Subscribers: Orchestrator Core, Review Engine, Dashboard, Logger
- Payload: `{ regressionId, details }`
- Trigger: A regression is identified.
- Retry Policy: High priority.
- Failure Behaviour: DLQ; alerted.

### 10.6 Review & Validation Events

**ReviewStarted / ReviewCompleted**
- Publisher: Review Engine
- Subscribers: Orchestrator Core, Dashboard, Logger
- Payload: `{ reviewId, taskId, resultRef (on completed) }`
- Trigger: Review lifecycle transitions.
- Retry Policy: Standard.
- Failure Behaviour: DLQ.

**ValidationStarted / ValidationCompleted**
- Publisher: Validation Engine
- Subscribers: Orchestrator Core, Dashboard, Logger
- Payload: `{ validationId, taskId, resultRef (on completed) }`
- Trigger: Validation lifecycle transitions.
- Retry Policy: Standard.
- Failure Behaviour: DLQ.

### 10.7 Browser & Git Events

**BrowserStarted / BrowserCompleted**
- Publisher: Browser Automation Module
- Subscribers: Orchestrator Core, Dashboard, Logger
- Payload: `{ sessionId, taskId, resultRef (on completed) }`
- Trigger: Browser automation lifecycle transitions.
- Retry Policy: Standard.
- Failure Behaviour: DLQ.

**GitCheckpointCreated**
- Publisher: Git Manager
- Subscribers: Orchestrator Core, Dashboard, Logger
- Payload: `{ checkpointId, commitRef }`
- Trigger: A checkpoint/commit is created.
- Retry Policy: Standard.
- Failure Behaviour: DLQ.

### 10.8 Configuration, System, Logging, Dashboard, Learning Events

**ConfigurationReloaded**
- Publisher: Configuration Manager
- Subscribers: All modules (category-wildcard subscription common)
- Payload: `{ configVersion, changedKeys }`
- Trigger: Configuration is reloaded.
- Retry Policy: High priority, standard retries.
- Failure Behaviour: DLQ; alerted (misconfiguration risk).

**SystemStarted / SystemShutdown**
- Publisher: Orchestrator Core / Lifecycle Manager
- Subscribers: All modules
- Payload: `{ timestamp, reason (on shutdown) }`
- Trigger: Platform-wide lifecycle transitions.
- Retry Policy: Best-effort (shutdown draining, see Section 5.2).
- Failure Behaviour: Logged; shutdown proceeds regardless after drain timeout.

**LoggerError**
- Publisher: Any module (via Logger's own error path) or the bus itself
- Subscribers: Dashboard, Health Monitor
- Payload: `{ sourceModule, errorRef }`
- Trigger: A logging operation itself fails.
- Retry Policy: None (avoid infinite loops).
- Failure Behaviour: DLQ suppressed for this event type to avoid recursive failure storms.

**DashboardConnected**
- Publisher: Dashboard
- Subscribers: Orchestrator Core, Logger
- Payload: `{ dashboardSessionId }`
- Trigger: A dashboard client connects.
- Retry Policy: None.
- Failure Behaviour: Logged.

**LearningUpdated**
- Publisher: Learning Module
- Subscribers: Planner, Router, Dashboard, Logger
- Payload: `{ modelVersion, updateRef }`
- Trigger: Learning feedback loop produces an update.
- Retry Policy: Standard.
- Failure Behaviour: DLQ.

> **Note:** The catalog above is representative and extensible. New events are added by defining a new `eventName`/`category`/payload contract in the shared schema registry; the Event Bus requires no code changes to support new event names, only schema registration.

---

## 11. Public Interfaces

### 11.1 `publish(event: Event): Promise<PublishResult>`
- **Purpose:** Queue an event for asynchronous, broadcast delivery to all matching subscribers.
- **Inputs:** A fully-formed `Event` object (or partial object auto-completed by the client factory).
- **Outputs:** `PublishResult { eventId, status: "QUEUED" }`
- **Validation:** Full schema validation; rejects on missing required fields, invalid enum values, oversized payload.
- **Errors:** `ValidationError`, `QueueOverflowError` (Section 13).
- **Side Effects:** Event enters the Event/Priority Queue; metrics incremented; middleware pipeline executed.

### 11.2 `publishAsync(event: Event): Promise<PublishResult>`
- **Purpose:** Alias/explicit form of `publish()`, emphasizing non-blocking semantics at call sites for clarity.
- Same contract as 11.1.

### 11.3 `publishSync(event: Event, timeoutMs?: number): Promise<HandlerResult[]>`
- **Purpose:** Deliver an event immediately, bypassing the queue, and block until all (or, for COMMAND events, the single) subscriber(s) acknowledge or the timeout elapses.
- **Inputs:** Event object, optional timeout (default from configuration).
- **Outputs:** Array of `HandlerResult { subscriberId, status, resultRef | errorRef }`.
- **Validation:** Same as `publish()`, plus a check that at least one subscriber currently exists for COMMAND-type events (otherwise returns `NoSubscriberError` rather than silently succeeding).
- **Errors:** `ValidationError`, `NoSubscriberError`, `TimeoutError`, `HandlerExecutionError` (aggregated).
- **Side Effects:** Direct synchronous invocation of handler(s); no queue entry; still fully traced/logged/metriced.

### 11.4 `publishBatch(events: Event[]): Promise<PublishResult[]>`
- **Purpose:** Efficiently publish many events in one call (Section 17 performance).
- **Inputs:** Array of Event objects.
- **Outputs:** Array of `PublishResult`, one per input event, preserving order.
- **Validation:** Each event validated independently; partial success is allowed (one invalid event does not block the rest) unless `atomic: true` is passed, in which case all-or-nothing.
- **Errors:** `ValidationError` (per-item, aggregated), `BatchTooLargeError`.
- **Side Effects:** Same as `publish()` per event.

### 11.5 `subscribe(topicPattern: string, handler: EventHandler, options?: SubscriptionOptions): SubscriptionHandle`
- **Purpose:** Register a handler for one or more topics.
- **Inputs:** Topic pattern (exact or wildcard), handler function reference, optional `{ priority, filter, deliveryMode, subscriberId }`.
- **Outputs:** `SubscriptionHandle { subscriptionId }`.
- **Validation:** Topic pattern syntax validated; duplicate `subscriberId` + topic pattern combination rejected unless `allowDuplicate: true`.
- **Errors:** `InvalidTopicPatternError`, `DuplicateSubscriptionError`.
- **Side Effects:** Entry added to Subscriber Registry; registry index rebuilt incrementally.

### 11.6 `unsubscribe(subscriptionId: string): void`
- **Purpose:** Remove a previously registered subscription.
- **Inputs:** `subscriptionId` returned from `subscribe()`.
- **Outputs:** None (void) or boolean success indicator.
- **Validation:** `subscriptionId` must exist.
- **Errors:** `SubscriptionNotFoundError` (may be treated as a no-op warning rather than a hard error, per configuration).
- **Side Effects:** Entry removed from registry; in-flight dispatches to this subscriber are allowed to complete but no new dispatches occur.

### 11.7 `registerHandler(topicPattern: string, handler: EventHandler, options?): SubscriptionHandle`
- **Purpose:** Alias for `subscribe()` used in contexts emphasizing handler registration (e.g., plugin bootstrap). Identical contract to 11.5.

### 11.8 `removeHandler(subscriptionId: string): void`
- **Purpose:** Alias for `unsubscribe()`.

### 11.9 `registerMiddleware(middleware: Middleware, position?: number): void`
- **Purpose:** Insert an infrastructure-only interceptor into the Middleware Pipeline.
- **Inputs:** Middleware object implementing `beforePublish`/`afterDispatch` hooks; optional explicit pipeline position.
- **Outputs:** None.
- **Validation:** Middleware must not declare itself as a business-logic subscriber; the Plugin Manager rejects middleware that attempts to access domain services.
- **Errors:** `InvalidMiddlewareError`.
- **Side Effects:** Alters pipeline execution order for all subsequent events.

### 11.10 `registerPlugin(plugin: EventBusPlugin): void`
- **Purpose:** Register a plugin that may bundle middleware and/or a custom transport adapter.
- **Inputs:** Plugin descriptor with lifecycle hooks (`onInit`, `onShutdown`) and optional middleware/transport registrations.
- **Outputs:** None.
- **Validation:** Plugin manifest validated (name, version, declared capabilities).
- **Errors:** `PluginRegistrationError`.
- **Side Effects:** Plugin lifecycle hooks invoked at appropriate bus lifecycle stages (Section 5.2 Lifecycle Manager).

### 11.11 `healthCheck(): HealthStatus`
- **Purpose:** Report current bus health.
- **Outputs:** `HealthStatus { status: healthy|degraded|unhealthy, queueDepth, dlqSize, dispatcherLiveness }`.

---

## 12. State Management

### 12.1 Event States

```
CREATED → VALIDATED → QUEUED → DISPATCHED → PROCESSING → ACKNOWLEDGED → COMPLETED → ARCHIVED
    │                                              │
    └──► REJECTED (validation failure)             └──► RETRYING → (success: ACKNOWLEDGED) or (exhausted: DEAD_LETTERED)
```

### 12.2 Queue States

`EMPTY → FILLING → NOMINAL → NEAR_CAPACITY → FULL (back-pressure engaged) → DRAINING (on shutdown)`

### 12.3 Delivery States (per subscriber, per event)

`PENDING → DELIVERED → HANDLER_RUNNING → SUCCEEDED | FAILED`

### 12.4 Retry States

`INITIAL → RETRY_SCHEDULED → RETRY_IN_PROGRESS → (SUCCEEDED | RETRY_SCHEDULED again | EXHAUSTED)`

### 12.5 Acknowledgement States

`AWAITING_ACK → ACKED | NACKED | ACK_TIMEOUT`

### 12.6 Dead Letter States

`ENTERED_DLQ → UNDER_REVIEW (manual/admin) → REQUEUED | DISCARDED | ARCHIVED_PERMANENTLY`

### 12.7 State Diagram — Event (composite)

```
        ┌──────────┐
        │ CREATED  │
        └────┬─────┘
             │validate
        ┌────▼─────┐        invalid
        │VALIDATED │───────────────────► REJECTED (terminal)
        └────┬─────┘
             │enqueue
        ┌────▼─────┐
        │  QUEUED  │
        └────┬─────┘
             │dispatch
        ┌────▼──────┐
        │DISPATCHED │
        └────┬──────┘
             │deliver
        ┌────▼───────┐
        │ PROCESSING │
        └────┬───────┘
       success│    │failure
        ┌─────▼┐   └────►┌─────────┐   exhausted   ┌────────────────┐
        │ACKED │          │ RETRYING │──────────────►│ DEAD_LETTERED   │(terminal)
        └───┬──┘          └────┬────┘                └────────────────┘
            │                  │success
            │                  ▼
            │              ┌──────┐
            │              │ACKED │
            │              └──┬───┘
            └───────┬─────────┘
               ┌─────▼─────┐
               │ COMPLETED │
               └─────┬─────┘
                     │archive (if persistenceFlag)
               ┌─────▼─────┐
               │ ARCHIVED  │ (terminal)
               └───────────┘
```

---

## 13. Error Handling

| Failure Mode | Handling Strategy |
|---|---|
| Subscriber Failure | Isolated per-subscriber try/catch around handler invocation; exception converted to a `HandlerExecutionError`, does not propagate to publisher or other subscribers; triggers Retry Manager for that (event, subscriber) pair only. |
| Publisher Failure (publisher-side exception during construction) | Occurs before `publish()` is called; out of Event Bus scope, but `publish()` itself validates defensively and returns a clear `ValidationError` rather than throwing an opaque exception. |
| Duplicate Events | `eventId` uniqueness checked at ingestion (bounded de-duplication window, e.g., last N minutes) to guard against publisher-side retries producing duplicates; duplicates are acknowledged as no-ops without re-dispatch. |
| Lost Events | Mitigated via persistence (if `persistenceFlag` true) and via at-least-once delivery guarantees; Health Monitor tracks queue-in vs queue-out counters to detect anomalous loss. |
| Timeout | `publishSync` calls enforce a timeout; async handlers that exceed a configurable max processing time are marked `FAILED` and routed to Retry Manager. |
| Queue Overflow | When queue depth exceeds configured high-watermark, `publish()` either (a) applies back-pressure by rejecting/delaying new publishes with `QueueOverflowError`, or (b) sheds lowest-priority events first, per configuration (Section 17). |
| Serialization Failure | Caught at the Event Serializer boundary; event is rejected pre-queue with `SerializationError`; never silently dropped. |
| Handler Exception | See Subscriber Failure above. |
| Dead Letter Queue | Terminal destination for events that exhaust retries or fail irrecoverably; includes full event payload plus failure history (`retryCount`, last error, per-subscriber failure details) for diagnosis. |
| Retry Strategy | Exponential backoff with jitter: `delay = min(baseDelay * 2^retryCount, maxDelay) ± jitter`. Category-specific overrides configurable (e.g., Health Events use no retry; Configuration Events use aggressive retry). |
| Recovery Strategy | DLQ entries may be manually or automatically (via admin tooling, not bus-internal business logic) requeued after the underlying issue (e.g., a downed subscriber) is resolved. |

---

## 14. Logging

The Event Bus emits structured, machine-parseable logs (not business logs) at each lifecycle transition:

- **Publish Logs:** eventId, eventName, sourceModule, timestamp, correlationId.
- **Dispatch Logs:** eventId, resolved subscriber list, dispatch mode (sync/async).
- **Subscriber Logs:** per-subscriber outcome (success/failure/timeout), duration.
- **Performance Logs:** queue wait time, processing duration, end-to-end latency.
- **Audit Logs:** subscription/unsubscription events, plugin registration, configuration-driven policy changes.
- **Debug Logs:** verbose internal state transitions (queue depth changes, retry scheduling), enabled only under a debug log level.

All logs carry `traceId` and `correlationId` for cross-module correlation, and are emitted as `LoggingEvents`-category events themselves (dogfooding the bus) as well as forwarded to the Logger module's ingestion port.

---

## 15. Monitoring

| Metric | Type | Description |
|---|---|---|
| Event Throughput | Counter/rate | Events published/dispatched per second, per category. |
| Queue Size | Gauge | Current depth of Event Queue and Priority Queue. |
| Subscribers | Gauge | Active subscriber count per topic. |
| Latency | Histogram | End-to-end (publish → complete) and per-stage latency. |
| Dropped Events | Counter | Events shed due to overflow or expired TTL. |
| Retries | Counter | Retry attempts per category/subscriber. |
| Dead Letters | Gauge/Counter | Current DLQ size and rate of growth. |
| Memory Usage | Gauge | Bus process memory footprint. |
| CPU Usage | Gauge | Bus process CPU utilization. |
| Health Checks | Status | Aggregate `healthCheck()` result exposed on an interval and on-demand. |

Metrics are exposed via the Metrics Collector to the platform's monitoring/dashboard subsystem through a pull (`/metrics`-style) or push interface, per the SDD's established observability conventions.

---

## 16. Security

- **Event Validation:** Structural validation only (schema conformance); the bus does not interpret payload semantics for security purposes beyond size and type checks.
- **Payload Validation:** Maximum payload size enforced; disallowed types (e.g., executable binary blobs) rejected at the Validator.
- **Sensitive Data:** The bus provides a `metadata.sensitive` flag convention; when set, Logging and Persistence Adapters apply redaction/exclusion rules rather than the bus attempting semantic PII detection.
- **Encryption:** Events persisted via the Persistence Adapter or transmitted over a future distributed transport (Section 21) are encrypted at rest/in transit using the platform's standard encryption utilities (owned by the platform's security infrastructure, not reimplemented in the bus).
- **Authentication:** Publishers/subscribers are assumed to be authenticated modules within the trusted process boundary; for future distributed deployments, transport adapters must enforce mutual authentication (mTLS or equivalent) — a Non-Goal for the initial in-process implementation but a required extension point.
- **Authorization:** An optional `sourceModule` allow-list per topic can be configured to restrict which modules may publish to sensitive categories (e.g., only Configuration Manager may publish `ConfigurationReloaded`); enforced by a dedicated Authorization Middleware, not embedded bus logic.
- **Audit Trail:** All publish/subscribe/unsubscribe operations are logged with actor (`sourceModule`/`subscriberId`), timestamp, and outcome.
- **Event Integrity:** Optional checksum/hash field in `metadata` allows subscribers to verify payload integrity; the bus does not sign events by default but exposes this as a middleware extension point.

---

## 17. Performance

- **Async Processing:** Default delivery mode is asynchronous, non-blocking for publishers.
- **Parallel Dispatch:** Multiple subscribers for the same event are invoked concurrently (bounded by a worker pool) rather than sequentially, except where `eventType == COMMAND` requires single-handler semantics.
- **Batch Publishing:** `publishBatch()` reduces per-call overhead for high-frequency producers (e.g., streaming task progress updates).
- **Caching:** The Subscriber Registry's topic-resolution index is cached/rebuilt incrementally rather than recomputed per dispatch.
- **Priority Scheduling:** Priority Queue is drained preferentially, with an aging mechanism to prevent starvation of NORMAL/LOW priority events (a NORMAL event waiting beyond a configured threshold is promoted).
- **Memory Usage:** Queue depth is bounded by configuration; the bus favors back-pressure over unbounded memory growth.
- **Back Pressure:** When queue high-watermark is reached, `publish()` signals back-pressure to callers (via `QueueOverflowError` or an awaitable delay, configurable) rather than allowing unbounded queuing.
- **High Throughput:** The Dispatcher uses a worker pool sized per configuration/available cores; the design is transport-agnostic so throughput can scale by swapping the internal queue for a higher-throughput implementation without changing the public interface.

---

## 18. Interaction With Other Modules

All interactions occur exclusively through publish/subscribe; the diagrams below illustrate typical flows, not direct calls.

### 18.1 Request Manager → Orchestrator Core (via Event Bus)

```
Request Manager        Event Bus         Orchestrator Core
     │  publish(RequestReceived)  │              │
     │─────────────────────────►│              │
     │                            │  dispatch    │
     │                            │─────────────►│
     │                            │              │ (reacts, begins planning flow)
```

### 18.2 Orchestrator Core ↔ Planner ↔ Task Queue

```
Orchestrator Core     Event Bus        Planner          Task Queue
      │ publish(PlanRequested)│           │                  │
      │──────────────────────►│           │                  │
      │                        │ dispatch  │                  │
      │                        │──────────►│                  │
      │                        │           │ publish(PlanCreated)
      │                        │◄──────────│                  │
      │                        │ dispatch (broadcast)         │
      │◄───────────────────────│──────────────────────────────►│
      │ (reacts)               │           │                  │ (creates tasks)
```

### 18.3 Router ↔ Provider Manager

```
Router              Event Bus         Provider Manager
  │ publish(RouteDecisionNeeded)│              │
  │─────────────────────────────►│              │
  │                               │ dispatch     │
  │                               │─────────────►│
  │                               │              │ publish(ProviderSelected)
  │                               │◄─────────────│
  │◄──────────────────────────────│
```

### 18.4 Task Queue → Review Engine → Validation Engine

```
Task Queue         Event Bus      Review Engine    Validation Engine
   │ publish(TaskCompleted)│              │                │
   │───────────────────────►│              │                │
   │                         │ dispatch     │                │
   │                         │─────────────►│                │
   │                         │              │ publish(ReviewCompleted)
   │                         │◄─────────────│                │
   │                         │ dispatch                       │
   │                         │───────────────────────────────►│
   │                         │              │                │ publish(ValidationCompleted)
   │                         │◄───────────────────────────────│
```

### 18.5 Configuration Manager → All Modules

```
Configuration Manager     Event Bus     [All Subscribed Modules]
      │ publish(ConfigurationReloaded) │
      │────────────────────────────────►│
      │                                  │ dispatch (broadcast, category wildcard)
      │                                  │──────────────────────────►
```

### 18.6 Logger and Dashboard

Both the Logger and Dashboard modules subscribe broadly (often via category-wildcard subscriptions such as `#`) to observe system-wide activity without being explicit targets of any publisher — the canonical example of Pub/Sub decoupling in this platform.

---

## 19. Folder Structure

```
event-bus/
├── src/
│   ├── domain/                        # Pure core logic — no framework/infra dependencies
│   │   ├── entities/
│   │   │   └── Event.ts               # Event envelope definition (Section 6)
│   │   ├── value-objects/
│   │   │   ├── Priority.ts            # Priority enum + comparison logic
│   │   │   ├── EventStatus.ts         # Status enum + valid transition rules (Section 12)
│   │   │   └── TopicPattern.ts        # Topic pattern parsing/matching (exact/wildcard)
│   │   ├── services/
│   │   │   ├── EventDispatcher.ts     # Core dispatch algorithm (pure, injected dependencies)
│   │   │   ├── SubscriberRegistry.ts  # Topic-to-subscriber index (Section 8.4)
│   │   │   ├── RetryPolicyResolver.ts # Computes backoff per category/config (Section 13)
│   │   │   └── CorrelationManager.ts  # Correlation/trace ID derivation (Section 6)
│   │   └── ports/                     # Interfaces the domain depends on (Hexagonal ports)
│   │       ├── EventQueuePort.ts
│   │       ├── EventStorePort.ts      # Persistence Adapter contract
│   │       ├── EventTransportPort.ts  # Future distributed transport contract
│   │       └── MetricsPort.ts
│   │
│   ├── application/                   # Use-case orchestration of domain services
│   │   ├── PublishEventUseCase.ts
│   │   ├── PublishSyncEventUseCase.ts
│   │   ├── SubscribeUseCase.ts
│   │   ├── UnsubscribeUseCase.ts
│   │   └── HealthCheckUseCase.ts
│   │
│   ├── infrastructure/                # Adapters implementing the ports
│   │   ├── queue/
│   │   │   ├── InMemoryEventQueue.ts
│   │   │   └── InMemoryPriorityQueue.ts
│   │   ├── persistence/
│   │   │   └── EventStoreAdapter.ts   # Talks to the Database module's EventStore port
│   │   ├── transport/
│   │   │   └── LocalTransportAdapter.ts # In-process default; future: distributed adapters
│   │   ├── metrics/
│   │   │   └── MetricsCollectorAdapter.ts
│   │   ├── logging/
│   │   │   └── StructuredLoggerAdapter.ts
│   │   └── serialization/
│   │       └── JsonEventSerializer.ts
│   │
│   ├── middleware/
│   │   ├── MiddlewarePipeline.ts
│   │   ├── TraceInjectionMiddleware.ts
│   │   ├── MetricsTaggingMiddleware.ts
│   │   ├── StructuralLoggingMiddleware.ts
│   │   └── AuthorizationMiddleware.ts # Optional source-module allow-list enforcement
│   │
│   ├── plugins/
│   │   ├── PluginManager.ts
│   │   └── PluginContract.ts
│   │
│   ├── errors/
│   │   ├── ValidationError.ts
│   │   ├── QueueOverflowError.ts
│   │   ├── SerializationError.ts
│   │   ├── HandlerExecutionError.ts
│   │   ├── TimeoutError.ts
│   │   ├── NoSubscriberError.ts
│   │   ├── InvalidTopicPatternError.ts
│   │   ├── DuplicateSubscriptionError.ts
│   │   ├── SubscriptionNotFoundError.ts
│   │   ├── InvalidMiddlewareError.ts
│   │   └── PluginRegistrationError.ts
│   │
│   ├── dead-letter/
│   │   ├── DeadLetterQueue.ts
│   │   └── DeadLetterInspectionService.ts # Admin-facing read/requeue operations
│   │
│   ├── lifecycle/
│   │   └── LifecycleManager.ts        # Startup/shutdown/drain (Section 5.2)
│   │
│   └── facade/
│       └── EventBusFacade.ts          # The single public entry point (Section 11)
│
├── schemas/
│   └── event-schema.json              # JSON Schema for Event envelope, versioned
│
├── config/
│   └── event-bus.config.ts            # Retry policies, queue thresholds, priority defaults
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── performance/
│   ├── stress/
│   ├── concurrency/
│   ├── failure/
│   └── contract/
│
└── docs/
    └── MDD.md                         # This document
```

### 19.1 Folder Responsibility Summary

- `domain/` — Framework-agnostic core logic implementing pub/sub, dispatch, and state rules; contains zero I/O.
- `application/` — Thin use-case layer wiring domain services together for each public operation.
- `infrastructure/` — Concrete adapters (queue, persistence, transport, metrics, logging, serialization) implementing the domain's ports; swappable independently (Hexagonal Architecture).
- `middleware/` — Infrastructure-only cross-cutting interceptors; explicitly forbidden from containing business logic.
- `plugins/` — Extension loading mechanism, isolated from the dispatch core.
- `errors/` — Typed error hierarchy referenced throughout Section 13.
- `dead-letter/` — DLQ storage and administrative inspection/requeue operations.
- `lifecycle/` — Startup/shutdown/drain sequencing.
- `facade/` — The only file other modules are permitted to import directly.
- `schemas/` — Versioned Event schema, the contract referenced by the Event Validator and Serializer.
- `config/` — All tunable parameters (retry, thresholds, priorities) — never hardcoded in domain logic.
- `tests/` — Mirrors the testing strategy in Section 20.

---

## 20. Testing Strategy

| Test Type | Focus |
|---|---|
| Unit Tests | Domain services in isolation (SubscriberRegistry matching logic, RetryPolicyResolver backoff math, TopicPattern wildcard matching, state-transition validity) using injected fakes for all ports. |
| Integration Tests | Facade-level flows: publish → validate → queue → dispatch → subscriber invocation, using the real in-memory adapters. |
| Performance Tests | Throughput under sustained publish load; latency percentiles (p50/p95/p99) per priority tier. |
| Stress Tests | Behavior at and beyond queue capacity; verifies back-pressure/shedding behavior (Section 17) rather than crash or silent data loss. |
| Concurrency Tests | Simultaneous subscribe/unsubscribe/publish from multiple threads/async contexts; verifies no lost updates to the Subscriber Registry and correct per-topic ordering guarantees. |
| Failure Tests | Simulated subscriber exceptions, timeouts, serialization failures; verifies isolation (Section 13) and correct DLQ routing. |
| Contract Tests | Verifies the Event envelope and each cataloged event (Section 10) conform to the published JSON Schema, protecting downstream module integrations from silent breaking changes. |
| Mock Strategy | All infrastructure ports (`EventQueuePort`, `EventStorePort`, `EventTransportPort`, `MetricsPort`) have in-memory fakes for unit/integration tests and are the only seams mocked — domain logic is never mocked, only exercised directly. |

---

## 21. Future Expansion

The current design targets a single-process, in-memory implementation, but every extension point below is achievable **without altering the public Facade contract (Section 11) or the Event schema (Section 6)**:

- **Distributed Event Bus:** Replace `InMemoryEventQueue`/`LocalTransportAdapter` with a distributed adapter (e.g., message-broker-backed) implementing the same `EventQueuePort`/`EventTransportPort`.
- **Remote Workers:** Dispatcher's worker pool becomes a pool of remote consumer processes pulling from the distributed transport; Subscriber Registry gains a distributed coordination layer (e.g., via the persistence/coordination store) while keeping the same registration API.
- **Multiple Processes:** Achieved by the same transport abstraction; correlation/trace IDs already propagate cross-process by design (Section 6).
- **Cluster Support:** Health Monitor and Metrics Collector extend to aggregate across nodes; no domain logic changes required.
- **Plugin Extensions:** The existing Plugin Manager (Section 5.2, 11.10) is the designed seam for all such extensions.
- **Cloud Deployment:** Persistence Adapter and Transport Adapter are the only components requiring cloud-specific implementations.
- **Microservices:** Because modules already communicate exclusively via events (never direct calls), splitting modules into separate services requires no change to their business logic — only swapping the transport adapter underneath the same Facade contract.

---

## 22. Risks

| Risk Category | Risk | Mitigation |
|---|---|---|
| Performance | High-volume publishers overwhelm the queue | Back-pressure, priority aging, batch publishing (Section 17) |
| Concurrency | Race conditions in Subscriber Registry during dynamic (un)subscription | Thread-safe/concurrency-safe registry data structures; concurrency test suite (Section 20) |
| Memory | Unbounded queue growth under sustained overload | Configurable capacity limits, shedding policy, DLQ offload |
| Reliability | Subscriber failures causing silent event loss | At-least-once delivery, Retry Manager, DLQ, delivery metrics reconciliation |
| Scalability | Single-process bottleneck as platform grows | Transport-agnostic design (Section 21) enables horizontal scaling without contract changes |
| Security | Unauthorized modules publishing to sensitive topics | Optional Authorization Middleware with source-module allow-lists (Section 16) |
| Maintenance | Event schema drift across modules over time | Centralized, versioned schema registry; contract tests (Section 20) enforced in CI |

---

## 23. Design Decisions

| Decision | Rationale | Trade-off / Alternatives Considered |
|---|---|---|
| Pub/Sub over direct RPC-style calls | Maximizes decoupling and extensibility, core platform goal | Slightly higher latency and less immediate call-stack traceability than direct calls; mitigated via Trace Manager |
| Both sync and async delivery supported | Some flows (e.g., request validation ack) need immediate results; most flows benefit from async decoupling | Maintaining two delivery paths adds internal complexity versus a purely async design |
| Hierarchical dot-delimited topics with wildcards | Familiar convention (similar to AMQP/MQTT), supports flexible category-level and fine-grained subscriptions | Requires a trie-based index for efficient matching rather than a flat map |
| Bus never inspects payload semantics | Enforces strict separation between infrastructure and business logic (a core architectural requirement) | Limits the bus's ability to offer payload-aware filtering beyond structural predicates; subscribers must self-filter on business content |
| At-least-once delivery (not exactly-once) | Exactly-once is significantly more complex to guarantee in a distributed future without heavy coordination overhead | Subscribers must be designed to tolerate duplicate delivery (idempotent handlers), documented as a platform-wide convention |
| In-memory default implementation with pluggable transport | Keeps initial implementation simple while preserving a clear path to distributed deployment | Requires disciplined adherence to the port/adapter boundary to avoid leaking in-memory assumptions into domain logic |
| Dead Letter Queue instead of silent drop | Guarantees no event is permanently lost without a diagnosable trail | Requires DLQ storage capacity planning and an administrative inspection workflow |
| Middleware/Plugin strictly infrastructure-only | Preserves the "no business logic in the bus" architectural requirement | Slightly limits what plugins can achieve; any business-relevant reaction must be a proper subscriber, not middleware |

---

## 24. Diagrams

### 24.1 Component Diagram
See Section 5.1.

### 24.2 Sequence Diagrams
See Section 7.3 (async publish), 7.4 (sync publish), and Section 18 (cross-module flows).

### 24.3 Publish/Subscribe Diagram

```
        Publishers                         Event Bus                          Subscribers
  ┌───────────────────┐                                              ┌───────────────────────┐
  │ Request Manager     │──publish──►┌────────────────┐              │ Orchestrator Core       │
  │ Planner              │──publish──►│                 │──dispatch──►│ Task Queue              │
  │ Task Queue           │──publish──►│  Event Bus Core │──dispatch──►│ Review Engine           │
  │ Provider Manager     │──publish──►│  (Pub/Sub Core) │──dispatch──►│ Validation Engine       │
  │ Review Engine        │──publish──►│                 │──dispatch──►│ Dashboard               │
  │ ...all modules       │──publish──►└────────────────┘──dispatch──►│ Logger                  │
  └───────────────────┘                                              └───────────────────────┘
```

### 24.4 State Diagram
See Section 12.7.

### 24.5 Lifecycle Diagram
See Section 7.1.

### 24.6 Folder Structure Diagram
See Section 19.

### 24.7 Event Flow Diagram

```
[Module A] --Event--> [Validator] --> [Middleware] --> [Queue/PriorityQueue] --> [Dispatcher]
                                                                                        │
                                            ┌───────────────────────────────────────────┼──────────────────────┐
                                            ▼                                            ▼                      ▼
                                    [Subscriber 1: Module B]                  [Subscriber 2: Module C]  [Subscriber N: ...]
                                            │success                                     │failure
                                            ▼                                            ▼
                                       [Acknowledge]                              [Retry Manager] --exhausted--> [DLQ]
```

### 24.8 Topic Architecture Diagram

```
category ─┬─ task
          │   ├─ task.created
          │   ├─ task.queued
          │   ├─ task.started
          │   ├─ task.completed
          │   └─ task.failed
          ├─ provider
          │   ├─ provider.selected
          │   ├─ provider.failed
          │   └─ provider.recovered
          ├─ review / validation / browser / git / configuration / system / health / security / lifecycle / logging / dashboard / learning
          │
   Wildcard examples:
     "task.#"        → all task-category events
     "provider.*"    → any single-segment provider event
     "#"              → every event (used by Logger/Dashboard broad subscriptions)
```

---

## 25. Architectural Constraints

The following rules are mandatory architectural constraints and are not optional policy choices. The Event Bus is an infrastructure dependency that carries facts between modules; it is not a place where business intent is executed.

- The Event Bus never executes business logic.
- The Event Bus never performs planning.
- The Event Bus never performs routing.
- The Event Bus never performs orchestration.
- The Event Bus never executes providers.
- The Event Bus never executes browser automation.
- The Event Bus never validates business rules.
- The Event Bus never stores business/domain entities.
- The Event Bus never replaces the Task Queue.
- The Event Bus never interprets payload semantics.

These constraints apply equally to the core dispatcher, middleware, plugins, transport adapters, persistence adapters, and lifecycle components. Any capability that would turn the Event Bus into a business execution engine is explicitly out of scope.

## 26. Architectural Decision Records

### ADR-001 Event Driven Architecture
- Decision: Adopt an event-driven backbone for module-to-module communication.
- Context: The platform requires loose coupling between independently evolving modules.
- Alternatives Considered: direct method calls, synchronous RPC, and shared database coordination.
- Rationale: Event-driven communication reduces dependency explosion and supports extensibility.
- Consequences: The system gains asynchronous decoupling at the cost of eventual consistency and duplicate delivery tolerance.

### ADR-002 Publish / Subscribe Communication
- Decision: Use publish/subscribe as the primary integration pattern.
- Context: Multiple modules may need to react to the same state change without direct coupling.
- Alternatives Considered: point-to-point invocation and request/response chaining.
- Rationale: Pub/sub enables fan-out, independent evolution, and simpler extension.
- Consequences: Publishers and subscribers remain decoupled, but message contracts must be stable and well documented.

### ADR-003 At-Least-Once Delivery
- Decision: Prefer at-least-once delivery rather than best-effort or exactly-once semantics.
- Context: The platform must preserve work through transient failures and retries.
- Alternatives Considered: exactly-once with heavy coordination and best-effort fire-and-forget.
- Rationale: At-least-once is pragmatic and compatible with distributed evolution.
- Consequences: Subscribers must tolerate duplicate delivery and implement idempotent handling.

### ADR-004 Dead Letter Queue
- Decision: Route undeliverable or repeatedly failing events to a Dead Letter Queue.
- Context: Some failures are terminal or require operator intervention.
- Alternatives Considered: silent drop and permanent retry loops.
- Rationale: DLQ provides observability, safety, and recovery guidance.
- Consequences: Event loss is controlled and diagnosable rather than silent.

### ADR-005 Hexagonal Architecture
- Decision: Structure the Event Bus around a hexagonal architecture with ports and adapters.
- Context: The implementation must remain swappable between in-memory and distributed transports.
- Alternatives Considered: tightly coupled monolithic implementation and layered service-only design.
- Rationale: Ports and adapters preserve separation of concerns and future extensibility.
- Consequences: Core domain logic remains stable while infrastructure implementations evolve.

### ADR-006 Middleware Pipeline
- Decision: Process every event through a well-defined middleware pipeline.
- Context: Cross-cutting concerns such as validation, tracing, metrics, and logging are required consistently.
- Alternatives Considered: ad hoc per-subscriber handlers and direct inline interception.
- Rationale: A shared pipeline reduces duplication and improves operational consistency.
- Consequences: Middleware ordering and responsibilities must be standardized and documented.

### ADR-007 Transport Abstraction
- Decision: Isolate queueing and delivery behind a transport abstraction.
- Context: The platform must support both local and future distributed deployments.
- Alternatives Considered: hard-coded in-memory delivery and direct broker integration.
- Rationale: Transport abstraction decouples the domain core from infrastructure changes.
- Consequences: The same facade contract remains valid even as the implementation becomes distributed.

### ADR-008 Event Schema Versioning
- Decision: Version all event schemas and require schema-aware validation.
- Context: Modules evolve independently and must not break one another silently.
- Alternatives Considered: unversioned payloads and implicit consumer assumptions.
- Rationale: Versioning preserves compatibility and enables safe evolution.
- Consequences: Consumers must support the negotiated version and migration path.

### ADR-009 Infrastructure Plugin Architecture
- Decision: Use a plugin architecture for middleware and transport extensions.
- Context: The platform needs extensibility without modifying the Event Bus core.
- Alternatives Considered: hard-coded extension points and direct code changes for every new connector.
- Rationale: Plugins keep the core stable and preserve operational isolation.
- Consequences: Plugin lifecycle, ownership, and safety constraints must be enforced.

## 27. Governance and Operational Extensions

### 27.1 Event Versioning Policy

- Schema Versioning: Every event carries a version identifier, and schema evolution is tracked centrally in the shared schema registry.
- Backward Compatibility: Producers must preserve existing required fields and semantics for supported versions whenever possible.
- Forward Compatibility: Consumers should tolerate unknown optional fields and ignore unrecognized extensions unless a version change explicitly requires stricter handling.
- Breaking Changes: Changes that remove fields, alter required semantics, or change event meaning require a new major version and explicit review.
- Deprecated Versions: Older versions may remain supported for a defined transition window before removal.
- Unsupported Versions: Events that use an unsupported or expired version must be rejected or routed to the DLQ rather than silently processed.
- Migration Strategy: Consumers should support both current and prior versions during migration, with roll-forward and roll-back compatibility preserved where feasible.
- Version Lifecycle: A version moves from active to deprecated to unsupported according to the platform's release and compatibility policy.

### 27.2 Event Naming Convention

Event names should follow the canonical pattern Category.Entity.Action, such as Task.Created, Task.Completed, Provider.Selected, Review.Completed, Validation.Completed, Browser.Completed, Git.CheckpointCreated, and Configuration.Reloaded. Naming must be consistent, lowercase or Pascal-style by convention, dot-delimited, and stable across releases. Each event name should describe the business occurrence precisely and avoid ambiguous or implementation-specific labels.

### 27.3 Event Ownership Rules

Only one module owns publishing each event. Each event has exactly one authoritative publisher, and that publisher remains responsible for the event's contract and semantics. Subscribers never publish replacement events, and ownership must never overlap. For example, Task.Created is owned by the Task Queue or its orchestration boundary, while Review.Completed is owned by the Review Engine; consumers may observe these events but do not re-publish them as substitutes.

### 27.4 Idempotency Strategy

Every event should carry a unique eventId. Duplicate events may still occur due to retries, replay, or transport redelivery, and the Event Bus and consumers must treat these as duplicates rather than independent work items. Consumer handlers should use eventId-based deduplication, store the result of processing, and reject or skip repeated execution safely. This provides an exactly-once illusion for downstream behavior while preserving at-least-once delivery semantics at the transport layer.

### 27.5 Event Ordering Guarantees

Ordering guarantees are limited and explicit. The Event Bus provides ordering per topic and, where supported by the underlying transport, per partition. It does not provide global ordering across all topics or across distributed nodes. Cross-topic ordering is therefore not guaranteed, and consumers must not assume a single global sequence. Distributed deployment may further weaken ordering guarantees depending on replication and failover behavior; consumers should design for eventual ordering rather than strict global ordering.

### 27.6 Event Size Limits

Operational limits must be enforced to protect queueing and transport performance. The maximum payload size, maximum metadata size, maximum headers, and maximum total event size should be configurable and validated before enqueueing. Large payloads should be stored externally and referenced by identifier where possible, rather than embedded directly in the event envelope. This keeps the bus efficient while preserving a stable contract for consumers.

### 27.7 Event Retention Policy

Events should be retained long enough to support replay, audit, debugging, and operational recovery. The retention period for active queues, the replay window for persisted events, the archival strategy, and the purge policy should all be configurable. Compliance-sensitive systems may require extended retention for regulated data, while ordinary operational events may be archived and purged on a shorter schedule.

### 27.8 Subscriber Lifecycle

The subscriber lifecycle is a managed state machine:

Registered
↓
Initialized
↓
Healthy
↓
Paused
↓
Resumed
↓
Unhealthy
↓
Unregistered
↓
Removed

A subscriber begins in Registered, moves to Initialized when the subscription is ready, and becomes Healthy when it can receive events successfully. A subscriber may be Paused during maintenance or overload, then Resumed when normal operation resumes. If processing repeatedly fails or times out, it becomes Unhealthy and may eventually be Unregistered and Removed from the active set. This lifecycle is used for health monitoring, drain coordination, and safe shutdown.

### 27.9 Middleware Ordering Rules

Middleware must execute in a deterministic order to preserve correctness and observability. A typical order is:

Validation
↓
Correlation
↓
Tracing
↓
Authorization
↓
Logging
↓
Metrics
↓
Serialization

Ordering matters because each middleware step may depend on state introduced by earlier stages. Validation must run before enrichment, tracing should be present before downstream behavior, authorization should precede any side effects, and serialization must occur last so that the envelope is final before queueing or transport delivery.

### 27.10 Distributed Deployment Considerations

The Event Bus must retain the same public contract when deployed across multiple processes or regions. Cluster topology, cross-region deployment, replication, failover, network partition handling, transport abstraction, and high availability must be treated as first-class operational concerns. The distributed implementation should preserve event ordering where the underlying transport provides it, but it must degrade gracefully under partition conditions and recover without changing the consumer contract.

### 27.11 Event Contract Governance

Event contracts are governed like any other critical integration boundary. Schema ownership must be explicit, the approval process should include compatibility review, and deprecation should follow a documented policy. Breaking changes require explicit approval, and contract tests should be part of the release workflow so that schema drift is detected before it reaches production.

### 27.12 Operational Limits

The Event Bus should expose configurable operational limits for maximum queue depth, maximum retry count, maximum subscribers, maximum concurrent dispatches, maximum middleware count, maximum handler timeout, and maximum retry delay. These limits protect stability under load and provide operators with clear guardrails for tuning and incident response.

### 27.13 Observability Correlation

The Event Bus should preserve and propagate correlation identifiers consistently across modules. The requestId identifies the originating request context, correlationId links all events belonging to one logical operation, traceId ties the distributed trace together, and spanId identifies the individual processing unit within that trace. This allows operators and developers to reconstruct end-to-end behavior across modules, queues, and transports without relying on ad hoc logging.

### 27.14 Event Taxonomy

Events should be classified into the following categories:

- Domain Events: represent meaningful business state changes within a domain, such as Task.Completed or Review.Completed.
- Application Events: represent workflow or application-level state transitions, such as Request.Accepted or Configuration.Reloaded.
- Infrastructure Events: represent platform or bus-level state changes, such as Queue.Overloaded or SystemShutdown.
- Integration Events: represent interactions between external systems or adapters, such as Provider.Selected or Git.CheckpointCreated.
- System Events: represent health, lifecycle, security, and operational state changes that support monitoring and resilience.

Each category serves a different purpose, and the classification should be used to guide subscription design, retention policy, and operational monitoring.

## Appendix A — Glossary

| Term | Definition |
|---|---|
| Envelope | The standard wrapper (Section 6) around every domain payload. |
| Topic | The routable identifier (typically `eventName` or hierarchical pattern) used for subscription matching. |
| DLQ | Dead Letter Queue — terminal store for undeliverable/unprocessable events. |
| Port | A Hexagonal Architecture interface the domain core depends on, implemented by an adapter. |
| Adapter | A concrete implementation of a port (e.g., `InMemoryEventQueue` implements `EventQueuePort`). |
| Correlation ID | Identifier linking all events belonging to one logical end-to-end operation. |

---

**End of Module Design Document — Event Bus**
