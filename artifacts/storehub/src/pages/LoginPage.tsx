import { useState } from "react";
import { useApp } from "../contexts/useApp";
import { useLocation } from "wouter";

/**
 * Auth-ready login screen.
 * Currently just bypasses auth with "Continue as Guest."
 * Routing and protected route structure already in place for when real auth is added.
 * Future: integrate Clerk/Auth.js/Replit Auth here.
 */
export default function LoginPage() {
  const { t } = useApp();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSkip() {
    setLocation("/onboarding");
  }

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    // Future: authenticate with real auth provider
    setLocation("/onboarding");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-1">
          <div className="text-4xl font-bold text-amber-600">StoreHub</div>
          <p className="text-gray-500 text-sm">{t.auth.subtitle}</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.auth.email}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.auth.password}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl py-3 transition-colors"
          >
            {t.auth.signIn}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs text-gray-400">
            <span className="bg-white px-2">or</span>
          </div>
        </div>

        <button
          onClick={handleSkip}
          className="w-full border border-gray-300 text-gray-600 font-medium rounded-xl py-3 hover:bg-gray-50 transition-colors text-sm"
        >
          {t.auth.skip}
        </button>

        <p className="text-center text-xs text-gray-400">{t.auth.forgotPassword}</p>
      </div>
    </div>
  );
}
