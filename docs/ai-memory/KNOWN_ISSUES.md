# Known Issues & Technical Debt (KNOWN_ISSUES.md)

*This file log tracks outstanding bugs, deferred refactors, code debt, and blockers identified during review cycles.*

---

## 1. Blocker List
*Active issues that prevent the continuation of the implementation queue.*

| Issue ID | Module Name | Severity | Description | Opened Date | Status |
| --- | --- | --- | --- | --- | --- |
| *None* | | | | | |

---

## 2. Technical Debt Registry
*Non-blocking architectural debt or optimizations deferred to post-v1 stages.*

| Debt ID | Module Name | Impact | Description | Deferred Date | Status |
| --- | --- | --- | --- | --- | --- |
| **DEBT-001**| Event Bus | Low | InMemory Bus lacks thread safety wrappers. Not required for initial single-client VS Code releases. | 2026-07-18 | ⬜ Documented |
| **DEBT-002**| SQLite Adapter| Medium | Direct raw SQL queries used. Consider implementing a lightweight ORM if query complexity increases. | 2026-07-18 | ⬜ Documented |

---

## 3. Active Bugs Register
*Functional defects found in implemented modules.*

| Bug ID | Module Name | Description / Steps to Reproduce | Opened Date | Status | Target Fix Batch |
| --- | --- | --- | --- | --- | --- |
| *None* | | | | | |
