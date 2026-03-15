import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { getErrorMessage } from "@/lib/error";

interface Props {
  show: boolean;
  onClose: () => void;
  onRequested: (newBalance: number) => void;
  addToast: (o: { type: "success" | "error" | "info"; icon?: string; msg: string }) => void;
}

type Method = "UPI" | "BANK";

export function WithdrawMoneyModal({ show, onClose, onRequested, addToast }: Props) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("UPI");
  const [upiId, setUpiId] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setAmount("");
    setMethod("UPI");
    setUpiId("");
    setAccountHolderName("");
    setAccountNumber("");
    setIfscCode("");
    setSubmitting(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt < 50) {
      addToast({ type: "error", icon: "❌", msg: "Minimum withdrawal amount is ₹50" });
      return;
    }

    if (method === "UPI" && !upiId.trim()) {
      addToast({ type: "error", icon: "❌", msg: "UPI ID is required" });
      return;
    }

    if (method === "BANK" && (!accountHolderName.trim() || !accountNumber.trim() || !ifscCode.trim())) {
      addToast({ type: "error", icon: "❌", msg: "Bank details are required" });
      return;
    }

    setSubmitting(true);
    try {
      const payload =
        method === "UPI"
          ? { amount: amt, method, upiId: upiId.trim() }
          : {
              amount: amt,
              method,
              accountHolderName: accountHolderName.trim(),
              accountNumber: accountNumber.trim(),
              ifscCode: ifscCode.trim().toUpperCase(),
            };

      const res = await api.post("/users/withdrawal", payload);
      const newBalance = res.data?.data?.walletBalance;
      if (typeof newBalance === "number") onRequested(newBalance);
      trackEvent("withdraw_request", {
        amount: amt,
        method,
      });

      addToast({
        type: "success",
        icon: "✅",
        msg: "Withdrawal request created. Amount reserved from wallet.",
      });
      close();
    } catch (err) {
      addToast({
        type: "error",
        icon: "❌",
        msg: getErrorMessage(err, "Failed to create withdrawal request"),
      });
      setSubmitting(false);
    }
  }

  return (
    <Modal
      show={show}
      onClose={close}
      title="Withdraw Money"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Submitting..." : "Request Withdrawal"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-[#3D3020] mb-1.5">Amount</label>
          <input
            className="w-full h-11 px-3 rounded-xl border-[1.5px] border-[#E8E0D4] bg-[#F4F1EC] outline-none focus:border-[#EA4800]"
            type="number"
            min={50}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#3D3020] mb-1.5">Withdrawal Method</label>
          <div className="flex gap-2">
            {(["UPI", "BANK"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`px-4 py-2 rounded-lg text-sm font-bold border ${
                  method === m
                    ? "bg-[#EA4800] text-white border-[#EA4800]"
                    : "bg-white border-[#E8E0D4] text-[#7A6A55]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {method === "UPI" ? (
          <div>
            <label className="block text-xs font-bold text-[#3D3020] mb-1.5">UPI ID</label>
            <input
              className="w-full h-11 px-3 rounded-xl border-[1.5px] border-[#E8E0D4] bg-[#F4F1EC] outline-none focus:border-[#EA4800]"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="name@bank"
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#3D3020] mb-1.5">Account Holder Name</label>
              <input
                className="w-full h-11 px-3 rounded-xl border-[1.5px] border-[#E8E0D4] bg-[#F4F1EC] outline-none focus:border-[#EA4800]"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="As per bank"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#3D3020] mb-1.5">Account Number</label>
              <input
                className="w-full h-11 px-3 rounded-xl border-[1.5px] border-[#E8E0D4] bg-[#F4F1EC] outline-none focus:border-[#EA4800]"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="9-18 digits"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#3D3020] mb-1.5">IFSC Code</label>
              <input
                className="w-full h-11 px-3 rounded-xl border-[1.5px] border-[#E8E0D4] bg-[#F4F1EC] outline-none focus:border-[#EA4800]"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                placeholder="ABCD0123456"
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
