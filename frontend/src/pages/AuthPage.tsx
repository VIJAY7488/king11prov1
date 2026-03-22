import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useApp } from "@/context/AppContext";
import { getErrorMessage } from "@/lib/error";
import { trackEvent } from "@/lib/analytics";

type AuthMode = "login" | "signup";

interface FormState {
  name: string;
  mobileNumber: string;
  password: string;
  confirmPassword: string;
  referralCode: string;
  agree: boolean;
}

function Spinner() {
  return (
    <span style={{ width: 20, height: 20, border: "2.5px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .8s linear infinite" }} />
  );
}

function Field({ label, type = "text", placeholder, value, onChange, error, suffix }: {
  label: string; type?: string; placeholder?: string; value: string;
  onChange: (v: string) => void; error?: string; suffix?: React.ReactNode;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, display: "block" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type={type} placeholder={placeholder} value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          inputMode={type === "tel" ? "numeric" : undefined}
          pattern={type === "tel" ? "[0-9]*" : undefined}
          style={{ width: "100%", height: 46, padding: "0 14px", borderRadius: 10, border: `1.5px solid ${error ? "#F87171" : "#E8E0D4"}`, background: "#F4F1EC", paddingRight: suffix ? 44 : 14, boxSizing: "border-box" as const }}
        />
        {suffix && (
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer" }}>
            {suffix}
          </div>
        )}
      </div>
      {error && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>⚠ {error}</p>}
    </div>
  );
}

export function AuthPage({ initialMode = "login" }: { initialMode?: AuthMode; onAuth?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const login    = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const token    = useAuthStore((s) => s.token);
  const { toast } = useApp();

  const [mode, setMode]         = useState<AuthMode>(initialMode);
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm]         = useState<FormState>({ name: "", mobileNumber: "", password: "", confirmPassword: "", referralCode: "", agree: false });
  const [errors, setErrors]     = useState<Partial<Record<keyof FormState, string>>>({});

  // If already logged in, go home
  useEffect(() => { if (token) navigate("/", { replace: true }); }, [token]);
  useEffect(() => {
    if (mode !== "signup") return;
    const params = new URLSearchParams(location.search);
    const raw = (params.get("ref") || params.get("referral") || "").trim().toUpperCase();
    if (!raw || !/^[A-Z0-9]{6,20}$/.test(raw)) return;
    setForm((prev) => ({ ...prev, referralCode: raw }));
  }, [location.search, mode]);

  const updateField = (field: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function validate(): boolean {
    const errs: typeof errors = {};
    if (mode === "signup") {
      if (!form.name.trim())             errs.name = "Name is required";
      if (form.password !== form.confirmPassword) errs.confirmPassword = "Passwords do not match";
      if (form.referralCode.trim() && !/^[a-zA-Z0-9]{6,20}$/.test(form.referralCode.trim())) {
        errs.referralCode = "Referral code must be 6-20 letters/numbers";
      }
    }
    if (!form.mobileNumber.trim() || !/^\d{10}$/.test(form.mobileNumber))
      errs.mobileNumber = "10-digit mobile required";
    if (!form.password.trim()) errs.password = "Password required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    try {
      if (mode === "login") {
        await login(form.mobileNumber, form.password);
        trackEvent("login", { method: "mobile_password" });
      } else {
        await register({
          name: form.name,
          mobileNumber: form.mobileNumber,
          password: form.password,
          referralCode: form.referralCode.trim() ? form.referralCode.trim().toUpperCase() : undefined,
        });
        trackEvent("sign_up", { method: "mobile_password" });
      }
      navigate("/", { replace: true });
    } catch (err) {
      const msg = getErrorMessage(err, "Authentication failed. Please try again.");
      toast({ type: "error", icon: "❌", msg });
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m: AuthMode) {
    setMode(m);
    setErrors({});
    setForm({ name: "", mobileNumber: "", password: "", confirmPassword: "", referralCode: "", agree: false });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF8", padding: 20 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Glow particles */}
      {[{ width: 200, height: 200, background: "rgba(234,72,0,.12)", top: "8%", left: "60%", filter: "blur(40px)" },
        { width: 160, height: 160, background: "rgba(234,72,0,.08)", top: "60%", left: "5%", filter: "blur(32px)" }
      ].map((s, i) => <div key={i} className="absolute rounded-full pointer-events-none" style={{ ...s, position: "absolute" }} />)}

      <div style={{ maxWidth: 460, width: "100%", borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.15)", border: "1px solid #eee" }}>
        <div style={{ background: "#fff", padding: 36 }}>

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 4, background: "#F4F1EC", borderRadius: 10, padding: 4, marginBottom: 20 }}>
            {(["login", "signup"] as AuthMode[]).map((m) => (
              <button key={m} onClick={() => switchMode(m)} style={{ flex: 1, padding: 10, border: "none", borderRadius: 8, background: mode === m ? "#fff" : "transparent", color: mode === m ? "#EA4800" : "#7A6A55", fontWeight: 700, cursor: "pointer" }}>
                {m === "login" ? "🔑 Sign In" : "✨ Create Account"}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 20 }}>
            {mode === "login" ? "Welcome back!" : "Create your account"}
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mode === "signup" && <Field label="Full Name" value={form.name} onChange={(v) => updateField("name", v)} error={errors.name} />}

            <Field label="Mobile Number" type="tel" value={form.mobileNumber} placeholder="10-digit mobile"
              onChange={(v) => updateField("mobileNumber", v.replace(/\D/g, "").slice(0, 10))} error={errors.mobileNumber} />

            <Field label="Password" type={showPass ? "text" : "password"} value={form.password}
              onChange={(v) => updateField("password", v)} error={errors.password}
              suffix={<span onClick={() => setShowPass(!showPass)}>{showPass ? "🙈" : "👁️"}</span>} />

            {mode === "signup" && <Field label="Confirm Password" type="password" value={form.confirmPassword} onChange={(v) => updateField("confirmPassword", v)} error={errors.confirmPassword} />}
            {mode === "signup" && (
              <Field
                label="Referral Code (Optional)"
                value={form.referralCode}
                placeholder="Enter referral code"
                onChange={(v) => updateField("referralCode", v.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20).toUpperCase())}
                error={errors.referralCode}
              />
            )}

            <button onClick={handleSubmit} disabled={loading}
              style={{ width: "100%", height: 48, borderRadius: 12, border: "none", background: loading ? "#FFDDCC" : "linear-gradient(135deg,#EA4800,#FF5A1A)", color: "#fff", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? <Spinner /> : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
