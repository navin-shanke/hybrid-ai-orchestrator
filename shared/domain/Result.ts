export type Result<T, E> = OkImpl<T, E> | ErrImpl<T, E>;

export class OkImpl<T, E> {
  readonly _tag = 'Ok' as const;
  constructor(public readonly value: T) {}

  isOk(): this is OkImpl<T, E> { return true; }
  isErr(): this is ErrImpl<T, E> { return false; }

  unwrap(): T { return this.value; }
  unwrapOr(_: T): T { return this.value; }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return ok(fn(this.value));
  }
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }
  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return ok(this.value) as unknown as Result<T, F>;
  }
  flatMapErr<F>(_fn: (error: E) => Result<T, F>): Result<T, F> {
    return ok(this.value) as unknown as Result<T, F>;
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: E) => U }): U {
    return handlers.ok(this.value);
  }

  toJSON(): { ok: true; value: T } {
    return { ok: true, value: this.value };
  }
}

export class ErrImpl<T, E> {
  readonly _tag = 'Err' as const;
  constructor(public readonly error: E) {}

  isOk(): this is OkImpl<T, E> { return false; }
  isErr(): this is ErrImpl<T, E> { return true; }

  unwrap(): never { throw this.error; }
  unwrapOr<T>(defaultValue: T): T { return defaultValue; }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return err(this.error) as unknown as Result<U, E>;
  }
  flatMap<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return err(this.error) as unknown as Result<U, E>;
  }
  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return err(fn(this.error));
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

export function ok<T, E = never>(value: T): Result<T, E> {
  return new OkImpl(value);
}

export function err<T, E>(error: E): Result<T, E> {
  return new ErrImpl(error);
}