import { useApp } from "@/context/AppContext";

export default function ToastContainer() {
  const { toasts, removeToast } = useApp();

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const bg = t.type === "success" ? "bg-green-50 border-green-200 text-green-800"
                 : t.type === "error"   ? "bg-red-50 border-red-200 text-red-800"
                 : "bg-[#FAFAF8] border-[#E8E0D4] text-[#1A1208]";

        return (
          <div
            key={t.id}
            onClick={() => removeToast(t.id)}
            className={`pointer-events-auto cursor-pointer border-[1.5px] rounded-xl px-4 py-3 shadow-lg flex items-center gap-3 w-80 translate-y-2 opacity-0 animate-[fadeSlide_0.3s_forwards] ${bg}`}
          >
            {t.icon && <span className="text-xl shrink-0">{t.icon}</span>}
            <span className="text-sm font-bold flex-1">{t.msg}</span>
            <button className="text-current opacity-50 hover:opacity-100 font-bold ml-2">×</button>
          </div>
        );
      })}
      <style>{`
        @keyframes fadeSlide {
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}