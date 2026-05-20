import smsService from "./smsService";
import emailService from "./emailService";

export interface Campaign {
  id: string;
  name: string;
  type: "sms" | "email";
  message: string;
  target: string[]; // list of phone numbers or emails
  scheduledAt?: string | null;
  createdAt: string;
  sent?: boolean;
}

const CAMPAIGNS_KEY = "storehub_marketing_campaigns";

function readAll(): Campaign[] {
  try {
    const raw = localStorage.getItem(CAMPAIGNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(items: Campaign[]) {
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(items));
}

export function createCampaign(c: Omit<Campaign, "id" | "createdAt">): Campaign {
  const out: Campaign = { ...c, id: `camp_${Date.now()}`, createdAt: new Date().toISOString() } as Campaign;
  const all = readAll();
  all.push(out);
  writeAll(all);
  return out;
}

export async function sendCampaignNow(campaignId: string) {
  const all = readAll();
  const c = all.find(x => x.id === campaignId);
  if (!c) throw new Error("Campaign not found");
  try {
    if (c.type === "sms") {
      await Promise.all(c.target.map(t => smsService.sendSMS(t, c.message)));
    } else {
      await Promise.all(c.target.map(t => emailService.sendEmail(t, c.name, c.message)));
    }
    c.sent = true;
    writeAll(all);
  } catch (e) {
    console.error('[marketingService] send failed', e);
    throw e;
  }
}

export default { createCampaign, sendCampaignNow };
