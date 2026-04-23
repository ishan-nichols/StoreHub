import { useState, type FormEvent } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { logIn, socialLogin } from "../../services/authService";
import { authenticateWithBiometric, getBiometricEmail } from "../../services/biometricService";
import { Eye, EyeOff, Mail, Lock, Smartphone, Fingerprint, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const { setUser } = useAuth();
  const [, navigate] = useLocation();

  function afterLogin(isNewUser: boolean) {
    if (isNewUser) navigate("/onboarding");
    else navigate("/dashboard");
  }

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [showPass,   setShowPass]   = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading,    setLoading]    = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [biometricAvailable] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!window.PublicKeyCredential;
  });

  const isDev = import.meta.env.DEV;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("email");
    try {
      const { user, isNewUser } = await logIn(email, password, rememberMe);
      setUser(user);
      afterLogin(isNewUser);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(null);
    }
  }

  async function handleBiometric() {
    const savedEmail = getBiometricEmail() ?? email;
    setError(null);
    setLoading("biometric");
    try {
      await authenticateWithBiometric(savedEmail || undefined);
      const { getMe } = await import("../../services/authService");
      const user = await getMe();
      if (user) { setUser(user); afterLogin(false); }
      else setError("Biometric verification failed. Please log in with your password.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Biometric failed");
    } finally {
      setLoading(null);
    }
  }

  async function handleSocialLogin(provider: "google" | "apple" | "microsoft") {
    setError(null);
    setLoading(provider);
    try {
      // INTEGRATION: OAUTH_GOOGLE / OAUTH_APPLE / OAUTH_MICROSOFT
      // Replace this stub with a real OAuth popup/redirect flow.
      const devData = {
        email: `demo@${provider}.com`,
        fullName: `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
        providerUserId: `demo-${provider}-${Date.now()}`,
      };
      const { user, isNewUser } = await socialLogin(provider, devData);
      setUser(user);
      afterLogin(isNewUser);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Social login failed");
    } finally {
      setLoading(null);
    }
  }

  const isLoading = loading !== null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg mb-3">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2zm-9 8H7v-2h3v2zm0-4H7V9h3v2zm5 4h-3v-2h3v2zm0-4h-3V9h3v2zM7 3h10v2H7V3z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Sign in to StoreHub</p>
        </div>

        {/* Social buttons */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {(["google", "apple", "microsoft"] as const).map((p) => (
            <button
              key={p}
              onClick={() => handleSocialLogin(p)}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm font-medium disabled:opacity-50"
            >
              {loading === p ? (
                <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <SocialIcon provider={p} />
                  <span className="capitalize">{p}</span>
                </>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          <span className="text-xs text-gray-400">or email</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Email / password form */}
        <form onSubmit={handleSubmit} className="space-y-3">
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

          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              autoComplete="current-password"
              className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
            <button type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                className="rounded border-gray-300" />
              Remember me
            </label>
            <Link to="/forgot-password" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
              Forgot password?
            </Link>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading === "email" ? (
              <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
            ) : "Sign in"}
          </button>
        </form>

        {/* Secondary actions */}
        <div className="mt-4 flex items-center justify-between">
          <Link to="/login/phone"
            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-emerald-600">
            <Smartphone className="w-4 h-4" />
            Phone login
          </Link>

          {biometricAvailable && (
            <button onClick={handleBiometric} disabled={isLoading}
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-emerald-600 disabled:opacity-50">
              <Fingerprint className="w-4 h-4" />
              Biometric
            </button>
          )}
        </div>

        {isDev && (
          <div className="mt-5 text-xs text-center text-gray-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2">
            Dev mode: sign-up tokens shown in API server logs
          </div>
        )}

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          Don't have an account?{" "}
          <Link to="/signup" className="text-emerald-600 font-medium hover:text-emerald-700">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  );
}

function SocialIcon({ provider }: { provider: "google" | "apple" | "microsoft" }) {
  if (provider === "google") return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
  if (provider === "apple") return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z"/>
    </svg>
  );
  return (
    <svg className="w-4 h-4" viewBox="0 0 21 21" fill="none">
      <path d="M10 0h10v10H10z" fill="#F25022"/>
      <path d="M0 0h9.5v9.5H0z" fill="#7FBA00"/>
      <path d="M10 10.5h10V21H10z" fill="#00A4EF"/>
      <path d="M0 10.5h9.5V21H0z" fill="#FFB900"/>
    </svg>
  );
}
