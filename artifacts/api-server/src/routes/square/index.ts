import { Router } from "express";

const router = Router();

// ── Environment detection ─────────────────────────────────────────────────────
// Square sandbox tokens start with "EAAAl" (developer test tokens).
// All other valid Square access tokens route to production.

function squareBaseUrl(token: string): string {
  return token.startsWith("EAAAl")
    ? "https://connect.squareupsandbox.com/v2"
    : "https://connect.squareup.com/v2";
}

// ── Transparent proxy ─────────────────────────────────────────────────────────
// Frontend calls POST /api/square/proxy with { token, path, method?, body? }.
// This route forwards to the correct Square environment, returns the response.
// The frontend never sees the token in a browser-visible network response.

router.post("/proxy", async (req, res) => {
  const { token, path, method = "GET", body, cursor } = req.body as {
    token: string;
    path: string;
    method?: string;
    body?: unknown;
    cursor?: string;
  };

  if (!token || !path) {
    res.status(400).json({ error: "token and path are required" });
    return;
  }

  const baseUrl = squareBaseUrl(token);
  const url = cursor ? `${baseUrl}${path}?cursor=${encodeURIComponent(cursor)}` : `${baseUrl}${path}`;

  const isSandbox = token.startsWith("EAAAl");
  console.log(`[Square] env=${isSandbox ? "sandbox" : "production"} ${method} ${path}`);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-01-17",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const errDetail = (data as { errors?: { detail?: string }[] })?.errors?.[0]?.detail ?? `HTTP ${response.status}`;
      console.error(`[Square] API error ${response.status} on ${method} ${path} | body sent: ${JSON.stringify(body)} | Square response: ${JSON.stringify(data)}`);
      res.status(response.status).json({ error: errDetail, raw: data });
      return;
    }

    // Debug: log catalog contents to help diagnose item count / name issues
    if (path.includes("/catalog/list")) {
      const objs = (data as { objects?: unknown[] }).objects ?? [];
      const byType: Record<string, number> = {};
      const itemNames: string[] = [];
      for (const o of objs) {
        const obj = o as { type?: string; item_data?: { name?: string; variations?: unknown[] } };
        const t = obj.type ?? "UNKNOWN";
        byType[t] = (byType[t] ?? 0) + 1;
        if (t === "ITEM" && obj.item_data?.name) {
          itemNames.push(`"${obj.item_data.name}" (${obj.item_data.variations?.length ?? 0} variations)`);
        }
      }
      console.log(`[Square] catalog/list: ${objs.length} objects by type: ${JSON.stringify(byType)}`);
      if (itemNames.length > 0) {
        console.log(`[Square] catalog ITEMs: ${itemNames.join(", ")}`);
      }
    }

    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Square] Fetch error:", msg);
    res.status(502).json({ error: `Square API unreachable: ${msg}` });
  }
});

export default router;
