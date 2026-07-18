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