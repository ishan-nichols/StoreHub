import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface InviteInfo {
  email:     string;
  storeName: string;
  roleName?: string;
  metadata?: { name?: string };
}

export default function InviteAcceptPage() {
  const [, navigate] = useLocation();
  const params       = new URLSearchParams(window.location.search);
  const token        = params.get("token") ?? "";
  const emailParam   = params.get("email") ?? "";

  const [info,     setInfo]     = useState<InviteInfo | null>(null);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(true);
  const [submitting, setSub]    = useState(false);

  const [fullName,  setFullName]  = useState("");
  const [password,  setPassword]  = useState("");
  const [password2, setPassword2] = useState("");

  // Validate token on mount
  useEffect(() => {
    if (!token) { setError("Missing invite token."); setLoading(false); return; }
    fetch(`/api/auth/invite/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) {
          setInfo(d as InviteInfo);
          if (d.metadata?.name) setFullName(d.metadata.name as string);
        } else {
          setError(d.error ?? "Invalid or expired invitation.");
        }
      })
      .catch(() => setError("Failed to validate invitation."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) { setError("Passwords do not match."); return; }
    if (password.length < 8)    { setError("Password must be at least 8 characters."); return; }

    setSub(true);
    setError("");
    try {
      const res = await fetch("/api/auth/invite/accept", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ token, password, fullName }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to accept invitation."); return; }
      // Redirect to dashboard — auth cookies are now set
      navigate("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSub(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-zinc-500 text-sm">Validating invitation…</div>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-8 max-w-md w-full text-center">
          <div className="text-3xl mb-4">🔗</div>
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">Invalid Invitation</h1>
          <p className="text-zinc-500 text-sm">{error}</p>
          <p className="text-zinc-400 text-xs mt-4">Contact your store manager for a new invitation.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🎉</div>
          <h1 className="text-xl font-semibold text-zinc-900">You're invited!</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Join <strong>{info?.storeName}</strong>
            {info?.roleName ? ` as ${info.roleName}` : ""} on StoreHub
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
            <input
              type="email"
              value={emailParam || info?.email || ""}
              disabled
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg bg-zinc-50 text-zinc-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Your full name"
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Create a password"
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-zinc-400 mt-1">Min 8 chars, uppercase, number, special character</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Confirm password</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              placeholder="Repeat your password"
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating account…" : "Accept & Join"}
          </button>
        </form>

        <p className="text-xs text-center text-zinc-400 mt-4">
          Already have an account? <a href="/login" className="text-blue-600 hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
