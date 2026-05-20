import { useState, useEffect } from "react";
import {
  Megaphone,
  Mail,
  MessageSquare,
  Calendar,
  BarChart2,
  Zap,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  Monitor,
  Plus,
  X,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  Users,
  Crown,
  Clock,
  Star,
  UserPlus,
  UserX,
  Send,
  Play,
  FileText,
  TrendingUp,
  Eye,
  MousePointer,
} from "lucide-react";
import {
  listCampaigns,
  createCampaign,
  deleteCampaign,
  sendCampaignNow,
  listAutomations,
  toggleAutomation,
  updateAutomation,
  getAnalytics,
  getSmartGroups,
  type Campaign,
  type CampaignType,
  type AutomationRule,
  type SmartGroup,
  type EmailBlock,
} from "../services/campaignService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function groupIcon(icon: string) {
  const map: Record<string, React.ReactNode> = {
    Users:     <Users size={16} />,
    Crown:     <Crown size={16} />,
    Clock:     <Clock size={16} />,
    Star:      <Star size={16} />,
    UserPlus:  <UserPlus size={16} />,
    UserX:     <UserX size={16} />,
  };
  return map[icon] ?? <Users size={16} />;
}

// ─── SMS Templates ────────────────────────────────────────────────────────────

const SMS_TEMPLATES = [
  {
    name: "Welcome",
    message: "Welcome! 🎉 We're so glad you chose us. Thanks for your purchase — you've already started earning loyalty points. We can't wait to see you again!",
  },
  {
    name: "We Miss You",
    message: "Hey! We miss you 😊 It's been a while since your last visit. Here's 10% off your next purchase — just show this message at checkout. Valid for 7 days!",
  },
  {
    name: "Birthday",
    message: "Happy Birthday! 🎂 From all of us — wishing you an amazing day. Come celebrate with us and enjoy a special birthday treat on your next visit!",
  },
  {
    name: "Special Offer",
    message: "Exclusive offer, just for you: 15% off your next purchase! 🎁 Show this message at checkout. Valid this week only — don't miss it!",
  },
  {
    name: "New Product",
    message: "Exciting news! 🆕 We just added something new we think you're going to love. Come check it out — we'd love to show you in person!",
  },
  {
    name: "Flash Sale",
    message: "⚡ FLASH SALE — today only! Incredible deals are waiting for you right now. Come in before we close and save big. Don't let this one pass!",
  },
  {
    name: "Loyalty Reward",
    message: "Great news! 🌟 You've unlocked a loyalty reward. Your points are ready to redeem on your next visit. Treat yourself — you've earned it!",
  },
];

// ─── Sub-Tab Navigation ───────────────────────────────────────────────────────

type SubTab = "active" | "past" | "automated" | "analytics";

