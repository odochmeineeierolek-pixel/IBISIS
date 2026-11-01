import { describe, expect, it } from "vitest";
import { WORKSPACES, hideDock, moveDock, parseLayout, toggleDock, visibleIds, resize } from "./layout";
import { checkTwitch } from "./twitchLimits";

describe("layout", () => {
  it("verschiebt ein Dock ohne Duplikate", () => {
    const l = moveDock(WORKSPACES.Standard, "chat", "left");
    expect(l.slots.left).toContain("chat");
    expect(visibleIds(l).filter((d) => d === "chat")).toHaveLength(1);
  });
  it("fügt vor einem Ziel-Dock ein", () => {
    const l = moveDock(WORKSPACES.Standard, "controls", "bottom", "scenes");
    expect(l.slots.bottom[0]).toBe("controls");
  });
  it("blendet aus und wieder ein", () => {
    const h = hideDock(WORKSPACES.Standard, "mixer");
    expect(visibleIds(h)).not.toContain("mixer");
    expect(visibleIds(toggleDock(h, "mixer"))).toContain("mixer");
  });
  it("begrenzt Größen", () => {
    expect(resize(WORKSPACES.Standard, "bottom", 9999).sizes.bottom).toBe(500);
  });
  it("verwirft kaputte Layouts", () => {
    expect(parseLayout("{kaputt")).toBeNull();
    const p = parseLayout(JSON.stringify({ slots: { left: ["chat", "chat", "xyz"], right: [], bottom: [] }, sizes: {} }));
    expect(p?.slots.left).toEqual(["chat"]);
  });
});

describe("twitch-grenzen", () => {
  it("lehnt 4K ab", () => {
    expect(checkTwitch({ width: 3840, height: 2160, fps: 30, bitrate: 6000 })[0].level).toBe("error");
  });
  it("lehnt 120 FPS ab", () => {
    expect(checkTwitch({ width: 1920, height: 1080, fps: 120, bitrate: 6000 }).some((h) => h.level === "error")).toBe(true);
  });
  it("akzeptiert 1080p60 bei 6000 kbps", () => {
    expect(checkTwitch({ width: 1920, height: 1080, fps: 60, bitrate: 6000 })[0].level).toBe("ok");
  });
});
