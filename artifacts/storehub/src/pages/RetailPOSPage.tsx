import { useEffect, useState } from "react";
import { useApp } from "../contexts/useApp";
import { getProducts } from "../services/dataService";
import { getCurrentShift } from "../services/cashDrawerService";
import type { Product } from "../schemas";
import { RetailPOS } from "../components/RetailPOS";
import { AlertCircle, Lock } from "lucide-react";

export default function RetailPOSPage() {
  const { profile, isLoading: profileLoading } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [managerPin, setManagerPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [posUnlocked, setPosUnlocked] = useState(() => localStorage.getItem("storehub_pos_unlocked") === "true");
  const [currentShift, setCurrentShift] = useState(() => getCurrentShift());

  const paymentsEnabled = profile?.paymentsEnabled !== false;
  const managerPinRequired = profile?.paymentSettings?.managerPinRequired === true;
  const shouldLock = paymentsEnabled && managerPinRequired && !posUnlocked && !currentShift;
  const showPOS = paymentsEnabled;

  useEffect(() => {
    async function load() {
      try {
        const prods = await getProducts();
        setProducts(prods);
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
    setCurrentShift(getCurrentShift());
  }, []);

  useEffect(() => {
    const handleProductsUpdated = () => {
      getProducts().then(setProducts).catch(console.error);
    };
    window.addEventListener("storehub:products-updated", handleProductsUpdated);

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "storehub_pos_unlocked") {
        setPosUnlocked(event.newValue === "true");
      }

      if (event.key === "storehub_current_shift") {
        setCurrentShift(getCurrentShift());
      }

      if (event.key === "storehub_products") {
        getProducts().then(setProducts).catch(console.error);
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storehub:products-updated", handleProductsUpdated);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const handleManagerPin = () => {
    const requiredPin = managerPinRequired ? "1234" : "";
    if (managerPin === requiredPin) {
      setPosUnlocked(true);
      localStorage.setItem("storehub_pos_unlocked", "true");
      setManagerPin("");
      setPinError("");
    } else {
      setPinError("Invalid PIN");
    }
  };

  if (profileLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center space-y-4">
          <div className="text-4xl animate-spin">⏳</div>
          <p className="text-gray-600 text-lg">Loading POS...</p>
        </div>
      </div>
    );
  }

  if (!showPOS) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center space-y-4">
          <div className="text-6xl">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900">Payments Not Enabled</h1>
          <p className="text-gray-600">
            Go to <strong>Settings → Payments & POS</strong> and toggle on the payments switch to use the POS system.
          </p>
          <a
            href="/settings"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg"
          >
            Open Settings
          </a>
        </div>
      </div>
    );
  }

  // Manager PIN lock screen
  if (shouldLock) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950/5 px-4 py-12">
        <div className="w-full max-w-xl overflow-hidden rounded-[36px] border border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur-xl">
          <div className="px-8 py-10 sm:px-10">
            <div className="flex items-center justify-center h-14 w-14 rounded-3xl bg-slate-100 text-slate-900 mb-6 mx-auto shadow-sm">
              <Lock className="h-6 w-6" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Manager PIN required</h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-500">
                Enter the manager PIN to unlock the POS for this session. Once unlocked, you can leave and return without re-entering it while the shift is active.
              </p>
            </div>

            <div className="mt-10 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">Manager PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={managerPin}
                onChange={(e) => {
                  setManagerPin(e.target.value);
                  setPinError("");
                }}
                placeholder="••••"
                className={`w-full rounded-3xl border px-5 py-4 text-center text-xl font-semibold tracking-[0.35em] text-slate-900 outline-none transition ${
                  pinError ? "border-rose-400 shadow-[0_0_0_4px_rgba(251,146,60,0.08)]" : "border-slate-200 focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                }`}
              />
              {pinError && <p className="text-sm font-medium text-rose-600">{pinError}</p>}
            </div>

            <button
              onClick={handleManagerPin}
              className="mt-8 flex w-full items-center justify-center rounded-full bg-slate-950 px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-slate-950/10 transition hover:bg-slate-800"
            >
              Unlock POS
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <RetailPOS products={products} />;
}
