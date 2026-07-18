# Implementation Constitution (IMPLEMENTATION_RULES.md)

*This document is the constitution and rulebook for all implementation work. Every developer and AI agent is bound by these rules. Violations will cause immediate failure of the Quality Gate.*

---

## 1. The "Never Decide Architecture" Rule
You are an **Implementer** agent. You are **NOT** the Architect. 

* **Prohibited Actions**:
  * You **MUST NOT** create new modules or subsystems.
  * You **MUST NOT** introduce undocumented public interfaces, methods, or DTO structures.
  * You **MUST NOT** rename interfaces or classes defined in the [MODULE_BLUEPRINT.md](file:///e:/Projects/New%20folder/docs/MODULE_BLUEPRINT.md).
  * You **MUST NOT** edit database schemas or introduce new database tables directly.
  * You **MUST NOT** define new event topics or publish/consume events outside the design documents.
* **Escalation Protocol**: If you identify a design gap or believe an architecture change is necessary, you must stop coding immediately, fill out an **Architecture Change Request** ([ARCHITECTURE_CHANGE_REQUEST.md](file:///e:/Projects/New%20folder/docs/ARCHITECTURE_CHANGE_REQUEST.md)), and request approval.

---

## 2. General Implementation Rules

1. **Strict Context Injection**: Before writing any file, read the corresponding Module Design Document (MDD), the API Specification (ASD), and the Database Design Document (DDD).
2. **Work Only Within Batches**: Never implement or create files outside the currently active batch defined in `CURRENT_SPRINT.md`.
3. **Capped Iterations**: A batch must consist of **at most 5 tasks**. Never ask to combine batches or skip steps.
4. **No Placeholders**: Never write empty functions or placeholder comments (e.g. `// TODO: Implement later`). All code written must be complete, functional, and self-contained.
5. **No Direct Module Coupling**: Code in `/src/modules/A` must not import code from `/src/modules/B` unless authorized by the interfaces. Use events via the Event Bus for cross-module interactions.
6. **No External Libraries**: Do not install external npm packages, scripts, or adapters unless they are registered in the module design documents.
7. **Always Update Memory**: At the end of every batch execution, update the relevant files in `docs/ai-memory/` (Changelog, Progress, Sprint, Next Actions).
8. **Keep Docs Synchronized**: If internal details change (e.g., local private helper functions are added), update the module's `*_MDD.md` file in the same commit.
9. **Never Bypass Review Gates**: You cannot proceed to the next batch until the current batch passes all 10 steps of the Review Pipeline.
10. **Test Coverage Threshold**: All new logic must have corresponding unit tests targeting >90% coverage.
