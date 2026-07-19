export enum Priority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export function comparePriority(a: Priority, b: Priority): number {
  return Number(b) - Number(a);
}

export function isValidPriority(value: number): value is Priority {
  return value >= Number(Priority.LOW) && value <= Number(Priority.CRITICAL);
}