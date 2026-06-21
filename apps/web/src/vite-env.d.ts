/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API. Empty/undefined ⇒ standalone mock mode. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
