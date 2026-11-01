import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { api, errText } from "./lib/api";

interface Ctx {
  s: Record<string, string>;
  set: (key: string, value: string) => Promise<void>;
  reload: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "error") => void;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useStore = () => useContext(C);

export function StoreProvider({ children, onReady }: { children: ReactNode; onReady?: () => void }) {
  const [s, setS] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; kind: string } | null>(null);

  const reload = useCallback(async () => {
    setS(await api.settingsAll());
  }, []);

  useEffect(() => {
    reload().then(onReady).catch((e) => setMsg({ text: errText(e), kind: "error" }));
  }, [reload, onReady]);

  const set = useCallback(async (key: string, value: string) => {
    setS((p) => ({ ...p, [key]: value }));
    try {
      await api.settingSet(key, value);
    } catch (e) {
      setMsg({ text: `Einstellung konnte nicht gespeichert werden: ${errText(e)}`, kind: "error" });
    }
  }, []);

  const toast = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    setMsg({ text, kind });
    window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 5000);
  }, []);

  return (
    <C.Provider value={{ s, set, reload, toast }}>
      {children}
      {msg && <div className={`toast ${msg.kind}`} role="status">{msg.text}</div>}
    </C.Provider>
  );
}
