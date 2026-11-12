// Acceso a localStorage siempre envuelto en try/catch:
// puede no existir, estar bloqueado (modo privado) o tirar QuotaExceededError.

const PREFIX = "calc3d:";

export const KEYS = {
  profiles: `${PREFIX}profiles`,
  activeProfile: `${PREFIX}activeProfile`,
  piece: `${PREFIX}piece`,
  products: `${PREFIX}products`,
  business: `${PREFIX}business`,
  quoteSeq: `${PREFIX}quoteSeq`,
} as const;

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readString(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
