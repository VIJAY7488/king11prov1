interface StepsBarProps {
  current: number;
  steps: string[];
}

export function StepsBar({ current, steps }: StepsBarProps) {
  return (
    <div className="flex items-center mb-6">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center flex-1">
          {/* Circle */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all ${
                i < current
                  ? "bg-[#EA4800] text-white"
                  : i === current
                  ? "bg-[#FFF0EA] border-2 border-[#EA4800] text-[#EA4800]"
                  : "bg-[#F4F1EC] border-[1.5px] border-[#E8E0D4] text-[#7A6A55]"
              }`}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span
              className={`text-[0.7rem] font-semibold hidden sm:inline ${
                i === current ? "text-[#EA4800] font-bold" : i < current ? "text-[#EA4800]" : "text-[#7A6A55]"
              }`}
            >
              {label}
            </span>
          </div>

          {/* Connector line */}
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 transition-colors ${i < current ? "bg-[#EA4800]" : "bg-[#E8E0D4]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}