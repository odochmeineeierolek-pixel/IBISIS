export interface VideoSettings { width: number; height: number; fps: number; bitrate: number }
export interface Hint { level: "ok" | "warn" | "error"; text: string }

/**
 * Prüft Einstellungen gegen die bekannten Twitch-Grenzen (RTMP: bis 1080p60,
 * empfohlen bis ca. 6000 kbps, Obergrenze ca. 8500 kbps). Twitch ändert diese
 * Werte gelegentlich – die Texte weisen darauf hin.
 */
export function checkTwitch(v: VideoSettings): Hint[] {
  const out: Hint[] = [];
  if (v.height > 1080 || v.width > 1920) {
    out.push({
      level: "error",
      text: "Twitch nimmt über den normalen Weg keine Auflösung über 1080p an. Mit dieser Einstellung kannst du lokal aufnehmen, aber nicht zu Twitch senden. Nur ausgewählte Konten können über „Enhanced Broadcasting“ bis 1440p senden.",
    });
  }
  if (v.fps > 60) {
    out.push({ level: "error", text: "Twitch unterstützt höchstens 60 Bilder pro Sekunde." });
  }
  if (v.bitrate > 8500) {
    out.push({ level: "warn", text: "Diese Bitrate liegt über dem, was Twitch zuverlässig annimmt (empfohlen: bis 6000 kbps, Obergrenze etwa 8500 kbps). Der Stream kann abbrechen." });
  } else if (v.bitrate < 1000) {
    out.push({ level: "warn", text: "Unter 1000 kbps wird das Bild sehr unscharf." });
  }
  if (out.length === 0) out.push({ level: "ok", text: "Diese Einstellung passt zu den Twitch-Vorgaben (Stand der Entwicklung; prüfe die aktuellen Twitch-Richtlinien)." });
  return out;
}

export const QUALITY_PRESETS = [
  { id: "720p30", label: "720p, 30 FPS", width: 1280, height: 720, fps: 30, bitrate: 3500, note: "Für schwächere Rechner und Internetleitungen." },
  { id: "1080p30", label: "1080p, 30 FPS", width: 1920, height: 1080, fps: 30, bitrate: 4500, note: "Guter Standard für die meisten Streams." },
  { id: "1080p60", label: "1080p, 60 FPS", width: 1920, height: 1080, fps: 60, bitrate: 6000, note: "Flüssig für schnelle Spiele. Braucht mehr Upload." },
  { id: "4k", label: "4K, 30 FPS (nur Aufnahme)", width: 3840, height: 2160, fps: 30, bitrate: 20000, note: "Twitch nimmt kein 4K an. Gilt für lokale Aufnahme." },
] as const;
