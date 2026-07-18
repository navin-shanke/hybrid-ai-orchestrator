# Architectural Decision Log (DECISION_LOG.md)

*This file log tracks all approved Architecture Change Requests (ACRs) and major design adjustments. It is modified only when the Chief Architect approves an ACR.*

---

## 1. Approved Decisions Registry

| ADR ID | Approved ACR ID | Title | Date | Status | Summary of Decision & Impact |
| --- | --- | --- | --- | --- | --- |
| **ADR-001** | N/A (Baseline) | Single-Node Process Server | 2026-07-18 | ✅ Accepted | Server runs locally to enable low-latency communication with Roo Code client. |
| **ADR-002** | N/A (Baseline) | SQLite relational database storage | 2026-07-18 | ✅ Accepted | Relational SQLite database selected to manage task queue and memory state transactions. |
| **ADR-003** | N/A (Baseline) | InMemory Async Event Bus | 2026-07-18 | ✅ Accepted | Employs standard listener patterns internally to minimize network configuration errors. |
| **ADR-004** | ACR-SK-001 | IdGenerator Abstraction for UniqueEntityID | 2026-07-19 | ✅ Accepted | Introduced `IdGenerator` interface + `UuidIdGenerator`/`TestIdGenerator` implementations. `UniqueEntityID` now accepts optional generator; default remains UUID v4. Enables test determinism and future strategy changes (ULID, NanoID, etc.) without touching domain code. |
| **ADR-005** | ACR-SK-002 | ValueObject Equality Semantics Documented | 2026-07-19 | ✅ Accepted | Documented that `ValueObject.equals()` performs structural equality with recursive handling for nested `ValueObject` instances. Other nested objects/arrays use reference equality. Future enhancement may deepen equality for arrays/collections. |
| **ADR-006** | ACR-SK-003 | Result.unwrap() Usage Policy | 2026-07-19 | ✅ Accepted | `Result.unwrap()` throws the contained error directly — **permitted only in test code and at module boundaries where failure is unrecoverable**. Production code must use `.match()`, `.map()`, `.flatMap()`, or `.unwrapOr()` for explicit error handling. Linting rule to be added in future batch. |
| **ADR-007** | ACR-SK-004 | ErrorCodes Organization | 2026-07-19 | ✅ Accepted | `ErrorCodes` remains a single centralized enum for v1 to simplify Router/Provider Manager lookups. Module-specific catalogs deferred to post-v1 (ADR-007 tracks the future split). Current file annotated with section comments per domain. |

---

## 2. Decision Template (For New Additions)

*When a new ACR is approved, append it below using this format:*

### ADR-XXX: [Title of Decision]
* **Related ACR**: [ACR ID]
* **Date**: YYYY-MM-DD
* **Status**: ⬜ Proposed | ✅ Approved | ❌ Superseded
* **Context / Problem Statement**: *What problem does this decision solve?*
* **Decision Outcome**: *What is the chosen approach?*
* **Consequences**:
  * *Positive impacts:*
  * *Negative impacts / trade-offs:*
* **Affected Modules**: *List modules requiring refactoring or document updates.*