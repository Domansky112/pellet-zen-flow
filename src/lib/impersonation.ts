// Tryb podglądu („zaloguj jako"): zapamiętujemy sesję administratora w przeglądarce,
// żeby po wejściu na konto pracownika można było wrócić jednym kliknięciem.

const KEY = "impersonation_admin_session";

export type ImpersonationState = {
  admin_email: string;
  admin_refresh_token: string;
  admin_access_token: string;
  target_email: string;
};

export function saveImpersonation(state: ImpersonationState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* brak dostępu do localStorage — pomijamy */
  }
}

export function getImpersonation(): ImpersonationState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ImpersonationState;
    if (!p?.admin_refresh_token || !p?.admin_access_token) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearImpersonation() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