// ─── Campaign Card ─────────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  onDelete,
}: {
  campaign: Campaign;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const statusColors: Record<Campaign["status"], string> = {
    sent:      "bg-emerald-100 text-emerald-700",
    scheduled: "bg-indigo-100 text-indigo-700",
    draft:     "bg-stone-100 text-stone-500",
  };

  return (
    <div className="rounded-[24px] border border-white/60 bg-white/70 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-stone-950 truncate">{campaign.name}</p>
            <span
              className={`shrink-0 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${campaign.type === "sms" ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"}`}
            >
              {campaign.type === "sms" ? <MessageSquare size={11} /> : <Mail size={11} />}
              {campaign.type === "sms" ? "Text" : "Email"}
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusColors[campaign.status]}`}>
              {campaign.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-400">
            To: <span className="font-medium text-stone-600">{campaign.audienceGroup.replace(/_/g, " ")}</span>
            {" · "}
            {campaign.audienceSize.toLocaleString()} recipients
            {" · "}
            {campaign.sentAt ? `Sent ${fmtDate(campaign.sentAt)}` : campaign.scheduledAt ? `Scheduled ${fmtDate(campaign.scheduledAt)}` : "Draft"}
          </p>
        </div>

        {confirming ? (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onDelete(campaign.id)}
              className="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs text-stone-500 hover:bg-stone-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded-xl p-1.5 text-stone-300 hover:bg-stone-50 hover:text-stone-500"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {campaign.status === "sent" && (
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-stone-100 pt-4">
          <div className="text-center">
            <p className="text-xs text-stone-400">Delivered</p>
            <p className="mt-0.5 text-lg font-bold text-stone-900">{campaign.stats.delivered.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-stone-400">{campaign.type === "email" ? "Opened" : "Received"}</p>
            <p className="mt-0.5 text-lg font-bold text-indigo-600">
              {campaign.type === "email" ? campaign.stats.opened.toLocaleString() : campaign.stats.delivered.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-stone-400">Clicked</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-600">{campaign.stats.clicked.toLocaleString()}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Automation Card ──────────────────────────────────────────────────────────

function AutomationCard({
  rule,
  onToggle,
  onEditMessage,
}: {
  rule: AutomationRule;
  onToggle: (id: string, enabled: boolean) => void;
  onEditMessage: (rule: AutomationRule) => void;
}) {
  const triggerColors: Record<string, string> = {
    new_customer_welcome: "bg-emerald-50 text-emerald-700",
    lapsed_30_days:       "bg-amber-50 text-amber-700",
    birthday:             "bg-pink-50 text-pink-700",
    reward_unlocked:      "bg-indigo-50 text-indigo-700",
    slow_day_blast:       "bg-orange-50 text-orange-700",
    win_back_60_days:     "bg-red-50 text-red-700",
  };

  return (
    <div className={`rounded-[24px] border p-5 shadow-sm transition ${rule.enabled ? "border-emerald-200 bg-emerald-50/40" : "border-white/60 bg-white/70"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-stone-950">{rule.name}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${triggerColors[rule.trigger] ?? "bg-stone-50 text-stone-500"}`}>
              {rule.type === "sms" ? "Text" : "Email"}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">{rule.description}</p>

          <div className="mt-3 flex items-center gap-4 text-xs text-stone-400">
            <span>
              <span className="font-semibold text-stone-700">{rule.firedThisMonth}</span> fired this month
            </span>
            <span>
              <span className="font-semibold text-emerald-700">${rule.revenueGenerated.toFixed(2)}</span> revenue
            </span>
            {rule.lastFiredAt && (
              <span>Last fired {fmtDate(rule.lastFiredAt)}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={() => onToggle(rule.id, !rule.enabled)}
            className="transition hover:opacity-75"
          >
            {rule.enabled ? (
              <ToggleRight size={36} className="text-emerald-500" />
            ) : (
              <ToggleLeft size={36} className="text-stone-300" />
            )}
          </button>
          <span className={`text-xs font-semibold ${rule.enabled ? "text-emerald-600" : "text-stone-400"}`}>
            {rule.enabled ? "Active" : "Off"}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-stone-100 pt-4">
        <p className="flex-1 truncate text-xs text-stone-500 italic">"{rule.message.slice(0, 80)}…"</p>
        <button
          onClick={() => onEditMessage(rule)}
          className="shrink-0 rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
        >
          Edit Message
        </button>
      </div>
    </div>
  );
}

// ─── Analytics View ───────────────────────────────────────────────────────────

function AnalyticsView() {
  const analytics = getAnalytics();
  const campaigns = listCampaigns().filter((c) => c.status === "sent");

  const tiles = [
    { label: "Sent This Month", value: analytics.totalSentThisMonth.toLocaleString(), icon: <Send size={16} className="text-indigo-500" />, bg: "bg-indigo-50" },
    { label: "Delivery Rate", value: pct(analytics.deliveryRate), icon: <CheckCircle size={16} className="text-emerald-500" />, bg: "bg-emerald-50" },
    { label: "Open Rate (Email)", value: pct(analytics.openRate), icon: <Eye size={16} className="text-amber-500" />, bg: "bg-amber-50" },
    { label: "Click Rate", value: pct(analytics.clickRate), icon: <MousePointer size={16} className="text-pink-500" />, bg: "bg-pink-50" },
    { label: "Opt-Outs", value: analytics.totalOptOuts.toLocaleString(), icon: <UserX size={16} className="text-red-400" />, bg: "bg-red-50" },
    { label: "Revenue Attributed", value: `$${analytics.revenueAttributed.toFixed(2)}`, icon: <TrendingUp size={16} className="text-stone-500" />, bg: "bg-stone-50" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className={`rounded-[20px] ${t.bg} p-4`}>
            <div className="mb-2">{t.icon}</div>
            <p className="text-2xl font-bold text-stone-900">{t.value}</p>
            <p className="mt-0.5 text-xs text-stone-500">{t.label}</p>
          </div>
        ))}
      </div>

      {analytics.bestCampaign && (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50/60 p-5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600">Best Campaign This Month</p>
          <p className="text-lg font-bold text-stone-950">{analytics.bestCampaign.name}</p>
          <p className="text-sm text-stone-500">
            {analytics.bestCampaign.stats.delivered.toLocaleString()} delivered ·{" "}
            {analytics.bestCampaign.audienceGroup.replace(/_/g, " ")}
          </p>
        </div>
      )}

      {campaigns.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-stone-700">All Campaigns Performance</h3>
          <div className="rounded-[20px] border border-stone-100 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-stone-500">Campaign</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500">Delivered</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500">Opened</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-stone-500">Clicked</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-stone-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-stone-800">{c.name}</p>
                      <p className="text-xs text-stone-400">{fmtDate(c.sentAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-stone-700">{c.stats.delivered}</td>
                    <td className="px-4 py-3 text-right text-indigo-600">{c.stats.opened}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{c.stats.clicked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {campaigns.length === 0 && (
        <div className="py-12 text-center text-stone-400">
          <BarChart2 size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No campaigns sent yet. Create your first campaign to see analytics here.</p>
        </div>
      )}
    </div>
  );
}

// ─── Phone Preview ────────────────────────────────────────────────────────────

function PhonePreview({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center">
      <p className="mb-3 text-xs font-medium text-stone-400">Preview</p>
      <div className="w-56 rounded-[36px] border-[6px] border-stone-800 bg-stone-800 shadow-xl">
        <div className="min-h-[360px] rounded-[30px] bg-stone-100 overflow-hidden">
          <div className="bg-stone-200/80 px-4 py-3 text-center text-xs font-medium text-stone-500">
            Messages
          </div>
          <div className="p-4">
            <div className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-300 text-xs font-semibold text-stone-600">
                S
              </div>
              <div className="max-w-[160px] rounded-[16px] rounded-tl-none bg-white px-3 py-2.5 shadow-sm">
                <p className="text-xs leading-relaxed text-stone-800 whitespace-pre-wrap">
                  {message || "Your message will appear here…"}
                </p>
                {message && (
                  <p className="mt-2 text-[10px] text-stone-400 border-t border-stone-100 pt-1.5">
                    Reply STOP to opt out.
                  </p>
                )}
              </div>
            </div>
            <p className="mt-2 text-right text-[10px] text-stone-400">Delivered</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Email Block Editor ───────────────────────────────────────────────────────

function EmailBlockEditor({
  block,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  block: EmailBlock;
  onUpdate: (patch: Partial<EmailBlock>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const typeLabels: Record<EmailBlock["type"], string> = {
    logo: "Store Logo",
    text: "Text Block",
    image: "Image",
    offer: "Offer / Coupon",
    button: "Button",
  };

  return (
    <div className="rounded-[20px] border border-stone-200 bg-stone-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {typeLabels[block.type]}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-200 disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-200 disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1 text-red-400 hover:bg-red-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {block.type === "logo" && (
        <p className="text-sm text-stone-400">Store logo — auto-filled from branding settings</p>
      )}
      {block.type === "text" && (
        <textarea
          rows={3}
          value={block.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="Write your message here…"
          className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400"
        />
      )}
      {block.type === "image" && (
        <div className="flex flex-col gap-2">
          <input
            value={block.imageUrl ?? ""}
            onChange={(e) => onUpdate({ imageUrl: e.target.value })}
            placeholder="Image URL (https://…)"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            value={block.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            placeholder="Alt text / description"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      )}
      {block.type === "offer" && (
        <div className="flex flex-col gap-2">
          <input
            value={block.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            placeholder="Offer headline (e.g. Exclusive deal for you!)"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex gap-2">
            <input
              value={block.offerCode ?? ""}
              onChange={(e) => onUpdate({ offerCode: e.target.value })}
              placeholder="Code (SAVE20)"
              className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
            <input
              value={block.offerDiscount ?? ""}
              onChange={(e) => onUpdate({ offerDiscount: e.target.value })}
              placeholder="20% off"
              className="flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      )}
      {block.type === "button" && (
        <div className="flex flex-col gap-2">
          <input
            value={block.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            placeholder="Button text (Shop Now)"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            value={block.buttonUrl ?? ""}
            onChange={(e) => onUpdate({ buttonUrl: e.target.value })}
            placeholder="Link URL (https://…)"
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      )}
    </div>
  );
}

// ─── Email Block Preview ──────────────────────────────────────────────────────

function EmailBlockPreview({ block }: { block: EmailBlock }) {
  switch (block.type) {
    case "logo":
      return (
        <div className="flex justify-center py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-800 text-xs font-bold text-white">
            LOGO
          </div>
        </div>
      );
    case "text":
      return (
        <p className="text-sm leading-relaxed text-stone-700">
          {block.content || <span className="italic text-stone-300">Text block…</span>}
        </p>
      );
    case "image":
      return block.imageUrl ? (
        <img src={block.imageUrl} alt={block.content} className="w-full rounded-lg object-cover" />
      ) : (
        <div className="flex h-24 items-center justify-center rounded-xl bg-stone-100 text-sm text-stone-400">
          Image placeholder
        </div>
      );
    case "offer":
      return (
        <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-center">
          <p className="text-xs text-amber-700">{block.content || "Offer headline"}</p>
          <p className="mt-1 text-xl font-bold tracking-widest text-amber-600">
            {block.offerCode || "CODE"}
          </p>
          <p className="text-xs text-amber-600">{block.offerDiscount || "Discount"} · Use at checkout</p>
        </div>
      );
    case "button":
      return (
        <div className="flex justify-center">
          <span className="inline-block rounded-full bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white">
            {block.content || "Button"}
          </span>
        </div>
      );
    default:
      return null;
  }
}

// ─── Email Builder (Step 3 Email) ─────────────────────────────────────────────

type BlockType = EmailBlock["type"];

function newBlock(type: BlockType): EmailBlock {
  return {
    id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    content: "",
  };
}

const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: "text",   label: "Text",    icon: <FileText size={14} /> },
  { type: "image",  label: "Image",   icon: <Monitor size={14} /> },
  { type: "offer",  label: "Coupon",  icon: <Star size={14} /> },
  { type: "button", label: "Button",  icon: <MousePointer size={14} /> },
];

function EmailBuilder({
  blocks,
  onChange,
  subject,
  onSubjectChange,
}: {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  subject: string;
  onSubjectChange: (s: string) => void;
}) {
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

  function updateBlock(id: string, patch: Partial<EmailBlock>) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function deleteBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= blocks.length) return;
    const copy = [...blocks];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  }

  function addBlock(type: BlockType) {
    onChange([...blocks, newBlock(type)]);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Subject line */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-stone-700">Email Subject</label>
        <input
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Your exclusive offer inside…"
          className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Block editor */}
        <div>
          <p className="mb-2 text-sm font-medium text-stone-700">Content Blocks</p>
          <div className="flex flex-col gap-2">
            {blocks.map((block, i) => (
              <EmailBlockEditor
                key={block.id}
                block={block}
                onUpdate={(patch) => updateBlock(block.id, patch)}
                onDelete={() => deleteBlock(block.id)}
                onMoveUp={() => moveBlock(block.id, -1)}
                onMoveDown={() => moveBlock(block.id, 1)}
                isFirst={i === 0}
                isLast={i === blocks.length - 1}
              />
            ))}
          </div>

          {/* Add block */}
          <div className="mt-3 flex flex-wrap gap-2">
            {BLOCK_TYPES.map((bt) => (
              <button
                key={bt.type}
                onClick={() => addBlock(bt.type)}
                className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
              >
                {bt.icon} + {bt.label}
              </button>
            ))}
            <button
              onClick={() => onChange([newBlock("logo"), ...blocks])}
              className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
            >
              <Star size={14} /> + Logo
            </button>
          </div>
          <p className="mt-2 text-xs text-stone-400">
            Unsubscribe link is added automatically to every email.
          </p>
        </div>

        {/* Preview */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-stone-700">Preview</p>
            <div className="flex gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1">
              <button
                onClick={() => setPreviewMode("desktop")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${previewMode === "desktop" ? "bg-white text-stone-900 shadow-sm" : "text-stone-400"}`}
              >
                <Monitor size={12} /> Desktop
              </button>
              <button
                onClick={() => setPreviewMode("mobile")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${previewMode === "mobile" ? "bg-white text-stone-900 shadow-sm" : "text-stone-400"}`}
              >
                <Smartphone size={12} /> Mobile
              </button>
            </div>
          </div>

          <div className={`overflow-auto rounded-[20px] border border-stone-200 bg-white ${previewMode === "mobile" ? "max-w-[375px] mx-auto" : "w-full"}`}>
            <div className="border-b border-stone-100 bg-stone-50 px-4 py-3">
              <p className="text-xs text-stone-400">Subject</p>
              <p className="text-sm font-medium text-stone-800">{subject || "(No subject)"}</p>
            </div>
            <div className="flex flex-col gap-4 p-5">
              {blocks.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-300">Add blocks to build your email</p>
              ) : (
                blocks.map((b) => <EmailBlockPreview key={b.id} block={b} />)
              )}
              <p className="mt-2 text-center text-xs text-stone-300">
                — Unsubscribe link added here automatically —
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create Campaign Wizard ───────────────────────────────────────────────────

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  type: CampaignType | null;
  group: SmartGroup | null;
  campaignName: string;
  message: string;
  emailSubject: string;
  emailBlocks: EmailBlock[];
  scheduleMode: "now" | "later";
  scheduleDate: string;
  scheduleTime: string;
}

function initialWizard(): WizardState {
  const tomorrow = new Date(Date.now() + 86_400_000);
  return {
    step: 1,
    type: null,
    group: null,
    campaignName: "",
    message: "",
    emailSubject: "",
    emailBlocks: [newBlock("text")],
    scheduleMode: "now",
    scheduleDate: tomorrow.toISOString().slice(0, 10),
    scheduleTime: "10:00",
  };
}

function CreateCampaignWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [state, setState] = useState<WizardState>(initialWizard);
  const [groups, setGroups] = useState<SmartGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSmartGroups()
      .then(setGroups)
      .finally(() => setLoadingGroups(false));
  }, []);

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  const canNext =
    (state.step === 1 && state.type !== null) ||
    (state.step === 2 && state.group !== null) ||
    (state.step === 3 && (state.type === "sms" ? state.message.trim().length > 0 : state.emailSubject.trim().length > 0)) ||
    (state.step === 4) ||
    false;

  async function handleSend(asDraft = false) {
    setSending(true);
    setError(null);
    try {
      const scheduledAt =
        asDraft
          ? null
          : state.scheduleMode === "later"
          ? new Date(`${state.scheduleDate}T${state.scheduleTime}`).toISOString()
          : null;

      const name =
        state.campaignName.trim() ||
        `${state.type === "sms" ? "Text" : "Email"} to ${state.group?.name} — ${new Date().toLocaleDateString()}`;

      const campaign = createCampaign({
        name,
        type: state.type!,
        audienceGroup: state.group!.id,
        audienceSize: state.group!.estimatedSize,
        message: state.message,
        emailSubject: state.emailSubject,
        emailBlocks: state.emailBlocks,
        scheduledAt,
        status: asDraft ? "draft" : state.scheduleMode === "later" ? "scheduled" : "sent",
      });

      if (!asDraft && state.scheduleMode === "now") {
        // Simulate sending to opted-in contacts
        await sendCampaignNow(campaign.id, []);
      }

      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const charCount = state.message.length;
  const msgParts = Math.ceil(charCount / 160) || 1;

  const STEPS = ["Type", "Audience", "Message", "Schedule", "Review"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col rounded-[30px] border border-white/60 bg-white shadow-2xl max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <Megaphone size={18} className="text-amber-500" />
            <h2 className="font-semibold text-stone-950">Create Campaign</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-stone-100">
            <X size={18} className="text-stone-400" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 border-b border-stone-100 px-6 py-3">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const active = state.step === n;
            const done = state.step > n;
            return (
              <div key={label} className="flex items-center">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition ${
                      done ? "bg-emerald-500 text-white" : active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-400"
                    }`}
                  >
                    {done ? <CheckCircle size={12} /> : n}
                  </div>
                  <span className={`text-xs font-medium ${active ? "text-stone-900" : "text-stone-400"}`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`mx-2 h-px w-6 flex-shrink-0 ${state.step > n ? "bg-emerald-300" : "bg-stone-200"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Step 1 — Type */}
          {state.step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-stone-500">Choose how you want to reach your customers.</p>
              <div className="grid grid-cols-2 gap-4">
                {(["sms", "email"] as CampaignType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => set("type", t)}
                    className={`rounded-[24px] border-2 p-6 text-left transition ${
                      state.type === t
                        ? "border-amber-400 bg-amber-50"
                        : "border-stone-200 bg-stone-50 hover:border-stone-300 hover:bg-white"
                    }`}
                  >
                    <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${t === "sms" ? "bg-indigo-100" : "bg-amber-100"}`}>
                      {t === "sms" ? <MessageSquare size={22} className="text-indigo-600" /> : <Mail size={22} className="text-amber-600" />}
                    </div>
                    <p className="font-semibold text-stone-950">{t === "sms" ? "Text Message" : "Email"}</p>
                    <p className="mt-1 text-xs text-stone-400">
                      {t === "sms"
                        ? "SMS delivered straight to your customers' phones"
                        : "Rich formatted email with images, offers, and buttons"}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — Audience */}
          {state.step === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-stone-500">Choose who receives this campaign. Only opted-in customers are included.</p>
              {loadingGroups ? (
                <div className="flex justify-center py-8">
                  <RefreshCw size={20} className="animate-spin text-stone-400" />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => set("group", g)}
                      className={`rounded-[20px] border-2 p-4 text-left transition ${
                        state.group?.id === g.id
                          ? "border-amber-400 bg-amber-50"
                          : "border-stone-200 bg-stone-50 hover:border-stone-300 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-stone-500">{groupIcon(g.icon)}</span>
                          <span className="font-semibold text-stone-900 text-sm">{g.name}</span>
                        </div>
                        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-bold text-stone-600">
                          ~{g.estimatedSize}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-stone-400">{g.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Message */}
          {state.step === 3 && state.type === "sms" && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700">Campaign Name</label>
                <input
                  value={state.campaignName}
                  onChange={(e) => set("campaignName", e.target.value)}
                  placeholder="Auto-generated if left blank"
                  className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <p className="text-sm font-medium text-stone-700">Quick Templates</p>
              <div className="flex flex-wrap gap-2">
                {SMS_TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => set("message", t.message)}
                    className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-amber-300 hover:bg-amber-50"
                  >
                    {t.name}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-stone-700">Message</label>
                    <span className={`text-xs ${charCount > 160 ? "text-amber-600 font-semibold" : "text-stone-400"}`}>
                      {charCount}/160 · {msgParts} part{msgParts !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={state.message}
                    onChange={(e) => set("message", e.target.value)}
                    placeholder="Write your text message here…"
                    className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <p className="mt-1.5 text-xs text-stone-400">
                    "Reply STOP to opt out." is added automatically.
                  </p>
                </div>
                <PhonePreview message={state.message} />
              </div>
            </div>
          )}

          {state.step === 3 && state.type === "email" && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700">Campaign Name</label>
                <input
                  value={state.campaignName}
                  onChange={(e) => set("campaignName", e.target.value)}
                  placeholder="Auto-generated if left blank"
                  className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <EmailBuilder
                blocks={state.emailBlocks}
                onChange={(blocks) => set("emailBlocks", blocks)}
                subject={state.emailSubject}
                onSubjectChange={(s) => set("emailSubject", s)}
              />
            </div>
          )}

          {/* Step 4 — Schedule */}
          {state.step === 4 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-stone-500">Choose when to deliver your campaign.</p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => set("scheduleMode", "now")}
                  className={`rounded-[24px] border-2 p-5 text-left transition ${
                    state.scheduleMode === "now"
                      ? "border-amber-400 bg-amber-50"
                      : "border-stone-200 bg-stone-50 hover:border-stone-300"
                  }`}
                >
                  <Play size={22} className={`mb-3 ${state.scheduleMode === "now" ? "text-amber-500" : "text-stone-400"}`} />
                  <p className="font-semibold text-stone-900">Send Now</p>
                  <p className="mt-1 text-xs text-stone-400">Deliver immediately after confirmation</p>
                </button>
                <button
                  onClick={() => set("scheduleMode", "later")}
                  className={`rounded-[24px] border-2 p-5 text-left transition ${
                    state.scheduleMode === "later"
                      ? "border-amber-400 bg-amber-50"
                      : "border-stone-200 bg-stone-50 hover:border-stone-300"
                  }`}
                >
                  <Calendar size={22} className={`mb-3 ${state.scheduleMode === "later" ? "text-amber-500" : "text-stone-400"}`} />
                  <p className="font-semibold text-stone-900">Schedule</p>
                  <p className="mt-1 text-xs text-stone-400">Pick a specific date and time</p>
                </button>
              </div>

              {state.scheduleMode === "later" && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1.5 block text-sm font-medium text-stone-700">Date</label>
                    <input
                      type="date"
                      value={state.scheduleDate}
                      onChange={(e) => set("scheduleDate", e.target.value)}
                      className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1.5 block text-sm font-medium text-stone-700">Time</label>
                    <input
                      type="time"
                      value={state.scheduleTime}
                      onChange={(e) => set("scheduleTime", e.target.value)}
                      className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5 — Review */}
          {state.step === 5 && (
            <div className="flex flex-col gap-5">
              <div className="rounded-[24px] bg-stone-50 p-5 flex flex-col gap-3">
                <h3 className="font-semibold text-stone-950">Campaign Summary</h3>
                <div className="grid grid-cols-2 gap-y-3 text-sm">
                  <span className="text-stone-400">Type</span>
                  <span className="font-medium text-stone-800 flex items-center gap-1.5">
                    {state.type === "sms" ? <MessageSquare size={13} className="text-indigo-500" /> : <Mail size={13} className="text-amber-500" />}
                    {state.type === "sms" ? "Text Message" : "Email"}
                  </span>
                  <span className="text-stone-400">Audience</span>
                  <span className="font-medium text-stone-800">{state.group?.name}</span>
                  <span className="text-stone-400">Recipients</span>
                  <span className="font-medium text-stone-800">~{state.group?.estimatedSize.toLocaleString()} opted-in contacts</span>
                  <span className="text-stone-400">Delivery</span>
                  <span className="font-medium text-stone-800">
                    {state.scheduleMode === "now"
                      ? "Send immediately"
                      : `Scheduled: ${state.scheduleDate} at ${state.scheduleTime}`}
                  </span>
                  {state.type === "sms" && (
                    <>
                      <span className="text-stone-400">Est. Cost</span>
                      <span className="font-medium text-stone-800">
                        ~${((state.group?.estimatedSize ?? 0) * 0.0079).toFixed(2)} (Twilio rate)
                      </span>
                    </>
                  )}
                  {state.type === "email" && (
                    <>
                      <span className="text-stone-400">Est. Cost</span>
                      <span className="font-medium text-stone-800">
                        ~${((state.group?.estimatedSize ?? 0) * 0.001).toFixed(2)} (SendGrid rate)
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Message preview */}
              {state.type === "sms" && state.message && (
                <div className="rounded-[20px] border border-stone-200 bg-stone-50 p-4">
                  <p className="mb-2 text-xs font-semibold text-stone-500">Message Preview</p>
                  <p className="text-sm text-stone-700 whitespace-pre-wrap">{state.message}</p>
                  <p className="mt-2 text-xs text-stone-400">Reply STOP to opt out. (appended automatically)</p>
                </div>
              )}

              {/* Compliance checklist */}
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-4">
                <p className="mb-3 text-xs font-semibold text-emerald-700">Compliance Check</p>
                {[
                  "Only opted-in customers will receive this campaign",
                  state.type === "sms"
                    ? '"Reply STOP to opt out." appended to every text'
                    : "Unsubscribe link appended to every email",
                  "Opted-out contacts are permanently excluded from all sends",
                  "Every send is logged with timestamp and delivery status",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2 mb-1.5">
                    <CheckCircle size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                    <span className="text-xs text-emerald-800">{item}</span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4">
          <button
            onClick={() => state.step > 1 ? setState((s) => ({ ...s, step: (s.step - 1) as WizardState["step"] })) : onClose()}
            className="flex items-center gap-2 rounded-2xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
          >
            <ArrowLeft size={15} />
            {state.step === 1 ? "Cancel" : "Back"}
          </button>

          <div className="flex items-center gap-2">
            {state.step === 5 && (
              <button
                onClick={() => handleSend(true)}
                disabled={sending}
                className="rounded-2xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-60"
              >
                Save as Draft
              </button>
            )}
            {state.step < 5 ? (
              <button
                onClick={() => setState((s) => ({ ...s, step: (s.step + 1) as WizardState["step"] }))}
                disabled={!canNext}
                className="flex items-center gap-2 rounded-2xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-40"
              >
                Continue <ArrowRight size={15} />
              </button>
            ) : (
              <button
                onClick={() => handleSend(false)}
                disabled={sending}
                className="flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {sending ? (
                  <><RefreshCw size={15} className="animate-spin" /> Sending…</>
                ) : (
                  <><Send size={15} /> {state.scheduleMode === "later" ? "Schedule Campaign" : "Send Campaign"}</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Automation Message Modal ────────────────────────────────────────────

function EditAutomationModal({
  rule,
  onClose,
  onSaved,
}: {
  rule: AutomationRule;
  onClose: () => void;
  onSaved: (updated: AutomationRule) => void;
}) {
  const [message, setMessage] = useState(rule.message);

  function handleSave() {
    const updated = updateAutomation(rule.id, { message });
    if (updated) onSaved(updated);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] border border-white/60 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-stone-950">{rule.name} — Message</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-stone-100">
            <X size={16} className="text-stone-400" />
          </button>
        </div>
        <p className="mb-3 text-xs text-stone-400">
          Use {"{name}"} for customer name and {"{storeName}"} for your store name.
          "Reply STOP to opt out." is always appended automatically.
        </p>
        <textarea
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400"
        />
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-2xl border border-stone-200 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Save Message
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Campaigns Tab (main export) ──────────────────────────────────────────────

export default function CampaignsTab() {
  const [subTab, setSubTab] = useState<SubTab>("active");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<AutomationRule | null>(null);

  function refresh() {
    setCampaigns(listCampaigns());
    setAutomations(listAutomations());
  }

  useEffect(() => {
    refresh();
  }, []);

  const activeCampaigns = campaigns.filter((c) => c.status === "draft" || c.status === "scheduled");
  const pastCampaigns   = campaigns.filter((c) => c.status === "sent");

  function handleDelete(id: string) {
    deleteCampaign(id);
    refresh();
  }

  function handleToggleAutomation(id: string, enabled: boolean) {
    toggleAutomation(id, enabled);
    setAutomations(listAutomations());
  }

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "active",    label: "Active",    icon: <Play size={14} />,       count: activeCampaigns.length || undefined },
    { id: "past",      label: "Past",      icon: <FileText size={14} />,   count: pastCampaigns.length || undefined },
    { id: "automated", label: "Automated", icon: <Zap size={14} />,        count: automations.filter((a) => a.enabled).length || undefined },
    { id: "analytics", label: "Analytics", icon: <BarChart2 size={14} /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-stone-950">Campaigns</h2>
          <p className="text-sm text-stone-400">Send targeted messages and automate your marketing</p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
        >
          <Plus size={16} /> Create Campaign
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition ${
              subTab === t.id
                ? "bg-stone-900 text-white"
                : "border border-stone-200 bg-white/80 text-stone-600 hover:bg-white"
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${subTab === t.id ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active campaigns */}
      {subTab === "active" && (
        <div className="flex flex-col gap-3">
          {activeCampaigns.length === 0 ? (
            <div className="py-16 text-center text-stone-400">
              <Megaphone size={36} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">No active campaigns</p>
              <p className="mt-1 text-sm">Create a campaign to start reaching your customers.</p>
              <button
                onClick={() => setShowWizard(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
              >
                <Plus size={15} /> Create Campaign
              </button>
            </div>
          ) : (
            activeCampaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} onDelete={handleDelete} />
            ))
          )}
        </div>
      )}

      {/* Past campaigns */}
      {subTab === "past" && (
        <div className="flex flex-col gap-3">
          {pastCampaigns.length === 0 ? (
            <div className="py-16 text-center text-stone-400">
              <FileText size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">No sent campaigns yet.</p>
            </div>
          ) : (
            pastCampaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} onDelete={handleDelete} />
            ))
          )}
        </div>
      )}

      {/* Automated campaigns */}
      {subTab === "automated" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-[20px] border border-indigo-200 bg-indigo-50 px-4 py-3">
            <Zap size={16} className="shrink-0 text-indigo-500" />
            <p className="text-sm text-indigo-700">
              Automated campaigns run in the background. Toggle them on to start sending. All automations respect opt-out preferences and never send to unsubscribed contacts.
            </p>
          </div>
          {automations.map((rule) => (
            <AutomationCard
              key={rule.id}
              rule={rule}
              onToggle={handleToggleAutomation}
              onEditMessage={(r) => setEditingAutomation(r)}
            />
          ))}
        </div>
      )}

      {/* Analytics */}
      {subTab === "analytics" && <AnalyticsView />}

      {/* Modals */}
      {showWizard && (
        <CreateCampaignWizard
          onClose={() => setShowWizard(false)}
          onCreated={() => {
            setShowWizard(false);
            refresh();
            setSubTab("active");
          }}
        />
      )}

      {editingAutomation && (
        <EditAutomationModal
          rule={editingAutomation}
          onClose={() => setEditingAutomation(null)}
          onSaved={(updated) => {
            setAutomations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setEditingAutomation(null);
          }}
        />
      )}
    </div>
  );
}
