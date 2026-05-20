import { useState, useEffect } from "react";
import {
  Users,
  Crown,
  Clock,
  Star,
  UserPlus,
  UserX,
  RefreshCw,
  Phone,
  ChevronRight,
  Megaphone,
  TrendingUp,
  X,
} from "lucide-react";
import { listCustomers, type Customer } from "../services/customerService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
}

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "Never";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return `${Math.floor(days / 30)} months ago`;
}

// ─── Smart Group Definitions ──────────────────────────────────────────────────

interface GroupDef {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  badge: string;
  filter: (customers: Customer[]) => Customer[];
}

function buildGroups(): GroupDef[] {
  const now = Date.now();
  const ms30 = 30 * 86_400_000;
  const ms60 = 60 * 86_400_000;

  return [
    {
      id: "all",
      name: "All Customers",
      description: "Your complete customer database",
      icon: <Users size={20} />,
      color: "bg-stone-100 text-stone-600",
      badge: "bg-stone-50",
      filter: (c) => c,
    },
    {
      id: "top_spenders",
      name: "Top Spenders",
      description: "Top 20% of customers by lifetime spend",
      icon: <Crown size={20} />,
      color: "bg-amber-100 text-amber-600",
      badge: "bg-amber-50",
      filter: (customers) => {
        const sorted = [...customers].sort((a, b) => b.totalSpent - a.totalSpent);
        return sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.2)));
      },
    },
    {
      id: "high_value",
      name: "High Value",
      description: "Customers who have spent $100 or more",
      icon: <TrendingUp size={20} />,
      color: "bg-emerald-100 text-emerald-600",
      badge: "bg-emerald-50",
      filter: (customers) => customers.filter((c) => c.totalSpent >= 100),
    },
    {
      id: "lapsed_30",
      name: "Lapsed — 30+ Days",
      description: "No visit in 30 or more days — need a nudge",
      icon: <Clock size={20} />,
      color: "bg-orange-100 text-orange-600",
      badge: "bg-orange-50",
      filter: (customers) =>
        customers.filter(
          (c) => !c.lastVisitAt || now - new Date(c.lastVisitAt).getTime() > ms30
        ),
    },
    {
      id: "win_back",
      name: "Win Back — 60+ Days",
      description: "At-risk customers with no visit in 60+ days",
      icon: <UserX size={20} />,
      color: "bg-red-100 text-red-600",
      badge: "bg-red-50",
      filter: (customers) =>
        customers.filter(
          (c) => !c.lastVisitAt || now - new Date(c.lastVisitAt).getTime() > ms60
        ),
    },
    {
      id: "loyal",
      name: "Loyalty Members",
      description: "Customers with 100 or more loyalty points",
      icon: <Star size={20} />,
      color: "bg-indigo-100 text-indigo-600",
      badge: "bg-indigo-50",
      filter: (customers) => customers.filter((c) => (c.loyaltyPoints ?? 0) >= 100),
    },
    {
      id: "new_customers",
      name: "New Customers",
      description: "Joined in the last 30 days",
      icon: <UserPlus size={20} />,
      color: "bg-pink-100 text-pink-600",
      badge: "bg-pink-50",
      filter: (customers) =>
        customers.filter(
          (c) => c.createdAt && now - new Date(c.createdAt).getTime() <= ms30
        ),
    },
  ];
}

// ─── Customer List Panel ──────────────────────────────────────────────────────

function GroupPanel({
  group,
  members,
  onClose,
  onCreateCampaign,
}: {
  group: GroupDef;
  members: Customer[];
  onClose: () => void;
  onCreateCampaign: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-white/60 bg-white/95 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white/90 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${group.color}`}>
              {group.icon}
            </div>
            <div>
              <h2 className="font-semibold text-stone-950">{group.name}</h2>
              <p className="text-xs text-stone-400">{members.length} customers</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-stone-100">
            <X size={18} className="text-stone-500" />
          </button>
        </div>

        <div className="border-b border-stone-100 px-6 py-3">
          <button
            onClick={onCreateCampaign}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
          >
            <Megaphone size={15} /> Send Campaign to This Group
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400">
              <Users size={28} className="mb-3 opacity-30" />
              <p className="text-sm">No customers in this group yet.</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-stone-50">
              {members.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-6 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-bold text-stone-600">
                    {(c.name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-stone-900">{c.name || "Unnamed"}</p>
                    {c.phone && (
                      <p className="flex items-center gap-1 text-xs text-stone-400">
                        <Phone size={10} /> {c.phone}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-stone-800">{fmt(c.totalSpent)}</p>
                    <p className="text-xs text-stone-400">{timeAgo(c.lastVisitAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Smart Groups Tab ─────────────────────────────────────────────────────────

export default function SmartGroupsTab({
  onNavigateToCampaigns,
}: {
  onNavigateToCampaigns?: () => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<GroupDef | null>(null);

  useEffect(() => {
    listCustomers()
      .then(setCustomers)
      .finally(() => setLoading(false));
  }, []);

  const groups = buildGroups();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <RefreshCw size={22} className="animate-spin text-stone-400" />
      </div>
    );
  }

  const selectedMembers = selectedGroup ? selectedGroup.filter(customers) : [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone-500">
        Pre-built customer segments — use them to target your campaigns.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const members = g.filter(customers);
          return (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g)}
              className="group rounded-[24px] border border-white/60 bg-white/70 p-5 text-left shadow-sm transition hover:bg-white hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${g.color}`}>
                  {g.icon}
                </div>
                <div className={`rounded-full px-3 py-1 text-sm font-bold text-stone-700 ${g.badge}`}>
                  {members.length}
                </div>
              </div>
              <p className="font-semibold text-stone-950">{g.name}</p>
              <p className="mt-0.5 text-xs text-stone-400">{g.description}</p>
              <div className="mt-3 flex items-center text-xs text-stone-400 group-hover:text-amber-500 transition">
                <span>View customers</span>
                <ChevronRight size={13} className="ml-1" />
              </div>
            </button>
          );
        })}
      </div>

      {selectedGroup && (
        <GroupPanel
          group={selectedGroup}
          members={selectedMembers}
          onClose={() => setSelectedGroup(null)}
          onCreateCampaign={() => {
            setSelectedGroup(null);
            onNavigateToCampaigns?.();
          }}
        />
      )}
    </div>
  );
}
