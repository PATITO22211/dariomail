/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DARIOMAIL_MOCK?: string;
  readonly VITE_DARIOMAIL_LABEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
