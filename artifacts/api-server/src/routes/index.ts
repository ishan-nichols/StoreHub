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

const router: IRouter = Router();

router.use(healthRouter);
router.use("/openai",   openaiRouter);
router.use("/vision",   visionRouter);
router.use("/insights", insightsRouter);
router.use("/auth",     authRouter);
router.use("/barcode",  barcodeRouter);
router.use("/upc",      upcRouter);
router.use("/square",   squareRouter);
router.use("/store",    storehubRouter);

export default router;
