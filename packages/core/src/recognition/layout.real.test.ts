import { describe, expect, it } from "vitest";
import type { Meld } from "../types/tiles";
import { layoutHand } from "./layout";
import type { Detection, RecognizedHand } from "./types";
import records from "./__fixtures__/records.json";

/**
 * 线上实拍的回归夹具（2026-09-19 导出的 50 条：检测框取整、用户确认的手牌，不含照片与玩家）。
 * 合成场景测的是规则，这里测的是「规则改了以后真实照片还认不认得对」——19 条带着牌河或牌山。
 */
interface Record {
  id: string;
  source: string;
  detections: Detection[];
  recognized: RecognizedHand | null;
  corrected: RecognizedHand | null;
}
const RECORDS = records as unknown as Record[];
const CONFIRMED = RECORDS.filter((r) => r.corrected !== null);

// 组内排序：暗杠里赤五露在哪一侧随布局版本变过，与「认没认对」无关
const meldKey = (m: Meld) => `${m.open ? "o" : "c"}${[...m.tiles].sort((a, b) => a - b).join(",")}`;
const tilesKey = (h: RecognizedHand) =>
  `${[...h.closed].sort((a, b) => a - b).join(",")}|${h.winTile}|${h.melds.map(meldKey).sort().join("/")}`;
const indicatorKey = (h: RecognizedHand) =>
  `${h.doraIndicators.join(",")}|${h.uraIndicators.join(",")}`;

describe("layoutHand：线上实拍回归", () => {
  it("已确认的 39 条：暗牌、和张、副露全部与用户确认的一致，且没有 blocking", () => {
    expect(CONFIRMED).toHaveLength(39);
    for (const r of CONFIRMED) {
      const out = layoutHand(r.detections);
      expect(tilesKey(out.hand), r.id).toBe(tilesKey(r.corrected!));
      expect(
        out.warnings.filter((w) => w.severity === "blocking"),
        r.id,
      ).toEqual([]);
    }
  });

  it("牌河末行不再被当成表宝牌：dad21385、929d8216 原先认成「表 5 / 里 1」", () => {
    for (const id of ["dad21385", "929d8216"]) {
      const r = RECORDS.find((x) => x.id === id)!;
      expect(indicatorKey(layoutHand(r.detections).hand), id).toBe(indicatorKey(r.corrected!));
    }
  });

  it("指示牌与用户确认一致的条数不回退", () => {
    const same = CONFIRMED.filter(
      (r) => indicatorKey(layoutHand(r.detections).hand) === indicatorKey(r.corrected!),
    );
    // 改版前 34 条；剩下的是村规截断与用户手改，布局无从知道
    expect(same.length).toBeGreaterThanOrEqual(36);
  });

  it("每条都给得出 window，且采信的框都在 window 里", () => {
    for (const r of RECORDS) {
      const out = layoutHand(r.detections);
      expect(out.window, r.id).not.toBeNull();
      const [x1, y1, x2, y2] = out.window!;
      for (const i of out.provenance.usedDetections) {
        const [a, b, c, d] = r.detections[i]!.box;
        const [cx, cy] = [(a + c) / 2, (b + d) / 2];
        expect(cx > x1 && cx < x2 && cy > y1 && cy < y2, `${r.id}#${i}`).toBe(true);
      }
    }
  });
});
