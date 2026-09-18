/// <reference types="vite/client" />

/** 构建期注入的部署配置（都可为空；含义见 .env.template）。 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_STATIC_BASE_URL?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_SITE_AUTHOR?: string;
  readonly VITE_SITE_AUTHOR_URL?: string;
  readonly VITE_SITE_SINCE?: string;
  readonly VITE_ICP_NUMBER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
