import { Router, type IRouter, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router: IRouter = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PERMISSION_KEYS = [
  "pos", "inventory", "sales", "expenses", "reports",
  "suppliers", "customers", "cashflow", "compliance", "tax",
  "employees", "settings"
];

/**
 * POST /api/store/employees/suggest-permissions
 * Body: { jobTitle: string }
 * Returns: { permissions: Record<string, boolean>, explanation: string }
 */
router.post("/suggest-permissions", requireAuth as any, async (req: Request, res: Response) => {
  const { jobTitle } = req.body as { jobTitle?: string };
  if (!jobTitle) {
    res.status(400).json({ error: "jobTitle is required" });
    return;
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `You are a retail store permission management system. Given a job title, return the appropriate permissions as a JSON object.

Job title: "${jobTitle}"

Available permissions and what they control:
- pos: Point of Sale / checkout operations
- inventory: Manage products and stock levels
- sales: View orders and sales history
- expenses: View and record business expenses
- reports: View performance reports and analytics
- suppliers: Manage supplier contacts and orders
- customers: View and manage customer profiles
- cashflow: View cash flow forecasts
- compliance: View compliance/license tracking
- tax: View tax center and filings
- employees: Manage other employees and schedules
- settings: Change store settings

Return ONLY a JSON object with this exact structure (no explanation outside the JSON):
{
  "permissions": {
    "pos": true/false,
    "inventory": true/false,
    "sales": true/false,
    "expenses": true/false,
    "reports": true/false,
    "suppliers": true/false,
    "customers": true/false,
    "cashflow": true/false,
    "compliance": true/false,
    "tax": true/false,
    "employees": true/false,
    "settings": true/false
  },
  "explanation": "One sentence explaining why these permissions are appropriate for this role"
}`
      }]
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Failed to parse AI response" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate all keys are present
    const permissions: Record<string, boolean> = {};
    for (const key of PERMISSION_KEYS) {
      permissions[key] = Boolean(parsed.permissions?.[key]);
    }

    res.json({ permissions, explanation: parsed.explanation ?? "" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
