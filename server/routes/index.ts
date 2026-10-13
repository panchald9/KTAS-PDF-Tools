import { Router } from "express";
import healthRouter from "./health";
import toolsRouter from "./tools";
import adminRouter from "./admin";
import analyticsRouter from "./analytics";

const router = Router();

router.use(healthRouter);
router.use(toolsRouter);
router.use(adminRouter);
router.use(analyticsRouter);

export default router;
