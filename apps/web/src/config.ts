/** When VITE_API_URL is set (compose), the app talks to the real backend. Otherwise
 *  it runs the self-contained mock flow (`npm run dev` with no env). */
function runtimeApiUrl(): string {
  const configured = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '');
  if (!configured) return '';
  if (typeof window === 'undefined') return configured;

  try {
    const configuredUrl = new URL(configured, window.location.origin);
    const currentUrl = new URL(window.location.origin);
    const stripWww = (host: string) => host.replace(/^www\./, '');

    // In production we may serve the app from `www.` while env points at apex.
    // Prefer same-origin requests when the only difference is `www` to avoid CORS.
    if (
      stripWww(configuredUrl.hostname) === stripWww(currentUrl.hostname) &&
      configuredUrl.protocol === currentUrl.protocol &&
      configuredUrl.port === currentUrl.port
    ) {
      return currentUrl.origin;
    }
  } catch {
    /* ignore parse failures and fall back to configured value */
  }

  return configured;
}

export const API_URL = runtimeApiUrl();
export const hasApi = API_URL.length > 0;

export const AUTH0_DOMAIN = (import.meta.env.VITE_AUTH0_DOMAIN ?? '').trim();
export const AUTH0_CLIENT_ID = (import.meta.env.VITE_AUTH0_CLIENT_ID ?? '').trim();
export const AUTH0_AUDIENCE = (import.meta.env.VITE_AUTH0_AUDIENCE ?? '').trim();
export const hasAuth = AUTH0_DOMAIN.length > 0 && AUTH0_CLIENT_ID.length > 0;
export const hasPartialAuthConfig =
  AUTH0_DOMAIN.length > 0 || AUTH0_CLIENT_ID.length > 0 || AUTH0_AUDIENCE.length > 0;
