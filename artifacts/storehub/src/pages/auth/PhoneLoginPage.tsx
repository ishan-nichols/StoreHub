import { useState, useRef, type FormEvent, type KeyboardEvent, type ClipboardEvent } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { sendOTP, verifyOTP, COUNTRY_CODES, formatPhoneNumber, fullPhoneNumber } from "../../services/phoneAuthService";
import { ArrowLeft, Phone, AlertCircle, ChevronDown } from "lucide-react";
import { AuthShell } from "../../components/page-shell";

type Step = "phone" | "otp";

export default function PhoneLoginPage() {
  const { setUser } = useAuth();
  const [, navigate] = useLocation();
  const isDev = import.meta.env.DEV;

  const [step,         setStep]        = useState<Step>("phone");
  const [country,      setCountry]     = useState(COUNTRY_CODES[0]);
  const [showCountry,  setShowCountry] = useState(false);
  const [phone,        setPhone]       = useState("");
  const [otp,          setOtp]         = useState(["", "", "", "", "", ""]);
  const [maskedPhone,  setMaskedPhone] = useState("");
  const [devOtp,       setDevOtp]      = useState<string | null>(null);
  const [countdown,    setCountdown]   = useState(0);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState<string | null>(null);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCountdown(seconds = 60) {
    setCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendOTP(e?: FormEvent) {
    e?.preventDefault();
    const full = fullPhoneNumber(country.dial, phone);
    if (full.replace(/\D/g, "").length < 7) {
      setError("Enter a valid phone number"); return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await sendOTP(full);
      setMaskedPhone(result.maskedPhone);
      if (isDev && result._devOtp) setDevOtp(result._devOtp);
      setStep("otp");
      startCountdown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(idx: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next  = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (next.every(d => d)) handleVerifyOTP(next.join(""));
  }

  function handleOtpKey(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
  }

  function handleOtpPaste(e: ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (digits.length === 6) {
      setOtp(digits.split(""));
      handleVerifyOTP(digits);
    }
  }

  async function handleVerifyOTP(code?: string) {
    const codeToVerify = code ?? otp.join("");
    if (codeToVerify.length !== 6) return;
    const full = fullPhoneNumber(country.dial, phone);
    setError(null);
    setLoading(true);
    try {
      const result = await verifyOTP(full, codeToVerify);
      const { getMe } = await import("../../services/authService");
      const user = await getMe();
      if (user) {
        setUser(user);
        if (result.isNewUser) navigate("/onboarding");
        else navigate("/");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title={step === "phone" ? "Sign in with phone" : "Enter your code"} subtitle={step === "phone" ? "We'll send you a one-time code." : `We sent a 6-digit code to ${maskedPhone || "your phone"}.`}>
        <Link to="/login"
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>

        {step === "phone" && (
          <>
            <form onSubmit={handleSendOTP} className="space-y-3">
              <div className="flex gap-2">
                <div className="relative">
                  <button type="button" onClick={() => setShowCountry(v => !v)}
                    className="flex items-center gap-1 px-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm whitespace-nowrap">
                    <span>{country.flag}</span>
                    <span>{country.dial}</span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </button>
                  {showCountry && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto">
                      {COUNTRY_CODES.map(c => (
                        <button key={c.code + c.dial} type="button"
                          onClick={() => { setCountry(c); setShowCountry(false); }}
                          className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 ${
                            c.code === country.code ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "text-gray-700 dark:text-gray-200"
                          }`}>
                          <span>{c.flag}</span>
                          <span className="flex-1">{c.name}</span>
                          <span className="text-gray-400">{c.dial}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative flex-1">
                  <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={formatPhoneNumber(phone, country.dial)}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="Phone number"
                    required
                    autoComplete="tel"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm text-red-700">{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition disabled:opacity-60 flex items-center justify-center">
                {loading ? <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : "Send code"}
              </button>
            </form>
          </>
        )}

        {step === "otp" && (
          <>
            {isDev && devOtp && (
              <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-400">[Dev] Code: <strong>{devOtp}</strong></p>
              </div>
            )}

            <div className="flex gap-2 mb-4">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)}
                  onPaste={handleOtpPaste}
                  disabled={loading}
                  className="flex-1 h-12 text-center text-xl font-bold rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
              ))}
            </div>

            {error && (
                <div className="mb-3 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm text-red-700">{error}</span>
                </div>
              )}

            {loading && (
              <div className="flex justify-center mb-3">
                <span className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <button onClick={() => { setStep("phone"); setOtp(["","","","","",""]); setError(null); }}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700">
                Change number
              </button>
              {countdown > 0 ? (
                <span className="text-gray-400">Resend in {countdown}s</span>
              ) : (
                <button onClick={() => handleSendOTP()}
                  className="text-emerald-600 hover:text-emerald-700 font-medium">
                  Resend code
                </button>
              )}
            </div>
          </>
        )}
    </AuthShell>
  );
}
