import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vouchersRouter from "./vouchers";
import dropboxRouter from "./dropbox";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vouchersRouter);
router.use(dropboxRouter);
router.use(settingsRouter);

export default router;
