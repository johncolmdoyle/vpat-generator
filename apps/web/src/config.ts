/** When VITE_API_URL is set (compose), the app talks to the real backend. Otherwise
 *  it runs the self-contained mock flow (`npm run dev` with no env). */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const hasApi = API_URL.length > 0;

export const AUTH0_DOMAIN = (import.meta.env.VITE_AUTH0_DOMAIN ?? '').trim();
export const AUTH0_CLIENT_ID = (import.meta.env.VITE_AUTH0_CLIENT_ID ?? '').trim();
export const AUTH0_AUDIENCE = (import.meta.env.VITE_AUTH0_AUDIENCE ?? '').trim();
export const hasAuth = AUTH0_DOMAIN.length > 0 && AUTH0_CLIENT_ID.length > 0;
export const hasPartialAuthConfig =
  AUTH0_DOMAIN.length > 0 || AUTH0_CLIENT_ID.length > 0 || AUTH0_AUDIENCE.length > 0;
