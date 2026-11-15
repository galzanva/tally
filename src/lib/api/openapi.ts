import { extendZodWithOpenApi, OpenApiGeneratorV31, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const AmountSchema = z.union([z.number(), z.string()]).openapi({ description: "Dollars, like 23.40 or \"23.40\"." });
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates look like 2026-11-15.");
export const TaxTagSchema = z.enum(["UNREVIEWED", "NONE", "BUSINESS", "MEDICAL", "CHARITABLE", "TAX_PAYMENT", "PROPERTY_TAX", "POSSIBLY_DEDUCTIBLE"]);

export const CreateExpenseSchema = z.object({
  amount: AmountSchema,
  date: DateSchema.optional(),
  merchant: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  paymentMethod: z.string().optional(),
  entity: z.string().optional(),
  taxTag: TaxTagSchema.optional(),
  essential: z.boolean().nullable().optional(),
  notes: z.string().optional(),
  receiptIds: z.array(z.string()).optional(),
  confirmLarge: z.boolean().optional(),
}).openapi("CreateExpense");

export const PatchExpenseSchema = CreateExpenseSchema.partial().extend({ applyAsNewRate: z.boolean().optional() }).openapi("PatchExpense");

export const PairSchema = z.object({
  code: z.string().min(4, "That pairing code isn't valid."),
  client: z.string().min(1, "Name the client, usually OpenClaw."),
}).openapi("PairRequest");

export const RecurringCreateSchema = z.object({
  name: z.string().min(1, "Name the recurring bill."),
  amount: AmountSchema,
  frequency: z.enum(["MONTHLY", "YEARLY"]),
  dayOfMonth: z.number().int().min(1).max(31),
  monthOfYear: z.number().int().min(1).max(12).optional(),
  amountType: z.enum(["FIXED", "VARIABLE"]),
  startOn: DateSchema.optional(),
  category: z.string(),
  merchant: z.string().optional(),
  paymentMethod: z.string().optional(),
  entity: z.string().optional(),
  taxTag: TaxTagSchema.optional(),
  essential: z.boolean().nullable().optional(),
}).openapi("CreateRecurring");

export const RateSchema = z.object({
  amount: AmountSchema,
  effectiveFrom: DateSchema,
  applyToPosted: z.boolean().optional(),
}).openapi("AddRate");

export const AskSchema = z.object({ question: z.string().min(1, "Ask a question about spending.") }).openapi("Ask");

const registry = new OpenAPIRegistry();
registry.registerComponent("securitySchemes", "bearer", { type: "http", scheme: "bearer", bearerFormat: "tly_" });

const json = (schema: z.ZodType) => ({ content: { "application/json": { schema } } });
const bearer = [{ bearer: [] }];

function path(method: "get" | "post" | "patch" | "delete", route: string, summary: string, scope: string | null, extras: Record<string, unknown> = {}) {
  registry.registerPath({
    method,
    path: route,
    summary,
    security: scope ? bearer : [],
    responses: { 200: { description: summary } },
    ...extras,
  });
}

path("post", "/api/v1/pair", "Redeem a pairing code", null, { request: { body: json(PairSchema) } });
path("get", "/api/v1/me", "Who this key belongs to", "any");
path("get", "/api/v1/categories", "Category names", "expenses:read");
path("get", "/api/v1/payment-methods", "Payment method names", "expenses:read");
path("get", "/api/v1/entities", "Entity names", "expenses:read");
path("post", "/api/v1/expenses", "Create an expense", "expenses:write", { request: { body: json(CreateExpenseSchema) } });
path("get", "/api/v1/expenses", "List expenses", "expenses:read");
path("get", "/api/v1/expenses/{id}", "Read an expense", "expenses:read");
path("patch", "/api/v1/expenses/{id}", "Update an expense", "expenses:write", { request: { body: json(PatchExpenseSchema) } });
path("delete", "/api/v1/expenses/{id}", "Soft-delete an expense", "expenses:write");
path("post", "/api/v1/expenses/{id}/restore", "Restore an expense", "expenses:write");
path("post", "/api/v1/receipts", "Upload a receipt", "receipts:write");
path("get", "/api/v1/receipts/{id}/file", "Download a receipt", "receipts:read");
path("get", "/api/v1/summary", "Spending summary", "expenses:read");
path("get", "/api/v1/recurring", "List recurring items", "recurring:read");
path("post", "/api/v1/recurring", "Create a recurring item", "recurring:write", { request: { body: json(RecurringCreateSchema) } });
path("patch", "/api/v1/recurring/{id}", "Update a recurring item", "recurring:write");
path("post", "/api/v1/recurring/{id}/rates", "Add a rate", "recurring:write", { request: { body: json(RateSchema) } });
path("post", "/api/v1/recurring/{id}/pause", "Pause", "recurring:write");
path("post", "/api/v1/recurring/{id}/resume", "Resume", "recurring:write");
path("post", "/api/v1/recurring/{id}/end", "End", "recurring:write");
path("post", "/api/v1/ask", "Ask a question", "insights:read", { request: { body: json(AskSchema) } });
path("get", "/api/v1/insights/latest", "Latest monthly review", "insights:read");
path("get", "/api/v1/openapi.json", "This document", null);

export function openApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: { title: "Tally", version: "1.0.0", description: "Expense API used by OpenClaw. Money goes in as dollars and comes back as cents plus amountFormatted." },
    servers: [{ url: process.env.APP_URL || "http://localhost:3000" }],
  });
}
