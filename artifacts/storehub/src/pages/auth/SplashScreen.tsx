import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";

export default function SplashScreen() {
  const [, navigate]  = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      if (isAuthenticated) navigate("/");
      else navigate("/login");
    }, 1800);
    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, navigate]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-[#f7f1e7]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.16),_transparent_24%),linear-gradient(180deg,_#fbf7f1_0%,_#efe6d8_100%)]" />
      <div className="premium-grid absolute inset-0 opacity-35" />
      <div className="glass-panel relative flex items-center gap-4 rounded-[32px] px-8 py-7">
        <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-stone-950 text-white shadow-lg">
          <svg className="w-10 h-10 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2zm-9 8H7v-2h3v2zm0-4H7V9h3v2zm5 4h-3v-2h3v2zm0-4h-3V9h3v2zM7 3h10v2H7V3z"/>
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-950">StoreHub</h1>
          <p className="text-sm text-stone-500">Small business software with a calmer feel</p>
        </div>
      </div>

      <div className="relative mt-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-300 border-t-amber-500" />
      </div>
    </div>
  );
}
