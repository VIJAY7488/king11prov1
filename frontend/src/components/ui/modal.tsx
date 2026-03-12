import { useEffect, type ReactNode } from "react";

interface ModalProps {
  show: boolean;
  onClose: () => void;
  title: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  footer?: ReactNode;
}

const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

export function Modal({ show, onClose, title, size = "md", children, footer }: ModalProps) {
  useEffect(() => {
    document.body.style.overflow = show ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[rgba(26,18,8,.55)] backdrop-blur-sm animate-[fadeIn_.2s_ease]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl w-full ${widths[size]} max-h-[92vh] overflow-y-auto shadow-[0_24px_80px_rgba(26,18,8,.2)] animate-[scaleIn_.22s_ease]`}
        onClick={(e) => e.stopPropagation()}
        style={{
          animationName: "scaleIn",
          animationDuration: ".22s",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b-[1.5px] border-[#E8E0D4]">
          <h2 className="font-display font-bold text-[1.075rem] text-[#1A1208]">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#F4F1EC] border-none text-[#7A6A55] flex items-center justify-center hover:bg-[#FFF0EA] hover:text-[#EA4800] transition-colors text-base"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex gap-3 justify-end px-6 py-4 border-t-[1.5px] border-[#E8E0D4]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}