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
    <div className="min-h-screen bg-emerald-600 flex flex-col items-center justify-center gap-6">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg">
          <svg className="w-10 h-10 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2zm-9 8H7v-2h3v2zm0-4H7V9h3v2zm5 4h-3v-2h3v2zm0-4h-3V9h3v2zM7 3h10v2H7V3z"/>
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">StoreHub</h1>
          <p className="text-emerald-200 text-sm">Small Business Manager</p>
        </div>
      </div>

      {/* Spinner */}
      <div className="mt-4">
        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    </div>
  );
}
