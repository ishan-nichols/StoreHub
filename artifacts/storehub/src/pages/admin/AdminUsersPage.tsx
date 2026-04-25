import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Users, Search, Pencil, Trash2, Save, X, AlertCircle,
  CheckCircle2, RefreshCw, Key, LogIn, ShieldCheck, Store, Building2,
} from "lucide-react";
import AdminLayout from "./AdminLayout";
import { useAuth } from "../../contexts/AuthContext";
import {
  listAllUsers, updateStoreUser, resetUserPassword, deleteStore,
  getDeleteCascade,
  type AdminUser,
} from "../../services/adminService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    superadmin:    "bg-amber-500/10 text-amber-400 border-amber-600/30",
    business_owner: "bg-indigo-500/10 text-indigo-400 border-indigo-600/30",
    store_owner:   "bg-emerald-500/10 text-emerald-400 border-emerald-600/30",
  };
  const icons: Record<string, React.ReactNode> = {
    superadmin:     <ShieldCheck className="w-3 h-3" />,
    business_owner: <Building2 className="w-3 h-3" />,
    store_owner:    <Store className="w-3 h-3" />,
  };
  const labels: Record<string, string> = {
    superadmin:     "Super Admin",
    business_owner: "Business Owner",
    store_owner:    "Store Owner",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${styles[role] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
      {icons[role]}
      {labels[role] ?? role}
    </span>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({
  user, onClose, onDeleted,
}: {
  user: AdminUser; onClose: () => void; onDeleted: () => void;
}) {
  const [cascade, setCascade] = useState<Awaited<ReturnType<typeof getDeleteCascade>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    getDeleteCascade(user.id)
      .then(setCascade)
      .finally(() => setLoading(false));
  }, [user.id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteStore(user.id);
      onDeleted();
    } catch (e) {
      alert((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-100">Delete Account</h2>
            <p className="text-xs text-zinc-400">{user.fullName} · {user.email}</p>
          </div>
        </div>

        {loading ? (
          <div className="py-4 text-center text-zinc-500 text-sm">Checking impact…</div>
        ) : cascade?.blocked ? (
          <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-sm text-red-300">
            {cascade.reason}
          </div>
        ) : (
          <>
            <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-4 space-y-3 text-sm">
              <p className="font-medium text-amber-300">This will permanently delete:</p>
              <ul className="space-y-1 text-amber-200/80 list-disc list-inside">
                <li>The user account ({user.fullName})</li>
                {(cascade?.businesses?.length ?? 0) > 0 && (
                  <li>
                    {cascade!.businesses.length === 1
                      ? `Business: "${cascade!.businesses[0]}"`
                      : `${cascade!.businesses.length} businesses: ${cascade!.businesses.join(", ")}`}
                  </li>
                )}
                {(cascade?.stores?.length ?? 0) > 0 && (
                  <li>
                    {cascade!.stores.length === 1
                      ? `Store: "${cascade!.stores[0].storeName}"`
                      : `${cascade!.stores.length} stores: ${cascade!.stores.map(s => s.storeName).join(", ")}`}
                  </li>
                )}
                {(cascade?.stores?.length ?? 0) > 0 && (
                  <li>All products, sales, expenses, employees &amp; suppliers for each store</li>
                )}
              </ul>
              <p className="text-amber-400 font-medium">This cannot be undone.</p>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                Type <span className="font-mono text-zinc-200">DELETE</span> to confirm
              </label>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="DELETE"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm font-mono"
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} className="text-zinc-400">Cancel</Button>
          {!cascade?.blocked && !loading && (
            <Button
              onClick={handleDelete}
              disabled={confirm !== "DELETE" || deleting}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? "Deleting…" : "Delete forever"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Edit Row Modal ───────────────────────────────────────────────────────────

function EditModal({
  user, onClose, onSaved,
}: {
  user: AdminUser; onClose: () => void; onSaved: (updated: Partial<AdminUser>) => void;
}) {
  const [fields, setFields] = useState({
    fullName:    user.fullName,
    email:       user.email ?? "",
    phoneNumber: user.phoneNumber ?? "",
    role:        user.role,
  });
  const [saving, setSaving] = useState(false);
  const [resetPw, setResetPw] = useState("");
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  function set(k: string, v: string) { setFields(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    setSaving(true);
    try {
      await updateStoreUser(user.id, {
        fullName:    fields.fullName || undefined,
        email:       fields.email || undefined,
        phoneNumber: fields.phoneNumber,
        role:        fields.role || undefined,
      });
      onSaved({ fullName: fields.fullName, email: fields.email, phoneNumber: fields.phoneNumber, role: fields.role });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPw() {
    setResetting(true);
    try {
      const r = await resetUserPassword(user.id, resetPw.trim() || undefined);
      setTempPw(r.tempPassword);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100">Edit Account</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1"><X className="w-4 h-4" /></button>
        </div>

        {/* Account fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { label: "Full Name", key: "fullName", type: "text" },
            { label: "Email", key: "email", type: "email" },
            { label: "Phone Number", key: "phoneNumber", type: "tel" },
          ] as const).map(({ label, key, type }) => (
            <div key={key}>
              <label className="text-xs text-zinc-500 block mb-1">{label}</label>
              <Input type={type} value={fields[key]} onChange={(e) => set(key, e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm" />
            </div>
          ))}
          {user.role !== "superadmin" && (
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Role</label>
              <select value={fields.role} onChange={(e) => set("role", e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-md px-3 py-1.5 text-sm">
                <option value="store_owner">Store Owner</option>
                <option value="business_owner">Business Owner</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>

        {/* Password reset section */}
        {user.role !== "superadmin" && (
          <div className="border-t border-zinc-800 pt-4 space-y-3">
            <p className="text-xs font-medium text-zinc-400 flex items-center gap-1.5"><Key className="w-3.5 h-3.5" /> Reset Password</p>
            {tempPw ? (
              <div className="bg-emerald-950/50 border border-emerald-800 rounded-lg p-3 space-y-1">
                <p className="text-xs text-emerald-400">New password (copy now):</p>
                <p className="font-mono text-base text-emerald-200 break-all select-all">{tempPw}</p>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  placeholder="New password (blank = auto-generate)"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm flex-1"
                />
                <Button onClick={handleResetPw} disabled={resetting} variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1.5 h-8 shrink-0">
                  <RefreshCw className="w-3.5 h-3.5" />
                  {resetting ? "…" : "Reset"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ROLE_FILTERS = [
  { label: "All", value: "" },
  { label: "Super Admins", value: "superadmin" },
  { label: "Business Owners", value: "business_owner" },
  { label: "Store Owners", value: "store_owner" },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);

  const { switchToStore } = useAuth();

  function load(role?: string) {
    setLoading(true);
    listAllUsers(role || undefined)
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function handleRoleFilter(role: string) {
    setRoleFilter(role);
    load(role);
  }

  function handleUserSaved(userId: string, patch: Partial<AdminUser>) {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...patch } : u));
    setEditUser(null);
    setSaveFlash("Saved!");
    setTimeout(() => setSaveFlash(null), 3000);
  }

  function handleUserDeleted(userId: string) {
    setUsers(prev => prev.filter(u => u.id !== userId));
    setDeleteUser(null);
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Never";

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.phoneNumber ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout>
      {editUser && (
        <EditModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={(patch) => handleUserSaved(editUser.id, patch)}
        />
      )}
      {deleteUser && (
        <DeleteModal
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onDeleted={() => handleUserDeleted(deleteUser.id)}
        />
      )}

      <div className="p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              <h1 className="text-2xl font-bold text-zinc-100">Accounts</h1>
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">All user accounts on the platform.</p>
          </div>
          {saveFlash && (
            <span className="flex items-center gap-1 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> {saveFlash}
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className="bg-zinc-900 border-zinc-700 text-zinc-100 pl-9 h-9"
            />
          </div>
          <div className="flex rounded-lg overflow-hidden border border-zinc-700">
            {ROLE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => handleRoleFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  roleFilter === f.value
                    ? "bg-zinc-700 text-zinc-100"
                    : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-zinc-500 ml-auto">{filtered.length} account{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-12 bg-zinc-800 rounded animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">No accounts found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Created</th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium">Last Login</th>
                  <th className="text-right px-4 py-3 text-xs text-zinc-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
                          {u.fullName.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium text-zinc-200 whitespace-nowrap">{u.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{u.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                    <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{fmtDate(u.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* View store detail if store_owner */}
                        {u.role === "store_owner" && (
                          <Link href={`/admin/stores/${u.id}`}>
                            <a className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                              title="View store">
                              <Store className="w-3.5 h-3.5" />
                            </a>
                          </Link>
                        )}
                        {/* Enter store */}
                        {u.role === "store_owner" && (
                          <button
                            onClick={() => switchToStore(u.id, "/dashboard")}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-900/40 hover:text-emerald-400 transition-colors"
                            title="Enter store"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* Edit */}
                        <button
                          onClick={() => setEditUser(u)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                          title="Edit account"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {/* Delete — blocked for superadmin */}
                        {u.role !== "superadmin" && (
                          <button
                            onClick={() => setDeleteUser(u)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:bg-red-900/40 hover:text-red-400 transition-colors"
                            title="Delete account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
