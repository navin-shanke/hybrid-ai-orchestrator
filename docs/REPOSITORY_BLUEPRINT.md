# Repository Blueprint: Hybrid AI Development Orchestrator

This document outlines the complete directory layout for the Hybrid AI Development Orchestrator project repository. This structure must be strictly adhered to during the implementation phase. No files or folders may be created outside this layout without an approved Architecture Change Request (ACR).

---

## 1. Top-Level Directory Structure

```
/
├── configuration/      # Shared configuration files, schemas, and environment templates
├── contracts/          # Shared language-agnostic interface and protocol contracts (Protobuf, JSON Schema)
├── deployment/         # Dockerfiles, docker-compose, Kubernetes manifests, and environment configs
├── docs/               # Architecture design documents, PRDs, and the AI Memory system
│   └── ai-memory/      # Real-time living AI memory context files
├── examples/           # Developer onboarding guides, interface integrations, and boilerplate mock examples
├── plugins/            # Third-party model providers, custom routers, or capability plugins
├── scripts/            # Helper scripts (builds, database seeding, telemetry extraction)
├── shared/             # The Shared Kernel containing common abstractions, exceptions, and utilities
├── src/                # Source code directory containing all 22 system modules
├── tests/              # End-to-end (E2E), integration, and performance benchmarks
└── tools/              # Custom developer tools, CLI utilities, and quality gate scripts
```

---

## 2. Directory Purpose and Owners

### 2.1 `/configuration`
* **Purpose**: Houses configuration definitions, validation schemas, and environment file templates. It ensures that the Orchestrator runs with correct parameters across local developer environments and cloud deployments.
* **Key Contents**:
  * `config.default.json`: Default settings.
  * `config.schema.json`: JSON Schema for validating the runtime configurations.
  * `.env.example`: Template for environment-specific secrets.
* **Module Owner**: Configuration Manager.

### 2.2 `/contracts`
* **Purpose**: Contains central, language-agnostic interface protocols and message specifications. This ensures that any client (VS Code, dashboard) or external module communicates using standardized API models.
* **Key Contents**:
  * `/events`: JSON schemas of all events published to the Event Bus.
  * `/api`: OpenAPI/Swagger definition of the Orchestrator API endpoint.
  * `/schemas`: Data serialization models (Protobuf or JSON Schema).
* **Module Owner**: Request Manager / Software Architect.

### 2.3 `/deployment`
* **Purpose**: Configuration files and deployment scripts for packaging the Orchestrator runtime (local containerization or cloud setups).
* **Key Contents**:
  * `Dockerfile`: Containerizes the Orchestrator service.
  * `docker-compose.yml`: Launches the Orchestrator and database locally.
* **Module Owner**: Technical Program Manager / Infrastructure.

### 2.4 `/docs`
* **Purpose**: Central depository for architectural documents, design specifications, and the AI session tracking files.
* **Key Contents**:
  * Original PRD, SDD, and MDD files.
  * `/docs/ai-memory`: Folder for the AI Memory System (see `docs/ai-memory/AI_CONTEXT.md`).
* **Module Owner**: Documentation Architect.

### 2.5 `/examples`
* **Purpose**: Simple demonstration codes, client connectors (e.g. how Continue or Roo Code calls the completions endpoint), and starter mock files.
* **Key Contents**:
  * `roo-code-settings.json`: Pre-configured profile for VS Code Roo Code extension.
  * `continue-config.json`: Configuration for Continue extension.
* **Module Owner**: Technical Program Manager.

### 2.6 `/plugins`
* **Purpose**: Holds modular integrations for providers and custom capabilities. It allows the system to add new model APIs or custom tool selectors dynamically.
* **Key Contents**:
  * `/providers`: Dynamic model provider adaptors (e.g. custom local servers).
  * `/capabilities`: Extensible tool executors.
* **Module Owner**: Provider Plugin System.

### 2.7 `/scripts`
* **Purpose**: Command-line tools and shell utilities for setup, compilation, validation, and maintenance tasks.
* **Key Contents**:
  * `verify_all.sh` / `verify_all.ps1`: Orchestrates local builds and runs unit tests.
  * `seed_db.sh`: Pre-fills task metadata and providers.
* **Module Owner**: Technical Program Manager.

### 2.8 `/shared` (The Shared Kernel)
* **Purpose**: Core common library that all modules are permitted to import. It contains universal types, generic interface specs, standard exception definitions, and common validation structures.
* **Key Contents**:
  * `/domain`: Base entity classes, value objects, domain events definitions.
  * `/exceptions`: Standard error classes (e.g. `ModuleException`, `ValidationException`).
  * `/utils`: General utilities (cryptography, date-time formatting, string sanitization).
  * `Result.ts` / `Result.py`: Standard functional outcome return objects.
* **Module Owner**: Chief Software Architect / Enterprise Solution Architect.

### 2.9 `/src`
* **Purpose**: Primary codebase folder containing all system modules, layered using Clean Architecture.
* **Structure**:
  ```
  /src
  ├── index.js/ts       # Application entry point (starts server)
  └── modules/          # Business logic modules (Clean Architecture layout)
      ├── configuration/
      ├── logger/
      ├── event-bus/
      ├── request-manager/
      ├── orchestrator-core/
      ├── planner/
      ├── task-queue/
      ├── router/
      ├── capability-selector/
      ├── provider-manager/
      ├── plugin-system/
      ├── model-registry/
      ├── memory-manager/
      ├── knowledge-base/
      ├── review-engine/
      ├── validation-engine/
      ├── browser-automation/
      ├── git-manager/
      ├── learning-layer/
      └── dashboard/
  ```
* **Each module directory must follow this Clean Architecture layout**:
  * `contracts/`: Abstract interfaces and schemas.
  * `domain/`: Business entities and rules.
  * `services/`: Use cases and orchestration logic.
  * `repositories/`: Persistence abstraction.
  * `adapters/`: External client connectors, database client implementation.
  * `events/`: Event definitions and message payloads.
  * `dto/`: Data Transfer Objects for input/output.
  * `errors/`: Module-specific exception definitions.
  * `validators/`: Business rule validation.
  * `tests/`: Module-specific unit and integration tests.
* **Module Owner**: Assigned Module Lead (referenced in `docs/IMPLEMENTATION_INDEX.md`).

### 2.10 `/tests`
* **Purpose**: System-wide end-to-end integration tests, regression verification workflows, and benchmarking suites.
* **Key Contents**:
  * `/e2e`: End-to-end client simulations.
  * `/performance`: Latency and concurrency tests.
* **Module Owner**: Technical Program Manager / QA Lead.

### 2.11 `/tools`
* **Purpose**: Quality gate automation tools, static analysis configurations, and custom CLI tools used during review phases.
* **Key Contents**:
  * `quality_gate.py`: Script to check build, lint, tests, and coverage before commits.
* **Module Owner**: AI Development Workflow Architect.
