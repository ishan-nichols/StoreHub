/**
 * config/integrations.ts — Integration credentials and connection state.
 *
 * PRODUCTION SETUP:
 *   Move API keys and credentials to server-side environment variables.
 *   Never send raw credentials to the frontend in production.
 *   Replace localStorage reads here with a call to your backend:
 *     GET /api/integrations/config → returns masked config (no secrets)
 *     POST /api/integrations/connect → validates credentials server-side
 *
 * SECRETS MANAGER:
 *   const VERIFONE_HOST = process.env.VERIFONE_COMMANDER_HOST;
 *   const VERIFONE_USER = process.env.VERIFONE_COMMANDER_USER;
 *   const VERIFONE_PASS = process.env.VERIFONE_COMMANDER_PASS;
 *   etc. — one env var per credential, per system
 *
 * CURRENT (development/demo):
 *   Credentials are stored in localStorage. This is acceptable for a
 *   single-user local app but MUST be replaced before multi-tenant deployment.
 */

const CREDS_KEY = "storehub_integration_creds";
const STATE_KEY = "storehub_integration_state";

export interface ConnectionState {
  systemId: string;
  connected: boolean;
  lastSynced: string | null;
  syncFrequency: "realtime" | "hourly" | "daily";
  error: string | null;
  hardwareModel?: string;
}

// ─── Credential Storage ─────────────────────────────────────────────────────

export function getCredentials(systemId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    const all: Record<string, Record<string, string>> = raw ? JSON.parse(raw) : {};
    return all[systemId] ?? {};
  } catch {
    return {};
  }
}

export function saveCredentials(systemId: string, creds: Record<string, string>): void {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    const all: Record<string, Record<string, string>> = raw ? JSON.parse(raw) : {};
    all[systemId] = creds;
    localStorage.setItem(CREDS_KEY, JSON.stringify(all));
  } catch {}
}

export function clearCredentials(systemId: string): void {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    const all: Record<string, Record<string, string>> = raw ? JSON.parse(raw) : {};
    delete all[systemId];
    localStorage.setItem(CREDS_KEY, JSON.stringify(all));
  } catch {}
}

// ─── Connection State ────────────────────────────────────────────────────────

export function getAllConnectionStates(): ConnectionState[] {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getConnectionState(systemId: string): ConnectionState | null {
  return getAllConnectionStates().find((s) => s.systemId === systemId) ?? null;
}

export function saveConnectionState(state: ConnectionState): void {
  try {
    const all = getAllConnectionStates().filter((s) => s.systemId !== state.systemId);
    localStorage.setItem(STATE_KEY, JSON.stringify([...all, state]));
  } catch {}
}

export function clearConnectionState(systemId: string): void {
  try {
    const all = getAllConnectionStates().filter((s) => s.systemId !== systemId);
    localStorage.setItem(STATE_KEY, JSON.stringify(all));
  } catch {}
}
