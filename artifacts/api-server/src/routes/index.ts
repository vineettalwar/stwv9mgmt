import { Router, type IRouter } from "express";
import healthRouter from "./health";
import companiesRouter from "./companies";
import usersRouter from "./users";
import adminUsersRouter from "./adminUsers";
import dashboardRouter from "./dashboard";
import projectsRouter from "./projects";
import timeEntriesRouter from "./timeEntries";
import deliverablesRouter from "./deliverables";
import milestonesRouter from "./milestones";
import todosRouter from "./todos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(companiesRouter);
router.use(usersRouter);
router.use(adminUsersRouter);
router.use(dashboardRouter);
router.use(projectsRouter);
router.use(timeEntriesRouter);
router.use(deliverablesRouter);
router.use(milestonesRouter);
router.use(todosRouter);

export default router;
