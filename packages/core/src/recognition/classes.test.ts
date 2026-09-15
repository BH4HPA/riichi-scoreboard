import { describe, expect, it } from "vitest";
import { AKA, TILE } from "../types/tiles";
import { RECOGNITION_CLASSES, RECOGNITION_MANIFEST, tileOfClass, tileOfClassId } from "./classes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const EXPECTED = [
  ...["m", "p", "s"].flatMap((s) => [
    ...Array.from({ length: 9 }, (_, i) => `${i + 1}${s}`),
    `0${s}`,
  ]),
  ...Array.from({ length: 7 }, (_, i) => `${i + 1}z`),
  "back",
];

describe("recognition classes", () => {
  it("38 类，顺序固定", () => {
    expect(RECOGNITION_CLASSES).toEqual(EXPECTED);
    expect(RECOGNITION_CLASSES.length).toBe(38);
  });

  it("类名 → 牌码覆盖全部 37 种牌，牌背为 null", () => {
    expect(tileOfClass("1m")).toBe(TILE.M1);
    expect(tileOfClass("9s")).toBe(TILE.S9);
    expect(tileOfClass("0m")).toBe(AKA.M5);
    expect(tileOfClass("0p")).toBe(AKA.P5);
    expect(tileOfClass("0s")).toBe(AKA.S5);
    expect(tileOfClass("1z")).toBe(TILE.East);
    expect(tileOfClass("7z")).toBe(TILE.Chun);
    expect(tileOfClass("back")).toBeNull();
    const tiles = RECOGNITION_CLASSES.map(tileOfClass).filter((t) => t !== null);
    expect(new Set(tiles).size).toBe(37);
    expect(() => tileOfClass("8z")).toThrow();
    expect(() => tileOfClass("0z")).toThrow();
    expect(() => tileOfClass("x")).toThrow();
    expect(tileOfClassId(37)).toBeNull();
    expect(() => tileOfClassId(38)).toThrow();
  });

  it("已发布模型（若有）字段合法", () => {
    const model = RECOGNITION_MANIFEST.model;
    if (!model) return;
    expect(model.id).toMatch(UUID);
    expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(model.imgsz).toBe(640);
    expect(model.trainedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
