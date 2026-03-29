import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { useAuthStore } from "@/store/authStore";
import { useApp } from "@/context/AppContext";

type Outcome = "YES" | "NO";
type TradeSide = "BUY" | "SELL";
type UiOrderType = "MARKET" | "LIMIT";

interface MarketItem {
  id?: string;
  _id?: string;
  question?: string;
  status?: string;
  closeAt?: string;
  category?: string;
  questionPrice?: {
    amount?: number;
    currency?: string;
  };
}

interface BookRow {
  price: number;
  quantity: number;
}

const marketIdOf = (m?: MarketItem | null): string => (m?.id ?? m?._id ?? "");

const normalizeMarkets = (raw: unknown): MarketItem[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => {
      const questionPriceRaw =
        row.questionPrice && typeof row.questionPrice === "object"
          ? (row.questionPrice as Record<string, unknown>)
          : null;

      return {
        id: typeof row.id === "string" ? row.id : undefined,
        _id: typeof row._id === "string" ? row._id : undefined,
        question: typeof row.question === "string" ? row.question : "Untitled Market",
        status: typeof row.status === "string" ? row.status : undefined,
        closeAt: typeof row.closeAt === "string" ? row.closeAt : undefined,
        category: typeof row.category === "string" ? row.category : undefined,
        questionPrice: questionPriceRaw
          ? {
              amount:
                typeof questionPriceRaw.amount === "number"
                  ? questionPriceRaw.amount
                  : Number(questionPriceRaw.amount),
              currency: typeof questionPriceRaw.currency === "string" ? questionPriceRaw.currency : undefined,
            }
          : undefined,
      };
    })
    .filter((row) => !!marketIdOf(row));
};

const normalizeBookRows = (raw: unknown): BookRow[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => {
      const priceRaw = row.price;
      const quantityRaw = row.quantity ?? row.qty;
      const price = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
      const quantity = typeof quantityRaw === "number" ? quantityRaw : Number(quantityRaw);
      return { price, quantity };
    })
    .filter((row) => Number.isFinite(row.price) && Number.isFinite(row.quantity) && row.price >= 0 && row.quantity >= 0);
};

const formatCurrency = (value: number) => `₹${value.toFixed(2)}`;
const formatOdds = (value: number) => `${(value * 100).toFixed(1)}%`;

const formatQuestionPrice = (market?: MarketItem | null) => {
  const amount = market?.questionPrice?.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return `${market?.questionPrice?.currency ?? "INR"} ${amount.toFixed(2)} / share`;
};

const formatTimeLeft = (closeAt?: string) => {
  if (!closeAt) return null;
  const closeTs = new Date(closeAt).getTime();
  if (!Number.isFinite(closeTs)) return null;

  const diff = closeTs - Date.now();
  if (diff <= 0) return "Closed";

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
};

