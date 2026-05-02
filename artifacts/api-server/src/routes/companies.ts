import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import {
  CreateCompanyBody,
  UpdateCompanyBody,
  GetCompanyParams,
  UpdateCompanyParams,
  DeleteCompanyParams,
  ListCompaniesResponse,
  GetCompanyResponse,
  UpdateCompanyResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/companies", requireAuth, async (_req, res): Promise<void> => {
  const companies = await db
    .select()
    .from(companiesTable)
    .orderBy(companiesTable.id);
  res.json(ListCompaniesResponse.parse(companies));
});

router.post("/companies", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [company] = await db
    .insert(companiesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(GetCompanyResponse.parse(company));
});

router.get("/companies/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetCompanyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, params.data.id));
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(GetCompanyResponse.parse(company));
});

router.patch("/companies/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCompanyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [company] = await db
    .update(companiesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(companiesTable.id, params.data.id))
    .returning();
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(UpdateCompanyResponse.parse(company));
});

router.delete("/companies/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCompanyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(companiesTable).where(eq(companiesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
