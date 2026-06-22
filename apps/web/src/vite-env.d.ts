/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API. Empty/undefined ⇒ standalone mock mode. */
  readonly VITE_API_URL?: string;
  /** Auth0 tenant domain for the SPA login flow. */
  readonly VITE_AUTH0_DOMAIN?: string;
  /** Auth0 SPA client id. */
  readonly VITE_AUTH0_CLIENT_ID?: string;
  /** Auth0 API audience used to request bearer tokens for the Fastify API. */
  readonly VITE_AUTH0_AUDIENCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
