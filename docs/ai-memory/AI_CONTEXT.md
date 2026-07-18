# AI Startup Context (AI_CONTEXT.md)

*This file is the primary entry point for any AI session. It must be read first to align context.*

---

## 1. Project Metadata
* **Project Name**: Hybrid AI Development Orchestrator
* **Objective**: Build a personal software engineering backend that orchestrates cloud reasoning models and local execution models behind an OpenAI-compatible API client interface.
* **Architecture**: Clean Architecture, event-driven, plugin-based provider manager.
* **Target Clients**: VS Code extension (Roo Code / Continue).

---

## 2. Current Implementation State
* **Current Phase**: Phase 0 — Project Analysis & Governance Setup
* **Current Sprit / Batch**: Batch 0 (Establishing Blueprints and Governance Package)
* **Last Completed Work**: Consistency audits of PRD, SDD, and MDD files.
* **Next Recommended Task**: Initialize the Shared Kernel (Contracts, Entities, Generic Result objects).

---

## 3. Core Coding & Architecture Standards
1. **Never Skip Contracts**: No domain model or service may be built without abstract interfaces.
2. **Clean Boundaries**: Modules must communicate asynchronously via the Event Bus or synchronously via exposed interface contracts. Direct model-to-model imports are strictly prohibited.
3. **Budget Guardrails**: All local executions and cloud completions must enforce configuration-defined token bounds and retry intervals.
4. **90% Test Coverage**: All implemented files must have accompanying unit and integration tests.

---

## 4. Key References & Map
* **Master Index**: [IMPLEMENTATION_INDEX.md](file:///e:/Projects/New%20folder/docs/IMPLEMENTATION_INDEX.md)
* **Playbook Guidelines**: [AI_PLAYBOOK.md](file:///e:/Projects/New%20folder/docs/AI_PLAYBOOK.md)
* **Repository Blueprint**: [REPOSITORY_BLUEPRINT.md](file:///e:/Projects/New%20folder/docs/REPOSITORY_BLUEPRINT.md)
* **Module Blueprints**: [MODULE_BLUEPRINT.md](file:///e:/Projects/New%20folder/docs/MODULE_BLUEPRINT.md)
* **Implementation Constitution**: [IMPLEMENTATION_RULES.md](file:///e:/Projects/New%20folder/docs/ai-memory/IMPLEMENTATION_RULES.md)
