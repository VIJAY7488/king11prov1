import { useState, useCallback } from "react";
import type { ToastItem, ToastType } from "@/types";

let _id = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (opts: { type: ToastType; icon?: string; msg: string }) => {
      const id = ++_id;
      setToasts((prev) => [...prev, { ...opts, id }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
    },
    []
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}