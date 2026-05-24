import * as React from "react";

const TABLET_MIN = 768; // md
const DESKTOP_MIN = 1024; // lg

export type Breakpoint = "mobile" | "tablet" | "desktop";

function read(): Breakpoint {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < TABLET_MIN) return "mobile";
  if (w < DESKTOP_MIN) return "tablet";
  return "desktop";
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = React.useState<Breakpoint>(() => read());

  React.useEffect(() => {
    const onResize = () => setBp(read());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return bp;
}

export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = React.useState(false);
  React.useEffect(() => {
    setTouch(
      "ontouchstart" in window ||
        (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 0,
    );
  }, []);
  return touch;
}
