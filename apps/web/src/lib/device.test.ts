import { describe, expect, it } from "vitest";
import { deviceKind } from "./device";
import { roomCodeFrom } from "../features/join/roomCode";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_LEGACY =
  "Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

describe("deviceKind", () => {
  it.each([
    ["iPhone", IPHONE, "phone"],
    ["旧 iPad UA", IPAD_LEGACY, "tablet"],
    ["Android 手机", ANDROID_PHONE, "phone"],
    ["Android 平板（无 Mobile）", ANDROID_TABLET, "tablet"],
    ["Mac 桌面", MAC, "desktop"],
  ])("%s", (_name, userAgent, expected) => {
    expect(deviceKind({ userAgent, platform: "x", maxTouchPoints: 0 })).toBe(expected);
  });

  it("iPadOS 桌面 UA 靠多点触控识别为平板", () => {
    expect(
      deviceKind({ userAgent: IPAD_DESKTOP_UA, platform: "MacIntel", maxTouchPoints: 5 }),
    ).toBe("tablet");
    expect(
      deviceKind({ userAgent: IPAD_DESKTOP_UA, platform: "MacIntel", maxTouchPoints: 0 }),
    ).toBe("desktop");
  });

  it("userAgentData.mobile 只在 true 时作手机信号，false 回落到 UA 判断；平板 UA 优先于该信号", () => {
    expect(deviceKind({ userAgent: MAC, userAgentData: { mobile: true } })).toBe("phone");
    expect(deviceKind({ userAgent: ANDROID_TABLET, userAgentData: { mobile: false } })).toBe(
      "tablet",
    );
    expect(deviceKind({ userAgent: IPAD_LEGACY, userAgentData: { mobile: true } })).toBe("tablet");
  });
});

describe("roomCodeFrom", () => {
  it("识别加入链接或纯房间码，统一大写", () => {
    expect(roomCodeFrom("http://10.0.0.1:8787/r/ab23cd")).toBe("AB23CD");
    expect(roomCodeFrom("https://x.example.com/r/AB23CD?x=1")).toBe("AB23CD");
    expect(roomCodeFrom("  ab23cd ")).toBe("AB23CD");
    expect(roomCodeFrom("https://x.example.com/console")).toBeNull();
    expect(roomCodeFrom("abc")).toBeNull();
    expect(roomCodeFrom("AB10CD")).toBeNull(); // 0/1 不在字母表里
  });
});
