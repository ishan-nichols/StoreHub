import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-placeholder")) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  return new Anthropic({ apiKey });
}

// ─── POST /api/voice/query ────────────────────────────────────────────────────

router.post("/query", requireAuth as any, async (req: Request, res: Response) => {
  try {
    const { question, storeData } = req.body as {
      question: string;
      storeData: Record<string, unknown>;
    };

    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const anthropic = getAnthropicClient();

    const systemPrompt = `You are a helpful store assistant for a retail store. Answer the owner's question using the provided store data. Keep answers SHORT (2-3 sentences max), conversational, and in plain language. No markdown, no bullets — just a direct spoken answer.`;

    const userMessage = storeData
      ? `Store data: ${JSON.stringify(storeData, null, 2)}\n\nQuestion: ${question}`
      : question;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const answer = message.content[0].type === "text" ? message.content[0].text.trim() : "I could not process that question. Please try again.";

    res.json({ answer });
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes("not configured")) {
      res.status(503).json({ error: "AI not configured — add ANTHROPIC_API_KEY to .env" });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
