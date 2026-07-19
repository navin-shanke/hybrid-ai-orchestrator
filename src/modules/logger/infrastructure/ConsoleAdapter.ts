import { ILoggerAdapter, LogEntry } from '../contracts/ILoggerAdapter.js';

export class ConsoleAdapter implements ILoggerAdapter {
  private readonly usePrettyPrint: boolean;
  private seen: WeakSet<object> = new WeakSet();

  constructor(options: { prettyPrint?: boolean } = {}) {
    this.usePrettyPrint = options.prettyPrint ?? false;
  }

  write(entry: LogEntry): void {
    this.seen = new WeakSet();
    const output = this.format(entry);
    const stream = Number(entry.level) >= 2 ? process.stderr : process.stdout;
    (stream.write as (data: string) => boolean)(output + '\n');
  }

  private format(entry: LogEntry): string {
    const replacer = (key: string, value: unknown): unknown => {
      if (typeof value === 'object' && value !== null) {
        if (this.seen.has(value)) {
          return '[Circular]';
        }
        this.seen.add(value);
      }
      return value;
    };

    if (this.usePrettyPrint) {
      return JSON.stringify(entry, replacer, 2);
    }
    return JSON.stringify(entry, replacer);
  }
}