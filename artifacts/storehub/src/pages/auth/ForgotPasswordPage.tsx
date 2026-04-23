import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { forgotPassword } from "../../services/authService";
import { Mail, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react";
import { AuthShell } from "../../components/page-shell";

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [sent,    setSent]    = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send a reset link.">
        <Link to="/login" className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>

        {!sent ? (
          <>
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

              {error && (
                <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-sm text-red-700">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition disabled:opacity-60 flex items-center justify-center"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                ) : "Send reset link"}
              </button>
            </form>
          </>
        ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Check your email</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
              If an account with <strong>{email}</strong> exists, you'll receive a reset link shortly.
              Check your spam folder if you don't see it.
            </p>
              <button onClick={() => { setEmail(""); setSent(false); }} className="mt-5 text-sm font-medium text-amber-700 hover:text-amber-800">
              Try another email
            </button>
          </div>
        )}
    </AuthShell>
  );
}
