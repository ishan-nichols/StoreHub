import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import openaiRouter from "./openai/index.js";
import visionRouter from "./vision/index.js";
import insightsRouter from "./insights/index.js";
import authRouter from "./auth/index.js";
import barcodeRouter from "./barcode/index.js";
import upcRouter from "./upc/index.js";
import squareRouter from "./square/index.js";
import storehubRouter from "./storehub/index.js";
import adminRouter from "./admin/index.js";
import businessesRouter from "./businesses/index.js";
import onboardingRouter from "./onboarding/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/openai",      openaiRouter);
router.use("/vision",      visionRouter);
router.use("/insights",    insightsRouter);
router.use("/auth",        authRouter);
router.use("/barcode",     barcodeRouter);
router.use("/upc",         upcRouter);
router.use("/square",      squareRouter);
router.use("/store",       storehubRouter);
router.use("/admin",       adminRouter);
router.use("/businesses",  businessesRouter);
router.use("/onboarding",  onboardingRouter);

export default router;
