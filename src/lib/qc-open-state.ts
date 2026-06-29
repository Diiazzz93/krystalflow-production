import { useEffect, useState } from "react";

// Survives iOS WebView reloads that can happen after the camera/file picker.
const KEY = "qc-open-job";

export function usePersistedQcId() {
  const [qcId, setQcIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (qcId) sessionStorage.setItem(KEY, qcId);
      else sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, [qcId]);

  return [qcId, setQcIdState] as const;
}
