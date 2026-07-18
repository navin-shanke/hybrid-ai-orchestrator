export interface IdGenerator {
  generate(): string;
}

export class UuidIdGenerator implements IdGenerator {
  generate(): string {
    return crypto.randomUUID();
  }
}

export class TestIdGenerator implements IdGenerator {
  private counter = 0;
  private prefix: string;

  constructor(prefix = 'test') {
    this.prefix = prefix;
  }

  generate(): string {
    this.counter++;
    return `${this.prefix}-${this.counter}`;
  }

  reset(): void {
    this.counter = 0;
  }
}

let defaultIdGenerator: IdGenerator = new UuidIdGenerator();

export function setDefaultIdGenerator(generator: IdGenerator): void {
  defaultIdGenerator = generator;
}

export function getDefaultIdGenerator(): IdGenerator {
  return defaultIdGenerator;
}