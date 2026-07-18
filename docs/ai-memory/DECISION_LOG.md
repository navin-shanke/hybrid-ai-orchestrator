# Architectural Decision Log (DECISION_LOG.md)

*This file log tracks all approved Architecture Change Requests (ACRs) and major design adjustments. It is modified only when the Chief Architect approves an ACR.*

---

## 1. Approved Decisions Registry

| ADR ID | Approved ACR ID | Title | Date | Status | Summary of Decision & Impact |
| --- | --- | --- | --- | --- | --- |
| **ADR-001** | N/A (Baseline) | Single-Node Process Server | 2026-07-18 | ✅ Accepted | Server runs locally to enable low-latency communication with Roo Code client. |
| **ADR-002** | N/A (Baseline) | SQLite relational database storage | 2026-07-18 | ✅ Accepted | Relational SQLite database selected to manage task queue and memory state transactions. |
| **ADR-003** | N/A (Baseline) | InMemory Async Event Bus | 2026-07-18 | ✅ Accepted | Employs standard listener patterns internally to minimize network configuration errors. |

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
