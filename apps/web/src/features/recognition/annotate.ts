import { RECOGNITION_CLASSES, type Detection } from "@riichi/core";

/** 框与文字都按图宽取值：1280 宽的照片上 2px 的线太细，640 宽的图上 4px 又太粗 */
const stroke = (width: number) => Math.max(2, Math.round(width / 400));
const fontSize = (width: number) => Math.max(11, Math.round(width / 48));

/**
 * 把检测框烧进照片，供算点数页回看与下载存档。
 *
 * 屏幕上的叠加层用牌图当标签（小屏上文字会糊成一团，见 `camera/DetectionOverlay`），
 * 这里反过来用文字 + 置信度：下载下来是拿去放大排查的，全分辨率下文字才带得动信息。
 * 原图本身服务端已经留了，所以这份产物的价值就在"标注可读"。
 */
export async function renderAnnotated(
  photo: Blob,
  detections: readonly Detection[],
): Promise<Blob> {
  const bitmap = await createImageBitmap(photo);
  try {
    const { width, height } = bitmap;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);

    const lw = stroke(width);
    const fs = fontSize(width);
    ctx.lineWidth = lw;
    ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";

    for (const d of detections) {
      const [x1, y1, x2, y2] = d.box;
      ctx.strokeStyle = "rgba(217,119,6,0.95)";
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      const text = `${RECOGNITION_CLASSES[d.cls] ?? "?"} ${Math.round(d.conf * 100)}`;
      const pad = Math.round(fs * 0.25);
      const tw = ctx.measureText(text).width + pad * 2;
      const th = fs + pad * 2;
      // 贴在框顶外侧；顶到图边就翻到框内，免得被裁掉
      const ty = y1 - th >= 0 ? y1 - th : y1;
      ctx.fillStyle = "rgba(217,119,6,0.95)";
      ctx.fillRect(x1, ty, tw, th);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, x1 + pad, ty + pad);
    }
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  } finally {
    bitmap.close();
  }
}
