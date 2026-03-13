import { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";

interface Props {
  show: boolean;
  onClose: () => void;
  onAdded: (amount: number) => void;
  addToast: (o: { type: "success" | "error" | "info"; icon?: string; msg: string }) => void;
}

const QUICK = [100, 250, 500, 1000, 2000, 5000];
const QR_IMAGE_URL = "https://res.cloudinary.com/ddw7yo6jm/image/upload/v1773365689/WhatsApp_Image_2026-03-13_at_07.01.55_qjzcc8.jpg";
const POLL_INTERVAL_MS = 5000; // poll every 5 seconds

type Step = "amount" | "payment" | "pending";
type DepositStatus = "PENDING" | "APPROVED" | "REJECTED";

export function AddMoneyModal({ show, onClose, onAdded, addToast }: Props) {
  const [step, setStep]             = useState<Step>("amount");
  const [amount, setAmount]         = useState("");
  const [refNumber, setRefNumber]   = useState("");
  const [depositId, setDepositId]   = useState<string | null>(null);
  const [depositStatus, setDepositStatus] = useState<DepositStatus>("PENDING");
  const [submitting, setSubmitting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Start polling when we have a depositId and step is "pending" ──────────
  useEffect(() => {
    if (step !== "pending" || !depositId) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`users/deposits/${depositId}`);
        const status: DepositStatus = res.data?.data?.deposit?.status;

        if (status === "APPROVED") {
          stopPolling();
          setDepositStatus("APPROVED");
          onAdded(Number(amount));        // update balance in Navbar
          addToast({ type: "success", icon: "✅", msg: `₹${amount} approved & added to wallet!` });
        } else if (status === "REJECTED") {
          stopPolling();
          setDepositStatus("REJECTED");
          addToast({ type: "error", icon: "❌", msg: "Deposit was rejected. Contact support." });
        }
        // PENDING → keep polling
      } catch {
        // silent — keep polling on network errors
      }
    }, POLL_INTERVAL_MS);

    return () => stopPolling();
  }, [step, depositId]);

  // Stop polling when modal is closed
  useEffect(() => {
    if (!show) stopPolling();
  }, [show]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function reset() {
    stopPolling();
    setStep("amount");
    setAmount("");
    setRefNumber("");
    setDepositId(null);
    setDepositStatus("PENDING");
    setSubmitting(false);
  }

  function proceed() {
    if (!amount || Number(amount) < 10) {
      addToast({ type: "error", icon: "❌", msg: "Minimum deposit is ₹10" });
      return;
    }
    setStep("payment");
  }

  async function submitDeposit() {
    if (!refNumber.trim()) {
      addToast({ type: "error", icon: "❌", msg: "Please enter the UPI reference number" });
      return;
    }
    if (refNumber.trim().length < 6) {
      addToast({ type: "error", icon: "❌", msg: "Reference number seems too short" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/users/deposit", {
        amount: Number(amount),
        refNumber: refNumber.trim(),
      });

      const deposit = res.data?.data?.deposit;
      setDepositId(deposit?.id ?? null);
      setDepositStatus("PENDING");
      addToast({ type: "info", icon: "⏳", msg: "Deposit submitted! Awaiting admin approval." });
      setStep("pending");
    } catch (err) {
      addToast({
        type: "error",
        icon: "❌",
        msg: getErrorMessage(err, "Failed to submit deposit. Try again."),
      });
    } finally {
      setSubmitting(false);
    }
  }

  const titles: Record<Step, string> = {
    amount:  "Add Money to Wallet",
    payment: "Scan & Pay",
    pending: depositStatus === "APPROVED"
      ? "✅ Payment Approved!"
      : depositStatus === "REJECTED"
      ? "❌ Payment Rejected"
      : "⏳ Awaiting Approval",
  };

  const footer =
    step === "amount" ? (
      <Button size="lg" onClick={proceed} className="min-w-[160px]">
        Continue — ₹{amount || 0}
      </Button>
    ) : step === "payment" ? (
      <>
        <Button variant="outline" onClick={() => setStep("amount")}>← Back</Button>
        <Button size="lg" onClick={submitDeposit} disabled={submitting} className="min-w-[140px]">
          {submitting ? <Spinner /> : "I've Paid"}
        </Button>
      </>
    ) : (
      <Button
        variant={depositStatus === "APPROVED" ? "default" : "outline"}
        onClick={() => { reset(); onClose(); }}
      >
        {depositStatus === "APPROVED" ? "Done 🎉" : "Close"}
      </Button>
    );

  return (
    <Modal show={show} onClose={() => { reset(); onClose(); }} title={titles[step]} footer={footer}>

      {/* ── Step 1: Amount ── */}
      {step === "amount" && (
        <div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {QUICK.map((a) => (
              <button
                key={a}
                onClick={() => setAmount(String(a))}
                className={`py-2.5 rounded-xl text-sm font-bold border-[1.5px] transition-all ${
                  Number(amount) === a
                    ? "bg-[#EA4800] text-white border-[#EA4800]"
                    : "bg-white border-[#E8E0D4] text-[#7A6A55] hover:border-[#EA4800] hover:text-[#EA4800]"
                }`}
              >
                ₹{a}
              </button>
            ))}
          </div>
          <label className="block text-xs font-bold text-[#3D3020] mb-1.5">Custom Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#EA4800] font-black text-xl">₹</span>
            <input
              className="w-full h-14 pl-8 pr-4 bg-[#F4F1EC] border-[1.5px] border-[#E8E0D4] rounded-xl text-2xl font-black text-[#1A1208] focus:border-[#EA4800] focus:bg-white outline-none transition-colors"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min={10}
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-green-600"></p>
        </div>
      )}

      {/* ── Step 2: QR + Reference Number ── */}
      {step === "payment" && (
        <div>
          <div className="bg-[#F4F1EC] rounded-xl p-3.5 mb-5 flex justify-between items-center">
            <span className="text-sm text-[#7A6A55]">Pay exactly</span>
            <span className="font-display font-black text-xl text-[#EA4800]">
              ₹{Number(amount).toLocaleString("en-IN")}
            </span>
          </div>

          <div className="flex flex-col items-center mb-5">
            <div className="p-3 bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl shadow-sm inline-block mb-3">
              <img src={QR_IMAGE_URL} alt="UPI QR Code" className="w-[180px] h-[180px] block" />
            </div>
            <p className="text-xs font-bold text-[#3D3020]">vijaypatel.ai@axl</p>
            <p className="text-xs text-[#7A6A55] mt-0.5">Scan with any UPI app</p>
            <div className="flex gap-3 mt-3">
              {[["🔵", "GPay"], ["🟣", "PhonePe"], ["🔵", "Paytm"]].map(([icon, label]) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className="text-xl">{icon}</span>
                  <span className="text-[0.65rem] text-[#7A6A55] font-semibold">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#3D3020] uppercase tracking-wide mb-1.5">
              UPI Reference / Transaction ID
            </label>
            <input
              className="w-full h-12 px-4 bg-[#F4F1EC] border-[1.5px] border-[#E8E0D4] rounded-xl text-sm font-bold text-[#1A1208] focus:border-[#EA4800] focus:bg-white outline-none transition-colors placeholder:font-normal placeholder:text-[#B0A090]"
              type="text"
              value={refNumber}
              onChange={(e) => setRefNumber(e.target.value.replace(/\s/g, ""))}
              placeholder="e.g. 425318762910"
            />
            <p className="mt-1.5 text-xs text-[#7A6A55]">
              Find this in your UPI app under payment history after paying.
            </p>
          </div>
          <p className="mt-4 text-xs text-green-600 font-semibold">🔒 Secure · Funds credited after admin approval</p>
        </div>
      )}

      {/* ── Step 3: Pending / Approved / Rejected ── */}
      {step === "pending" && (
        <div className="text-center py-6 px-2">

          {/* Dynamic icon based on status */}
          <div className={`text-6xl mb-4 ${depositStatus === "PENDING" ? "animate-bounce" : ""}`}>
            {depositStatus === "APPROVED" ? "🎉" : depositStatus === "REJECTED" ? "❌" : "⏳"}
          </div>

          {depositStatus === "PENDING" && (
            <>
              <h3 className="font-display font-black text-[1.25rem] text-[#1A1208] mb-2">
                Deposit Under Review
              </h3>
              <p className="text-sm text-[#7A6A55] mb-4 max-w-xs mx-auto">
                Your deposit of{" "}
                <span className="font-bold text-[#EA4800]">₹{Number(amount).toLocaleString("en-IN")}</span>{" "}
                is awaiting admin approval. This page will update automatically.
              </p>
              {/* Polling indicator */}
              <div className="flex items-center justify-center gap-2 text-xs text-[#7A6A55] mb-5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
                Checking for updates every 5 seconds...
              </div>
            </>
          )}

          {depositStatus === "APPROVED" && (
            <>
              <h3 className="font-display font-black text-[1.25rem] text-green-600 mb-2">
                Payment Approved!
              </h3>
              <p className="text-sm text-[#7A6A55] mb-5 max-w-xs mx-auto">
                <span className="font-bold text-[#EA4800]">₹{Number(amount).toLocaleString("en-IN")}</span>{" "}
                has been credited to your wallet.
              </p>
            </>
          )}

          {depositStatus === "REJECTED" && (
            <>
              <h3 className="font-display font-black text-[1.25rem] text-red-500 mb-2">
                Deposit Rejected
              </h3>
              <p className="text-sm text-[#7A6A55] mb-5 max-w-xs mx-auto">
                Your deposit of{" "}
                <span className="font-bold text-[#EA4800]">₹{Number(amount).toLocaleString("en-IN")}</span>{" "}
                was rejected. Please contact support with your reference number.
              </p>
            </>
          )}

          {/* Deposit details card */}
          <div className="bg-[#F4F1EC] rounded-2xl p-4 text-left space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-[#7A6A55]">Amount</span>
              <span className="font-bold text-[#1A1208]">₹{Number(amount).toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#7A6A55]">Ref Number</span>
              <span className="font-bold text-[#1A1208] font-mono">{refNumber}</span>
            </div>
            {depositId && (
              <div className="flex justify-between text-sm">
                <span className="text-[#7A6A55]">Deposit ID</span>
                <span className="font-bold text-[#1A1208] font-mono text-xs">{depositId}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-[#7A6A55]">Status</span>
              {depositStatus === "PENDING" && (
                <span className="inline-flex items-center gap-1.5 text-amber-600 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
                  Pending
                </span>
              )}
              {depositStatus === "APPROVED" && (
                <span className="text-green-600 font-bold">✅ Approved</span>
              )}
              {depositStatus === "REJECTED" && (
                <span className="text-red-500 font-bold">❌ Rejected</span>
              )}
            </div>
          </div>

        </div>
      )}

    </Modal>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />;
}