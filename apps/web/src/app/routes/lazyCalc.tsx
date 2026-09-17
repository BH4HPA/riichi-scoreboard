import { lazy } from "react";

/** 拍照算点数页把相机、Worker 与牌面编辑器全拉进来；和 CameraButton 一样，只在真进去时才加载。 */
export const LazyCalc = lazy(() => import("@/app/routes/Calc").then((m) => ({ default: m.Calc })));
