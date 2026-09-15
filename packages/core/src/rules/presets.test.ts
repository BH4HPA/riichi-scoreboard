import { describe, expect, it } from "vitest";
import { umaDescription } from "../format/rules";
import { buildPointsTable } from "../reference/pointsTable";
import { BUILTIN_PRESETS, findPreset, presetNameOf, rulesKey } from "./presets";
import { validateRules } from "./validate";

describe("内置预设", () => {
  it("id 唯一、M-League 在首位", () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("mleague");
    expect(ids).toHaveLength(5);
  });

  it.each(BUILTIN_PRESETS.map((p) => [p.name, p] as const))(
    "%s 通过规则校验且可生成描述与点数表",
    (_name, preset) => {
      expect(validateRules(preset.rules)).toEqual(preset.rules);
      expect(umaDescription(preset.rules)).toMatch(/顺位马/);
      expect(buildPointsTable(preset.rules, "ko")).toHaveLength(11);
    },
  );

  it("关键差异点：切上、累计役满、赤、起返点", () => {
    const byId = Object.fromEntries(BUILTIN_PRESETS.map((p) => [p.id, p.rules]));
    expect(byId["majsoul-ranked"]!.final).toMatchObject({
      startPoints: 25000,
      returnPoints: 25000,
    });
    expect(byId["majsoul-ranked"]!.win.multiRon).toBe("triple");
    expect(byId["tenhou-houou"]!.final.uma).toEqual([20, 10, -10, -20]);
    expect(byId["tenhou-houou"]!.scoring.kiriageMangan).toBe(false);
    expect(byId["saikouisen"]!.hand.akaCount).toBe(3);
    expect(byId["wrc"]!.hand.akaCount).toBe(0);
    expect(byId["saikouisen"]!.scoring.pao).toBe(false);
    expect(byId["wrc"]!.scoring.kazoeYakuman).toBe(true);
    // 30 符 4 番：切上开 → 满贯块；关 → 7700
    const rowOf = (id: string) => buildPointsTable(byId[id]!, "ko").find((r) => r.fu === 30)!;
    expect(rowOf("wrc").manganFrom).toBe(4);
    expect(rowOf("tenhou-houou").manganFrom).toBeNull();
    expect(rowOf("tenhou-houou").cells[3]!.cell.ron).toBe(7700);
  });
});

describe("findPreset / presetNameOf", () => {
  it.each(BUILTIN_PRESETS.map((p) => [p.name, p] as const))("%s 能被找回", (_n, preset) => {
    expect(findPreset(preset.rules)?.id).toBe(preset.id);
    expect(presetNameOf(preset.rules)).toBe(preset.name);
  });

  it("键序打乱、经 JSON 往返后仍匹配", () => {
    const r = BUILTIN_PRESETS[1]!.rules;
    const { scoring, ...rest } = r;
    const shuffled: unknown = JSON.parse(JSON.stringify({ ...rest, scoring }));
    expect(findPreset(shuffled)?.id).toBe(BUILTIN_PRESETS[1]!.id);
  });

  it("改动任一字段即为自定义", () => {
    const r = BUILTIN_PRESETS[0]!.rules;
    const edited = { ...r, hand: { ...r.hand, kuitan: !r.hand.kuitan } };
    expect(findPreset(edited)).toBeNull();
    expect(presetNameOf(edited)).toBe("自定义");
  });

  it("非法草稿返回 null 而不是抛异常", () => {
    const r = BUILTIN_PRESETS[0]!.rules;
    expect(rulesKey({ ...r, final: { ...r.final, startPoints: 2 } })).toBeNull();
    expect(findPreset({})).toBeNull();
  });

  it("也可在自定义预设列表里查找", () => {
    const mine = { id: "u1", name: "我的", rules: BUILTIN_PRESETS[2]!.rules };
    expect(findPreset(mine.rules, [mine])?.id).toBe("u1");
    expect(findPreset(mine.rules, [...BUILTIN_PRESETS, mine])?.id).toBe(BUILTIN_PRESETS[2]!.id);
  });
});
