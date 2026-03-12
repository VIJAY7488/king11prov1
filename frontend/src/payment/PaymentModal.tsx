import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Contest, Wallet } from "@/types";
import { Modal } from "@/components/ui/modal";
import type { BadgeProps } from "@/components/ui/badge";

interface Props {
  show: boolean;
  onClose: () => void;
  contest: Contest | null;
  wallet: Wallet;
  onPaid: (c: Contest) => void;
  addToast: (o: { type: "success" | "error" | "info"; icon?: string; msg: string }) => void;
}

type Screen = "main" | "otp" | "success";
type Method = "wallet" | "upi" | "card" | "netbank";

const UPI_APPS = [
  { id: "gpay",    icon: "🔵", label: "Google Pay" },
  { id: "phonepe", icon: "🟣", label: "PhonePe"    },
  { id: "paytm",   icon: "🔵", label: "Paytm"      },
  { id: "other",   icon: "📲", label: "Other"       },
];

const BANKS = ["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "Kotak Bank", "Yes Bank"];

function fmtCardNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function fmtExpiry(value: string): string {
  const clean = value.replace(/\D/g, "").slice(0, 4);
  if (clean.length <= 2) return clean;
  return `${clean.slice(0, 2)}/${clean.slice(2)}`;
}

function tagToBadgeVariant(tag: string): BadgeProps["variant"] {
  const v = tag.toLowerCase();
  if (v === "free") return "secondary";
  if (v === "h2h" || v === "practice") return "outline";
  if (v === "guar") return "default";
  if (v === "multi") return "ghost";
  return "default";
}

export function PaymentModal({ show, onClose, contest, wallet, onPaid, addToast }: Props) {
  const [method, setMethod] = useState<Method>("upi");
  const [upiApp, setUpiApp] = useState("gpay");
  const [upiId, setUpiId] = useState("");
  const [cardNum, setCardNum] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [bank, setBank] = useState("");
  const [processing, setProcessing] = useState(false);
  const [screen, setScreen] = useState<Screen>("main");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  const amount = contest?.entryRaw ?? 0;
  const canWallet = wallet.balance >= amount;

  function handlePay() {
    if (method === "card" && (!cardNum || !cardName || !expiry || !cvv)) {
      addToast({ type: "error", icon: "❌", msg: "Please fill all card details" });
      return;
    }
    if (method === "upi" && upiApp === "other" && !upiId) {
      addToast({ type: "error", icon: "❌", msg: "Enter your UPI ID" });
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      if (contest?.isFree) { setScreen("success"); setTimeout(() => finish(), 2000); }
      else setScreen("otp");
    }, 1400);
  }

  function handleOtpVerify() {
    if (otp.join("").length !== 6) {
      addToast({ type: "error", icon: "❌", msg: "Enter 6-digit OTP" });
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setScreen("success");
      setTimeout(() => finish(), 2000);
    }, 1400);
  }

  function finish() {
    if (contest) onPaid(contest);
    reset();
  }

  function reset() {
    setScreen("main"); setOtp(["","","","","",""]); setCardNum(""); setCvv(""); setExpiry(""); setCardName(""); setProcessing(false);
  }

  /* ── Success screen ── */
  if (screen === "success") {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(26,18,8,.55)] backdrop-blur-sm">
        <div className="text-center animate-[bounceIn_.5s_ease]">
          <div className="text-8xl mb-4">🎉</div>
          <h2 className="font-display font-black text-3xl text-[#EA4800] mb-2">
            {contest?.isFree ? "Contest Joined!" : "Payment Successful!"}
          </h2>
          <p className="text-white/70 text-base">
            {contest?.isFree ? `You've joined ${contest?.name}` : `₹${amount} paid · ${contest?.name}`}
          </p>
        </div>
      </div>
    );
  }

  /* ── OTP screen ── */
  if (screen === "otp") {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[rgba(26,18,8,.55)] backdrop-blur-sm">
        <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl w-full max-w-sm shadow-[0_24px_80px_rgba(26,18,8,.2)]">
          <div className="flex items-center justify-between px-6 py-4 border-b-[1.5px] border-[#E8E0D4]">
            <h2 className="font-display font-bold text-lg">🔐 Enter OTP</h2>
            <button onClick={() => { reset(); onClose(); }} className="w-8 h-8 rounded-lg bg-[#F4F1EC] flex items-center justify-center text-[#7A6A55] hover:bg-[#FFF0EA] hover:text-[#EA4800]">✕</button>
          </div>
          <div className="p-6 text-center">
            <p className="text-[#7A6A55] text-sm mb-6">OTP sent to your registered mobile (****23)</p>
            <div className="mb-6"><OtpInput value={otp} onChange={setOtp} /></div>
            <Button className="w-full" size="lg" onClick={handleOtpVerify} disabled={processing}>
              {processing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Verify & Pay"}
            </Button>
            <p className="mt-3 text-xs text-[#7A6A55]">Resend OTP in <span className="text-[#EA4800] font-bold">28s</span></p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Main payment screen ── */
  return (
    <Modal show={show} onClose={onClose} title={`Join — ${contest?.name ?? ""}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="lg" className="min-w-[160px]" onClick={handlePay} disabled={processing}>
            {processing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : contest?.isFree ? "🎮 Join Free" : `Pay ₹${amount}`}
          </Button>
        </>
      }
    >
      {/* Contest summary */}
      <div className="bg-[#F4F1EC] rounded-xl p-4 mb-5">
        <div className="flex justify-between mb-2">
          <span className="font-semibold text-sm">{contest?.name}</span>
          <span className={`font-black text-base ${contest?.isFree ? "text-green-600" : "text-[#EA4800]"}`}>
            {contest?.isFree ? "FREE" : `₹${amount}`}
          </span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {contest?.tags.map((t) => <Badge key={t.l} variant={tagToBadgeVariant(t.t)}>{t.l}</Badge>)}
        </div>
        {!contest?.isFree && (
          <div className="flex justify-between mt-3 pt-3 border-t border-[#E8E0D4]">
            <span className="text-sm text-[#7A6A55]">Wallet Balance</span>
            <span className={`font-bold text-sm ${canWallet ? "text-green-600" : "text-red-500"}`}>
              ₹{wallet.balance.toLocaleString("en-IN")}
            </span>
          </div>
        )}
      </div>

      {contest?.isFree ? (
        <div className="text-center py-4">
          <div className="text-5xl mb-3">🎮</div>
          <p className="font-display font-bold text-lg mb-1">Free Contest!</p>
          <p className="text-[#7A6A55] text-sm">No payment needed. Just join and play!</p>
        </div>
      ) : (
        <div>
          <p className="text-xs font-bold text-[#3D3020] uppercase tracking-wide mb-3">Payment Method</p>

          {/* Methods */}
          <div className="flex flex-col gap-2 mb-4">
            {canWallet && (
            <PayOption selected={method === "wallet"} onSelect={() => setMethod("wallet")} icon="💰" label="Wallet Balance" sub="Instant · No OTP" right={`₹${wallet.balance}`} rightColor="text-green-600" />
            )}
            <PayOption selected={method === "upi"} onSelect={() => setMethod("upi")} icon="📲" label="UPI" sub="GPay, PhonePe, Paytm & more" />
            <PayOption selected={method === "card"} onSelect={() => setMethod("card")} icon="💳" label="Debit / Credit Card" sub="Visa, Mastercard, RuPay" />
            <PayOption selected={method === "netbank"} onSelect={() => setMethod("netbank")} icon="🏦" label="Net Banking" sub="All major Indian banks" />
          </div>

          {method === "upi" && (
            <div className="mb-4">
              <p className="text-xs font-bold text-[#3D3020] mb-2">Select UPI App</p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {UPI_APPS.map((a) => (
                  <div key={a.id} onClick={() => setUpiApp(a.id)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-[1.5px] cursor-pointer transition-all text-xs font-semibold ${upiApp === a.id ? "border-[#EA4800] bg-[#FFF0EA] text-[#EA4800]" : "border-[#E8E0D4] text-[#7A6A55] hover:border-[#EA4800]"}`}>
                    <span className="text-2xl">{a.icon}</span>
                    {a.label}
                  </div>
                ))}
              </div>
              {upiApp === "other" && <Input value={upiId} onChange={(e: ChangeEvent<HTMLInputElement>) => setUpiId(e.target.value)} placeholder="yourname@upi" />}
            </div>
          )}

          {method === "card" && (
            <div className="space-y-3 mb-4">
              <Input value={cardNum} onChange={(e: ChangeEvent<HTMLInputElement>) => setCardNum(fmtCardNumber(e.target.value))} placeholder="1234 5678 9012 3456" maxLength={19} />
              <Input value={cardName} onChange={(e: ChangeEvent<HTMLInputElement>) => setCardName(e.target.value)} placeholder="CARDHOLDER NAME" />
              <div className="grid grid-cols-2 gap-3">
                <Input value={expiry} onChange={(e: ChangeEvent<HTMLInputElement>) => setExpiry(fmtExpiry(e.target.value))} placeholder="MM/YY" maxLength={5} />
                <Input type="password" value={cvv} onChange={(e: ChangeEvent<HTMLInputElement>) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="CVV" />
              </div>
            </div>
          )}

          {method === "netbank" && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {BANKS.map((b) => (
                <div key={b} onClick={() => setBank(b)}
                  className={`p-3 text-center rounded-xl border-[1.5px] cursor-pointer text-sm font-semibold transition-all ${bank === b ? "border-[#EA4800] bg-[#FFF0EA] text-[#EA4800]" : "border-[#E8E0D4] text-[#7A6A55] hover:border-[#EA4800]"}`}>
                  {b}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-green-600 font-semibold">🔒 256-bit SSL secured · RBI regulated · PCI-DSS compliant</p>
        </div>
      )}
    </Modal>
  );
}

function OtpInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  function updateAt(i: number, raw: string) {
    const next = [...value];
    next[i] = raw.replace(/\D/g, "").slice(0, 1);
    onChange(next);
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {value.map((digit, i) => (
        <Input
          key={i}
          value={digit}
          onChange={(e: ChangeEvent<HTMLInputElement>) => updateAt(i, e.target.value)}
          className="w-10 h-11 text-center font-black"
          maxLength={1}
          inputMode="numeric"
        />
      ))}
    </div>
  );
}

function PayOption({ selected, onSelect, icon, label, sub, right, rightColor }: { selected: boolean; onSelect: () => void; icon: string; label: string; sub: string; right?: string; rightColor?: string }) {
  return (
    <div onClick={onSelect}
      className={`flex items-center gap-3 p-3.5 rounded-xl border-[1.5px] cursor-pointer transition-all ${selected ? "border-[#EA4800] bg-[#FFF0EA]" : "border-[#E8E0D4] bg-white hover:border-[#EA4800]"}`}>
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <div className="font-bold text-sm">{label}</div>
        <div className="text-xs text-[#7A6A55]">{sub}</div>
      </div>
      {right && <span className={`font-bold text-sm ${rightColor}`}>{right}</span>}
    </div>
  );
}
