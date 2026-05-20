import * as customerService from "./customerService";
import smsService from "./smsService";

const REWARD_THRESHOLD_KEY = "storehub_loyalty_reward_threshold";
const REWARD_TIERS_KEY = "storehub_loyalty_reward_tiers";

export interface RewardTier {
  name: string;
  pointsRequired: number;
  emoji: string;
}

const DEFAULT_TIERS: RewardTier[] = [
  { name: "Bronze", pointsRequired: 500,  emoji: "🥉" },
  { name: "Silver", pointsRequired: 1000, emoji: "🥈" },
  { name: "Gold",   pointsRequired: 2000, emoji: "🥇" },
];

export function getRewardTiers(): RewardTier[] {
  try {
    const raw = localStorage.getItem(REWARD_TIERS_KEY);
    if (!raw) return DEFAULT_TIERS;
    const parsed = JSON.parse(raw) as RewardTier[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TIERS;
  } catch {
    return DEFAULT_TIERS;
  }
}

export function setRewardTiers(tiers: RewardTier[]): void {
  localStorage.setItem(REWARD_TIERS_KEY, JSON.stringify(tiers));
  // Keep the legacy threshold in sync with the lowest tier so campaigns fire correctly.
  const sorted = [...tiers].sort((a, b) => a.pointsRequired - b.pointsRequired);
  if (sorted.length > 0) setRewardThreshold(sorted[0].pointsRequired);
}

export function getPointsPerDollar(): number {
  try {
    return (customerService as any).getPointsPerDollar?.() ?? 1;
  } catch {
    return 1;
  }
}

export function setRewardThreshold(points: number) {
  localStorage.setItem(REWARD_THRESHOLD_KEY, String(points));
}

export function getRewardThreshold(): number {
  const raw = localStorage.getItem(REWARD_THRESHOLD_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : DEFAULT_TIERS[0].pointsRequired;
}

export async function awardPointsForSale(customerId: string, saleTotal: number) {
  const ptsPerDollar = getPointsPerDollar();
  const pointsEarned = Math.round((saleTotal || 0) * ptsPerDollar);
  if (!customerId || pointsEarned <= 0) return;

  const before = await customerService.getCustomer(customerId).catch(() => null);
  const pointsBefore = before?.loyaltyPoints ?? 0;

  await customerService.addPoints(customerId, pointsEarned);

  try {
    const updated = await customerService.getCustomer(customerId);
    const pointsAfter = updated.loyaltyPoints ?? 0;
    const tiers = getRewardTiers().sort((a, b) => a.pointsRequired - b.pointsRequired);

    // Find the highest tier just crossed (was below, now at or above).
    const justUnlocked = tiers
      .filter((t) => pointsBefore < t.pointsRequired && pointsAfter >= t.pointsRequired)
      .pop(); // highest crossed tier

    if (justUnlocked && updated.phone) {
      const redemptionRate = parseFloat(localStorage.getItem("storehub_loyalty_redemption") ?? "100") || 100;
      const dollarValue = (justUnlocked.pointsRequired / redemptionRate).toFixed(2);
      const msg = `${justUnlocked.emoji} Congrats! You've unlocked the ${justUnlocked.name} reward — ${justUnlocked.pointsRequired} pts = $${dollarValue} off your next purchase. See you soon!`;
      smsService.sendSMS(updated.phone, msg).catch(() => {});
    }
  } catch (e) {
    console.warn('[loyaltyService] could not check tier thresholds', e);
  }
}

export default { awardPointsForSale, getPointsPerDollar, getRewardThreshold, setRewardThreshold, getRewardTiers, setRewardTiers };
