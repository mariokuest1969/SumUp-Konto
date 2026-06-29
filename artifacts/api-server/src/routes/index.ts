import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vouchersRouter from "./vouchers";
import dropboxRouter from "./dropbox";
import settingsRouter from "./settings";
import sumupRouter from "./sumup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vouchersRouter);
router.use(dropboxRouter);
router.use(settingsRouter);
router.use(sumupRouter);

export default router;
