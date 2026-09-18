/**
 * 部署方静态桶（CDN）里本项目对象的公共前缀，如 `https://static.example.com/riichi`；
 * 曲库与识别模型都从这里取（上传脚本在 ci/ 下）。留空即没有这两项功能，界面隐藏对应入口。
 */
export const STATIC_BASE_URL =
  (import.meta.env.VITE_STATIC_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
