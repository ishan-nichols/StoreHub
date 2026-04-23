import OpenAI from "openai";

function createClient() {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error("OpenAI integration not configured. Set AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY.");
  }
  return new OpenAI({ apiKey, baseURL });
}

let _client: OpenAI | null = null;

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    if (!_client) _client = createClient();
    return (_client as unknown as Record<string | symbol, unknown>)[prop];
  },
});
