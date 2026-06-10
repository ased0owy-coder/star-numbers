import { Router, type IRouter } from "express";
import healthRouter from "./health";
import detectNumbersRouter from "./detect-numbers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(detectNumbersRouter);

export default router;
