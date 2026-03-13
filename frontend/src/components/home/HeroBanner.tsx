import { Zap } from "lucide-react";
import { Button } from "../ui/button";

interface HeroBannerProps {
    onCreateTeamClick?: () => void;
    onPointSystemClick?: () => void;
}

export default function HeroBanner ({ onCreateTeamClick, onPointSystemClick }: HeroBannerProps) {
    return (
        <section className="pt-4 sm:pt-8">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#140e38] via-[#1a0e3d] to-[#0d0929] border border-white/[0.07] rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6 sm:gap-8">
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
                <div className="relative z-10 space-y-4 sm:space-y-5 max-w-xl">
                    <div className="inline-flex items-center gap-2 bg-violet-500/15 border border-violet-500/30 rounded-full px-3 py-1.5 text-[10px] sm:text-[11px] font-bold text-violet-300 uppercase tracking-wide sm:tracking-widest">
                        <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                        Live Contests Active
                    </div>

                    <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-[1.12] sm:leading-tight tracking-tight text-white">
                        IPL is Back!{" "}
                        <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                            Build Your Dream Team & Win Big Every Match.
                        </span>
                        <br />
                        <span className="bg-gradient-to-r from-[#FFE08A] via-[#FFC96B] to-[#FFAA5B] bg-clip-text text-transparent">
                            TONIGHT 7:30 PM • RCB VS SRH
                        </span>
                    </h1>

                    <p className="text-[#C8DAF6] text-sm sm:text-base md:text-lg leading-relaxed">
                        <span className="font-bold bg-gradient-to-r from-[#FFE08A] via-[#FFC96B] to-[#FFAA5B] bg-clip-text text-transparent">100% Transparent Contests • Fast Withdrawals • Built for True Cricket Fans</span>. Pick your squad,
                        beat the competition, and win real cash prizes every day.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 pt-1 w-full sm:w-auto">
                        <Button
                            size="lg"
                            className="shadow-lg shadow-violet-900/40 text-[15px] w-full sm:w-auto justify-center"
                            onClick={onCreateTeamClick}
                        >
                            <Zap size={16} className="mr-2" /> Create Team Now
                        </Button>
                        <Button
                            variant="outline"
                            size="lg"
                            className="text-[15px] w-full sm:w-auto justify-center"
                            onClick={onPointSystemClick}
                        >
                            Point System →
                        </Button>
                    </div>

                    {/* Trust badges */}
                    <div className="flex items-center gap-2 sm:gap-4 pt-1 sm:pt-2 flex-wrap">
                        {["🔒 100% Secure", "⚡ Instant Withdrawal", "🏆 Certified Fair Play"].map((b) => (
                            <span key={b} className="text-[11px] sm:text-[12px] text-slate-500 font-medium">{b}</span>
                        ))}
                    </div>
                </div>

                {/* Right stats */}
                <div className="relative z-10 shrink-0 w-full md:w-[430px]">
                    <div className="relative overflow-hidden rounded-2xl border border-white/15 min-h-[220px] sm:min-h-[240px] md:min-h-[290px] bg-gradient-to-br from-[#1A255E] via-[#0F1D4A] to-[#0A1230] p-4 sm:p-5 md:p-6">
                        <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute -top-8 -right-6 w-36 h-36 rounded-full bg-[#EA480040] blur-2xl" />
                            <div className="absolute -bottom-10 -left-8 w-40 h-40 rounded-full bg-[#FBBF2440] blur-2xl" />
                            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)", backgroundSize: "14px 14px" }} />
                        </div>

                        <div className="relative z-10 h-full flex flex-col justify-between gap-4">
                            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] sm:tracking-[0.25em] text-[#D6E5FF] font-bold">Tonight&apos;s Mega Clash</p>

                            <div className="flex items-center justify-between">
                                <div className="flex flex-col items-center gap-1.5 sm:gap-2 max-w-[95px] sm:max-w-none">
                                    <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-b from-[#EF4444] to-[#8B0000] border-2 border-white/60 shadow-[0_10px_28px_rgba(0,0,0,.35)] flex items-center justify-center text-white font-black text-base sm:text-lg md:text-2xl">
                                        RCB
                                    </div>
                                    <p className="text-[10px] sm:text-xs leading-tight font-bold text-white/90 uppercase tracking-wide text-center">Royal Challengers</p>
                                </div>

                                <div className="text-center px-1 sm:px-3">
                                    <p className="text-2xl sm:text-3xl md:text-5xl font-black bg-gradient-to-b from-[#FFE08A] to-[#F59E0B] bg-clip-text text-transparent leading-none">VS</p>
                                    <p className="text-[10px] md:text-xs text-[#BFD3F5] font-semibold uppercase tracking-wider mt-1">T20</p>
                                </div>

                                <div className="flex flex-col items-center gap-1.5 sm:gap-2 max-w-[95px] sm:max-w-none">
                                    <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-b from-[#FB923C] to-[#C2410C] border-2 border-white/60 shadow-[0_10px_28px_rgba(0,0,0,.35)] flex items-center justify-center text-white font-black text-base sm:text-lg md:text-2xl">
                                        SRH
                                    </div>
                                    <p className="text-[10px] sm:text-xs leading-tight font-bold text-white/90 uppercase tracking-wide text-center">Sunrisers</p>
                                </div>
                            </div>

                            <div className="rounded-xl bg-white/10 border border-white/15 px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row gap-1 sm:gap-0 items-start sm:items-center justify-between">
                                <span className="text-[10px] sm:text-[11px] md:text-xs font-semibold text-[#D7E8FF] uppercase tracking-wider">M. Chinnaswamy</span>
                                <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-[#FFE08A]">7:30 PM IST</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}