const ACTOR_KEY = 'actorId';
const APPROVER_KEY = 'approverId';

export const ACTOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

export function isValidActorIdFormat(value: string): boolean {
  return ACTOR_ID_PATTERN.test(value);
}

export function getActorId(): string {
  try {
    return localStorage.getItem(ACTOR_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setActorId(value: string): void {
  localStorage.setItem(ACTOR_KEY, value);
}

export function getApproverId(): string {
  try {
    return localStorage.getItem(APPROVER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setApproverId(value: string): void {
  localStorage.setItem(APPROVER_KEY, value);
}
