import { useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { api } from "../lib/api";

type Phase = "idle" | "checking" | "none" | "available" | "downloading" | "ready" | "error";

function friendly(e: unknown): string {
  const t = String(e);
  if (/pubkey|signature|base64/i.test(t)) return "Der Update-Schlüssel ist nicht eingerichtet. Das ist eine Einstellung des Entwicklers, an deinem Rechner ist nichts kaputt.";
  if (/404|not found|status/i.test(t)) return "Auf dem Update-Server wurde keine Update-Information gefunden.";
  if (/network|connect|dns|timed out|error sending/i.test(t)) return "Der Update-Server ist nicht erreichbar. Prüfe deine Internetverbindung.";
  return `Die Suche nach Updates ist fehlgeschlagen: ${t}`;
}

export function Updates() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [upd, setUpd] = useState<Update | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");

  const search = async () => {
    setPhase("checking"); setErr("");
    try {
      const u = await check();
      if (u) { setUpd(u); setPhase("available"); } else setPhase("none");
    } catch (e) { void api.logWrite("WARN", `Update-Suche: ${e}`); setErr(friendly(e)); setPhase("error"); }
  };

  const install = async () => {
    if (!upd) return;
    setPhase("downloading"); setDone(0);
    try {
      await api.backupCreate().catch(() => {}); // Einstellungen vor dem Update sichern
      await upd.downloadAndInstall((ev) => {
        if (ev.event === "Started") setTotal(ev.data.contentLength ?? 0);
        if (ev.event === "Progress") setDone((d) => d + ev.data.chunkLength);
      });
      setPhase("ready");
    } catch (e) { void api.logWrite("ERROR", `Update-Installation: ${e}`); setErr(friendly(e)); setPhase("error"); }
  };

  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <p>Aktuelle Version: <b>0.1.0</b></p>
      {(phase === "idle" || phase === "none" || phase === "error") && <button className="btn primary" onClick={search}>Nach Updates suchen</button>}
      {phase === "checking" && <p className="muted">Suche …</p>}
      {phase === "none" && <p className="okmsg">Du nutzt die neueste Version.</p>}
      {phase === "available" && upd && (
        <>
          <p>Version <b>{upd.version}</b> ist verfügbar.</p>
          {upd.body && <pre className="log small">{upd.body}</pre>}
          <button className="btn primary" onClick={install}>Herunterladen und installieren</button>
        </>
      )}
      {phase === "downloading" && (<><p>Lade herunter … {total ? `${pct} %` : ""}</p><div className="progress"><i style={{ width: `${pct}%` }} /></div></>)}
      {phase === "ready" && (<><p className="okmsg">Update installiert. IBIS IV muss neu starten.</p><button className="btn primary" onClick={() => relaunch()}>Jetzt neu starten</button></>)}
      {phase === "error" && <p className="err">{err}</p>}
    </div>
  );
}
