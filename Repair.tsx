import { useCallback, useEffect, useState } from "react";
import { api, BackupInfo, Check, errText } from "../lib/api";
import { useStore } from "../store";

const ICON = { ok: "✔", warn: "!", error: "✖", na: "–" } as const;

export function Repair() {
  const { toast, reload } = useStore();
  const [checks, setChecks] = useState<Check[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [log, setLog] = useState("");
  const [filter, setFilter] = useState<"ALL" | "WARN" | "ERROR">("ALL");
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try { setChecks(await api.repairCheck()); setBackups(await api.backups()); setLog(await api.logRead(500)); }
    catch (e) { toast(errText(e), "error"); } finally { setBusy(false); }
  }, [toast]);
  useEffect(() => { void run(); }, [run]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try { await fn(); toast(okMsg); await run(); } catch (e) { toast(errText(e), "error"); }
  };
  const shown = log.split("\n").filter((l) => filter === "ALL" || (filter === "ERROR" ? /\[(ERROR|PANIC)\]/.test(l) : /\[(WARN|ERROR|PANIC)\]/.test(l))).join("\n");

  return (
    <div className="page">
      <h2>Installation prüfen</h2>
      <ul className="checks">
        {checks.map((c) => (
          <li key={c.id} className={c.status}>
            <span>{ICON[c.status]}</span>
            <div><b>{c.title}</b><small>{c.detail}</small></div>
            {c.fixable && <button className="btn small primary" onClick={() => act(async () => { toast(await api.repairFix(c.id)); }, "Behoben.")}>Automatisch beheben</button>}
          </li>
        ))}
      </ul>
      <button className="btn" disabled={busy} onClick={run}>Erneut prüfen</button>

      <h2>Einstellungen sichern und wiederherstellen</h2>
      <button className="btn primary" onClick={() => act(() => api.backupCreate(), "Sicherung erstellt.")}>Jetzt sichern</button>
      <ul className="list backups">
        {backups.length === 0 && <li className="empty">Noch keine Sicherung.</li>}
        {backups.map((b) => (
          <li key={b.name}>
            <span>{b.created}<small>{(b.size / 1024).toFixed(0)} KB</small></span>
            <button className="btn small" onClick={() => { if (window.confirm(`Alle Einstellungen und Profile auf den Stand vom ${b.created} zurücksetzen?`)) act(async () => { await api.backupRestore(b.name); await reload(); }, "Wiederhergestellt."); }}>Wiederherstellen</button>
            <button className="mini" title="Sicherung löschen" onClick={() => act(() => api.backupDelete(b.name), "Gelöscht.")}>✕</button>
          </li>
        ))}
      </ul>

      <h2>Protokoll</h2>
      <div className="row">
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="ALL">Alles</option><option value="WARN">Warnungen und Fehler</option><option value="ERROR">Nur Fehler</option>
        </select>
        <button className="btn small" onClick={() => api.logRead(500).then(setLog)}>Aktualisieren</button>
        <button className="btn small" onClick={() => navigator.clipboard.writeText(shown).then(() => toast("Protokoll kopiert."))}>Kopieren</button>
      </div>
      <pre className="log">{shown || "Keine Einträge."}</pre>
    </div>
  );
}
