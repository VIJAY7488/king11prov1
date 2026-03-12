import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { useApp } from "@/context/AppContext";

type TxType = "DEPOSIT" | "DEDUCTION" | "REFUND" | "JOIN_CONTEST" | "WIN_PRIZE" | "WITHDRAWAL";
type TxStatus = "PENDING" | "SUCCESS" | "FAILED" | "REVERSED";

interface TransactionItem {
  id: string;
  userId: string;
  type: TxType;
  status: TxStatus;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const TYPE_LABEL: Record<TxType, string> = {
  DEPOSIT: "Add Money",
  DEDUCTION: "Deduction",
  REFUND: "Refund",
  JOIN_CONTEST: "Entry Fee",
  WIN_PRIZE: "Winning Prize",
  WITHDRAWAL: "Withdrawal",
};

const STATUS_STYLE: Record<TxStatus, string> = {
  SUCCESS: "bg-green-100 text-green-700",
  PENDING: "bg-amber-100 text-amber-700",
  FAILED: "bg-red-100 text-red-700",
  REVERSED: "bg-blue-100 text-blue-700",
};

function amountSign(t: TransactionItem): 1 | -1 {
  return t.balanceAfter >= t.balanceBefore ? 1 : -1;
}

export function TransactionsPage() {
  const navigate = useNavigate();
  const { toast } = useApp();

  const [rows, setRows] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [typeFilter, setTypeFilter] = useState<"" | TxType>("");
  const [statusFilter, setStatusFilter] = useState<"" | TxStatus>("");

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("limit", "20");
      if (typeFilter) q.set("type", typeFilter);
      if (statusFilter) q.set("status", statusFilter);

      const res = await api.get(`/users/wallet/transactions?${q.toString()}`);
      const data = res.data?.data;
      setRows(data?.transactions ?? []);
      setTotalPages(Math.max(1, Number(data?.totalPages ?? 1)));
    } catch (err) {
      toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Failed to load transactions") });
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [page, typeFilter, statusFilter]);

  const title = useMemo(() => {
    if (typeFilter) return `${TYPE_LABEL[typeFilter]} Transactions`;
    return "All Wallet Transactions";
  }, [typeFilter]);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
      <button onClick={() => navigate("/profile")} className="text-sm font-bold text-[#EA4800] mb-4 hover:underline">
        ← Back to Profile
      </button>

      <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl overflow-hidden shadow-sm" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
        <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-5 py-3.5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display font-black text-xl text-[#1A1208]">📒 {title}</h1>
            <p className="text-xs text-[#7A6A55]">Add money, entry fee, winnings and withdrawal transactions</p>
          </div>
          <div className="flex gap-2">
            <select
              value={typeFilter}
              onChange={(e) => { setPage(1); setTypeFilter((e.target.value || "") as any); }}
              className="h-9 rounded-lg border border-[#E8E0D4] bg-white text-sm px-2 text-[#1A1208]"
            >
              <option value="">All Types</option>
              {Object.keys(TYPE_LABEL).map((t) => <option key={t} value={t}>{TYPE_LABEL[t as TxType]}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setPage(1); setStatusFilter((e.target.value || "") as any); }}
              className="h-9 rounded-lg border border-[#E8E0D4] bg-white text-sm px-2 text-[#1A1208]"
            >
              <option value="">All Status</option>
              {Object.keys(STATUS_STYLE).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-[#F4F1EC] rounded-lg animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-[#7A6A55] text-sm">No transactions found.</div>
        ) : (
          <div className="divide-y divide-[#E8E0D4]">
            {rows.map((t) => {
              const sign = amountSign(t);
              return (
                <div key={t.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[#1A1208]">{TYPE_LABEL[t.type] ?? t.type}</p>
                    <p className="text-xs text-[#7A6A55]">{new Date(t.createdAt).toLocaleString("en-IN")}</p>
                    <p className="text-[0.68rem] text-[#B0A090] font-mono truncate">{t.referenceId ?? t.id}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-display font-black text-lg ${sign > 0 ? "text-green-700" : "text-red-600"}`}>
                      {sign > 0 ? "+" : "-"}₹{Math.abs(Number(t.amount)).toLocaleString("en-IN")}
                    </div>
                    <div className="text-[0.68rem] text-[#7A6A55]">
                      Bal: ₹{Number(t.balanceBefore).toLocaleString("en-IN")} → ₹{Number(t.balanceAfter).toLocaleString("en-IN")}
                    </div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[0.62rem] font-bold ${STATUS_STYLE[t.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {t.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="px-5 py-3 border-t border-[#E8E0D4] bg-[#FAFAF8] flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-[#E8E0D4] text-sm font-semibold disabled:opacity-50"
          >
            Previous
          </button>
          <div className="text-sm font-semibold text-[#7A6A55]">Page {page} / {totalPages}</div>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 rounded-lg border border-[#E8E0D4] text-sm font-semibold disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}