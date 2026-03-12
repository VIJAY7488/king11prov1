interface LandingPageProps {
  onLogin: () => void;
  onSignup: () => void;
}

export function LandingPage({ onLogin, onSignup }: LandingPageProps) {
  return (
    <div className="max-w-[1280px] mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-10 sm:pb-16">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="mb-8 sm:mb-10">
        <div
          className="relative rounded-2xl sm:rounded-3xl overflow-hidden p-5 sm:p-8 md:p-14 flex flex-col md:flex-row md:items-center md:justify-between gap-6 sm:gap-8"
          style={{ background: "linear-gradient(135deg, #1A1208 0%, #2D1F0A 40%, #1A1208 100%)", minHeight: 320 }}
        >
          {/* Ambient glows */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-1/3 w-[500px] h-[400px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(234,72,0,.22) 0%, transparent 65%)" }} />
            <div className="absolute bottom-0 right-0 w-80 h-72 rounded-full" style={{ background: "radial-gradient(ellipse, rgba(255,90,26,.14) 0%, transparent 65%)" }} />
            <div className="absolute -bottom-8 left-1/4 w-64 h-64 rounded-full" style={{ background: "radial-gradient(ellipse, rgba(234,72,0,.1) 0%, transparent 65%)" }} />
            {/* Grid */}
            <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
          </div>

          {/* Left — copy */}
          <div className="relative z-10 max-w-xl space-y-4 sm:space-y-5">
            {/* Live pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[0.68rem] sm:text-[0.72rem] font-bold uppercase tracking-widest" style={{ background: "rgba(234,72,0,.22)", border: "1px solid rgba(234,72,0,.4)", color: "#FF8C5A" }}>
              <span className="w-2 h-2 rounded-full bg-[#EA4800] animate-pulse" />
              Live Contests Active Now
            </div>

            <h1 className="font-display font-black leading-[1.05] text-white" style={{ fontSize: "clamp(1.85rem, 6vw, 3.75rem)" }}>
              WIN UP TO<br />
              <span style={{ color: "#EA4800" }}>₹10 CRORE</span><br />
              THIS WEEKEND
            </h1>

            <p className="text-white/55 text-sm sm:text-base leading-relaxed max-w-md">
              India's #1 fantasy sports platform. Build your Dream XI for cricket, football & more. Win real cash every single day.
            </p>

            {/* Feature chips */}
            <div className="flex gap-2 flex-wrap">
              {["🔒 100% Secure", "⚡ Instant Withdrawal", "🎯 Fair Play Certified", "🏆 45M+ Players"].map((chip) => (
                <span key={chip} className="text-[0.7rem] sm:text-[0.75rem] font-semibold px-2.5 sm:px-3 py-1 rounded-full" style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.13)", color: "rgba(255,255,255,.65)" }}>
                  {chip}
                </span>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col xs:flex-row gap-3 pt-1 w-full sm:w-auto">
              <button
                onClick={onSignup}
                className="flex items-center justify-center gap-2 px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-display font-black text-sm sm:text-base text-white transition-all hover:-translate-y-0.5 w-full xs:w-auto"
                style={{ background: "linear-gradient(135deg, #EA4800, #FF5A1A)", boxShadow: "0 8px 32px rgba(234,72,0,.4)" }}
              >
                🚀 Start Playing Free
              </button>
              <button
                onClick={onLogin}
                className="flex items-center justify-center gap-2 px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base transition-all hover:bg-white/15 w-full xs:w-auto"
                style={{ background: "rgba(255,255,255,.09)", border: "1.5px solid rgba(255,255,255,.2)", color: "rgba(255,255,255,.85)" }}
              >
                🔑 Sign In
              </button>
            </div>
          </div>

          {/* Right — stats */}
          <div className="relative z-10 grid grid-cols-2 gap-2 sm:gap-3 shrink-0 w-full md:w-auto md:min-w-[260px]">
            {[
              ["₹10 Cr", "Daily Prize Pool"],
              ["45M+",   "Active Players"  ],
              ["500+",   "Daily Contests"  ],
              ["24/7",   "Live Support"    ],
            ].map(([v, l]) => (
              <div key={l} className="text-center rounded-xl sm:rounded-2xl p-3 sm:p-4" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }}>
                <div className="font-display font-black leading-none mb-1" style={{ fontSize: "clamp(1.25rem, 4vw, 2rem)", color: "#EA4800" }}>{v}</div>
                <div className="text-[0.6rem] sm:text-[0.65rem] uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,.4)" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="mb-10 sm:mb-12">
        <h2 className="font-display font-black text-xl sm:text-2xl text-center text-[#1A1208] mb-6 sm:mb-8">How PlayXI Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {[
            { step: "01", icon: "👕", title: "Pick Your Players", desc: "Select 11 players within the credit limit. Choose your captain and vice-captain wisely." },
            { step: "02", icon: "🏆", title: "Join a Contest",    desc: "Choose from Mega, Small, Head-to-Head, or Free contests. Entry starts at just ₹9." },
            { step: "03", icon: "💰", title: "Win Real Cash",     desc: "Earn points as your players perform in the real match. Top rankers win huge prizes." },
          ].map((s) => (
            <div key={s.step} className="relative bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl p-5 sm:p-6 text-center shadow-sm overflow-hidden group hover:-translate-y-1 transition-all duration-300 hover:border-[#EA4800] hover:shadow-[0_12px_40px_rgba(234,72,0,.12)]">
              <div className="absolute top-3 right-4 font-display font-black text-4xl text-[#F4F1EC] group-hover:text-[#FFF0EA] transition-colors">{s.step}</div>
              <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">{s.icon}</div>
              <h3 className="font-display font-black text-base sm:text-lg text-[#1A1208] mb-2">{s.title}</h3>
              <p className="text-sm text-[#7A6A55] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SPORT SELECTOR ───────────────────────────────────────────────── */}
      <section className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-display font-bold text-lg sm:text-xl text-[#1A1208]">🔥 Live & Upcoming Matches</h2>
        </div>
        {/* Matches grid */}
      </section>

      {/* ── CONTESTS PREVIEW ─────────────────────────────────────────────── */}

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="mb-10 sm:mb-12">
        <h2 className="font-display font-black text-xl sm:text-2xl text-center text-[#1A1208] mb-6 sm:mb-8">What Players Say</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {[
            { init: "RK", name: "Rahul K., Mumbai",    quote: "Won ₹2.5 lakhs last IPL season! PlayXI is the most fair platform I've played on.", bg: "from-[#EA4800] to-[#FF7A3D]", stars: 5 },
            { init: "PS", name: "Priya S., Delhi",      quote: "Super easy to create teams and the payouts are instant. Love the free contests for beginners.", bg: "from-[#7C3AED] to-[#A78BFA]", stars: 5 },
            { init: "AM", name: "Arjun M., Bangalore",  quote: "The live leaderboard is so exciting. I refresh it every over during IPL!", bg: "from-[#059669] to-[#34D399]", stars: 5 },
          ].map((t) => (
            <div key={t.name} className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl p-5 sm:p-6 shadow-sm hover:-translate-y-1 transition-all duration-300 hover:border-[#EA4800]">
              <div className="flex gap-0.5 mb-3 sm:mb-4">
                {[...Array(t.stars)].map((_, i) => <span key={i} className="text-yellow-400 text-base sm:text-lg">★</span>)}
              </div>
              <p className="text-[#3D3020] text-[0.88rem] sm:text-[0.9rem] leading-relaxed mb-4 sm:mb-5 italic">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${t.bg} flex items-center justify-center font-black text-xs sm:text-sm text-white shrink-0`}>{t.init}</div>
                <span className="font-semibold text-xs sm:text-sm text-[#7A6A55]">{t.name}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── BOTTOM CTA STRIP ─────────────────────────────────────────────── */}
      <section>
        <div className="rounded-2xl sm:rounded-3xl p-7 sm:p-10 text-center relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1A1208, #2D1F0A)" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 700px 400px at 50% 50%, rgba(234,72,0,.18) 0%, transparent 70%)" }} />
          <div className="relative z-10">
            <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🏆</div>
            <h2 className="font-display font-black text-2xl sm:text-3xl text-white mb-2 sm:mb-3">Ready to Win?</h2>
            <p className="text-white/50 text-sm sm:text-base mb-5 sm:mb-7">Create your free account in 30 seconds. No deposit needed to start.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button
                onClick={onSignup}
                className="w-full sm:w-auto px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-display font-black text-sm sm:text-base text-white transition-all hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #EA4800, #FF5A1A)", boxShadow: "0 8px 32px rgba(234,72,0,.4)" }}
              >
                ✨ Create Free Account
              </button>
              <button
                onClick={onLogin}
                className="w-full sm:w-auto px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base transition-all hover:bg-white/15"
                style={{ background: "rgba(255,255,255,.09)", border: "1.5px solid rgba(255,255,255,.2)", color: "rgba(255,255,255,.8)" }}
              >
                Already have account? Login →
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}