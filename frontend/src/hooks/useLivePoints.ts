import { useState, useEffect } from "react";

export function useLivePoints(initial: number, active = true): number {
  const [pts, setPts] = useState(initial);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (Math.random() > 0.65) {
        setPts((p) => p + Math.floor(Math.random() * 8) + 1);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [active]);

  return pts;
}