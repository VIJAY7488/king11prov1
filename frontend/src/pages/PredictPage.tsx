import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const yesBook = {
  bids: [
    { price: 0.63, qty: 420 },
    { price: 0.62, qty: 680 },
    { price: 0.61, qty: 910 },
  ],
  asks: [
    { price: 0.64, qty: 370 },
    { price: 0.65, qty: 540 },
    { price: 0.66, qty: 760 },
  ],
};

const noBook = {
  bids: [
    { price: 0.37, qty: 390 },
    { price: 0.36, qty: 610 },
    { price: 0.35, qty: 800 },
  ],
  asks: [
    { price: 0.38, qty: 460 },
    { price: 0.39, qty: 590 },
    { price: 0.4, qty: 730 },
  ],
};

export default function PredictPage() {
  const navigate = useNavigate();
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [quantity, setQuantity] = useState(25);

  const book = side === "YES" ? yesBook : noBook;
  const bestAsk = book.asks[0]?.price ?? 0;
  const bestBid = book.bids[0]?.price ?? 0;
  const estCost = useMemo(() => Number((quantity * bestAsk).toFixed(2)), [quantity, bestAsk]);

  const adjustQty = (delta: number) => {
    setQuantity((q) => Math.max(1, q + delta));
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
      <div className="rounded-3xl border-[1.5px] border-[#E8E0D4] bg-white p-5 sm:p-6 shadow-[0_12px_32px_rgba(26,18,8,0.06)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD9C9] bg-[#FFF4EE] px-3 py-1 text-xs font-black text-[#B3470F]">
          PROTOTYPE UI
        </div>

        <h1 className="mt-4 font-display text-3xl font-black tracking-tight text-[#1A1208]">
          Predict
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[#7A6A55]">
          Frontend prototype for prediction markets. No backend API integration yet.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-[#E8E0D4] bg-[#FAFAF8] p-4">
            <p className="text-sm font-extrabold text-[#1A1208]">
              Will CSK win IPL 2025 Match 14?
            </p>
            <p className="mt-1 text-xs text-[#7A6A55]">Closes in 02:14:55</p>

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
                <span>Best Ask ₹{bestAsk.toFixed(2)}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-extrabold text-[#0B8A37]">BIDS</p>
                  <div className="mt-1 space-y-1">
                    {book.bids.map((row) => (
                      <div key={`b-${row.price}`} className="flex items-center justify-between rounded-lg bg-[#F3FFF8] px-2 py-1 text-xs">
                        <span className="font-black text-[#0B8A37]">{row.price.toFixed(2)}</span>
                        <span className="font-semibold text-[#3D4A3F]">{row.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold text-[#D9480F]">ASKS</p>
                  <div className="mt-1 space-y-1">
                    {book.asks.map((row) => (
                      <div key={`a-${row.price}`} className="flex items-center justify-between rounded-lg bg-[#FFF4EE] px-2 py-1 text-xs">
                        <span className="font-black text-[#D9480F]">{row.price.toFixed(2)}</span>
                        <span className="font-semibold text-[#5B4A3F]">{row.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E8E0D4] bg-white p-4">
            <p className="text-sm font-extrabold text-[#1A1208]">Buy {side}</p>
            <p className="mt-1 text-xs text-[#7A6A55]">Limit price: ₹{bestAsk.toFixed(2)}</p>

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
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[10, 25, 50].map((quick) => (
                  <button
                    key={quick}
                    onClick={() => setQuantity(quick)}
                    className="rounded-lg border border-[#E8E0D4] py-1.5 text-xs font-extrabold text-[#7A6A55] hover:border-[#EA4800] hover:text-[#EA4800]"
                  >
                    {quick}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-[#FAFAF8] p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#7A6A55]">Estimated Cost</span>
                <span className="font-black text-[#1A1208]">₹{estCost.toLocaleString("en-IN")}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[#7A6A55]">Best Bid/Ask</span>
                <span className="font-extrabold text-[#1A1208]">{bestBid.toFixed(2)} / {bestAsk.toFixed(2)}</span>
              </div>
            </div>

            <button className="mt-4 w-full rounded-xl bg-gradient-to-br from-[#EA4800] to-[#FF5A1A] py-3 text-sm font-black text-white shadow-[0_10px_24px_rgba(234,72,0,.28)]">
              Buy {side} • {quantity} qty
            </button>

            <p className="mt-2 text-[11px] text-[#9A8A74]">
              Prototype only. Order execution is disabled.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button
            onClick={() => navigate("/")}
            className="rounded-xl border border-[#E8E0D4] px-4 py-2 text-sm font-black text-[#7A6A55] hover:border-[#EA4800] hover:text-[#EA4800] transition-colors"
          >
            Back to Home
          </button>
          <button
            onClick={() => navigate("/predict")}
            className="rounded-xl border border-[#E8E0D4] px-4 py-2 text-sm font-black text-[#7A6A55]"
          >
            Refresh Prototype
          </button>
        </div>
      </div>
    </div>
  );
}
