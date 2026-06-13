/**
 * A stable, anonymous per-device id (no PII) sent as `x-client-id` so the admin panel can show a
 * best-effort "active now" count. Persisted in localStorage; regenerated only if storage is cleared.
 */
const KEY = 'sweepstake.client.v1';

export function getClientId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return ''; // storage disabled — active-now just won't count this client
  }
}

/**
 * The admin token, held for the tab session only (entered once on /a/admin). Not a login — just
 * saves re-typing while the panel is open.
 */
const ADMIN_KEY = 'sweepstake.admin.v1';

export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAdminToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(ADMIN_KEY, token);
    else sessionStorage.removeItem(ADMIN_KEY);
  } catch {
    /* non-fatal */
  }
}
