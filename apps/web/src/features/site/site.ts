/** 站点署名与备案信息，都由部署方通过构建期环境变量给；缺哪项就不显示哪项。 */
const env = import.meta.env as Record<string, string | undefined>;

export const AUTHOR = env.VITE_SITE_AUTHOR
  ? {
      name: env.VITE_SITE_AUTHOR,
      url: env.VITE_SITE_AUTHOR_URL ?? null,
      since: env.VITE_SITE_SINCE ? Number(env.VITE_SITE_SINCE) : null,
    }
  : null;

export const ICP = env.VITE_ICP_NUMBER
  ? { number: env.VITE_ICP_NUMBER, url: "https://beian.miit.gov.cn/" }
  : null;
