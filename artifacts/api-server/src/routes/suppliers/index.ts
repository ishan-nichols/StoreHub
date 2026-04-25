import { Router, type IRouter } from "express";
import intelligenceRouter from "./intelligence.js";

const router: IRouter = Router();

router.use("/", intelligenceRouter);

export default router;
