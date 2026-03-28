import { useNavigate } from "react-router-dom";

export default function PredictPage() {
  const navigate = useNavigate();

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

        <div className="mt-6 grid gap-3">
          <div className="rounded-2xl border border-[#E8E0D4] bg-[#FAFAF8] p-4">
            <p className="text-sm font-extrabold text-[#1A1208]">Will CSK win IPL Match 14?</p>
            <p className="mt-1 text-xs text-[#7A6A55]">Market closes in 02:14:55</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="rounded-xl bg-[#EA4800] py-2 text-sm font-black text-white">
                Buy YES (0.63)
              </button>
              <button className="rounded-xl border border-[#E8E0D4] bg-white py-2 text-sm font-black text-[#1A1208]">
                Buy NO (0.37)
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6">
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
