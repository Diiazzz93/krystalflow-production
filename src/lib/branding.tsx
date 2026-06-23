import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loadSetting, saveSetting } from "./app-settings-kv";

export type Branding = {
  companyName: string;
  appName: string;
  primaryColor: string; // hex
  secondaryColor: string; // hex
  sidebarLogo: string | null; // data URL
  loginLogo: string | null;
  pdfLogo: string | null;
};

export const DEFAULT_BRANDING: Branding = {
  companyName: "Krystalshield",
  appName: "KrystalFlow",
  primaryColor: "#0e7490",
  secondaryColor: "#38bdf8",
  sidebarLogo: null,
  loginLogo: null,
  pdfLogo: null,
};

const STORAGE_KEY = "ks-branding";
const SETTING_KEY = "branding";

function loadLocal(): Branding {
  if (typeof window === "undefined") return DEFAULT_BRANDING;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_BRANDING;
  }
}

function saveLocal(b: Branding) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

const listeners = new Set<() => void>();
let current: Branding = DEFAULT_BRANDING;

export function getBranding(): Branding {
  return current;
}

export function setBranding(next: Branding) {
  current = next;
  saveLocal(next);
  // Fire-and-forget; UI updates immediately from local cache.
  void saveSetting(SETTING_KEY, next).catch(() => {});
  listeners.forEach((l) => l());
}

type Ctx = {
  branding: Branding;
  update: (patch: Partial<Branding>) => void;
  reset: () => void;
};

const BrandingContext = createContext<Ctx | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setState] = useState<Branding>(DEFAULT_BRANDING);
  const hydrated = useRef(false);

  useEffect(() => {
    current = loadLocal();
    setState(current);
    const fn = () => setState({ ...current });
    listeners.add(fn);

    // Hydrate from backend; if backend is empty but we have local data,
    // push the local data up (one-time migration per device).
    void (async () => {
      const remote = await loadSetting<Partial<Branding>>(SETTING_KEY);
      if (remote && typeof remote === "object") {
        current = { ...DEFAULT_BRANDING, ...remote };
        saveLocal(current);
        listeners.forEach((l) => l());
      } else if (JSON.stringify(current) !== JSON.stringify(DEFAULT_BRANDING)) {
        await saveSetting(SETTING_KEY, current).catch(() => {});
      }
      hydrated.current = true;
    })();

    return () => {
      listeners.delete(fn);
    };
  }, []);

  function update(patch: Partial<Branding>) {
    setBranding({ ...current, ...patch });
  }
  function reset() {
    setBranding(DEFAULT_BRANDING);
  }

  return (
    <BrandingContext.Provider value={{ branding, update, reset }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding outside provider");
  return ctx;
}

/** Mock upload: reads a File and returns a data URL. Swap for real storage upload later. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return [14, 116, 144];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
