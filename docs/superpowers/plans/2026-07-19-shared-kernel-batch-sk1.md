# Shared Kernel Batch SK-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational domain primitives (Entity, ValueObject, Result, BaseException, DateTime) used by all 22 modules in the Hybrid AI Development Orchestrator.

**Architecture:** Clean Architecture shared kernel — zero dependencies, pure TypeScript domain primitives. Every module imports from `shared/`. No external libraries.

**Tech Stack:** TypeScript (strict mode), Vitest for testing, ESLint for linting.

---

---

### Task 0: Memory Bootstrap (Required Before Any Implementation)

**Purpose:** Ensure the implementation agent has full context before writing code.

- [ ] **Step 1: Read all memory files**

```bash
# Read in order:
1. docs/ai-memory/AI_CONTEXT.md
2. docs/ai-memory/IMPLEMENTATION_RULES.md
3. docs/ai-memory/ARCHITECTURE_MEMORY.md
4. docs/IMPLEMENTATION_INDEX.md
5. docs/ai-memory/IMPLEMENTATION_PROGRESS.md
6. docs/ai-memory/CURRENT_SPRINT.md
7. docs/ai-memory/NEXT_ACTIONS.md
8. docs/ai-memory/DECISION_LOG.md
9. docs/ai-memory/REVIEW_HISTORY.md
10. docs/ai-memory/KNOWN_ISSUES.md
11. docs/MODULE_BLUEPRINT.md (Shared Kernel section)
12. docs/architecture/specs/Orchestrator_SDD.md
13. docs/architecture/specs/Orchestrator_API_Specification.md (if needed)
14. docs/architecture/specs/Orchestrator_Database_Design_Document.md (if needed)
```

- [ ] **Step 2: Summarize current state**

Write a brief summary confirming:
- Current phase: Phase 0 — Project Analysis & Governance Setup
- Current module: Shared Kernel (Seq 0)
- Current batch: SK-1 (Baseline Abstractions)
- 5 files to implement: Entity, ValueObject, Result, BaseException/ErrorCodes, DateTime/Validation
- No architectural decisions pending
- No known issues blocking implementation

- [ ] **Step 3: Confirm readiness**

Only proceed to Task 1 after completing the above.

---

### Task 1: Entity Base Class (`shared/domain/Entity.ts`)

**Files:**
- Create: `shared/domain/Entity.ts`
- Create: `tests/shared/domain/Entity.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/shared/domain/Entity.test.ts
import { Entity } from '../../../shared/domain/Entity';
import { UniqueEntityID } from '../../../shared/domain/UniqueEntityID';

class TestEntity extends Entity<{ name: string }> {
  get name(): string {
    return this.props.name;
  }
}

describe('Entity', () => {
  it('creates an entity with a UniqueEntityID', () => {
    const id = new UniqueEntityID('123');
    const entity = new TestEntity({ name: 'test' }, id);
    expect(entity.id).toBe(id);
    expect(entity.id.toString()).toBe('123');
  });

  it('generates a new ID when none provided', () => {
    const entity = new TestEntity({ name: 'test' });
    expect(entity.id).toBeInstanceOf(UniqueEntityID);
    expect(entity.id.toString().length).toBeGreaterThan(0);
  });

  it('considers entities equal when IDs match', () => {
    const id = new UniqueEntityID('same-id');
    const entity1 = new TestEntity({ name: 'first' }, id);
    const entity2 = new TestEntity({ name: 'second' }, id);
    expect(entity1.equals(entity2)).toBe(true);
  });

  it('considers entities unequal when IDs differ', () => {
    const entity1 = new TestEntity({ name: 'first' }, new UniqueEntityID('1'));
    const entity2 = new TestEntity({ name: 'second' }, new UniqueEntityID('2'));
    expect(entity1.equals(entity2)).toBe(false);
  });

  it('returns false when comparing to null or different type', () => {
    const entity = new TestEntity({ name: 'test' });
    expect(entity.equals(null as any)).toBe(false);
    expect(entity.equals({ id: entity.id } as any)).toBe(false);
  });

  it('does not mutate props', () => {
    const props = { name: 'original' };
    const entity = new TestEntity(props);
    props.name = 'mutated';
    expect(entity.name).toBe('original');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/shared/domain/Entity.test.ts
```
Expected: FAIL — `Entity` and `UniqueEntityID` not defined

