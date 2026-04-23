import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/", async (req, res) => {
  const { storeContext, city, language = "en" } = req.body as {
    storeContext: string;
    city?: string;
    language?: string;
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let weatherSummary = "";
  if (city?.trim()) {
    try {
      const wr = await fetch(
        `https://wttr.in/${encodeURIComponent(city.trim())}?format=j1`,
        { headers: { "User-Agent": "StoreHub/1.0", Accept: "application/json" } }
      );
      if (wr.ok) {
        const wd = (await wr.json()) as Record<string, unknown>;
        const cur = (wd.current_condition as Record<string, unknown>[])?.[0];
        if (cur) {
          const desc = (cur.weatherDesc as { value: string }[])?.[0]?.value ?? "";
          const tempF = cur.temp_F as string;
          const tempC = cur.temp_C as string;
          const humid = cur.humidity as string;
          const windMph = cur.windspeedMiles as string;
          weatherSummary = `Current weather in ${city}: ${desc}, ${tempF}°F / ${tempC}°C, humidity ${humid}%, wind ${windMph} mph.`;
          const tmw = (wd.weather as Record<string, unknown>[])?.[1];
          if (tmw) {
            const hiF = tmw.maxtempF as string;
            const loF = tmw.mintempF as string;
            const tmwHour = (tmw.hourly as Record<string, unknown>[])?.[4];
            const tmwDesc = (tmwHour?.weatherDesc as { value: string }[])?.[0]?.value ?? "";
            weatherSummary += ` Tomorrow: ${tmwDesc}, high ${hiF}°F / low ${loF}°F.`;
          }
        }
      }
    } catch {
      // continue without weather
    }
  }

  const langNote = language === "es" ? "Respond entirely in Spanish." : "Respond in English.";

  const systemPrompt = `You are StoreHub AI, a sharp business advisor for small retail and grocery stores. Generate a practical business insights report. ${langNote}

IMPORTANT ACCURACY RULES:
- Only state facts that appear in the provided store data
- Never invent revenue numbers, sales counts, or inventory figures
- If data is missing, say so clearly
- Do not speculate about what the owner "might" do without basis in the data

Structure your report using these sections with markdown headers:

## Today's Performance
Analyze today's revenue, expenses, profit, and sales count. Note if data is limited.

## Smart Suggestions
Give 2-3 specific, actionable suggestions based on actual store data${weatherSummary ? " and the current weather" : ""}. Be concrete (e.g., mention actual product names from low-stock list when reordering, not generic advice).

## Tax Tip
One practical small business tax tip relevant to this store type. Cover deductions, quarterly payments, record keeping, or sales tax rules. Be specific.
${weatherSummary ? "\n## Weather Opportunity\nHow today's or tomorrow's weather creates a specific business opportunity or risk. What action should the owner take today?\n" : ""}
Keep the entire report under 350 words. Be direct and useful.`;

  const userMsg = `${weatherSummary ? `WEATHER: ${weatherSummary}\n\n` : ""}STORE DATA:\n${storeContext}`;

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ weather: weatherSummary, done: true })}\n\n`);
  } catch {
    res.write(`data: ${JSON.stringify({ error: "AI error", done: true })}\n\n`);
  }

  res.end();
});

export default router;
