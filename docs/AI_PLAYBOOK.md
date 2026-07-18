# AI Playbook (AI_PLAYBOOK.md)

This playbook is the operational manual and developer handbook for any AI agent (specifically `OpenCode`) executing implementation tasks in this repository. It defines startup routines, coding loops, quality gates, and architectural governance.

---

## 1. The Startup Routine (Mandatory)
Before writing any code or proposing edits, you **MUST** run the following startup checks:

1. **Read Startup Memory**:
   * Read [docs/ai-memory/AI_CONTEXT.md](file:///e:/Projects/New%20folder/docs/ai-memory/AI_CONTEXT.md) to understand current objectives.
   * Read [docs/ai-memory/IMPLEMENTATION_RULES.md](file:///e:/Projects/New%20folder/docs/ai-memory/IMPLEMENTATION_RULES.md) to review coding constraints.
   * Read [docs/ai-memory/CURRENT_SPRINT.md](file:///e:/Projects/New%20folder/docs/ai-memory/CURRENT_SPRINT.md) to identify the active batch.
   * Read [docs/ai-memory/NEXT_ACTIONS.md](file:///e:/Projects/New%20folder/docs/ai-memory/NEXT_ACTIONS.md) to confirm task sequencing.
2. **Review Specifications**:
   * Open the target module's MDD document (e.g. `Router-MDD.md`).
   * Review the target files, interfaces, and events defined in [docs/MODULE_BLUEPRINT.md](file:///e:/Projects/New%20folder/docs/MODULE_BLUEPRINT.md).
3. **Validate Code Status**:
   * Check [docs/ai-memory/IMPLEMENTATION_PROGRESS.md](file:///e:/Projects/New%20folder/docs/ai-memory/IMPLEMENTATION_PROGRESS.md) to ensure all prerequisite modules are marked **100% Completed**.

---

## 2. The Execution & Review Pipeline

Every batch consists of **at most 5 tasks**. The loop below must be executed in sequence:

```
[1] Planning
  ↓
[2] Implementation (Capped at 5 tasks)
  ↓
[3] Architecture Review
  ↓
[4] Code Review
  ↓
[5] Security Review
  ↓
[6] Performance Review
  ↓
[7] Automated Testing
  ↓
[8] Documentation Updates
  ↓
[9] Living Memory updates
  ↓
[10] Commit and Request Approval
```

### 2.1 Pipeline Phase Responsibilities
1. **Planning**: Analyze the 5 tasks. Verify that all interfaces and DTOs exist or are part of this batch.
2. **Implementation**: Implement code *only* for the current batch. Do not write placeholder methods for future batches.
3. **Architecture Review**: Verify class structures match Clean Architecture (entities inside domain, ports isolating infrastructure).
4. **Code Review**: Audit against SOLID principles, cleanliness, and naming conventions.
5. **Security Review**: Check key management (no hardcoded keys), sanitization inputs, and sandboxing rules.
6. **Performance Review**: Check for memory leaks, unclosed streams, database query optimization, and resource caching.
7. **Automated Testing**: Run unit tests. Ensure test coverage for the new code exceeds **90%**.
8. **Documentation Updates**: Update the module's `*_MDD.md` file if any internal methods, states, or helpers were added.
9. **Living Memory Updates**: Update `docs/ai-memory/` progress, sprits, and changelogs.
10. **Commit**: Save changes in Git with a descriptive, task-oriented commit message.

---

## 3. Architecture Authority & ACR Rules

> [!CAUTION]
> **OpenCode is NOT permitted to make architectural decisions.**
> You are an implementer. You cannot add undocumented features, change responsibilities, rename interfaces, modify database schemas, or add new APIs.

If you identify a gap or believe an architectural change is necessary:
1. **STOP** implementation immediately.
2. Draft an **Architecture Change Request** using the template in [docs/ARCHITECTURE_CHANGE_REQUEST.md](file:///e:/Projects/New%20folder/docs/ARCHITECTURE_CHANGE_REQUEST.md).
3. Present the ACR to the user (Chief Architect) for approval.
4. **DO NOT** write code for the change until the ACR is approved and the master documents (PRD, SDD, DDD, ASD, or MDD) have been updated.
5. Once approved, update [docs/ai-memory/DECISION_LOG.md](file:///e:/Projects/New%20folder/docs/ai-memory/DECISION_LOG.md) and resume implementation.
