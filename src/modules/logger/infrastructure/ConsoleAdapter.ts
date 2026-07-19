import { ILoggerAdapter, LogEntry } from '../contracts/ILoggerAdapter.js';

export class ConsoleAdapter implements ILoggerAdapter {
  private readonly usePrettyPrint: boolean;

  constructor(options: { prettyPrint?: boolean } = {}) {
    this.usePrettyPrint = options.prettyPrint ?? false;
  }

  write(entry: LogEntry): void {
    const output = this.format(entry);
    const stream = Number(entry.level) >= 2 ? process.stderr : process.stdout;
    stream.write(output + '\n');
  }

  private format(entry: LogEntry): string {
    if (this.usePrettyPrint) {
      return JSON.stringify(entry, null, 2);
    }
    return JSON.stringify(entry);
  }
}