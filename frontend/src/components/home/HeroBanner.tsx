import { Zap } from "lucide-react";
import { Button } from "../ui/button";

export default function HeroBanner () {
    return (
        <section className="pt-8">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#140e38] via-[#1a0e3d] to-[#0d0929] border border-white/[0.07] rounded-3xl p-8 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
               {/* Glow effects */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 right-1/4 w-72 h-56 bg-violet-600/15 rounded-full blur-[90px]" />
                    <div className="absolute bottom-0 right-0 w-56 h-48 bg-fuchsia-600/12 rounded-full blur-[70px]" />
                    <div className="absolute -top-10 -left-10 w-40 h-40 bg-indigo-700/10 rounded-full blur-[60px]" />
                    {/* Decorative grid lines */}
                    <div
                        className="absolute inset-0 opacity-[0.03]"
                        style={{
                        backgroundImage: "linear-gradient(rgba(124,58,237,1) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,1) 1px, transparent 1px)",
                        backgroundSize: "60px 60px",
                        }}
                    />
                </div>

                {/* Left content */}
                <div className="relative z-10 space-y-5 max-w-xl">
                    <div className="inline-flex items-center gap-2 bg-violet-500/15 border border-violet-500/30 rounded-full px-3 py-1.5 text-[11px] font-bold text-violet-300 uppercase tracking-widest">
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                            24 Live Contests Active
                    </div>

                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight text-white">
                         WIN UP TO{" "}
                        <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                            ₹10 CRORE
                        </span>
                        <br />
                        <span className="text-slate-300">THIS WEEKEND</span>
                    </h1>

                    <p className="text-slate-400 text-base md:text-lg leading-relaxed">
                        Join <span className="text-white font-semibold">45 million players</span>. Pick your squad,
                        beat the competition, and win real cash prizes every day.
                    </p>

                    <div className="flex gap-3 flex-wrap pt-1">
                        <Button size="lg" className="shadow-lg shadow-violet-900/40 text-[15px]">
                            <Zap size={16} className="mr-2" /> Create Team Now
                        </Button>
                        <Button variant="outline" size="lg" className="text-[15px]">
                            How to Play →
                        </Button>
                    </div>

                    {/* Trust badges */}
                    <div className="flex items-center gap-4 pt-2 flex-wrap">
                        {["🔒 100% Secure", "⚡ Instant Withdrawal", "🏆 Certified Fair Play"].map((b) => (
                        <span key={b} className="text-[12px] text-slate-500 font-medium">{b}</span>
                        ))}
                    </div>
                </div>

                {/* Right stats */}
                <div className="relative z-10 flex flex-row md:flex-col gap-6 md:gap-8 shrink-0">
                    {[
                        { val: "₹10Cr", lbl: "Today's Prize Pool", icon: "🏆" },
                        { val: "24", lbl: "Live Matches", icon: "🔴" },
                        { val: "45M+", lbl: "Active Players", icon: "👥" },
                    ].map(({ val, lbl, icon }) => (
            <div key={lbl} className="text-center">
              <p className="text-[11px] text-slate-500 mb-1">{icon}</p>
              <p className="text-3xl md:text-4xl font-black bg-gradient-to-b from-amber-300 to-amber-500 bg-clip-text text-transparent leading-none">
                {val}
              </p>
              <p className="text-[11px] text-slate-500 mt-1.5 uppercase tracking-wider">{lbl}</p>
            </div>
          ))}
                </div>
            </div>
        </section>
    )
}