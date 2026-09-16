import { lazy } from "react";

/** 标注页把相机、Worker 与牌面编辑器全拉进来；和 CameraButton 一样，只在真进去时才加载。 */
export const LazyLabel = lazy(() =>
  import("@/app/routes/Label").then((m) => ({ default: m.Label })),
);
