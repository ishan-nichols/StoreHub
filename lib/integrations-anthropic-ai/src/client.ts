import Anthropic from "@anthropic-ai/sdk";

function createClient() {
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Anthropic integration not configured. Set ANTHROPIC_API_KEY.");
  }
  return new Anthropic({ apiKey, baseURL });
}

let _client: Anthropic | null = null;

export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    if (!_client) _client = createClient();
    return (_client as unknown as Record<string | symbol, unknown>)[prop];
  },
});
