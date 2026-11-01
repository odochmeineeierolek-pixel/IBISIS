import { useCallback, useEffect, useRef, useState } from "react";
import { api, errText } from "./lib/api";
import { DOCKS, DOCK_IDS, Layout, WORKSPACES, WORKSPACE_NAMES, parseLayout, toggleDock, visibleIds } from "./lib/layout";
import { StoreProvider, useStore } from "./store";
import { Logo } from "./components/Logo";
import { Workspace } from "./components/Workspace";
import { Wizard } from "./components/Wizard";
import { Settings } from "./components/Settings";
import { Repair } from "./components/Repair";

type View = "main" | "settings" | "repair" | "about";
interface MenuItem { label: string; onClick?: () => void; checked?: boolean; sep?: boolean }

function Menu({ title, items }: { title: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="menu" ref={ref}>
      <button className={open ? "sel" : ""} onClick={() => setOpen(!open)}>{title}</button>
      {open && <div className="dropdown">{items.map((it, i) => it.sep ? <hr key={i} /> : (
        <button key={i} onClick={() => { setOpen(false); it.onClick?.(); }}><span className="tick">{it.checked ? "✔" : ""}</span>{it.label}</button>
      ))}</div>}
    </div>
  );
}

function Shell({ wizardDone, setWizardDone }: { wizardDone: boolean; setWizardDone: (v: boolean) => void }) {
  const { s, set, reload, toast } = useStore();
  const [view, setView] = useState<View>("main");
  const [profiles, setProfiles] = useState<{ id: number; name: string; active: boolean }[]>([]);
  const workspace = s.workspace ?? "Standard";
  const layout: Layout = parseLayout(s.layout) ?? WORKSPACES[workspace] ?? WORKSPACES.Standard;
  const saveTimer = useRef<number>();

  useEffect(() => { api.profiles().then(setProfiles).catch(() => {}); }, [s]);
  useEffect(() => { document.documentElement.dataset.calm = s.reduce_motion === "1" ? "1" : "0"; }, [s.reduce_motion]);

  const applyLayout = useCallback((l: Layout, name?: string) => {
    const ws = name ?? "Custom Workspace";
    void set("layout", JSON.stringify(l));
    void set("workspace", ws);
    if (ws === "Custom Workspace") {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void set("layout_custom", JSON.stringify(l)), 400);
    }
  }, [set]);

  const pickWorkspace = (n: string) => {
    if (n === "Custom Workspace") applyLayout(parseLayout(s.layout_custom) ?? layout, n);
    else applyLayout(WORKSPACES[n], n);
  };

  if (!wizardDone) return <Wizard onDone={() => { setWizardDone(true); void reload(); }} />;

  const open = (v: string) => setView(v as View);
  const shown = visibleIds(layout);

  return (
    <div className="app">
      <div className="menubar">
        <div className="brand"><Logo size={22} /><b>IBIS IV</b></div>
        <Menu title="Datei" items={[
          { label: "Einstellungen", onClick: () => setView("settings") },
          { label: "Reparatur & Sicherung", onClick: () => setView("repair") },
          { sep: true, label: "" },
          { label: "Beenden", onClick: () => window.close() },
        ]} />
        <Menu title="Ansicht" items={[
          ...WORKSPACE_NAMES.map((n) => ({ label: n, checked: n === workspace, onClick: () => { setView("main"); pickWorkspace(n); } })),
          { sep: true, label: "" },
          ...DOCK_IDS.map((d) => ({ label: DOCKS[d], checked: shown.includes(d), onClick: () => { setView("main"); applyLayout(toggleDock(layout, d)); } })),
        ]} />
        <Menu title="Profile" items={profiles.map((p) => ({
          label: p.name, checked: p.active,
          onClick: async () => { try { await api.profileSwitch(p.id); await reload(); } catch (e) { toast(errText(e), "error"); } },
        }))} />
        <Menu title="Hilfe" items={[
          { label: "Nach Updates suchen", onClick: () => setView("settings") },
          { label: "Über IBIS IV", onClick: () => setView("about") },
        ]} />
        <div className="grow" />
        <span className="ws">{workspace}</span>
      </div>
      {view === "main" && <Workspace layout={layout} onChange={(l) => applyLayout(l)} openView={open} />}
      {view !== "main" && (
        <div className="view">
          <button className="btn back" onClick={() => setView("main")}>← Zurück zum Studio</button>
          {view === "settings" && <Settings onRerunWizard={async () => { await api.stateSet("wizard_done", "0"); setWizardDone(false); setView("main"); }} />}
          {view === "repair" && <Repair />}
          {view === "about" && (
            <div className="page about">
              <Logo size={96} /><h2>IBIS IV</h2><p>Version 0.1.0 (Phase 1: Grundgerüst)</p>
              <p>Your stream. Your control.</p>
              <p className="muted">Freie Software unter GPL-2.0-or-later. Die Streaming-Engine (libobs, FFmpeg) ist noch nicht eingebaut.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [wizardDone, setWizardDone] = useState(true);
  const onReady = useCallback(() => {
    api.stateGet("wizard_done").then((v) => { setWizardDone(v === "1"); setReady(true); }).catch(() => setReady(true));
  }, []);
  return (
    <StoreProvider onReady={onReady}>
      {ready ? <Shell wizardDone={wizardDone} setWizardDone={setWizardDone} /> : <div className="splash"><Logo size={72} /></div>}
    </StoreProvider>
  );
}