export default function PredictPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { toast } = useApp();

  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState("");
  const [side, setSide] = useState<Outcome>("YES");
  const [tradeSide, setTradeSide] = useState<TradeSide>("BUY");
  const [orderType, setOrderType] = useState<UiOrderType>("MARKET");
  const [quantity, setQuantity] = useState(25);
  const [bids, setBids] = useState<BookRow[]>([]);
  const [asks, setAsks] = useState<BookRow[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingBook, setLoadingBook] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMarket = markets.find((m) => marketIdOf(m) === selectedMarketId) ?? null;

  const bestAsk = asks[0]?.price ?? 0;
  const bestBid = bids[0]?.price ?? 0;
  const contractValue = useMemo(() => {
    const amount = selectedMarket?.questionPrice?.amount;
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) return amount;
    return 10;
  }, [selectedMarket?.questionPrice?.amount]);
  const referenceOdds = tradeSide === "BUY" ? bestAsk : bestBid;
  const fallbackOdds = referenceOdds > 0 ? referenceOdds : 0.5;
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const activeOdds = orderType === "LIMIT" ? (limitPrice > 0 ? limitPrice : fallbackOdds) : fallbackOdds;
  const estCost = useMemo(
    () => Number((quantity * activeOdds * contractValue).toFixed(2)),
    [quantity, activeOdds, contractValue]
  );
  const spreadOdds = useMemo(() => {
    if (bestAsk <= 0 || bestBid <= 0) return null;
    return Number((bestAsk - bestBid).toFixed(4));
  }, [bestAsk, bestBid]);
  const spreadCurrency = useMemo(() => {
    if (spreadOdds === null) return null;
    return Number((spreadOdds * contractValue).toFixed(2));
  }, [spreadOdds, contractValue]);
  const totalBidQty = useMemo(() => bids.reduce((sum, row) => sum + row.quantity, 0), [bids]);
  const totalAskQty = useMemo(() => asks.reduce((sum, row) => sum + row.quantity, 0), [asks]);
  const questionPriceLabel = formatQuestionPrice(selectedMarket);
  const perShareTradeValue = useMemo(
    () => Number((activeOdds * contractValue).toFixed(2)),
    [activeOdds, contractValue]
  );
  const maxSettlementPayout = useMemo(
    () => Number((quantity * contractValue).toFixed(2)),
    [quantity, contractValue]
  );
  const timeLeft = formatTimeLeft(selectedMarket?.closeAt);

  useEffect(() => {
    setLimitPrice(fallbackOdds);
  }, [fallbackOdds]);

  useEffect(() => {
    let active = true;

    async function loadMarkets() {
      setLoadingMarkets(true);
      try {
        const res = await api.get("/markets", {
          params: { status: "OPEN", page: 1, limit: 20, sortBy: "closeAt", sortOrder: "asc" },
          cache: { ttlMs: 15_000, key: "predict-markets" },
        });
        const rows = normalizeMarkets(res.data?.data?.markets);
        if (!active) return;
        setMarkets(rows);
        setSelectedMarketId((prev) => prev || marketIdOf(rows[0]));
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, "Failed to load markets"));
      } finally {
        if (active) setLoadingMarkets(false);
      }
    }

    void loadMarkets();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadBook() {
      if (!selectedMarketId) {
        setBids([]);
        setAsks([]);
        return;
      }

      setLoadingBook(true);
      try {
        const res = await api.get(`/orderbook/${selectedMarketId}`, {
          params: { outcome: side, depth: 10 },
          cache: { ttlMs: 4_000, key: `predict-book:${selectedMarketId}:${side}` },
        });
        if (!active) return;
        setBids(normalizeBookRows(res.data?.data?.buys));
        setAsks(normalizeBookRows(res.data?.data?.sells));
      } catch (err) {
        if (!active) return;
        setBids([]);
        setAsks([]);
        toast({ type: "error", icon: "⚠️", msg: getErrorMessage(err, "Failed to load order book") });
      } finally {
        if (active) setLoadingBook(false);
      }
    }

    void loadBook();
    return () => {
      active = false;
    };
  }, [selectedMarketId, side, toast]);

  const adjustQty = (delta: number) => {
    setQuantity((q) => Math.max(1, q + delta));
  };

  const handlePlace = async () => {
    if (!selectedMarketId) return;

    if (!token) {
      toast({ type: "info", icon: "🔒", msg: "Please login to place prediction trades" });
      navigate("/login");
      return;
    }

    setPlacing(true);
    try {
      const payload = {
        marketId: selectedMarketId,
        outcome: side,
        type: tradeSide,
        quantity,
        optionalLimitPrice: orderType === "LIMIT" && activeOdds > 0 ? activeOdds : undefined,
      };

      const res = await api.post("/trade/execute", payload);
      const route = res.data?.data?.route ?? "UNKNOWN";
      const bookFilled = Number(res.data?.data?.bookFilledQuantity ?? 0);
      const ammFilled = Number(res.data?.data?.ammFilledQuantity ?? 0);
      const filled = Number.isFinite(bookFilled + ammFilled) ? bookFilled + ammFilled : 0;

      if (filled > 0) {
        toast({
          type: "success",
          icon: "✅",
          msg: `${tradeSide} order executed via ${route}. Filled qty: ${filled}`,
        });
      } else {
        toast({
          type: "info",
          icon: "🕒",
          msg: `No instant fill available. Your order was placed on the orderbook.`,
        });
      }

      const bookRes = await api.get(`/orderbook/${selectedMarketId}`, {
        params: { outcome: side, depth: 10 },
        cache: false,
      });
      setBids(normalizeBookRows(bookRes.data?.data?.buys));
      setAsks(normalizeBookRows(bookRes.data?.data?.sells));
    } catch (err) {
      toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Trade execution failed") });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-6 sm:px-6 md:pb-10">
      <div className="overflow-hidden rounded-[32px] border border-[#E8E0D4] bg-[radial-gradient(circle_at_top_left,_rgba(255,120,70,0.14),_transparent_28%),linear-gradient(180deg,_#FFFDF9_0%,_#FFFFFF_100%)] shadow-[0_18px_50px_rgba(26,18,8,0.08)]">
        <div className="border-b border-[#F0E6D8] px-5 py-5 sm:px-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD9C9] bg-[#FFF4EE] px-3 py-1 text-[11px] font-black tracking-[0.18em] text-[#B3470F]">
            SMART ROUTED MARKET
          </div>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-display text-3xl font-black tracking-tight text-[#1A1208] sm:text-4xl">
                Predict
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7A6A55]">
                Trade live yes/no questions with orderbook-first execution. If matching liquidity is not available,
                the remainder can route to AMM automatically.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-[#EFE3D4] bg-white/80 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9B7B63]">Best Bid Odds</p>
                <p className="mt-1 text-lg font-black text-[#1A1208]">{bestBid > 0 ? formatOdds(bestBid) : "--"}</p>
              </div>
              <div className="rounded-2xl border border-[#EFE3D4] bg-white/80 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9B7B63]">Best Ask Odds</p>
                <p className="mt-1 text-lg font-black text-[#1A1208]">{bestAsk > 0 ? formatOdds(bestAsk) : "--"}</p>
              </div>
              <div className="rounded-2xl border border-[#EFE3D4] bg-white/80 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9B7B63]">Spread</p>
                <p className="mt-1 text-lg font-black text-[#1A1208]">{spreadOdds !== null ? formatOdds(spreadOdds) : "--"}</p>
              </div>
              <div className="rounded-2xl border border-[#EFE3D4] bg-white/80 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9B7B63]">Question Price</p>
                <p className="mt-1 text-lg font-black text-[#1A1208]">{questionPriceLabel ?? "--"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          {error && (
            <div className="mb-4 rounded-xl border border-[#FFD1C4] bg-[#FFF5F1] px-3 py-2 text-xs font-bold text-[#B53A0B]">
              {error}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-[28px] border border-[#E8E0D4] bg-[#FFFDF9] p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex-1">
                  <label className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#8A715D]">
                    Select Question
                  </label>
                  <select
                    value={selectedMarketId}
                    onChange={(e) => setSelectedMarketId(e.target.value)}
                    disabled={loadingMarkets || markets.length === 0}
                    className="mt-2 w-full rounded-2xl border border-[#E8E0D4] bg-white px-4 py-3 text-sm font-semibold text-[#1A1208]"
                  >
                    {loadingMarkets && <option>Loading markets...</option>}
                    {!loadingMarkets && markets.length === 0 && <option>No open markets</option>}
                    {markets.map((m) => (
                      <option key={marketIdOf(m)} value={marketIdOf(m)}>
                        {m.question ?? "Untitled Market"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
                  <div className="rounded-2xl bg-[#FFF4EE] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#B06634]">Status</p>
                    <p className="mt-1 text-sm font-black text-[#1A1208]">{selectedMarket?.status ?? "OPEN"}</p>
                  </div>
                  <div className="rounded-2xl bg-[#F7F2EA] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8C7764]">Closes In</p>
                    <p className="mt-1 text-sm font-black text-[#1A1208]">{timeLeft ?? "--"}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-3xl bg-[#1D150E] px-5 py-5 text-white shadow-[0_18px_40px_rgba(26,18,8,0.18)]">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#E7B78D]">
                  {selectedMarket?.category ?? "Live Market"}
                </p>
                <h2 className="mt-2 text-xl font-black leading-tight sm:text-2xl">
                  {selectedMarket?.question ?? "Select a market to view order book"}
                </h2>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[#F6DCC5]">
                  {selectedMarket?.closeAt && Number.isFinite(new Date(selectedMarket.closeAt).getTime()) && (
                    <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">
                      Closes {new Date(selectedMarket.closeAt).toLocaleString("en-IN")}
                    </span>
                  )}
                  {questionPriceLabel && (
                    <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">
                      Admin price {questionPriceLabel}
                    </span>
                  )}
                  <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">
                    Smart router enabled
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#E8E0D4] bg-[#FAF5EE] p-4 sm:p-5">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#8A715D]">Market Snapshot</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0B8A37]">Bid Depth</p>
                  <p className="mt-1 text-lg font-black text-[#1A1208]">{totalBidQty}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D9480F]">Ask Depth</p>
                  <p className="mt-1 text-lg font-black text-[#1A1208]">{totalAskQty}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8A715D]">Selected Side</p>
                  <p className="mt-1 text-lg font-black text-[#1A1208]">{side}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8A715D]">Execution</p>
                  <p className="mt-1 text-lg font-black text-[#1A1208]">{orderType}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-[#E9DDCF] bg-white px-4 py-3 text-sm leading-6 text-[#6F5C4D]">
                The engine tries live bids and asks first. If enough matching liquidity is not available, the remaining
                quantity can route to AMM.
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[28px] border border-[#E8E0D4] bg-[#FAFAF8] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold text-[#1A1208]">Order Book</p>
                  <p className="mt-1 text-xs text-[#7A6A55]">Switch outcome to inspect the active bid and ask ladder.</p>
                </div>
                <div className="inline-flex rounded-2xl border border-[#E8E0D4] bg-white p-1">
                  <button
                    onClick={() => setSide("YES")}
                    className={`rounded-xl px-4 py-2 text-sm font-black transition-all ${
                      side === "YES"
                        ? "bg-[#EA4800] text-white shadow-[0_8px_20px_rgba(234,72,0,.22)]"
                        : "text-[#7A6A55]"
                    }`}
                  >
                    YES
                  </button>
                  <button
                    onClick={() => setSide("NO")}
                    className={`rounded-xl px-4 py-2 text-sm font-black transition-all ${
                      side === "NO"
                        ? "bg-[#1A1208] text-white shadow-[0_8px_20px_rgba(26,18,8,.18)]"
                        : "text-[#7A6A55]"
                    }`}
                  >
                    NO
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-[#D7F0DF] bg-[linear-gradient(180deg,_#FCFFFD_0%,_#F3FFF8_100%)] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#0B8A37]">Bids</p>
                      <p className="mt-1 text-xs text-[#4F6456]">Buyers waiting on {side}</p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#0B8A37]">
                      Depth {totalBidQty}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {bids.map((row, index) => (
                      <div
                        key={`b-${row.price}-${index}`}
                        className="grid grid-cols-[1fr_auto] items-center rounded-2xl bg-white/90 px-3 py-2 shadow-[0_6px_18px_rgba(11,138,55,0.06)]"
                      >
                        <div>
                          <p className="text-lg font-black text-[#0B8A37]">{formatOdds(Number(row.price))}</p>
                          <p className="text-[11px] font-semibold text-[#6D8474]">
                            {formatCurrency(Number(row.price) * contractValue)} / share
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-[#1A1208]">{row.quantity}</p>
                          <p className="text-[11px] font-semibold text-[#6D8474]">Qty</p>
                        </div>
                      </div>
                    ))}
                    {bids.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[#CFE5D5] bg-white/80 px-3 py-6 text-center text-sm font-semibold text-[#7E907F]">
                        No bids available
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-[#F5D9CB] bg-[linear-gradient(180deg,_#FFFDFC_0%,_#FFF4EE_100%)] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#D9480F]">Asks</p>
                      <p className="mt-1 text-xs text-[#8A695B]">Sellers waiting on {side}</p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#D9480F]">
                      Depth {totalAskQty}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {asks.map((row, index) => (
                      <div
                        key={`a-${row.price}-${index}`}
                        className="grid grid-cols-[1fr_auto] items-center rounded-2xl bg-white/90 px-3 py-2 shadow-[0_6px_18px_rgba(217,72,15,0.06)]"
                      >
                        <div>
                          <p className="text-lg font-black text-[#D9480F]">{formatOdds(Number(row.price))}</p>
                          <p className="text-[11px] font-semibold text-[#8A695B]">
                            {formatCurrency(Number(row.price) * contractValue)} / share
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-[#1A1208]">{row.quantity}</p>
                          <p className="text-[11px] font-semibold text-[#8A695B]">Qty</p>
                        </div>
                      </div>
                    ))}
                    {asks.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[#EBCABD] bg-white/80 px-3 py-6 text-center text-sm font-semibold text-[#9C7567]">
                        No asks available
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#E8E0D4] bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8A715D]">Book Status</p>
                  <p className="mt-1 text-sm font-black text-[#1A1208]">{loadingBook ? "Refreshing..." : "Live"}</p>
                </div>
                <div className="rounded-2xl border border-[#E8E0D4] bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8A715D]">Best Bid / Ask</p>
                  <p className="mt-1 text-sm font-black text-[#1A1208]">
                    {bestBid > 0 || bestAsk > 0 ? `${formatOdds(bestBid)} / ${formatOdds(bestAsk)}` : "--"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E8E0D4] bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8A715D]">Spread</p>
                  <p className="mt-1 text-sm font-black text-[#1A1208]">
                    {spreadOdds !== null ? `${formatOdds(spreadOdds)} (${formatCurrency(spreadCurrency ?? 0)})` : "--"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#E8E0D4] bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-[#1A1208]">Trade Ticket</p>
                  <p className="mt-1 text-xs leading-5 text-[#7A6A55]">
                    Configure your side, quantity, and order type. Smart routing checks the book first.
                  </p>
                </div>
                <div className="rounded-full bg-[#FFF4EE] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#B3470F]">
                  {tradeSide} {side}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTradeSide("BUY")}
                  className={`rounded-2xl py-3 text-sm font-black transition-all ${
                    tradeSide === "BUY"
                      ? "bg-[#EA4800] text-white shadow-[0_10px_24px_rgba(234,72,0,.24)]"
                      : "border border-[#E8E0D4] bg-white text-[#7A6A55]"
                  }`}
                >
                  Buy Position
                </button>
                <button
                  onClick={() => setTradeSide("SELL")}
                  className={`rounded-2xl py-3 text-sm font-black transition-all ${
                    tradeSide === "SELL"
                      ? "bg-[#1A1208] text-white shadow-[0_10px_24px_rgba(26,18,8,.18)]"
                      : "border border-[#E8E0D4] bg-white text-[#7A6A55]"
                  }`}
                >
                  Sell Position
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOrderType("MARKET")}
                  className={`rounded-2xl py-2.5 text-xs font-black transition-all ${
                    orderType === "MARKET"
                      ? "border border-[#FFCAB3] bg-[#FFF0EA] text-[#EA4800]"
                      : "border border-[#E8E0D4] text-[#7A6A55]"
                  }`}
                >
                  Market Order
                </button>
                <button
                  onClick={() => setOrderType("LIMIT")}
                  className={`rounded-2xl py-2.5 text-xs font-black transition-all ${
                    orderType === "LIMIT"
                      ? "border border-[#FFCAB3] bg-[#FFF0EA] text-[#EA4800]"
                      : "border border-[#E8E0D4] text-[#7A6A55]"
                  }`}
                >
                  Limit Order
                </button>
              </div>

              <div className="mt-4 rounded-3xl border border-[#E8E0D4] bg-[#FCFAF7] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[#7A6A55]">Live reference</p>
                  <p className="text-xs font-black text-[#1A1208]">
                    {tradeSide === "BUY"
                      ? bestAsk > 0 ? `Best ask ${formatOdds(bestAsk)} (${formatCurrency(bestAsk * contractValue)})` : "No ask liquidity"
                      : bestBid > 0 ? `Best bid ${formatOdds(bestBid)} (${formatCurrency(bestBid * contractValue)})` : "No bid liquidity"}
                  </p>
                </div>

                {orderType === "LIMIT" && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-[#7A6A55]">Limit Price</p>
                    <input
                      value={limitPrice > 0 ? limitPrice : ""}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        if (!Number.isFinite(raw)) {
                          setLimitPrice(0);
                          return;
                        }
                        const clamped = Math.min(0.99, Math.max(0.01, Number(raw.toFixed(2))));
                        setLimitPrice(clamped);
                      }}
                      className="mt-2 h-11 w-full rounded-2xl border border-[#E8E0D4] bg-white px-4 text-sm font-black text-[#1A1208]"
                      inputMode="decimal"
                      placeholder="0.65"
                    />
                  </div>
                )}

                <div className={`${orderType === "LIMIT" ? "mt-4" : "mt-0"} rounded-2xl border border-[#E8E0D4] bg-white p-3`}>
                  <p className="text-xs font-bold text-[#7A6A55]">Quantity</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => adjustQty(-5)}
                      className="h-10 w-10 rounded-xl border border-[#E8E0D4] text-lg font-black text-[#7A6A55]"
                    >
                      -
                    </button>
                    <input
                      value={quantity}
                      onChange={(e) => {
                        const value = Number(e.target.value.replace(/\D/g, ""));
                        setQuantity(Number.isFinite(value) && value > 0 ? value : 1);
                      }}
                      className="h-10 flex-1 rounded-xl border border-[#E8E0D4] px-3 text-center text-sm font-black text-[#1A1208]"
                    />
                    <button
                      onClick={() => adjustQty(5)}
                      className="h-10 w-10 rounded-xl border border-[#E8E0D4] text-lg font-black text-[#7A6A55]"
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[10, 25, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setQuantity(preset)}
                        className="rounded-full border border-[#E8E0D4] px-3 py-1.5 text-xs font-black text-[#7A6A55] transition-colors hover:border-[#EA4800] hover:text-[#EA4800]"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-3xl bg-[#1A1208] p-4 text-white shadow-[0_18px_40px_rgba(26,18,8,0.16)]">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#D8C1AA]">{tradeSide === "BUY" ? "Estimated Cost" : "Estimated Value"}</span>
                  <span className="text-2xl font-black">₹{estCost.toLocaleString("en-IN")}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/8 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D8C1AA]">Execution Odds</p>
                    <p className="mt-1 font-black">{activeOdds > 0 ? formatOdds(activeOdds) : "--"}</p>
                  </div>
                  <div className="rounded-2xl bg-white/8 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D8C1AA]">Quantity</p>
                    <p className="mt-1 font-black">{quantity}</p>
                  </div>
                  <div className="rounded-2xl bg-white/8 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D8C1AA]">Per Share Value</p>
                    <p className="mt-1 font-black">{formatCurrency(perShareTradeValue)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/8 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#D8C1AA]">Max Settlement</p>
                    <p className="mt-1 font-black">{formatCurrency(maxSettlementPayout)}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handlePlace}
                disabled={placing || !selectedMarketId || quantity <= 0}
                className="mt-4 w-full rounded-2xl bg-gradient-to-br from-[#EA4800] to-[#FF5A1A] py-3.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(234,72,0,.28)] transition-transform hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {placing ? "Placing Order..." : `${tradeSide} ${side} • ${quantity} qty`}
              </button>

              <div className="mt-3 text-center text-[11px] font-semibold text-[#8D7763]">
                Orderbook liquidity is checked first. AMM is used only if matching book liquidity is unavailable.
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="rounded-xl border border-[#E8E0D4] px-4 py-2 text-sm font-black text-[#7A6A55] transition-colors hover:border-[#EA4800] hover:text-[#EA4800]"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
