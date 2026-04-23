import { useState, type FormEvent } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { signUp, getPasswordStrength } from "../../services/authService";
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, CheckCircle } from "lucide-react";

export default function SignUpPage() {
  const { setUser }    = useAuth();
  const [, navigate]   = useLocation();

  const [fullName,     setFullName]     = useState("");
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPass,     setShowPass]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [verifyEmail,  setVerifyEmail]  = useState(false);
  const [devToken,     setDevToken]     = useState<string | null>(null);

  const isDev = import.meta.env.DEV;
  const strength = getPasswordStrength(password);

  const strengthMeta: Record<string, { label: string; color: string; width: string }> = {
    empty:  { label: "",       color: "bg-gray-200 dark:bg-gray-700",  width: "0%" },
    weak:   { label: "Weak",   color: "bg-red-500",    width: "25%" },
    fair:   { label: "Fair",   color: "bg-orange-500", width: "50%" },
    good:   { label: "Good",   color: "bg-yellow-500", width: "75%" },
    strong: { label: "Strong", color: "bg-emerald-500", width: "100%" },
  };
  const sm = strengthMeta[strength];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signUp(email, password, fullName);
      if (isDev && result._devVerifyToken) setDevToken(result._devVerifyToken);
      setVerifyEmail(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  async function devVerify() {
    if (!devToken) return;
    setLoading(true);
    try {
      const { verifyEmail: verifyEmailFn, logIn } = await import("../../services/authService");
      await verifyEmailFn(devToken);
      const { user } = await logIn(email, password, true);
      setUser(user);
      navigate("/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  if (verifyEmail) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Check your inbox</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
            We sent a verification link to <strong>{email}</strong>.
            Click it to activate your account.
          </p>

          {isDev && devToken && (
            <div className="mt-5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-left">
              <p className="text-xs font-mono text-amber-700 dark:text-amber-400 break-all mb-2">
                [Dev] Token: {devToken}
              </p>
              <button onClick={devVerify} disabled={loading}
                className="w-full py-2 bg-amber-500 text-white text-sm font-medium rounded-lg disabled:opacity-60">
                {loading ? "Verifying..." : "Auto-verify (dev only)"}
              </button>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            onClick={() => setVerifyEmail(false)}
            className="mt-6 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Back to sign up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg mb-3">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2zm-9 8H7v-2h3v2zm0-4H7V9h3v2zm5 4h-3v-2h3v2zm0-4h-3V9h3v2zM7 3h10v2H7V3z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create your account</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Free forever. No credit card needed.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <User className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Full name"
              required
              autoComplete="name"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          <div className="relative">
            <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              required
              autoComplete="email"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <div className="relative">
              <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                required
                autoComplete="new-password"
                className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full ${sm.color} transition-all duration-300`} style={{ width: sm.width }} />
                </div>
                <span className={`text-xs font-medium ${strength === "strong" ? "text-emerald-600" : strength === "weak" ? "text-red-500" : "text-orange-500"}`}>
                  {sm.label}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1">
            {[
              { label: "8+ characters",    pass: password.length >= 8 },
              { label: "Uppercase letter", pass: /[A-Z]/.test(password) },
              { label: "Number",           pass: /[0-9]/.test(password) },
              { label: "Special char",     pass: /[^A-Za-z0-9]/.test(password) },
            ].map(req => (
              <div key={req.label} className="flex items-center gap-1.5">
                <CheckCircle className={`w-3 h-3 ${req.pass ? "text-emerald-500" : "text-gray-300 dark:text-gray-600"}`} />
                <span className={`text-xs ${req.pass ? "text-gray-700 dark:text-gray-300" : "text-gray-400"}`}>
                  {req.label}
                </span>
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || strength === "weak" || strength === "empty"}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition disabled:opacity-60 flex items-center justify-center"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
            ) : "Create account"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">
          By signing up, you agree to our{" "}
          <span className="underline cursor-pointer">Terms of Service</span> and{" "}
          <span className="underline cursor-pointer">Privacy Policy</span>.
        </p>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
          Already have an account?{" "}
          <Link to="/login" className="text-emerald-600 font-medium hover:text-emerald-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
