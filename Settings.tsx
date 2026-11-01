import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, errText, Profile } from "../lib/api";
import { checkTwitch, QUALITY_PRESETS, VideoSettings } from "../lib/twitchLimits";
import { useStore } from "../store";
import { Updates } from "./Updates";
import { Unavailable } from "./Docks";

const CATS: { id: string; label: string; phase?: number; what?: string }[] = [
  { id: "general", label: "Allgemein" },
  { id: "look", label: "Erscheinungsbild" },
  { id: "streaming", label: "Streaming & Video" },
  { id: "twitch", label: "Twitch", phase: 5, what: "Anmeldung, Titel, Kategorie und Tags." },
  { id: "audio", label: "Audio", phase: 4, what: "Mixer, Filter und Geräte." },
  { id: "record", label: "Aufnahme" },
  { id: "camera", label: "Kamera", phase: 4, what: "Kameras, Rahmen und Chroma Key." },
  { id: "alerts", label: "Alerts", phase: 6, what: "Alert-Editor und Ereignisse." },
  { id: "voices", label: "Stimmen", phase: 6, what: "Lokale Text-to-Speech-Stimmen." },
  { id: "overlays", label: "Overlays", phase: 7, what: "Overlay- und Grafikeditor." },
  { id: "hotkeys", label: "Hotkeys", phase: 8, what: "Tastenkürzel und Automatisierung." },
  { id: "perf", label: "Performance" },
  { id: "plugins", label: "Plugins", phase: 10, what: "Isoliert laufende Erweiterungen." },
  { id: "privacy", label: "Datenschutz" },
  { id: "updates", label: "Updates" },
];

const DEFAULT_VIDEO: VideoSettings = { width: 1920, height: 1080, fps: 30, bitrate: 4500 };

export function Settings({ onRerunWizard }: { onRerunWizard: () => void }) {
  const [cat, setCat] = useState("general");
  const c = CATS.find((x) => x.id === cat)!;
  return (
    <div className="settings">
      <nav>{CATS.map((x) => (
        <button key={x.id} className={x.id === cat ? "sel" : ""} onClick={() => setCat(x.id)}>
          {x.label}{x.phase && <span className="badge">P{x.phase}</span>}
        </button>
      ))}</nav>
      <div className="page">
        <h2>{c.label}</h2>
        {c.phase ? <Unavailable phase={c.phase} what={c.what!} /> : <Panel id={cat} onRerunWizard={onRerunWizard} />}
      </div>
    </div>
  );
}

