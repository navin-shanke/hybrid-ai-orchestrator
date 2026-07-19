export enum EventStatus {
  CREATED = 'CREATED',
  VALIDATED = 'VALIDATED',
  QUEUED = 'QUEUED',
  DISPATCHED = 'DISPATCHED',
  PROCESSING = 'PROCESSING',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTERED = 'DEAD_LETTERED',
  ARCHIVED = 'ARCHIVED',
  REJECTED = 'REJECTED',
  RETRYING = 'RETRYING',
}

export const VALID_STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  [EventStatus.CREATED]: [EventStatus.VALIDATED, EventStatus.REJECTED],
  [EventStatus.VALIDATED]: [EventStatus.QUEUED, EventStatus.REJECTED],
  [EventStatus.QUEUED]: [EventStatus.DISPATCHED],
  [EventStatus.DISPATCHED]: [EventStatus.PROCESSING],
  [EventStatus.PROCESSING]: [EventStatus.ACKNOWLEDGED, EventStatus.RETRYING, EventStatus.FAILED],
  [EventStatus.RETRYING]: [EventStatus.ACKNOWLEDGED, EventStatus.FAILED],
  [EventStatus.ACKNOWLEDGED]: [EventStatus.COMPLETED],
  [EventStatus.COMPLETED]: [EventStatus.ARCHIVED],
  [EventStatus.FAILED]: [EventStatus.RETRYING, EventStatus.DEAD_LETTERED],
  [EventStatus.DEAD_LETTERED]: [EventStatus.ARCHIVED],
  [EventStatus.REJECTED]: [EventStatus.ARCHIVED],
  [EventStatus.ARCHIVED]: [],
};

export function isValidTransition(from: EventStatus, to: EventStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const TERMINAL_STATUSES: EventStatus[] = [
  EventStatus.COMPLETED,
  EventStatus.FAILED,
  EventStatus.DEAD_LETTERED,
  EventStatus.REJECTED,
  EventStatus.ARCHIVED,
];

export function isTerminalStatus(status: EventStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}