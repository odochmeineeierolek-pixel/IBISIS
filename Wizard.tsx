import { useEffect, useRef, useState } from "react";
import { api, errText, Hw, NetEntry } from "../lib/api";
import { QUALITY_PRESETS, checkTwitch } from "../lib/twitchLimits";
import { useStore } from "../store";
import { Logo } from "./Logo";

const STEPS = ["Sprache", "Twitch", "Mikrofon", "Kamera", "Hardware", "Internet", "Qualität", "Alerts", "Fertig"];

function useDevices(kind: "audioinput" | "videoinput") {
  const [list, setList] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const t = await navigator.mediaDevices.getUserMedia(kind === "audioinput" ? { audio: true } : { video: true });
      t.getTracks().forEach((x) => x.stop()); // Nur für die Berechtigung, damit Gerätenamen sichtbar sind.
      const all = await navigator.mediaDevices.enumerateDevices();
      setList(all.filter((d) => d.kind === kind));
      setError("");
    } catch (e) {
      setError(`Zugriff nicht möglich: ${errText(e)}. Erlaube den Zugriff in den Windows-Datenschutzeinstellungen (Mikrofon bzw. Kamera).`);
    }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line
  return { list, error, reload: load };
}

function MicStep({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const { list, error, reload } = useDevices("audioinput");
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!value) return;
    let stop = false; let stream: MediaStream | undefined; let ctx: AudioContext | undefined;
    navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: value } } }).then((s) => {
      if (stop) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s; ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        if (stop) return;
        an.getByteTimeDomainData(buf);
        let peak = 0; for (const b of buf) peak = Math.max(peak, Math.abs(b - 128));
        setLevel(Math.min(100, (peak / 128) * 140));
        requestAnimationFrame(loop);
      };
      loop();
    }).catch(() => setLevel(0));
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); void ctx?.close(); setLevel(0); };
  }, [value]);
  return (
    <>
      <p>Wähle dein Mikrofon und sprich ein paar Worte. Der Balken zeigt, ob es etwas hört.</p>
      {error && <p className="err">{error} <button className="btn small" onClick={reload}>Erneut versuchen</button></p>}
      <select value={value} onChange={(e) => onPick(e.target.value)}>
        <option value="">Bitte wählen …</option>
        {list.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${i + 1}`}</option>)}
      </select>
      <div className="meter"><i style={{ width: `${level}%` }} /></div>
    </>
  );
}

function CamStep({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  const { list, error, reload } = useDevices("videoinput");
  const vid = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!value) return;
    let stream: MediaStream | undefined; let stop = false;
    navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: value } } }).then((s) => {
      if (stop) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s; if (vid.current) vid.current.srcObject = s;
    }).catch(() => {});
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [value]);
  return (
    <>
      <p>Wähle deine Kamera. Du siehst unten ein Testbild. Kamera ist optional, du kannst auch überspringen.</p>
      {error && <p className="err">{error} <button className="btn small" onClick={reload}>Erneut versuchen</button></p>}
      <select value={value} onChange={(e) => onPick(e.target.value)}>
        <option value="">Keine Kamera</option>
        {list.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Kamera ${i + 1}`}</option>)}
      </select>
      {value && <video ref={vid} autoPlay muted playsInline className="camtest" />}
    </>
  );
}

function guessEncoder(gpus: string[]): { id: "nvenc" | "amf" | "qsv" | "x264"; label: string } {
  const g = gpus.join(" ").toLowerCase();
  if (g.includes("nvidia")) return { id: "nvenc", label: "NVIDIA NVENC" };
  if (g.includes("amd") || g.includes("radeon")) return { id: "amf", label: "AMD AMF" };
  if (g.includes("intel")) return { id: "qsv", label: "Intel Quick Sync" };
  return { id: "x264", label: "x264 (Software)" };
}

