/** When VITE_API_URL is set (compose), the app talks to the real backend. Otherwise
 *  it runs the self-contained mock flow (`npm run dev` with no env). */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const hasApi = API_URL.length > 0;
