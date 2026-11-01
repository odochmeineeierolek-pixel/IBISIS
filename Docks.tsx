import { useEffect, useState } from "react";
import { api, Stats } from "../lib/api";
import { useStore } from "../store";
import { DockId } from "../lib/layout";

export function Unavailable({ phase, what }: { phase: number; what: string }) {
  return (
    <div className="unavail">
      <span className="badge">Phase {phase}</span>
      <p>{what}</p>
      <small>Noch nicht verfügbar.</small>
    </div>
  );
}

function ScenesDock() {
  const { s, set } = useStore();
  const scenes: string[] = safeList(s.scenes);
  const active = s.active_scene ?? scenes[0];
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<{ i: number; v: string } | null>(null);
  const save = (list: string[], act?: string) => { void set("scenes", JSON.stringify(list)); if (act) void set("active_scene", act); };

  return (
    <div className="dock-body">
      <ul className="list">
        {scenes.length === 0 && <li className="empty">Noch keine Szene. Lege unten deine erste an.</li>}
        {scenes.map((n, i) => (
          <li key={n + i} className={n === active ? "sel" : ""} onClick={() => set("active_scene", n)}>
            {editing?.i === i ? (
              <input autoFocus value={editing.v} onChange={(e) => setEditing({ i, v: e.target.value })}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditing(null);
                  if (e.key === "Enter") {
                    const v = editing.v.trim();
                    if (v && (v === n || !scenes.includes(v))) save(scenes.map((x, j) => (j === i ? v : x)), n === active ? v : undefined);
                    setEditing(null);
                  }
                }} />
            ) : (
              <>
                <span onDoubleClick={() => setEditing({ i, v: n })} title="Doppelklick zum Umbenennen">{n}</span>
                <button className="mini" title="Szene löschen" onClick={(e) => { e.stopPropagation(); const l = scenes.filter((_, j) => j !== i); save(l, l[0] ?? ""); }}>✕</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={(e) => { e.preventDefault(); const v = adding.trim(); if (v && !scenes.includes(v)) { save([...scenes, v], scenes.length === 0 ? v : undefined); setAdding(""); } }}>
        <input placeholder="Neue Szene …" value={adding} onChange={(e) => setAdding(e.target.value)} />
        <button className="btn small" type="submit">Hinzufügen</button>
      </form>
    </div>
  );
}

export function safeList(raw?: string): string[] {
  try { const v = JSON.parse(raw ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}

const gb = (b: number) => (b / 1024 ** 3).toFixed(1) + " GB";
const mb = (b: number) => Math.round(b / 1024 ** 2) + " MB";

function PerfDock() {
  const [st, setSt] = useState<Stats | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () => api.stats().then((v) => alive && setSt(v)).catch(() => {});
    tick();
    const t = window.setInterval(tick, 2000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!st) return <div className="dock-body"><p className="empty">Messe …</p></div>;
  const Row = ({ k, v, pct }: { k: string; v: string; pct?: number }) => (
    <div className="stat"><span>{k}</span><b>{v}</b>{pct !== undefined && <i style={{ width: `${Math.min(100, pct)}%` }} />}</div>
  );
  return (
    <div className="dock-body stats">
      <Row k="CPU gesamt" v={`${st.cpu.toFixed(0)} %`} pct={st.cpu} />
      <Row k="RAM gesamt" v={`${gb(st.mem_used)} / ${gb(st.mem_total)}`} pct={(st.mem_used / st.mem_total) * 100} />
      <Row k="IBIS IV (CPU)" v={`${st.proc_cpu.toFixed(1)} %`} />
      <Row k="IBIS IV (RAM, Hauptprozess)" v={mb(st.proc_mem)} />
      <small className="muted">FPS, Dropped Frames, GPU, Encoder und Bitrate folgen mit der Streaming-Engine (Phase 3 und 9).</small>
    </div>
  );
}

function ControlsDock({ openView }: { openView: (v: string) => void }) {
  return (
    <div className="dock-body controls">
      <button className="btn primary" disabled title="Braucht die Streaming-Engine (Phase 3)">Stream starten <span className="badge">Phase 3</span></button>
      <button className="btn" disabled title="Braucht die Streaming-Engine (Phase 3)">Aufnahme starten <span className="badge">Phase 3</span></button>
      <button className="btn" onClick={() => openView("settings")}>Einstellungen</button>
      <button className="btn" onClick={() => openView("repair")}>Reparatur &amp; Sicherung</button>
    </div>
  );
}

function StatusDock() {
  return (
    <div className="dock-body">
      <div className="stat"><span>Stream</span><b>Offline</b></div>
      <div className="stat"><span>Engine</span><b>nicht enthalten</b></div>
      <div className="stat"><span>Twitch</span><b>nicht verbunden</b></div>
      <small className="muted">Laufzeit, Bitrate und Zuschauer erscheinen, sobald Engine (Phase 3) und Twitch (Phase 5) angebunden sind.</small>
    </div>
  );
}

export function DockContent({ id, openView }: { id: DockId; openView: (v: string) => void }) {
  switch (id) {
    case "scenes": return <ScenesDock />;
    case "sources": return <Unavailable phase={4} what="Quellen wie Game Capture, Kamera und Browser benötigen die Streaming-Engine." />;
    case "mixer": return <Unavailable phase={4} what="Der Audio-Mixer mit Filtern folgt zusammen mit der Engine." />;
    case "status": return <StatusDock />;
    case "chat": return <Unavailable phase={5} what="Der Twitch-Chat erscheint nach der Twitch-Anmeldung." />;
    case "events": return <Unavailable phase={5} what="Follower, Subs, Bits und Raids kommen über Twitch EventSub." />;
    case "controls": return <ControlsDock openView={openView} />;
    case "perf": return <PerfDock />;
  }
}
