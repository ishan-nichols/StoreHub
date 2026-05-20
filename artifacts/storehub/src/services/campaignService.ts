// ─────────────────────────────────────────────────────────────────────────────
// campaignService.ts — full marketing campaign management
//
// PRODUCTION CREDENTIALS — add these as environment secrets (never commit):
//
//   SMS via Twilio:
//     VITE_TWILIO_ACCOUNT_SID = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
//     VITE_TWILIO_AUTH_TOKEN  = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
//     VITE_TWILIO_FROM_NUMBER = "+15550001234"
//
//   Email via SendGrid:
//     VITE_SENDGRID_API_KEY    = "SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
//     VITE_SENDGRID_FROM_EMAIL = "noreply@yourstore.com"
//     VITE_SENDGRID_FROM_NAME  = "Your Store Name"
//
//   These plug into sendSms() and sendEmail() below. Move both calls
//   server-side so the credentials never reach the browser.
// ─────────────────────────────────────────────────────────────────────────────

import { listCustomers, type Customer } from "./customerService";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CampaignType   = "sms" | "email";
export type CampaignStatus = "draft" | "scheduled" | "sent";

export type AutomationTrigger =
  | "new_customer_welcome"
  | "lapsed_30_days"
  | "birthday"
  | "reward_unlocked"
  | "slow_day_blast"
  | "win_back_60_days";

export interface CampaignStats {
  delivered: number;
  opened:    number; // email only
  clicked:   number; // email only
  optedOut:  number;
  failed:    number;
}

export interface SendLogEntry {
  id:        string;
  recipient: string; // phone or email
  sentAt:    string; // ISO timestamp
  status:    "delivered" | "failed" | "opted_out";
  channel:   CampaignType;
}

export interface EmailBlock {
  id:            string;
  type:          "logo" | "text" | "image" | "offer" | "button";
  content:       string;
  buttonUrl?:    string;
  imageUrl?:     string;
  imageAlt?:     string;
  offerCode?:    string;
  offerDiscount?: string;
}

export interface Campaign {
  id:            string;
  name:          string;
  type:          CampaignType;
  audienceGroup: string;   // smart group id
  audienceSize:  number;
  message:       string;   // SMS body or plain-text fallback
  emailSubject?: string;
  emailBlocks?:  EmailBlock[];
  scheduledAt?:  string | null; // null = send immediately
  sentAt?:       string | null;
  status:        CampaignStatus;
  createdAt:     string;
  stats:         CampaignStats;
  sendLog:       SendLogEntry[];
}

export interface AutomationRule {
  id:               string;
  trigger:          AutomationTrigger;
  name:             string;
  description:      string;
  type:             CampaignType;
  message:          string;
  enabled:          boolean;
  firedThisMonth:   number;
  revenueGenerated: number;
  lastFiredAt?:     string | null;
}

export interface SmartGroup {
  id:            string;
  name:          string;
  description:   string;
  estimatedSize: number;
  icon:          string;
}

export interface CampaignAnalytics {
  totalSentThisMonth: number;
  deliveryRate:       number;
  openRate:           number;
  clickRate:          number;
  totalOptOuts:       number;
  revenueAttributed:  number;
  bestCampaign:       Campaign | null;
}

// ─── Opt-In / Opt-Out ────────────────────────────────────────────────────────
// Every send checks opt-out status first. SMS appends "Reply STOP to opt out."
// and email appends an unsubscribe link automatically.

const OPT_OUT_KEY = "storehub_opted_out";

function getOptedOut(): Set<string> {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(OPT_OUT_KEY) || "[]");
    return new Set(arr.map((s) => s.toLowerCase().trim()));
  } catch {
    return new Set();
  }
}

export function optOut(contact: string) {
  const set = getOptedOut();
  set.add(contact.toLowerCase().trim());
  localStorage.setItem(OPT_OUT_KEY, JSON.stringify([...set]));
}

export function isOptedOut(contact: string): boolean {
  return getOptedOut().has(contact.toLowerCase().trim());
}

// ─── Campaign CRUD ───────────────────────────────────────────────────────────

const CAMPAIGNS_KEY = "storehub_campaigns_v2";