function Panel({ id, onRerunWizard }: { id: string; onRerunWizard: () => void }) {
  const { s, set, toast, reload } = useStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newName, setNewName] = useState("");
  const [dir, setDir] = useState("");
  const loadProfiles = () => api.profiles().then(setProfiles).catch((e) => toast(errText(e), "error"));
  useEffect(() => { if (id === "general") void loadProfiles(); if (id === "privacy") api.dataDir().then(setDir); }, [id]); // eslint-disable-line

  let video = DEFAULT_VIDEO;
  try { video = { ...DEFAULT_VIDEO, ...JSON.parse(s.video ?? "{}") }; } catch { /* Standard */ }
  const setVideo = (patch: Partial<VideoSettings>) => set("video", JSON.stringify({ ...video, ...patch }));
  const num = (v: string, d: number) => { const n = parseInt(v, 10); return isFinite(n) && n > 0 ? n : d; };

  if (id === "general") return (
    <>
      <label className="field">Sprache
        <select value={s.language ?? "de"} onChange={(e) => set("language", e.target.value)}>
          <option value="de">Deutsch</option><option value="en">English (noch nicht übersetzt)</option>
        </select></label>
      <h3>Profile</h3>
      <p className="muted">Jedes Profil hat eigene Einstellungen. Ein neues Profil startet als Kopie des aktuellen.</p>
      <ul className="list">
        {profiles.map((p) => (
          <li key={p.id} className={p.active ? "sel" : ""}>
            <span>{p.name}{p.active && <small> (aktiv)</small>}</span>
            {!p.active && <button className="btn small" onClick={async () => { try { await api.profileSwitch(p.id); await reload(); await loadProfiles(); } catch (e) { toast(errText(e), "error"); } }}>Wechseln</button>}
            <button className="mini" title="Profil löschen" onClick={async () => { if (!window.confirm(`Profil „${p.name}“ löschen?`)) return; try { await api.profileDelete(p.id); await reload(); await loadProfiles(); } catch (e) { toast(errText(e), "error"); } }}>✕</button>
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); try { await api.profileCreate(newName); setNewName(""); await loadProfiles(); } catch (er) { toast(errText(er), "error"); } }}>
        <input placeholder="Neues Profil …" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn small" type="submit">Profil anlegen</button>
      </form>
      <h3>Einrichtung</h3>
      <button className="btn" onClick={onRerunWizard}>Einrichtungsassistent erneut starten</button>
    </>
  );

  if (id === "look") return (
    <label className="check"><input type="checkbox" checked={s.reduce_motion === "1"} onChange={(e) => set("reduce_motion", e.target.checked ? "1" : "0")} />
      Animationen reduzieren (spart Leistung)</label>
  );

  if (id === "streaming") return (
    <>
      <div className="choices">{QUALITY_PRESETS.map((p) => (
        <button key={p.id} className="choice" onClick={() => set("video", JSON.stringify({ width: p.width, height: p.height, fps: p.fps, bitrate: p.bitrate }))}>{p.label}</button>
      ))}</div>
      <div className="grid2">
        <label className="field">Breite<input type="number" value={video.width} onChange={(e) => setVideo({ width: num(e.target.value, 1920) })} /></label>
        <label className="field">Höhe<input type="number" value={video.height} onChange={(e) => setVideo({ height: num(e.target.value, 1080) })} /></label>
        <label className="field">Bilder pro Sekunde<input type="number" value={video.fps} onChange={(e) => setVideo({ fps: num(e.target.value, 30) })} /></label>
        <label className="field">Video-Bitrate (kbps)<input type="number" value={video.bitrate} onChange={(e) => setVideo({ bitrate: num(e.target.value, 4500) })} /></label>
      </div>
      {checkTwitch(video).map((h, i) => <p key={i} className={h.level === "ok" ? "okmsg" : "err"}>{h.text}</p>)}
      <label className="field">Bevorzugter Encoder
        <select value={s.encoder_pref ?? "x264"} onChange={(e) => set("encoder_pref", e.target.value)}>
          <option value="nvenc">NVIDIA NVENC</option><option value="amf">AMD AMF</option><option value="qsv">Intel Quick Sync</option><option value="x264">x264 (Software)</option>
        </select></label>
      <p className="muted">Die Werte werden gespeichert und von der Streaming-Engine verwendet (Phase 3). Bis dahin wird noch nichts gesendet.</p>
    </>
  );

  if (id === "record") return (
    <>
      <label className="field">Speicherort für Aufnahmen
        <div className="row"><input readOnly value={s.record_path ?? "Nicht festgelegt"} />
          <button className="btn small" onClick={async () => { const p = await open({ directory: true }); if (typeof p === "string") await set("record_path", p); }}>Ordner wählen</button></div></label>
      <label className="field">Format
        <select value={s.record_format ?? "mkv"} onChange={(e) => set("record_format", e.target.value)}>
          <option value="mkv">MKV (empfohlen, absturzsicher)</option><option value="mp4">MP4</option></select></label>
      <p className="muted">Gespeichert für Phase 8. Aufnahme, Replay-Buffer und Mehrspur-Audio sind noch nicht verfügbar.</p>
    </>
  );

  if (id === "perf") return (
    <>
      <label className="field">Vorschau-Bildrate
        <select value={s.preview_fps ?? "30"} onChange={(e) => set("preview_fps", e.target.value)}>
          <option value="10">10 (sparsam)</option><option value="30">30</option><option value="60">60</option></select></label>
      <label className="check"><input type="checkbox" checked={s.reduce_motion === "1"} onChange={(e) => set("reduce_motion", e.target.checked ? "1" : "0")} />Animationen reduzieren</label>
      <p className="muted">Die Vorschau-Einstellung wirkt, sobald es eine Vorschau gibt (Phase 3). Live-Messwerte findest du im Dock „Performance“.</p>
    </>
  );

  if (id === "privacy") return (
    <>
      <p>IBIS IV sendet keine Nutzungsdaten. Gespeichert werden nur deine Einstellungen, Profile, Sicherungen und das Protokoll auf diesem Rechner:</p>
      <pre className="log small">{dir}</pre>
      <p className="muted">Spätere Zugangsdaten (Twitch-Token) werden im Windows-Anmeldeinformationsspeicher abgelegt und nicht in dieser Datenbank.</p>
    </>
  );

  if (id === "updates") return <Updates />;
  return null;
}
