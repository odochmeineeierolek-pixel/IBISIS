import { useState } from "react";
import { DOCKS, DockId, Layout, Slot, hideDock, moveDock, resize } from "../lib/layout";
import { DockContent } from "./Docks";
import { useStore } from "../store";

interface Props { layout: Layout; onChange: (l: Layout) => void; openView: (v: string) => void }

export function Workspace({ layout, onChange, openView }: Props) {
  const [drag, setDrag] = useState<DockId | null>(null);
  const [over, setOver] = useState<Slot | null>(null);
  const { s } = useStore();
  const scene = s.active_scene;

  const startResize = (slot: Slot) => (e: React.PointerEvent) => {
    e.preventDefault();
    const start = slot === "bottom" ? e.clientY : e.clientX;
    const base = layout.sizes[slot];
    const move = (ev: PointerEvent) => {
      const d = (slot === "bottom" ? ev.clientY : ev.clientX) - start;
      onChange(resize(layout, slot, slot === "left" ? base + d : base - d));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const Slot = ({ slot }: { slot: Slot }) => {
    const ids = layout.slots[slot];
    const empty = ids.length === 0;
    if (empty && !drag) return null;
    const size = empty ? 64 : layout.sizes[slot];
    const style = slot === "bottom" ? { height: size } : { width: size };
    return (
      <>
        {slot === "right" && !empty && <div className="split v" onPointerDown={startResize("right")} />}
        {slot === "bottom" && !empty && <div className="split h" onPointerDown={startResize("bottom")} />}
        <div className={`slot ${slot} ${over === slot ? "over" : ""}`} style={style}
          onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(slot); } }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => { e.preventDefault(); if (drag) onChange(moveDock(layout, drag, slot)); setDrag(null); setOver(null); }}>
          {empty && <span className="drophint">Hier ablegen</span>}
          {ids.map((id) => (
            <section key={id} className="dock"
              onDragOver={(e) => { if (drag && drag !== id) { e.preventDefault(); e.stopPropagation(); setOver(slot); } }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag && drag !== id) onChange(moveDock(layout, drag, slot, id)); setDrag(null); setOver(null); }}>
              <header draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", id); setDrag(id); }} onDragEnd={() => { setDrag(null); setOver(null); }}>
                <span>{DOCKS[id]}</span>
                <button className="mini" title="Ausblenden (Ansicht-Menü zum Wiederholen)" onClick={() => onChange(hideDock(layout, id))}>✕</button>
              </header>
              <DockContent id={id} openView={openView} />
            </section>
          ))}
        </div>
        {slot === "left" && !empty && <div className="split v" onPointerDown={startResize("left")} />}
      </>
    );
  };

  return (
    <div className="workspace">
      <div className="top">
        {Slot({ slot: "left" })}
        <main className="center">
          <div className={`preview ${layout.vertical ? "vertical" : ""}`}>
            <div className="frame">
              <b>{scene || "Keine Szene"}</b>
              <p>Hier erscheint das Live-Bild, sobald die Streaming-Engine eingebunden ist (Phase 3).</p>
              <span className="badge">Keine Engine aktiv</span>
            </div>
          </div>
        </main>
        {Slot({ slot: "right" })}
      </div>
      {Slot({ slot: "bottom" })}
    </div>
  );
}

