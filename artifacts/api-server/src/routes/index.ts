import { Router, type IRouter } from "express";
import healthRouter from "./health";
import toolsRouter from "./tools";
import adminRouter from "./admin";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(analyticsRouter);
router.use(toolsRouter);

export default router;