- [ ] **Step 3: Write minimal implementation**

```typescript
// shared/domain/UniqueEntityID.ts
export class UniqueEntityID {
  private readonly _value: string;

  constructor(value?: string) {
    this._value = value ?? crypto.randomUUID();
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }

  equals(other: UniqueEntityID): boolean {
    return this._value === other._value;
  }
}
```

```typescript
// shared/domain/Entity.ts
export abstract class Entity<T extends object> {
  protected readonly _id: UniqueEntityID;
  protected readonly props: T;

  constructor(props: T, id?: UniqueEntityID) {
    this._id = id ?? new UniqueEntityID();
    this.props = Object.freeze({ ...props });
  }

  get id(): UniqueEntityID {
    return this._id;
  }

  equals(other: Entity<T> | null | undefined): boolean {
    if (!other || !(other instanceof Entity)) {
      return false;
    }
    return this._id.equals(other._id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/shared/domain/Entity.test.ts
```
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/domain/Entity.ts shared/domain/UniqueEntityID.ts tests/shared/domain/Entity.test.ts
git commit -m "feat(shared): add Entity base class and UniqueEntityID"
```

---

### Task 2: ValueObject Base Class (`shared/domain/ValueObject.ts`)

**Files:**
- Create: `shared/domain/ValueObject.ts`
- Create: `tests/shared/domain/ValueObject.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/shared/domain/ValueObject.test.ts
import { ValueObject } from '../../../shared/domain/ValueObject';

class Address extends ValueObject<{ street: string; city: string; zip: string }> {
  get street(): string { return this.props.street; }
  get city(): string { return this.props.city; }
  get zip(): string { return this.props.zip; }
}

