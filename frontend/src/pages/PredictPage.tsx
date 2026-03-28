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
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : undefined,
      _id: typeof row._id === "string" ? row._id : undefined,
      question: typeof row.question === "string" ? row.question : "Untitled Market",
      status: typeof row.status === "string" ? row.status : undefined,
      closeAt: typeof row.closeAt === "string" ? row.closeAt : undefined,
    }))
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
  const defaultPrice = tradeSide === "BUY" ? bestAsk : bestBid;
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const activePrice = orderType === "LIMIT" ? (limitPrice > 0 ? limitPrice : defaultPrice) : defaultPrice;
  const estCost = useMemo(() => Number((quantity * activePrice).toFixed(2)), [quantity, activePrice]);

  useEffect(() => {
    setLimitPrice(defaultPrice);
  }, [defaultPrice]);

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
        setSelectedMarketId((prev) => {
          if (prev) return prev;
          return marketIdOf(rows[0]);
        });
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
        optionalLimitPrice: orderType === "LIMIT" && activePrice > 0 ? activePrice : undefined,
      };

      const res = await api.post("/trade/execute", payload);
      const route = res.data?.data?.route ?? "UNKNOWN";
      toast({
        type: "success",
        icon: "✅",
        msg: `${tradeSide} order executed via ${route}. Qty: ${quantity}`,
      });

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
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
      <div className="rounded-3xl border-[1.5px] border-[#E8E0D4] bg-white p-5 sm:p-6 shadow-[0_12px_32px_rgba(26,18,8,0.06)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD9C9] bg-[#FFF4EE] px-3 py-1 text-xs font-black text-[#B3470F]">
          LIVE MARKET VIEW
        </div>

        <h1 className="mt-4 font-display text-3xl font-black tracking-tight text-[#1A1208]">
          Predict
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[#7A6A55]">
          Live markets + order book from backend. Trading uses smart router.
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-[#FFD1C4] bg-[#FFF5F1] px-3 py-2 text-xs font-bold text-[#B53A0B]">
            {error}
          </div>
        )}

        <div className="mt-4">
          <label className="text-xs font-extrabold text-[#7A6A55]">Select Question</label>
          <select
            value={selectedMarketId}
            onChange={(e) => setSelectedMarketId(e.target.value)}
            disabled={loadingMarkets || markets.length === 0}
            className="mt-1 w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-2 text-sm font-semibold text-[#1A1208]"
          >
            {loadingMarkets && <option>Loading markets...</option>}
            {!loadingMarkets && markets.length === 0 && <option>No open markets</option>}
            {markets.map((m) => (
              <option key={marketIdOf(m)} value={marketIdOf(m)}>
                {m.question ?? "Untitled Market"}
              </option>
            ))}
          </select>
          {selectedMarket?.closeAt && Number.isFinite(new Date(selectedMarket.closeAt).getTime()) && (
            <p className="mt-1 text-[11px] text-[#7A6A55]">
              Closes: {new Date(selectedMarket.closeAt).toLocaleString("en-IN")}
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-[#E8E0D4] bg-[#FAFAF8] p-4">
            <p className="text-sm font-extrabold text-[#1A1208]">
              {selectedMarket?.question ?? "Select a market to view order book"}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setSide("YES")}
                className={`rounded-xl py-2 text-sm font-black transition-all ${
                  side === "YES"
                    ? "bg-[#EA4800] text-white shadow-[0_8px_20px_rgba(234,72,0,.24)]"
                    : "border border-[#E8E0D4] bg-white text-[#7A6A55]"
                }`}
              >
                YES
              </button>
              <button
                onClick={() => setSide("NO")}
                className={`rounded-xl py-2 text-sm font-black transition-all ${
                  side === "NO"
                    ? "bg-[#1A1208] text-white shadow-[0_8px_20px_rgba(26,18,8,.2)]"
                    : "border border-[#E8E0D4] bg-white text-[#7A6A55]"
                }`}
              >
                NO
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-[#E8E0D4] bg-white p-3">
              <div className="flex items-center justify-between text-xs font-bold text-[#7A6A55]">
                <span>Order Book ({side})</span>
                <span>{loadingBook ? "Loading..." : `Best Ask ₹${bestAsk.toFixed(2)}`}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-extrabold text-[#0B8A37]">BIDS</p>
                  <div className="mt-1 space-y-1">
                    {bids.map((row) => (
                      <div key={`b-${row.price}`} className="flex items-center justify-between rounded-lg bg-[#F3FFF8] px-2 py-1 text-xs">
                        <span className="font-black text-[#0B8A37]">{Number(row.price).toFixed(2)}</span>
                        <span className="font-semibold text-[#3D4A3F]">{row.quantity}</span>
                      </div>
                    ))}
                    {bids.length === 0 && (
                      <div className="rounded-lg bg-[#F8F8F8] px-2 py-1 text-xs text-[#8C7E6B]">No bids</div>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold text-[#D9480F]">ASKS</p>
                  <div className="mt-1 space-y-1">
                    {asks.map((row) => (
                      <div key={`a-${row.price}`} className="flex items-center justify-between rounded-lg bg-[#FFF4EE] px-2 py-1 text-xs">
                        <span className="font-black text-[#D9480F]">{Number(row.price).toFixed(2)}</span>
                        <span className="font-semibold text-[#5B4A3F]">{row.quantity}</span>
                      </div>
                    ))}
                    {asks.length === 0 && (
                      <div className="rounded-lg bg-[#F8F8F8] px-2 py-1 text-xs text-[#8C7E6B]">No asks</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E8E0D4] bg-white p-4">
            <p className="text-sm font-extrabold text-[#1A1208]">{tradeSide} {side}</p>
            <p className="mt-1 text-xs text-[#7A6A55]">
              {tradeSide === "BUY"
                ? bestAsk > 0 ? `Best ask: ₹${bestAsk.toFixed(2)}` : "No ask liquidity available"
                : bestBid > 0 ? `Best bid: ₹${bestBid.toFixed(2)}` : "No bid liquidity available"}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setTradeSide("BUY")}
                className={`rounded-xl py-2 text-sm font-black transition-all ${
                  tradeSide === "BUY"
                    ? "bg-[#EA4800] text-white shadow-[0_8px_20px_rgba(234,72,0,.24)]"
                    : "border border-[#E8E0D4] bg-white text-[#7A6A55]"
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => setTradeSide("SELL")}
                className={`rounded-xl py-2 text-sm font-black transition-all ${
                  tradeSide === "SELL"
                    ? "bg-[#1A1208] text-white shadow-[0_8px_20px_rgba(26,18,8,.2)]"
                    : "border border-[#E8E0D4] bg-white text-[#7A6A55]"
                }`}
              >
                SELL
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setOrderType("MARKET")}
                className={`rounded-xl py-2 text-xs font-black transition-all ${
                  orderType === "MARKET"
                    ? "bg-[#FFF0EA] text-[#EA4800] border border-[#FFCAB3]"
                    : "border border-[#E8E0D4] text-[#7A6A55]"
                }`}
              >
                MARKET
              </button>
              <button
                onClick={() => setOrderType("LIMIT")}
                className={`rounded-xl py-2 text-xs font-black transition-all ${
                  orderType === "LIMIT"
                    ? "bg-[#FFF0EA] text-[#EA4800] border border-[#FFCAB3]"
                    : "border border-[#E8E0D4] text-[#7A6A55]"
                }`}
              >
                LIMIT
              </button>
            </div>

            {orderType === "LIMIT" && (
              <div className="mt-3 rounded-xl border border-[#E8E0D4] p-3">
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
                  className="mt-2 h-9 w-full rounded-lg border border-[#E8E0D4] px-3 text-sm font-black text-[#1A1208]"
                  inputMode="decimal"
                  placeholder="0.65"
                />
              </div>
            )}

            <div className="mt-4 rounded-xl border border-[#E8E0D4] p-3">
              <p className="text-xs font-bold text-[#7A6A55]">Quantity</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => adjustQty(-5)}
                  className="h-9 w-9 rounded-lg border border-[#E8E0D4] text-lg font-black text-[#7A6A55]"
                >
                  -
                </button>
                <input
                  value={quantity}
                  onChange={(e) => {
                    const value = Number(e.target.value.replace(/\D/g, ""));
                    setQuantity(Number.isFinite(value) && value > 0 ? value : 1);
                  }}
                  className="h-9 flex-1 rounded-lg border border-[#E8E0D4] px-3 text-center text-sm font-black text-[#1A1208]"
                />
                <button
                  onClick={() => adjustQty(5)}
                  className="h-9 w-9 rounded-lg border border-[#E8E0D4] text-lg font-black text-[#7A6A55]"
                >
                  +
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-[#FAFAF8] p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#7A6A55]">{tradeSide === "BUY" ? "Estimated Cost" : "Estimated Value"}</span>
                <span className="font-black text-[#1A1208]">₹{estCost.toLocaleString("en-IN")}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[#7A6A55]">Best Bid / Ask</span>
                <span className="font-extrabold text-[#1A1208]">{bestBid.toFixed(2)} / {bestAsk.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={handlePlace}
              disabled={placing || !selectedMarketId || quantity <= 0}
              className="mt-4 w-full rounded-xl bg-gradient-to-br from-[#EA4800] to-[#FF5A1A] py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(234,72,0,.28)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {placing ? "Placing..." : `${tradeSide} ${side} • ${quantity} qty`}
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button
            onClick={() => navigate("/")}
            className="rounded-xl border border-[#E8E0D4] px-4 py-2 text-sm font-black text-[#7A6A55] hover:border-[#EA4800] hover:text-[#EA4800] transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
