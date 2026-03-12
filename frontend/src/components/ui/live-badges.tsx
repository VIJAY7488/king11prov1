import { useState, useEffect } from "react";

export function LiveBadge({ over }: { over?: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn((p) => !p), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5 bg-[#EA4800] text-white text-[0.7rem] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wide">
      <span
        className="w-1.5 h-1.5 rounded-full bg-white"
        style={{ opacity: on ? 1 : 0.3, transition: "opacity 0.1s" }}
      />
      {over ? `LIVE · ${over} OV` : "LIVE"}
    </span>
  );
}

export function UpcomingBadge({ timeLeft }: { timeLeft?: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-[#FFF0EA] text-[#EA4800] border border-[#FFDDCC] text-[0.7rem] font-bold px-2.5 py-1 rounded-md">
      ⏱ {timeLeft}
    </span>
  );
}