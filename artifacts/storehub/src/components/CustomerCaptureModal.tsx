import React, { useState, useEffect } from "react";
import { X, User } from "lucide-react";
import { listCustomers, getCustomer } from "../services/customerService";

interface RecentCustomer {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
}

interface Props {
  onClose: () => void;
  onSave: (payload: { phone?: string; email?: string; consent: boolean; name?: string }) => void;
  defaultPhone?: string | null;
}

export default function CustomerCaptureModal({ onClose, onSave, defaultPhone }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(true);
  const [recent, setRecent] = useState<RecentCustomer[]>([]);
  const [selectedRecentPoints, setSelectedRecentPoints] = useState<number | null>(null);

  const handleSave = () => {
    if (!phone && !email && !name) {
      onClose();
      return;
    }
    onSave({ phone: phone || undefined, email: email || undefined, consent, name: name || undefined });
  };

  useEffect(() => {
    setPhone(defaultPhone ?? "");
  }, [defaultPhone]);

  useEffect(() => {
    let mounted = true;
    listCustomers()
      .then((all) => {
        if (!mounted) return;
        const recentList = (all || []).slice(0, 6).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }));
        setRecent(recentList);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Save customer contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">Save contact for loyalty & receipts.</p>

          <div className="flex gap-3">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <label className="block text-xs text-gray-700 mb-1">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" className="w-full px-3 py-2 border rounded-lg shadow-sm text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-700 mb-1">Phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="123-456-7890" className="w-full px-3 py-2 border rounded-lg shadow-sm text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-700 mb-1">Email</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" className="w-full px-3 py-2 border rounded-lg shadow-sm text-sm" />
                </div>
              </div>
            </div>
          </div>

          {recent.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Recent customers</p>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button
                    key={r.id}
                    onClick={async () => {
                      setName(r.name || "");
                      setPhone(r.phone || "");
                      setEmail(r.email || "");
                      setSelectedRecentPoints(null);
                      try {
                        const full = await getCustomer(r.id).catch(() => null);
                        if (full && (full as any).loyaltyPoints != null) {
                          setSelectedRecentPoints((full as any).loyaltyPoints);
                        }
                      } catch {}
                    }}
                    className="px-3 py-1.5 bg-gray-100 rounded-full text-xs text-gray-700 hover:bg-gray-200"
                  >
                    {r.name || r.phone}
                    {selectedRecentPoints != null && (
                      <span className="ml-2 text-xs text-amber-600">· {selectedRecentPoints} pts</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-xs">I have consent to message this customer. Reply STOP to unsubscribe.</span>
          </label>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg">Skip</button>
            <button onClick={handleSave} className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
