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