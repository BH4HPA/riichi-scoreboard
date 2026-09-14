import { describe, expect, it } from "vitest";
import { CORE_VERSION } from "./index";

describe("core bootstrap", () => {
  it("exports a version", () => {
    expect(CORE_VERSION).toBe("2.0.0");
  });
});