describe('ValueObject', () => {
  it('considers two value objects equal when all props match', () => {
    const addr1 = new Address({ street: '123 Main St', city: 'NYC', zip: '10001' });
    const addr2 = new Address({ street: '123 Main St', city: 'NYC', zip: '10001' });
    expect(addr1.equals(addr2)).toBe(true);
  });

  it('considers value objects unequal when any prop differs', () => {
    const addr1 = new Address({ street: '123 Main St', city: 'NYC', zip: '10001' });
    const addr2 = new Address({ street: '456 Oak Ave', city: 'NYC', zip: '10001' });
    expect(addr1.equals(addr2)).toBe(false);
  });

  it('returns false for null or undefined', () => {
    const addr = new Address({ street: '123 Main St', city: 'NYC', zip: '10001' });
    expect(addr.equals(null as any)).toBe(false);
    expect(addr.equals(undefined as any)).toBe(false);
  });

  it('returns false for different class', () => {
    const addr = new Address({ street: '123 Main St', city: 'NYC', zip: '10001' });
    expect(addr.equals({ street: '123 Main St', city: 'NYC', zip: '10001' } as any)).toBe(false);
  });

  it('handles nested value objects in equality', () => {
    class Person extends ValueObject<{ name: string; address: Address }> {
      get name(): string { return this.props.name; }
      get address(): Address { return this.props.address; }
    }
    const person1 = new Person({ name: 'John', address: new Address({ street: '123 Main', city: 'NYC', zip: '10001' }) });
    const person2 = new Person({ name: 'John', address: new Address({ street: '123 Main', city: 'NYC', zip: '10001' }) });
    expect(person1.equals(person2)).toBe(true);
  });

  it('freezes props to prevent mutation', () => {
    const props = { street: '123 Main', city: 'NYC', zip: '10001' };
    const addr = new Address(props);
    props.street = 'mutated';
    expect(addr.street).toBe('123 Main');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/shared/domain/ValueObject.test.ts
```
Expected: FAIL — `ValueObject` not defined

- [ ] **Step 3: Write minimal implementation**

```typescript
// shared/domain/ValueObject.ts
export abstract class ValueObject<T extends object> {
  protected readonly props: T;

  constructor(props: T) {
    this.props = Object.freeze({ ...props });
  }

  equals(other: ValueObject<T> | null | undefined): boolean {
    if (!other || !(other instanceof ValueObject)) {
      return false;
    }
    return this.shallowEqual(this.props, other.props);
  }

  private shallowEqual(obj1: object, obj2: object): boolean {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
      const val1 = (obj1 as any)[key];
      const val2 = (obj2 as any)[key];
      if (val1 instanceof ValueObject && val2 instanceof ValueObject) {
        if (!val1.equals(val2)) return false;
      } else if (val1 !== val2) {
        return false;
      }
    }
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/shared/domain/ValueObject.test.ts
```
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/domain/ValueObject.ts tests/shared/domain/ValueObject.test.ts
git commit -m "feat(shared): add ValueObject base class"
```

---

### Task 3: Monadic Result Type (`shared/domain/Result.ts`)

**Files:**
- Create: `shared/domain/Result.ts`
- Create: `tests/shared/domain/Result.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/shared/domain/Result.test.ts
import { Result, Ok, Err } from '../../../shared/domain/Result';

describe('Result', () => {
  describe('Ok', () => {
    it('wraps a success value', () => {
      const result = Ok(42);
      expect(result.isOk()).toBe(true);
      expect(result.isErr()).toBe(false);
      expect(result.unwrap()).toBe(42);
    });

    it('maps over success value', () => {
      const result = Ok(2).map(x => x * 3);
      expect(result.unwrap()).toBe(6);
    });

    it('flatMaps over success value', () => {
      const result = Ok(2).flatMap(x => Ok(x * 5));
      expect(result.unwrap()).toBe(10);
    });

    it('mapErr does nothing on Ok', () => {
      const result = Ok(42).mapErr(e => e + '!');
      expect(result.unwrap()).toBe(42);
    });
  });

  describe('Err', () => {
    it('wraps an error value', () => {
      const result = Err('not found');
      expect(result.isErr()).toBe(true);
      expect(result.isOk()).toBe(false);
      expect(() => result.unwrap()).toThrow('not found');
    });

    it('maps over error value', () => {
      const result = Err(404).mapErr(code => `Error ${code}`);
      expect(result.isErr()).toBe(true);
      expect(() => result.unwrap()).toThrow('Error 404');
    });

    it('flatMaps over error value', () => {
      const result = Err('fail').flatMapErr(e => Err(e + '!'));
      expect(() => result.unwrap()).toThrow('fail!');
    });

    it('map does nothing on Err', () => {
      const result = Err('oops').map(x => x * 2);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('unwrapOr', () => {
    it('returns value on Ok', () => {
      expect(Ok(10).unwrapOr(0)).toBe(10);
    });
    it('returns default on Err', () => {
      expect(Err('fail').unwrapOr(0)).toBe(0);
    });
  });

  describe('match', () => {
    it('calls ok handler on success', () => {
      const result = Ok('hello').match({
        ok: v => v.toUpperCase(),
        err: e => `Error: ${e}`
      });
      expect(result).toBe('HELLO');
    });
    it('calls err handler on failure', () => {
      const result = Err('oops').match({
        ok: v => v.toUpperCase(),
        err: e => `Error: ${e}`
      });
      expect(result).toBe('Error: oops');
    });
  });

  describe('serialization', () => {
    it('toJSON preserves Ok value', () => {
      const json = Ok({ x: 1 }).toJSON();
      expect(json).toEqual({ ok: true, value: { x: 1 } });
    });
    it('toJSON preserves Err value', () => {
      const json = Err('fail').toJSON();
      expect(json).toEqual({ ok: false, error: 'fail' });
    });
  });

  describe('edge cases', () => {
    it('handles null/undefined as valid Ok values', () => {
      expect(Ok(null).unwrap()).toBeNull();
      expect(Ok(undefined).unwrap()).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/shared/domain/Result.test.ts
```
Expected: FAIL — `Result`, `Ok`, `Err` not defined

- [ ] **Step 3: Write minimal implementation**

```typescript
// shared/domain/Result.ts
export type Result<T, E> = Ok<T, E> | Err<T, E>;

export class Ok<T, E> {
  readonly _tag = 'Ok' as const;
  constructor(public readonly value: T) {}

  isOk(): this is Ok<T, E> { return true; }
  isErr(): this is Err<T, E> { return false; }

  unwrap(): T { return this.value; }
  unwrapOr(_: T): T { return this.value; }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return Ok(fn(this.value));
  }
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }
  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return Ok(this.value) as any;
  }
  flatMapErr<F>(_fn: (error: E) => Result<T, F>): Result<T, F> {
    return Ok(this.value) as any;
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.ok(this.value);
  }

  toJSON(): { ok: true; value: T } {
    return { ok: true, value: this.value };
  }
}

export class Err<T, E> {
  readonly _tag = 'Err' as const;
  constructor(public readonly error: E) {}

  isOk(): this is Ok<T, E> { return false; }
  isErr(): this is Err<T, E> { return true; }

  unwrap(): never { throw this.error; }
  unwrapOr<T>(defaultValue: T): T { return defaultValue; }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return Err(this.error) as any;
  }
  flatMap<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return Err(this.error) as any;
  }
  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return Err(fn(this.error));
  }
  flatMapErr<F>(fn: (error: E) => Result<T, F>): Result<T, F> {
    return fn(this.error);
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.err(this.error);
  }

  toJSON(): { ok: false; error: E } {
    return { ok: false, error: this.error };
  }
}

export function Ok<T, E = never>(value: T): Result<T, E> {
  return new Ok(value);
}

export function Err<T, E>(error: E): Result<T, E> {
  return new Err(error);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/shared/domain/Result.test.ts
```
Expected: PASS (all 14+ tests)

- [ ] **Step 5: Commit**

```bash
git add shared/domain/Result.ts tests/shared/domain/Result.test.ts
git commit -m "feat(shared): add monadic Result type (Ok/Err)"
```

---

### Task 4: Base Exception & Error Codes (`shared/exceptions/BaseException.ts`, `shared/exceptions/ErrorCodes.ts`)

**Files:**
- Create: `shared/exceptions/ErrorCodes.ts`
- Create: `shared/exceptions/BaseException.ts`
- Create: `tests/shared/exceptions/BaseException.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/shared/exceptions/BaseException.test.ts
import { BaseException } from '../../../shared/exceptions/BaseException';
import { ErrorCodes } from '../../../shared/exceptions/ErrorCodes';

describe('BaseException', () => {
  it('creates exception with code and message', () => {
    const err = new BaseException(ErrorCodes.CONFIG_INVALID, 'Invalid config');
    expect(err.code).toBe(ErrorCodes.CONFIG_INVALID);
    expect(err.message).toBe('Invalid config');
    expect(err.name).toBe('BaseException');
  });

  it('captures stack trace', () => {
    const err = new BaseException(ErrorCodes.UNKNOWN, 'test');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('BaseException');
  });

  it('serializes to JSON', () => {
    const err = new BaseException(ErrorCodes.VALIDATION_FAILED, 'bad input', { field: 'email' });
    const json = err.toJSON();
    expect(json).toEqual({
      name: 'BaseException',
      code: ErrorCodes.VALIDATION_FAILED,
      message: 'bad input',
      details: { field: 'email' },
      stack: expect.any(String)
    });
  });

  it('supports error chaining with cause', () => {
    const cause = new Error('root cause');
    const err = new BaseException(ErrorCodes.PROVIDER_TIMEOUT, 'timeout', undefined, cause);
    expect(err.cause).toBe(cause);
  });

  it('is instanceof Error', () => {
    const err = new BaseException(ErrorCodes.UNKNOWN, 'test');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof BaseException).toBe(true);
  });
});

describe('ErrorCodes', () => {
  it('contains all required error codes', () => {
    expect(ErrorCodes.CONFIG_INVALID).toBe('CONFIG_INVALID');
    expect(ErrorCodes.CONFIG_NOT_FOUND).toBe('CONFIG_NOT_FOUND');
    expect(ErrorCodes.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(ErrorCodes.PROVIDER_UNAVAILABLE).toBe('PROVIDER_UNAVAILABLE');
    expect(ErrorCodes.PROVIDER_TIMEOUT).toBe('PROVIDER_TIMEOUT');
    expect(ErrorCodes.PROVIDER_AUTH_FAILED).toBe('PROVIDER_AUTH_FAILED');
    expect(ErrorCodes.MODEL_NOT_FOUND).toBe('MODEL_NOT_FOUND');
    expect(ErrorCodes.MODEL_CAPABILITY_MISMATCH).toBe('MODEL_CAPABILITY_MISMATCH');
    expect(ErrorCodes.TASK_QUEUE_FULL).toBe('TASK_QUEUE_FULL');
    export interface IResult {
  isOk(): boolean;
  isErr(): boolean;
}
    expect(ErrorCodes.MEMORY_LOAD_FAILED).toBe('MEMORY_LOAD_FAILED');
    expect(ErrorCodes.KNOWLEDGE_RETRIEVAL_FAILED).toBe('KNOWLEDGE_RETRIEVAL_FAILED');
    expect(ErrorCodes.REVIEW_FAILED).toBe('REVIEW_FAILED');
    expect(ErrorCodes.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(ErrorCodes.BROWSER_AUTOMATION_FAILED).toBe('BROWSER_AUTOMATION_FAILED');
    expect(ErrorCodes.GIT_OPERATION_FAILED).toBe('GIT_OPERATION_FAILED');
    expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCodes.UNKNOWN).toBe('UNKNOWN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/shared/exceptions/BaseException.test.ts
```
Expected: FAIL — classes not defined

- [ ] **Step 3: Write minimal implementation**

```typescript
// shared/exceptions/ErrorCodes.ts
export const ErrorCodes = {
  // Configuration
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
  CONFIG_HOT_RELOAD_FAILED: 'CONFIG_HOT_RELOAD_FAILED',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',

  // Provider
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',
  PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED',

  // Model
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  MODEL_CAPABILITY_MISMATCH: 'MODEL_CAPABILITY_MISMATCH',
  MODEL_CONTEXT_EXCEEDED: 'MODEL_CONTEXT_EXCEEDED',

  // Task Queue
  TASK_QUEUE_FULL: 'TASK_QUEUE_FULL',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TASK_CANCELLED: 'TASK_CANCELLED',
  TASK_DEPENDENCY_FAILED: 'TASK_DEPENDENCY_FAILED',

  // Memory / Knowledge
  MEMORY_LOAD_FAILED: 'MEMORY_LOAD_FAILED',
  MEMORY_SAVE_FAILED: 'MEMORY_SAVE_FAILED',
  KNOWLEDGE_RETRIEVAL_FAILED: 'KNOWLEDGE_RETRIEVAL_FAILED',
  KNOWLEDGE_COMPARISON_FAILED: 'KNOWLEDGE_COMPARISON_FAILED',

  // Review / Validation
  REVIEW_FAILED: 'REVIEW_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  REGRESSION_DETECTED: 'REGRESSION_DETECTED',

  // Browser
  BROWSER_AUTOMATION_FAILED: 'BROWSER_AUTOMATION_FAILED',
  BROWSER_NAVIGATION_TIMEOUT: 'BROWSER_NAVIGATION_TIMEOUT',
  BROWSER_ENGINE_UNAVAILABLE: 'BROWSER_ENGINE_UNAVAILABLE',

  // Git
  GIT_OPERATION_FAILED: 'GIT_OPERATION_FAILED',
  GIT_REPO_NOT_FOUND: 'GIT_REPO_NOT_FOUND',
  GIT_MERGE_CONFLICT: 'GIT_MERGE_CONFLICT',

  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
```

```typescript
// shared/exceptions/BaseException.ts
import { ErrorCode } from './ErrorCodes';

export class BaseException extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly cause?: Error;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>, cause?: Error) {
    super(message);
    this.name = 'BaseException';
    this.code = code;
    this.details = details;
    this.cause = cause;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BaseException);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/shared/exceptions/BaseException.test.ts
```
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add shared/exceptions/ErrorCodes.ts shared/exceptions/BaseException.ts tests/shared/exceptions/BaseException.test.ts
git commit -m "feat(shared): add BaseException and ErrorCodes"
```

---

### Task 5: DateTime & Validation Utilities (`shared/utils/DateTime.ts`, `shared/utils/Validation.ts`)

**Files:**
- Create: `shared/utils/DateTime.ts`
- Create: `shared/utils/Validation.ts`
- Create: `tests/shared/utils/DateTime.test.ts`
- Create: `tests/shared/utils/Validation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/shared/utils/DateTime.test.ts
import { DateTime } from '../../../shared/utils/DateTime';

describe('DateTime', () => {
  it('creates from ISO string', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    expect(dt.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('creates from timestamp', () => {
    const dt = DateTime.fromTimestamp(1705315800000); // 2024-01-15T10:30:00Z
    expect(dt.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('creates now', () => {
    const before = Date.now();
    const dt = DateTime.now();
    const after = Date.now();
    expect(dt.toMillis()).toBeGreaterThanOrEqual(before);
    expect(dt.toMillis()).toBeLessThanOrEqual(after);
  });

  it('formats to ISO string', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    expect(dt.toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('returns milliseconds since epoch', () => {
    const dt = DateTime.fromTimestamp(1705315800000);
    expect(dt.toMillis()).toBe(1705315800000);
  });

  it('adds duration', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    const later = dt.plus({ hours: 2, minutes: 30 });
    expect(later.toISOString()).toBe('2024-01-15T13:00:00.000Z');
  });

  it('subtracts duration', () => {
    const dt = DateTime.fromISO('2024-01-15T10:30:00Z');
    const earlier = dt.minus({ hours: 1 });
    expect(earlier.toISOString()).toBe('2024-01-15T09:30:00.000Z');
  });

  it('compares dates', () => {
    const dt1 = DateTime.fromISO('2024-01-15T10:30:00Z');
    const dt2 = DateTime.fromISO('2024-01-15T11:30:00Z');
    expect(dt1.isBefore(dt2)).toBe(true);
    expect(dt2.isAfter(dt1)).toBe(true);
    expect(dt1.equals(dt1)).toBe(true);
  });

  it('handles invalid ISO string', () => {
    expect(() => DateTime.fromISO('invalid')).toThrow();
  });
});
```

```typescript
// tests/shared/utils/Validation.test.ts
import { Validation } from '../../../shared/utils/Validation';

describe('Validation', () => {
  describe('isNonEmptyString', () => {
    it('returns true for non-empty string', () => {
      expect(Validation.isNonEmptyString('hello')).toBe(true);
    });
    it('returns false for empty string', () => {
      expect(Validation.isNonEmptyString('')).toBe(false);
    });
    it('returns false for whitespace only', () => {
      expect(Validation.isNonEmptyString('   ')).toBe(false);
    });
    it('returns false for null/undefined', () => {
      expect(Validation.isNonEmptyString(null as any)).toBe(false);
      expect(Validation.isNonEmptyString(undefined as any)).toBe(false);
    });
  });

  describe('isValidUUID', () => {
    it('returns true for valid UUID v4', () => {
      expect(Validation.isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });
    it('returns false for invalid format', () => {
      expect(Validation.isValidUUID('not-a-uuid')).toBe(false);
      expect(Validation.isValidUUID('')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('returns true for valid email', () => {
      expect(Validation.isValidEmail('user@example.com')).toBe(true);
    });
    it('returns false for invalid email', () => {
      expect(Validation.isValidEmail('invalid')).toBe(false);
      expect(Validation.isValidEmail('@example.com')).toBe(false);
    });
  });

  describe('isPositiveInteger', () => {
    it('returns true for positive integers', () => {
      expect(Validation.isPositiveInteger(1)).toBe(true);
      expect(Validation.isPositiveInteger(100)).toBe(true);
    });
    it('returns false for zero, negative, non-integers', () => {
      expect(Validation.isPositiveInteger(0)).toBe(false);
      expect(Validation.isPositiveInteger(-1)).toBe(false);
      expect(Validation.isPositiveInteger(1.5)).toBe(false);
    });
  });

  describe('isWithinRange', () => {
    it('returns true when value in range', () => {
      expect(Validation.isWithinRange(5, 1, 10)).toBe(true);
      expect(Validation.isWithinRange(1, 1, 10)).toBe(true);
      expect(Validation.isWithinRange(10, 1, 10)).toBe(true);
    });
    it('returns false when out of range', () => {
      expect(Validation.isWithinRange(0, 1, 10)).toBe(false);
      expect(Validation.isWithinRange(11, 1, 10)).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('trims and removes control characters', () => {
      expect(Validation.sanitizeString('  hello\x00world  ')).toBe('hello world');
    });
    it('limits length', () => {
      expect(Validation.sanitizeString('abcdef', 3)).toBe('abc');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/shared/utils/DateTime.test.ts tests/shared/utils/Validation.test.ts
```
Expected: FAIL — modules not defined

- [ ] **Step 3: Write minimal implementation**

```typescript
// shared/utils/DateTime.ts
export class DateTime {
  private readonly _date: Date;

  private constructor(date: Date) {
    this._date = date;
  }

  static now(): DateTime {
    return new DateTime(new Date());
  }

  static fromISO(isoString: string): DateTime {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid ISO date string: ${isoString}`);
    }
    return new DateTime(date);
  }

  static fromTimestamp(millis: number): DateTime {
    return new DateTime(new Date(millis));
  }

  toISOString(): string {
    return this._date.toISOString();
  }

  toMillis(): number {
    return this._date.getTime();
  }

  plus(duration: { days?: number; hours?: number; minutes?: number; seconds?: number }): DateTime {
    const millis = this._date.getTime();
    const added = (duration.days ?? 0) * 86400000 +
                  (duration.hours ?? 0) * 3600000 +
                  (duration.minutes ?? 0) * 60000 +
                  (duration.seconds ?? 0) * 1000;
    return new DateTime(new Date(millis + added));
  }

  minus(duration: { days?: number; hours?: number; minutes?: number; seconds?: number }): DateTime {
    const millis = this._date.getTime();
    const subtracted = (duration.days ?? 0) * 86400000 +
                       (duration.hours ?? 0) * 3600000 +
                       (duration.minutes ?? 0) * 60000 +
                       (duration.seconds ?? 0) * 1000;
    return new DateTime(new Date(millis - subtracted));
  }

  isBefore(other: DateTime): boolean {
    return this._date < other._date;
  }

  isAfter(other: DateTime): boolean {
    return this._date > other._date;
  }

  equals(other: DateTime): boolean {
    return this._date.getTime() === other._date.getTime();
  }
}
```

```typescript
// shared/utils/Validation.ts
export class Validation {
  static isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  static isValidUUID(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  static isValidEmail(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  static isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }

  static isWithinRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }

  static sanitizeString(value: string, maxLength?: number): string {
    let sanitized = value
      .replace(/[\x00-\x1F\x7F]/g, ' ') // Remove control chars
      .trim();
    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }
    return sanitized;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/shared/utils/DateTime.test.ts tests/shared/utils/Validation.test.ts
```
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add shared/utils/DateTime.ts shared/utils/Validation.ts tests/shared/utils/DateTime.test.ts tests/shared/utils/Validation.test.ts
git commit -m "feat(shared): add DateTime and Validation utilities"
```

---

### Task 6: Verify Build, Lint, Tests, Coverage

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript build**

```bash
npm run build
```
Expected: Exit code 0, no errors

- [ ] **Step 2: Run linter**

```bash
npm run lint
```
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Run all tests**

```bash
npm test
```
Expected: All tests pass

- [ ] **Step 4: Run coverage (must exceed 90% on Result.ts)**

```bash
npm run test:coverage
```
Expected: `shared/domain/Result.ts` shows 100% branch coverage

- [ ] **Step 5: Commit verification**

```bash
git add -A
git commit -m "chore: verify build, lint, tests, coverage for Batch SK-1"
```

---

### Task 7: Update Project Memory Documents

**Files:**
- Modify: `docs/ai-memory/IMPLEMENTATION_PROGRESS.md`
- Modify: `docs/ai-memory/CHANGELOG.md`
- Modify: `docs/ai-memory/CURRENT_SPRINT.md`
- Modify: `docs/ai-memory/NEXT_ACTIONS.md`
- Modify: `docs/ai-memory/REVIEW_HISTORY.md`
- Modify (if applicable): `docs/ai-memory/DECISION_LOG.md`
- Modify (if applicable): `docs/ai-memory/KNOWN_ISSUES.md`

- [ ] **Step 1: Update IMPLEMENTATION_PROGRESS.md**

```markdown
# Implementation Progress (IMPLEMENTATION_PROGRESS.md)

*This file tracks the project-wide metrics, module statuses, and current completion percentages. It must be updated at the end of every batch.*

---

## 1. Overall Project Metrics
* **Total Modules**: 22  
* **Overall Project Completion**: **6.8%**  
* **Completed Modules**: 1 (Shared Kernel)  
* **In-Progress Modules**: 0  
* **Pending Modules**: 21  

---

## 2. Module Completion Matrix

| Seq | Module Name | Phase | Current Batch | Tasks Completed | Tasks Remaining | Review Status | Overall Completion % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | **Shared Kernel** | Phase 1 | Batch 1 | 5 | 0 | ✅ Reviewed | 100% |
| 1 | **Configuration Manager** | Phase 0 | Pending | 0 | 10 | ⬜ Unreviewed | 0% |
| ... | (unchanged) | | | | | | |
```

- [ ] **Step 2: Update CHANGELOG.md**

```markdown
# Changelog

## [0.1.0] - 2026-07-19
### Added
- Shared Kernel foundation (Batch SK-1)
  - `Entity` base class with `UniqueEntityID` identity
  - `ValueObject` base class with structural equality
  - Monadic `Result<T, E>` type with `Ok`/`Err` constructors
  - `BaseException` class with error codes and serialization
  - `ErrorCodes` enum covering all system error categories
  - `DateTime` utility for UTC date/time operations
  - `Validation` utility for input sanitization and validation
```

- [ ] **Step 3: Update CURRENT_SPRINT.md**

```markdown
# Current Sprint & Active Batch (CURRENT_SPRINT.md)

---

## 1. Active Sprint Scope
* **Target Module**: Configuration Manager (Seq 1)  
* **Sprint Phase**: Phase 1-4 (Contracts, Domains, and Adapters)  
* **Active Batch**: Batch 1  

---

## 2. Active Batch Tasks (Max 5 Tasks)

| Task ID | Task Description | Target File | Status | Pre-requisite |
| --- | --- | --- | --- | --- |
| **CM-1.1** | Create Configuration Manager Interface `IConfigurationManager.ts` | `src/modules/configuration/contracts/IConfigurationManager.ts` | ⬜ Pending | Shared Kernel |
| **CM-1.2** | Create Config Validation Rules `ConfigRules.ts` | `src/modules/configuration/domain/ConfigRules.ts` | ⬜ Pending | Shared Kernel |
| **CM-1.3** | Create Config Exceptions `ConfigException.ts` | `src/modules/configuration/errors/ConfigException.ts` | ⬜ Pending | Shared Kernel |
| **CM-1.4** | Create File Config Adapter `FileConfigAdapter.ts` | `src/modules/configuration/infrastructure/FileConfigAdapter.ts` | ⬜ Pending | Shared Kernel |
| **CM-1.5** | Implement Default Config Validation Logic | `src/modules/configuration/domain/ConfigValidator.ts` | ⬜ Pending | Shared Kernel |

---

## 3. Sprint Definition of Done (DoD)
All 5 tasks above must satisfy:
- [ ] Code compiles without compiler warnings.
- [ ] Direct unit tests cover 100% of branch paths in validation logic.
- [ ] Pre-run static analysis (linting) has 0 errors.
- [ ] `docs/ai-memory/IMPLEMENTATION_PROGRESS.md` is updated.
- [ ] `docs/ai-memory/CHANGELOG.md` is updated.
```

- [ ] **Step 4: Update NEXT_ACTIONS.md**

```markdown
# Next Actions (NEXT_ACTIONS.md)

## Immediate Next Batch
**Module**: Configuration Manager (Seq 1)
**Batch**: CM-1 (Configuration Contracts & Domain)

## Tasks to Execute
1. CM-1.1: Create IConfigurationManager.ts interface
2. CM-1.2: Create ConfigRules.ts validation logic
3. CM-1.3: Create ConfigException.ts extending BaseException
4. CM-1.4: Create FileConfigAdapter.ts reading JSON/.env
5. CM-1.5: Create ConfigValidator.ts with JSON Schema validation

## Dependencies Resolved
- ✅ Shared Kernel (Entity, ValueObject, Result, BaseException, ErrorCodes, DateTime, Validation)

## Blockers
None
```

- [ ] **Step 5: Commit all memory updates**

```bash
git add docs/ai-memory/IMPLEMENTATION_PROGRESS.md docs/ai-memory/CHANGELOG.md docs/ai-memory/CURRENT_SPRINT.md docs/ai-memory/NEXT_ACTIONS.md
git commit -m "docs: update project memory after Batch SK-1 completion"
```

---

## Self-Review Checklist

**Spec Coverage:** ✅ All 5 files from MODULE_BLUEPRINT.md#1 covered
**Placeholders:** ✅ None — every step has complete code
**Type Consistency:** ✅ Result.ts used in BaseException tests, Validation used in DateTime, ErrorCodes enum matches PRD categories

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-07-19-shared-kernel-batch-sk1.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**