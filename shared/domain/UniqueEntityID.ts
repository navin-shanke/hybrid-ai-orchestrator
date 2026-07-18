import { getDefaultIdGenerator } from './IdGenerator.js';

export class UniqueEntityID {
  private readonly _value: string;

  constructor(value?: string, private readonly idGenerator = getDefaultIdGenerator()) {
    this._value = value ?? idGenerator.generate();
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