import { useState } from "react";
import { useLocation, Link } from "wouter";
import { ArrowLeft, Copy, CheckCheck, AlertCircle } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { createStore } from "../../services/adminService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BUSINESS_TYPES = [
  { value: "grocery",   label: "Grocery Store" },
  { value: "bakery",    label: "Bakery" },
  { value: "butcher",   label: "Butcher" },
  { value: "pharmacy",  label: "Pharmacy" },
  { value: "clothing",  label: "Clothing Store" },
  { value: "gas_station", label: "Gas Station / C-Store" },
  { value: "restaurant", label: "Restaurant" },
  { value: "other",     label: "Other" },
];

interface Created {
  userId: string;
  email: string;
  fullName: string;
  tempPassword: string;
}

export default function AdminCreateStorePage() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({
    email: "", fullName: "", storeName: "", businessType: "other", password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.fullName || !form.storeName) {
      setError("Email, owner name, and store name are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await createStore({
        email: form.email,
        fullName: form.fullName,
        storeName: form.storeName,
        businessType: form.businessType,
        password: form.password || undefined,
      });
      setCreated(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyCredentials() {
    if (!created) return;
    const text = `StoreHub Login\nEmail: ${created.email}\nTemporary Password: ${created.tempPassword}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (created) {
    return (
      <AdminLayout>
        <div className="p-8 max-w-lg mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Link href="/admin/stores">
              <a className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </a>
            </Link>
            <h1 className="text-2xl font-bold text-zinc-100">Store Created</h1>
          </div>

          <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-6 space-y-4">
            <p className="text-emerald-300 font-medium">
              Account created successfully. Share these credentials with the store owner.
            </p>
            <div className="bg-zinc-950 rounded-lg p-4 font-mono text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-500">Email</span>
                <span className="text-zinc-200">{created.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Temp Password</span>
                <span className="text-zinc-200">{created.tempPassword}</span>
              </div>
            </div>
            <Button
              onClick={copyCredentials}
              variant="outline"
              className="w-full gap-2 border-emerald-700 text-emerald-300 hover:bg-emerald-900"
            >
              {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Credentials"}
            </Button>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/stores/${created.userId}`)}
              className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              View Store
            </Button>
            <Button
              onClick={() => { setCreated(null); setForm({ email: "", fullName: "", storeName: "", businessType: "other", password: "" }); }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Create Another
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8 max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/stores">
            <a className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </a>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Create Store</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Set up a new store account</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-sm">Store Owner Email *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="owner@store.com"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-sm">Owner Full Name *</Label>
            <Input
              value={form.fullName}
              onChange={(e) => setField("fullName", e.target.value)}
              placeholder="Jane Smith"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-sm">Store Name *</Label>
            <Input
              value={form.storeName}
              onChange={(e) => setField("storeName", e.target.value)}
              placeholder="Jane's Grocery"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-sm">Business Type</Label>
            <Select value={form.businessType} onValueChange={(v) => setField("businessType", v)}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {BUSINESS_TYPES.map(({ value, label }) => (
                  <SelectItem key={value} value={value} className="text-zinc-300">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-sm">
              Temporary Password <span className="text-zinc-600">(auto-generated if blank)</span>
            </Label>
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              placeholder="Leave blank to auto-generate"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            {loading ? "Creating…" : "Create Store Account"}
          </Button>
        </form>

        <p className="text-xs text-zinc-600 text-center">
          The store owner will log in with the generated credentials and complete onboarding themselves.
        </p>
      </div>
    </AdminLayout>
  );
}
