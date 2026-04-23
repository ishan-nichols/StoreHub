import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { AlertCircle, Eye, EyeOff, Fingerprint, Lock, Mail, Smartphone } from "lucide-react";
import { useGoogleLogin } from "@react-oauth/google";
import { useAuth } from "../../contexts/AuthContext";
import { authenticateWithBiometric, getBiometricEmail } from "../../services/biometricService";
import { googleSignIn, logIn, socialLogin } from "../../services/authService";

export default function LoginPage() {
  const { setUser } = useAuth();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [biometricAvailable] = useState(() => (typeof window !== "undefined" ? !!window.PublicKeyCredential : false));

  const isDev = import.meta.env.DEV;
  const isLoading = loading !== null;

  function afterLogin(isNewUser: boolean) {
    navigate(isNewUser ? "/onboarding" : "/dashboard");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
      if (user) {
        setUser(user);
        afterLogin(false);
      } else {
        setError("Biometric verification failed. Please log in with your password.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Biometric login failed");
    } finally {
      setLoading(null);
    }
  }

  const triggerGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setError(null);
      setLoading("google");
      try {
        const { user, isNewUser } = await googleSignIn(tokenResponse.access_token);
        setUser(user);
        afterLogin(isNewUser);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Google sign-in failed");
      } finally {
        setLoading(null);
      }
    },
    onError: () => {
      setError("Google sign-in was cancelled or failed. Please try again.");
      setLoading(null);
    },
  });

  async function handleSocialLogin(provider: "google" | "apple" | "microsoft") {
    if (provider === "google") {
      setLoading("google");
      triggerGoogleLogin();
      return;
    }
    setError(null);
    setLoading(provider);
    try {
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f1e7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.16),_transparent_24%),linear-gradient(180deg,_#fbf7f1_0%,_#efe6d8_100%)]" />
      <div className="premium-grid absolute inset-0 opacity-35" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center gap-10 px-4 py-10 lg:flex-row lg:items-center lg:px-10">
        <section className="max-w-xl text-stone-900">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-4 py-2 text-sm font-medium text-stone-600 shadow-sm backdrop-blur-md">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Built to make busy store days feel lighter
          </div>
          <h1 className="mt-6 max-w-lg text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-stone-950">
            Retail software that feels calm, clear, and ready in seconds.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-stone-600">
            StoreHub keeps checkout, inventory, reports, and your day-to-day decisions in one place, without the usual clutter.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              ["Checkout", "Fast point-of-sale flow with fewer taps."],
              ["Inventory", "Low stock and price changes stay easy to spot."],
              ["Reports", "A quick morning read on what matters today."],
            ].map(([title, body]) => (
              <div key={title} className="glass-panel rounded-[28px] p-4">
                <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full max-w-md">
          <div className="glass-panel rounded-[32px] p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-amber-400 via-orange-400 to-amber-600 text-white shadow-lg shadow-amber-200/80">
                <StoreGlyph />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-400">StoreHub</p>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-stone-950">Welcome back</h2>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              {(["google", "apple", "microsoft"] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => handleSocialLogin(provider)}
                  disabled={isLoading}
                  className="rounded-2xl border border-stone-200 bg-white/80 px-3 py-3 text-sm font-medium text-stone-700 transition hover:-translate-y-0.5 hover:bg-white disabled:opacity-50"
                >
                  <div className="flex items-center justify-center gap-2">
                    {loading === provider ? <Spinner /> : <SocialIcon provider={provider} />}
                    <span className="capitalize">{provider}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-stone-200" />
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">or continue with email</span>
              <div className="h-px flex-1 bg-stone-200" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-600">Email</span>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@yourstore.com"
                    className="w-full rounded-2xl border border-stone-200 bg-white/90 py-3.5 pl-11 pr-4 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                  />
                </div>
              </label>

              <label className="block">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-stone-600">Password</span>
                  <Link to="/forgot-password" className="text-sm font-medium text-amber-700 hover:text-amber-800">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-2xl border border-stone-200 bg-white/90 py-3.5 pl-11 pr-12 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((value) => !value)}
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-stone-500">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                  />
                  Keep me signed in
                </label>

                {biometricAvailable && (
                  <button
                    type="button"
                    onClick={handleBiometric}
                    disabled={isLoading}
                    className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-amber-700 disabled:opacity-50"
                  >
                    <Fingerprint className="h-4 w-4" />
                    Biometric
                  </button>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60"
              >
                {loading === "email" ? <Spinner dark /> : "Sign in to StoreHub"}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between text-sm">
              <Link to="/login/phone" className="inline-flex items-center gap-2 font-medium text-stone-500 transition hover:text-amber-700">
                <Smartphone className="h-4 w-4" />
                Phone login
              </Link>
              <Link to="/signup" className="font-medium text-amber-700 hover:text-amber-800">
                Create account
              </Link>
            </div>

            {isDev && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                Dev mode is on. Sign-up tokens are available in API server logs.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return <span className={`h-4 w-4 animate-spin rounded-full border-2 ${dark ? "border-white/40 border-t-white" : "border-stone-300 border-t-stone-700"}`} />;
}

function StoreGlyph() {
  return (
    <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
      <path d="M19 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Zm-9 8H7v-2h3v2Zm0-4H7V9h3v2Zm5 4h-3v-2h3v2Zm0-4h-3V9h3v2ZM7 3h10v2H7V3Z" />
    </svg>
  );
}

function SocialIcon({ provider }: { provider: "google" | "apple" | "microsoft" }) {
  if (provider === "google") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
      </svg>
    );
  }
  if (provider === "apple") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09Zm3.378-3.066c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701Z" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 21 21" fill="none">
      <path d="M10 0h10v10H10z" fill="#F25022" />
      <path d="M0 0h9.5v9.5H0z" fill="#7FBA00" />
      <path d="M10 10.5h10V21H10z" fill="#00A4EF" />
      <path d="M0 10.5h9.5V21H0z" fill="#FFB900" />
    </svg>
  );
}
