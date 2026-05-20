// smartGroups.ts — placeholder for smart group generation
// Implement server-side or background job to recompute groups regularly. This client-side placeholder provides filtering helpers.

import { listCustomers } from "./customerService";

export async function computeTopSpenders(limit = 20) {
  const all = await listCustomers();
  return all.slice().sort((a: any, b: any) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, limit);
}

export async function computeLapsed(days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const all = await listCustomers();
  return all.filter((c: any) => !c.lastVisitAt || new Date(c.lastVisitAt).getTime() <= cutoff);
}

export default { computeTopSpenders, computeLapsed };