export function Wizard({ onDone }: { onDone: () => void }) {
  const { set, toast } = useStore();
  const [i, setI] = useState(0);
  const [lang, setLang] = useState("de");
  const [mic, setMic] = useState("");
  const [cam, setCam] = useState("");
  const [hw, setHw] = useState<Hw | null>(null);
  const [net, setNet] = useState<NetEntry[] | null>(null);
  const [preset, setPreset] = useState("1080p30");
  const [alerts, setAlerts] = useState<Record<string, boolean>>({ follow: true, sub: true, bits: true, raid: true });
  const enc = guessEncoder(hw?.gpus ?? []);
  const chosen = QUALITY_PRESETS.find((p) => p.id === preset)!;

  useEffect(() => { if (i === 4 && !hw) api.hardware().then(setHw).catch((e) => toast(errText(e), "error")); }, [i]); // eslint-disable-line
  const runNet = () => { setNet(null); api.net().then(setNet).catch((e) => toast(errText(e), "error")); };
  useEffect(() => { if (i === 5 && !net) runNet(); }, [i]); // eslint-disable-line

  const finish = async () => {
    try {
      await set("language", lang);
      await set("mic_id", mic); await set("cam_id", cam);
      await set("encoder_pref", enc.id);
      await set("video", JSON.stringify({ width: chosen.width, height: chosen.height, fps: chosen.fps, bitrate: chosen.bitrate }));
      await set("alerts_wanted", JSON.stringify(alerts));
      await api.stateSet("wizard_done", "1");
      onDone();
    } catch (e) { toast(errText(e), "error"); }
  };

  const body = [
    <>
      <p>In welcher Sprache möchtest du IBIS IV nutzen?</p>
      <div className="choices">
        <button className={`choice ${lang === "de" ? "sel" : ""}`} onClick={() => setLang("de")}>Deutsch</button>
        <button className={`choice ${lang === "en" ? "sel" : ""}`} onClick={() => setLang("en")}>English</button>
      </div>
      {lang === "en" && <p className="muted">Die englische Oberfläche ist noch nicht übersetzt. Deine Wahl wird gespeichert, bis dahin bleibt die Oberfläche deutsch.</p>}
    </>,
    <>
      <p>Die Twitch-Anmeldung wird in Phase 5 eingebaut. Dafür ist ein einmaliger, offizieller Anmeldevorgang im Browser nötig, ohne dass IBIS IV dein Passwort sieht.</p>
      <p className="unavail-inline"><span className="badge">Phase 5</span> Noch nicht verfügbar. Du kannst den Schritt überspringen und später in den Einstellungen verbinden.</p>
    </>,
    <MicStep value={mic} onPick={setMic} />,
    <CamStep value={cam} onPick={setCam} />,
    <>
      <p>IBIS IV liest deine Hardware aus, um den passenden Encoder vorzuschlagen.</p>
      {!hw ? <p className="muted">Prüfe …</p> : (
        <dl className="kv">
          <dt>System</dt><dd>{hw.os}</dd>
          <dt>Prozessor</dt><dd>{hw.cpu} ({hw.cores} Threads)</dd>
          <dt>Arbeitsspeicher</dt><dd>{(hw.ram / 1024 ** 3).toFixed(1)} GB</dd>
          <dt>Grafikkarte(n)</dt><dd>{hw.gpus.length ? hw.gpus.join(", ") : "Nicht erkannt"}</dd>
          <dt>Vorgeschlagener Encoder</dt><dd><b>{enc.label}</b></dd>
        </dl>
      )}
      <p className="muted">Der Vorschlag beruht auf dem Hersteller der Grafikkarte. Ob der Encoder wirklich funktioniert, prüft IBIS IV, sobald die Streaming-Engine eingebaut ist (Phase 3).</p>
    </>,
    <>
      <p>Verbindung zu Twitch und zum Internet:</p>
      {!net ? <p className="muted">Prüfe …</p> : (
        <ul className="checks">{net.map((n) => (
          <li key={n.host} className={n.ok ? "ok" : "error"}><span>{n.ok ? "✔" : "✖"}</span>{n.host.replace(":443", "")}<em>{n.ok ? `${n.ms} ms` : "nicht erreichbar"}</em></li>
        ))}</ul>
      )}
      {net?.some((n) => !n.ok) && <p className="err">Mindestens ein Ziel ist nicht erreichbar. Prüfe deine Internetverbindung, Firewall oder VPN.</p>}
      <button className="btn small" onClick={runNet}>Erneut prüfen</button>
      <p className="muted">Die Upload-Geschwindigkeit kann IBIS IV ohne Teststrecke nicht zuverlässig messen. Wähle die Bitrate im nächsten Schritt vorsichtig.</p>
    </>,
    <>
      <p>Wähle eine Ausgangsqualität. Du kannst sie später jederzeit ändern.</p>
      <div className="choices col">
        {QUALITY_PRESETS.map((p) => (
          <button key={p.id} className={`choice ${preset === p.id ? "sel" : ""}`} onClick={() => setPreset(p.id)}>
            <b>{p.label}</b><small>{p.bitrate} kbps · {p.note}</small>
          </button>
        ))}
      </div>
      {checkTwitch(chosen).map((h, k) => <p key={k} className={h.level === "ok" ? "okmsg" : "err"}>{h.text}</p>)}
    </>,
    <>
      <p>Welche Ereignisse sollen später Alerts auslösen?</p>
      <div className="choices col">
        {[["follow", "Neuer Follower"], ["sub", "Abonnements und Geschenk-Abos"], ["bits", "Bits und Cheers"], ["raid", "Raids"]].map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={alerts[k]} onChange={(e) => setAlerts({ ...alerts, [k]: e.target.checked })} />{l}</label>
        ))}
      </div>
      <p className="unavail-inline"><span className="badge">Phase 6</span> Das Alert-System selbst folgt später. Deine Auswahl wird vorgemerkt.</p>
    </>,
    <>
      <p>Alles bereit. Deine Auswahl:</p>
      <dl className="kv">
        <dt>Sprache</dt><dd>{lang === "de" ? "Deutsch" : "English"}</dd>
        <dt>Qualität</dt><dd>{chosen.label}, {chosen.bitrate} kbps</dd>
        <dt>Encoder</dt><dd>{enc.label}</dd>
        <dt>Mikrofon</dt><dd>{mic ? "gewählt" : "keins"}</dd>
        <dt>Kamera</dt><dd>{cam ? "gewählt" : "keine"}</dd>
      </dl>
    </>,
  ];

  return (
    <div className="wizard">
      <div className="wizard-card">
        <header><Logo size={44} /><div><h1>Willkommen bei IBIS IV</h1><p className="muted">Schritt {i + 1} von {STEPS.length}: {STEPS[i]}</p></div></header>
        <div className="progress"><i style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>
        <div className="wizard-body">{body[i]}</div>
        <footer>
          <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Zurück</button>
          {i < STEPS.length - 1
            ? <button className="btn primary" onClick={() => setI(i + 1)}>{[1, 3].includes(i) && !(i === 3 ? cam : "") ? "Überspringen" : "Weiter"}</button>
            : <button className="btn primary" onClick={finish}>Fertigstellen</button>}
        </footer>
      </div>
    </div>
  );
}
