# Architecture Memory (ARCHITECTURE_MEMORY.md)

*This document stores stable architectural knowledge, design system decisions, module boundaries, and interfaces. It is updated only when an Architecture Change Request (ACR) is approved.*

---

## 1. Clean Architecture System Conventions

The system enforces strict boundary controls:
* **Entities (Domain)**: Represent enterprise business rules. They contain state and pure logic. No dependencies on databases, HTTP libraries, or framework components.
* **Ports (Contracts)**: Abstract interfaces defining how data enters (inbound ports / use cases) or leaves (outbound ports / repository interfaces) the system core.
* **Services**: Implement the use cases. They manage data flow to and from entities, orchestrating execution.
* **Adapters (Infrastructure)**: Implement the ports. This includes database clients (Postgres/SQLite adapters), external HTTP client APIs, and terminal automation drivers.

---

## 2. Event Registry Catalog

Below is the verified event register matching the [EventBus_Module_Design_Document.md](file:///e:/Projects/New%20folder/docs/architecture/mdd/EventBus_Module_Design_Document.md). Only these topics may be published:

| Event Name | Publisher Module | Consumed By Modules | Payload Schema Reference |
| --- | --- | --- | --- |
| `REQUEST_RECEIVED` | Request Manager | Router, Orchestrator Core | `contracts/events/RequestReceived.json` |
| `ROUTE_DECIDED` | Router | Capability Selector, Core | `contracts/events/RouteDecided.json` |
| `PLAN_GENERATED` | Planner | Task Queue, Core | `contracts/events/PlanGenerated.json` |
| `TASK_DISPATCHED` | Task Queue | Dashboard Backend, Core | `contracts/events/TaskDispatched.json` |
| `TASK_COMPLETED` | Task Queue | Review Engine, Memory | `contracts/events/TaskCompleted.json` |
| `REVIEW_COMPLETED` | Review Engine | Validation Engine, Core | `contracts/events/ReviewCompleted.json` |
| `QUALITY_GATE_PASSED` | Validation Engine | Git Manager, Core | `contracts/events/QualityPassed.json` |
| `CONFIGURATION_HOT_RELOADED` | Configuration | Plugin System, Core | `contracts/events/ConfigReloaded.json` |

---

## 3. Active Architecture Decisions Record (ADR) Log

| ADR ID | Decision Title | Status | Date | Brief Rationale |
| --- | --- | --- | --- | --- |
| ADR-001 | Single-Node Process Server | Accepted | 2026-07-18 | Run as a local HTTP service to integrate with local editor extensions (Roo Code). |
| ADR-002 | SQLite Storage for Metadata | Accepted | 2026-07-18 | Simplicity of setup, single file, full relational transactional consistency. |
| ADR-003 | In-Memory Async Event Bus | Accepted | 2026-07-18 | Prevents third-party queue dependencies (RabbitMQ/Redis) for initial local releases. |