function readCampaigns(): Campaign[] {
  try {
    return JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeCampaigns(list: Campaign[]) {
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(list));
}

export function listCampaigns(): Campaign[] {
  return readCampaigns();
}

export function getCampaign(id: string): Campaign | null {
  return readCampaigns().find((c) => c.id === id) ?? null;
}

export function createCampaign(
  payload: Omit<Campaign, "id" | "createdAt" | "stats" | "sendLog">
): Campaign {
  const campaign: Campaign = {
    ...payload,
    id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    stats: { delivered: 0, opened: 0, clicked: 0, optedOut: 0, failed: 0 },
    sendLog: [],
  };
  const all = readCampaigns();
  all.unshift(campaign);
  writeCampaigns(all);
  return campaign;
}

export function updateCampaign(id: string, patch: Partial<Campaign>): Campaign | null {
  const all = readCampaigns();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  writeCampaigns(all);
  return all[idx];
}

export function deleteCampaign(id: string) {
  writeCampaigns(readCampaigns().filter((c) => c.id !== id));
}

// ─── Delivery (shows exactly where Twilio / SendGrid credentials plug in) ────

// ── SMS via Twilio ──────────────────────────────────────────────────────────
// Move this call to your backend to keep credentials server-side.
//
//   Endpoint: POST /api/campaigns/:id/send-sms
//   Backend calls:
//     POST https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json
//     Authorization: Basic base64(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
//     Body: { From: TWILIO_FROM_NUMBER, To: phone, Body: message }
async function sendSms(_phone: string, _message: string): Promise<boolean> {
  // const TWILIO_ACCOUNT_SID = import.meta.env.VITE_TWILIO_ACCOUNT_SID;
  // const TWILIO_AUTH_TOKEN   = import.meta.env.VITE_TWILIO_AUTH_TOKEN;
  // const TWILIO_FROM_NUMBER  = import.meta.env.VITE_TWILIO_FROM_NUMBER;
  // → call your backend → Twilio
  return true; // simulated in dev
}

// ── Email via SendGrid ───────────────────────────────────────────────────────
// Move this call to your backend to keep credentials server-side.
//
//   Endpoint: POST /api/campaigns/:id/send-email
//   Backend calls:
//     POST https://api.sendgrid.com/v3/mail/send
//     Authorization: Bearer {SENDGRID_API_KEY}
//     Headers: List-Unsubscribe: <https://yourstore.com/unsubscribe?c={contact}>
//     Body: { from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
//             personalizations: [{ to: [{ email }] }],
//             subject, content: [{ type: "text/html", value: html }] }
async function sendEmail(_email: string, _subject: string, _html: string): Promise<boolean> {
  // const SENDGRID_API_KEY    = import.meta.env.VITE_SENDGRID_API_KEY;
  // const SENDGRID_FROM_EMAIL = import.meta.env.VITE_SENDGRID_FROM_EMAIL;
  // → call your backend → SendGrid
  return true; // simulated in dev
}

function buildEmailHtml(campaign: Campaign): string {
  if (!campaign.emailBlocks?.length) return `<p style="font-family:sans-serif">${campaign.message}</p>`;
  return campaign.emailBlocks
    .map((b) => {
      switch (b.type) {
        case "logo":
          return `<div style="text-align:center;padding:20px 0"><img src="${b.imageUrl ?? ""}" alt="Store Logo" style="max-height:60px"/></div>`;
        case "text":
          return `<p style="font-family:sans-serif;color:#1a1a1a;line-height:1.7;margin:0 0 12px">${b.content}</p>`;
        case "image":
          return `<img src="${b.imageUrl ?? ""}" alt="${b.imageAlt ?? b.content}" style="width:100%;border-radius:10px;display:block;margin:12px 0"/>`;
        case "offer":
          return `<div style="background:#fff7ed;border:2px dashed #f59e0b;border-radius:12px;padding:24px;text-align:center;margin:16px 0"><p style="font-size:14px;color:#92400e;margin:0 0 8px">${b.content}</p><strong style="font-size:28px;color:#b45309;letter-spacing:2px">${b.offerCode ?? ""}</strong><br/><span style="color:#92400e;font-size:12px;margin-top:4px;display:block">${b.offerDiscount ?? ""} off · Use code at checkout</span></div>`;
        case "button":
          return `<div style="text-align:center;margin:20px 0"><a href="${b.buttonUrl ?? "#"}" style="background:#1c1917;color:white;padding:14px 32px;border-radius:999px;text-decoration:none;font-family:sans-serif;font-weight:600;font-size:15px">${b.content}</a></div>`;
        default:
          return "";
      }
    })
    .join("\n");
}

export async function sendCampaignNow(
  campaignId: string,
  recipients: Array<{ contact: string }>
): Promise<void> {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");

  const optedOut = getOptedOut();
  const log: SendLogEntry[] = [];
  let delivered = 0, failed = 0, optedOutCount = 0;

  for (const { contact } of recipients) {
    const normalised = contact.toLowerCase().trim();
    const entryId = `log_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    if (optedOut.has(normalised)) {
      log.push({ id: entryId, recipient: contact, sentAt: new Date().toISOString(), status: "opted_out", channel: campaign.type });
      optedOutCount++;
      continue;
    }

    let ok = false;
    if (campaign.type === "sms") {
      // "Reply STOP to opt out." is always appended — required by TCPA
      const body = `${campaign.message}\n\nReply STOP to opt out.`;
      ok = await sendSms(contact, body);
    } else {
      // Unsubscribe link is always appended — required by CAN-SPAM
      const html =
        buildEmailHtml(campaign) +
        `<hr style="border:none;border-top:1px solid #e7e5e4;margin:32px 0"/>` +
        `<p style="font-size:11px;color:#a8a29e;text-align:center;font-family:sans-serif">To unsubscribe from marketing emails, <a href="https://yourstore.com/unsubscribe?contact=${encodeURIComponent(contact)}" style="color:#a8a29e">click here</a>.</p>`;
      ok = await sendEmail(contact, campaign.emailSubject ?? campaign.name, html);
    }

    log.push({
      id: entryId,
      recipient: contact,
      sentAt: new Date().toISOString(),
      status: ok ? "delivered" : "failed",
      channel: campaign.type,
    });
    if (ok) delivered++; else failed++;
  }

  updateCampaign(campaignId, {
    status: "sent",
    sentAt: new Date().toISOString(),
    stats: { ...campaign.stats, delivered, failed, optedOut: optedOutCount },
    sendLog: [...campaign.sendLog, ...log],
  });
}

// ─── Automation Rules ─────────────────────────────────────────────────────────

const AUTOMATIONS_KEY = "storehub_automations_v2";

const DEFAULT_AUTOMATIONS: AutomationRule[] = [
  {
    id: "auto_welcome",
    trigger: "new_customer_welcome",
    name: "New Customer Welcome",
    description: "Fires automatically after a customer's very first purchase",
    type: "sms",
    message: "Welcome! 🎉 We're so glad you chose us for your first purchase. You've started earning loyalty points — we can't wait to see you again!",
    enabled: false,
    firedThisMonth: 0,
    revenueGenerated: 0,
    lastFiredAt: null,
  },
  {
    id: "auto_lapsed_30",
    trigger: "lapsed_30_days",
    name: "Lapsed Customer — 30 Days",
    description: "Fires when a customer hasn't visited in 30 days",
    type: "sms",
    message: "Hey! We miss you 😊 It's been a little while since your last visit. Here's 10% off your next purchase — just show this text at checkout. Valid for 7 days!",
    enabled: false,
    firedThisMonth: 0,
    revenueGenerated: 0,
    lastFiredAt: null,
  },
  {
    id: "auto_birthday",
    trigger: "birthday",
    name: "Birthday Greeting",
    description: "Fires on the customer's birthday (requires birthday on file)",
    type: "sms",
    message: "Happy Birthday! 🎂 From all of us — wishing you an amazing day. Come celebrate with us and enjoy a special birthday treat on your next visit!",
    enabled: false,
    firedThisMonth: 0,
    revenueGenerated: 0,
    lastFiredAt: null,
  },
  {
    id: "auto_reward",
    trigger: "reward_unlocked",
    name: "Loyalty Reward Unlocked",
    description: "Fires the moment a customer earns enough points for a reward",
    type: "sms",
    message: "Great news! 🌟 You've just unlocked a loyalty reward. Your points are ready to redeem on your next visit. Treat yourself — you've earned it!",
    enabled: false,
    firedThisMonth: 0,
    revenueGenerated: 0,
    lastFiredAt: null,
  },
  {
    id: "auto_slow_day",
    trigger: "slow_day_blast",
    name: "Slow Day Blast",
    description: "Owner triggers manually during slow business periods",
    type: "sms",
    message: "📣 Today only — something special is waiting for you! Stop in before we close and mention this text for an exclusive offer. See you soon!",
    enabled: false,
    firedThisMonth: 0,
    revenueGenerated: 0,
    lastFiredAt: null,
  },
  {
    id: "auto_winback",
    trigger: "win_back_60_days",
    name: "Win Back — 60 Days",
    description: "Fires after 60 days of no visits with a bigger offer to re-engage",
    type: "sms",
    message: "We haven't seen you in a while and we'd love to have you back 💙 Here's an exclusive offer just for you: 20% off your next visit. This offer expires in 7 days — hope to see you soon!",
    enabled: false,
    firedThisMonth: 0,
    revenueGenerated: 0,
    lastFiredAt: null,
  },
];

function readAutomations(): AutomationRule[] {
  try {
    const stored: AutomationRule[] | null = JSON.parse(
      localStorage.getItem(AUTOMATIONS_KEY) || "null"
    );
    if (!stored) return DEFAULT_AUTOMATIONS;
    // merge stored state (enabled, fired counts) with defaults (in case new rules were added)
    const storedMap = new Map(stored.map((a) => [a.id, a]));
    return DEFAULT_AUTOMATIONS.map((def) => (storedMap.get(def.id) as AutomationRule) ?? def);
  } catch {
    return DEFAULT_AUTOMATIONS;
  }
}

function writeAutomations(rules: AutomationRule[]) {
  localStorage.setItem(AUTOMATIONS_KEY, JSON.stringify(rules));
}

export function listAutomations(): AutomationRule[] {
  return readAutomations();
}

export function toggleAutomation(id: string, enabled: boolean): AutomationRule | null {
  const all = readAutomations();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], enabled };
  writeAutomations(all);
  return all[idx];
}

export function updateAutomation(id: string, patch: Partial<AutomationRule>): AutomationRule | null {
  const all = readAutomations();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  writeAutomations(all);
  return all[idx];
}

// ─── Smart Audience Groups ────────────────────────────────────────────────────

export async function getSmartGroups(): Promise<SmartGroup[]> {
  let customers: Customer[] = [];
  try {
    customers = await listCustomers();
  } catch {
    // fall through with empty list
  }

  const now = Date.now();
  const ms30 = 30 * 86_400_000;
  const ms60 = 60 * 86_400_000;

  return [
    {
      id: "all",
      name: "All Customers",
      description: "Every opted-in customer in your database",
      estimatedSize: customers.length,
      icon: "Users",
    },
    {
      id: "top_spenders",
      name: "Top Spenders",
      description: "Top 20% of customers ranked by total lifetime spend",
      estimatedSize: Math.max(1, Math.ceil(customers.length * 0.2)),
      icon: "Crown",
    },
    {
      id: "lapsed_30",
      name: "Lapsed — 30+ Days",
      description: "Customers with no visit in 30 or more days",
      estimatedSize: customers.filter(
        (c) => !c.lastVisitAt || now - new Date(c.lastVisitAt).getTime() > ms30
      ).length,
      icon: "Clock",
    },
    {
      id: "win_back",
      name: "Win Back — 60+ Days",
      description: "At-risk customers with no visit in 60 or more days",
      estimatedSize: customers.filter(
        (c) => !c.lastVisitAt || now - new Date(c.lastVisitAt).getTime() > ms60
      ).length,
      icon: "UserX",
    },
    {
      id: "loyal",
      name: "Loyalty Members",
      description: "Customers with 100 or more loyalty points",
      estimatedSize: customers.filter((c) => (c.loyaltyPoints ?? 0) >= 100).length,
      icon: "Star",
    },
    {
      id: "new_customers",
      name: "New Customers",
      description: "Customers who joined in the last 30 days",
      estimatedSize: customers.filter(
        (c) => c.createdAt && now - new Date(c.createdAt).getTime() <= ms30
      ).length,
      icon: "UserPlus",
    },
  ];
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export function getAnalytics(): CampaignAnalytics {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const campaigns = readCampaigns();
  const thisMonth = campaigns.filter(
    (c) => c.sentAt && new Date(c.sentAt).getTime() >= monthStart
  );

  const totalSent      = thisMonth.reduce((s, c) => s + c.stats.delivered + c.stats.failed, 0);
  const totalDelivered = thisMonth.reduce((s, c) => s + c.stats.delivered, 0);
  const totalOpened    = thisMonth.reduce((s, c) => s + c.stats.opened, 0);
  const totalClicked   = thisMonth.reduce((s, c) => s + c.stats.clicked, 0);
  const totalOptOuts   = thisMonth.reduce((s, c) => s + c.stats.optedOut, 0);

  const deliveryRate = totalSent > 0 ? totalDelivered / totalSent : 0;
  const openRate     = totalDelivered > 0 ? totalOpened / totalDelivered : 0;
  const clickRate    = totalOpened > 0 ? totalClicked / totalOpened : 0;

  const sorted = [...thisMonth].sort((a, b) => b.stats.delivered - a.stats.delivered);
  const bestCampaign = sorted[0] ?? null;

  return {
    totalSentThisMonth: totalSent,
    deliveryRate,
    openRate,
    clickRate,
    totalOptOuts,
    revenueAttributed: 0, // TODO: link to sales by campaign attribution tag
    bestCampaign,
  };
}
