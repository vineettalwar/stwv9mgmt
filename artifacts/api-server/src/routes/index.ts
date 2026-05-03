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
import offersRouter from "./offers";
import contractsRouter from "./contracts";
import invoicesRouter from "./invoices";
import messagesRouter from "./messages";
import notificationsRouter from "./notifications";
import complianceRouter from "./compliance";
import adminDashboardRouter from "./adminDashboard";
import auditLogsRouter from "./auditLogs";
import reportsRouter from "./reports";
import expensesRouter from "./expenses";
import calendarRouter from "./calendar";
import resourcesRouter from "./resources";
import devRouter from "./dev";

const router: IRouter = Router();

// Dev-only routes (404 in production — see routes/dev.ts).
// IMPORTANT: must be mounted at the `/dev` prefix so the production 404
// gate inside `devRouter` only fires for `/api/dev/*` requests, not every
// `/api/*` request.
router.use("/dev", devRouter);

router.use(healthRouter);
router.use(companiesRouter);
router.use(usersRouter);
router.use(adminUsersRouter);
router.use(dashboardRouter);
router.use(adminDashboardRouter);
router.use(projectsRouter);
router.use(timeEntriesRouter);
router.use(deliverablesRouter);
router.use(milestonesRouter);
router.use(todosRouter);
router.use(offersRouter);
router.use(contractsRouter);
router.use(invoicesRouter);
router.use(messagesRouter);
router.use(notificationsRouter);
router.use(complianceRouter);
router.use(auditLogsRouter);
router.use(reportsRouter);
router.use(expensesRouter);
router.use(calendarRouter);
router.use(resourcesRouter);

export default router;
