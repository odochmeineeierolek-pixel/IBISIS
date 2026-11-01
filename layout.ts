export type Slot = "left" | "right" | "bottom";

export const DOCKS = {
  scenes: "Szenen",
  sources: "Quellen",
  mixer: "Audio-Mixer",
  status: "Streaming-Status",
  chat: "Chat",
  events: "Ereignisse",
  controls: "Steuerung",
  perf: "Performance",
} as const;
export type DockId = keyof typeof DOCKS;
export const DOCK_IDS = Object.keys(DOCKS) as DockId[];

export interface Layout {
  slots: Record<Slot, DockId[]>;
  sizes: Record<Slot, number>; // Pixel (Breite links/rechts, Höhe unten)
  vertical: boolean; // Vorschau im Hochformat
}

const mk = (left: DockId[], right: DockId[], bottom: DockId[], vertical = false): Layout => ({
  slots: { left, right, bottom },
  sizes: { left: 280, right: 320, bottom: 250 },
  vertical,
});

export const WORKSPACES: Record<string, Layout> = {
  Standard: mk([], ["chat", "events"], ["scenes", "sources", "mixer", "controls"]),
  Streaming: mk([], ["chat", "events", "status"], ["scenes", "sources", "mixer", "controls"]),
  Gaming: mk(["perf", "status"], ["chat"], ["scenes", "mixer", "controls"]),
  Recording: mk([], ["perf", "status"], ["scenes", "sources", "mixer", "controls"]),
  Editing: mk(["scenes", "sources"], ["controls"], ["mixer"]),
  "Vertical Streaming": mk(["scenes", "sources"], ["status", "controls"], ["mixer", "perf"], true),
};
export const WORKSPACE_NAMES = [...Object.keys(WORKSPACES), "Custom Workspace"];

export const SLOTS: Slot[] = ["left", "right", "bottom"];
export const visibleIds = (l: Layout): DockId[] => SLOTS.flatMap((s) => l.slots[s]);

const clone = (l: Layout): Layout => JSON.parse(JSON.stringify(l));

/** Verschiebt ein Dock in einen Bereich, optional vor ein anderes Dock. */
export function moveDock(l: Layout, id: DockId, slot: Slot, beforeId?: DockId): Layout {
  const n = clone(l);
  for (const s of SLOTS) n.slots[s] = n.slots[s].filter((d) => d !== id);
  const arr = n.slots[slot];
  const i = beforeId ? arr.indexOf(beforeId) : -1;
  if (i >= 0) arr.splice(i, 0, id);
  else arr.push(id);
  return n;
}

export function hideDock(l: Layout, id: DockId): Layout {
  const n = clone(l);
  for (const s of SLOTS) n.slots[s] = n.slots[s].filter((d) => d !== id);
  return n;
}

export function toggleDock(l: Layout, id: DockId): Layout {
  return visibleIds(l).includes(id) ? hideDock(l, id) : moveDock(l, id, "right");
}

export function resize(l: Layout, slot: Slot, size: number): Layout {
  const n = clone(l);
  const [min, max] = slot === "bottom" ? [120, 500] : [180, 600];
  n.sizes[slot] = Math.round(Math.min(max, Math.max(min, size)));
  return n;
}

/** Liest ein gespeichertes Layout und verwirft ungültige oder doppelte Einträge. */
export function parseLayout(raw: string | undefined): Layout | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    const seen = new Set<string>();
    const slots = {} as Layout["slots"];
    for (const s of SLOTS) {
      const list: unknown = p?.slots?.[s];
      if (!Array.isArray(list)) return null;
      slots[s] = list.filter((d): d is DockId => typeof d === "string" && d in DOCKS && !seen.has(d) && !!seen.add(d));
    }
    const sz = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
    return {
      slots,
      sizes: { left: sz(p.sizes?.left, 280), right: sz(p.sizes?.right, 320), bottom: sz(p.sizes?.bottom, 250) },
      vertical: p.vertical === true,
    };
  } catch {
    return null;
  }
}
