import { Prisma, PrismaClient } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const OWNED = new Set([
  "Category",
  "Merchant",
  "PaymentMethod",
  "Entity",
  "Expense",
  "Receipt",
  "RecurringExpense",
  "ApiKey",
  "PairingCode",
  "AuditLog",
  "LlmUsage",
  "Insight",
]);

const LIST_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

type Query = (args: Record<string, unknown>) => Promise<unknown>;

function mentions(where: unknown, key: string): boolean {
  const stack: unknown[] = [where];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Object.prototype.hasOwnProperty.call(current, key)) return true;
    for (const value of Object.values(current as Record<string, unknown>)) stack.push(value);
  }
  return false;
}

function andWhere(where: unknown, extra: Record<string, unknown>) {
  if (!where || (typeof where === "object" && Object.keys(where as object).length === 0)) return extra;
  return { AND: [where, extra] };
}

function delegate(model: string) {
  const name = model.charAt(0).toLowerCase() + model.slice(1);
  return (prisma as unknown as Record<string, { findFirst: (args: unknown) => Promise<{ id: string } | null> }>)[name];
}

function stampUser(data: unknown, userId: string) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  return { ...(data as Record<string, unknown>), userId };
}

async function owns(model: string, where: Record<string, unknown> | undefined, userId: string) {
  const modelDelegate = delegate(model);
  if (!modelDelegate || !where) return false;
  if (typeof where.id === "string") {
    const row = await modelDelegate.findFirst({ where: { id: where.id, userId }, select: { id: true } });
    return Boolean(row);
  }
  if ("userId" in where && where.userId !== userId) return false;
  const row = await modelDelegate.findFirst({ where: andWhere(where, { userId }), select: { id: true } });
  return Boolean(row);
}

async function scopeRate(operation: string, args: Record<string, any>, query: Query, userId: string) {
  if (operation === "create") {
    const recurringId = args.data?.recurringId as string | undefined;
    const parent = await prisma.recurringExpense.findFirst({ where: { id: recurringId, userId }, select: { id: true } });
    if (!parent) throw new NotFoundError("That recurring item doesn't exist.");
    return query(args);
  }
  if (operation === "createMany") {
    const rows = (Array.isArray(args.data) ? args.data : [args.data]) as { recurringId?: string }[];
    for (const row of rows) {
      const parent = await prisma.recurringExpense.findFirst({ where: { id: row.recurringId, userId }, select: { id: true } });
      if (!parent) throw new NotFoundError("That recurring item doesn't exist.");
    }
    return query(args);
  }
  if (LIST_OPS.has(operation)) {
    return query({ ...args, where: andWhere(args.where, { recurring: { userId } }) });
  }
  if (["findUnique", "findUniqueOrThrow", "update", "delete"].includes(operation)) {
    const id = args.where?.id as string | undefined;
    const compound = args.where?.recurringId_effectiveFrom?.recurringId as string | undefined;
    const found = id
      ? await prisma.recurringRate.findFirst({ where: { id, recurring: { userId } }, select: { id: true } })
      : compound
        ? await prisma.recurringExpense.findFirst({ where: { id: compound, userId }, select: { id: true } })
        : null;
    if (!found) {
      if (operation === "findUnique") return null;
      throw new NotFoundError("That rate doesn't exist.");
    }
    return query(args);
  }
  return query(args);
}

async function applyScope(model: string, operation: string, args: Record<string, any>, query: Query, userId: string) {
  if (model === "RecurringRate") return scopeRate(operation, args, query, userId);
  if (!OWNED.has(model)) return query(args);

  if (operation === "create") {
    return query({ ...args, data: stampUser(args.data, userId) });
  }
  if (operation === "createMany") {
    const data = (Array.isArray(args.data) ? args.data : [args.data]).map((row: unknown) => stampUser(row, userId));
    return query({ ...args, data });
  }
  if (operation === "upsert") {
    const create = stampUser(args.create, userId);
    const where = args.where ?? {};
    for (const value of Object.values(where) as Record<string, unknown>[]) {
      if (value && typeof value === "object" && "userId" in value) value.userId = userId;
    }
    return query({ ...args, create, where });
  }
  if (operation === "update" || operation === "updateMany") {
    const data = { ...(args.data ?? {}) };
    delete data.userId;
    args = { ...args, data };
  }
  if (LIST_OPS.has(operation)) {
    let where = andWhere(args.where, { userId });
    if (model === "Expense" && operation !== "deleteMany" && !mentions(args.where, "deletedAt")) {
      where = andWhere(where, { deletedAt: null });
    }
    return query({ ...args, where });
  }
  if (["findUnique", "findUniqueOrThrow", "update", "delete"].includes(operation)) {
    const found = await owns(model, args.where, userId);
    if (!found) {
      if (operation === "findUnique") return null;
      throw new NotFoundError();
    }
    const row = await query(args);
    if (operation === "findUnique" && model === "Expense" && row && (row as { deletedAt?: Date | null }).deletedAt && !mentions(args.where, "deletedAt")) {
      return null;
    }
    return row;
  }
  return query(args);
}

type Delegate = {
  findMany: (args?: any) => Promise<any[]>;
  findFirst: (args?: any) => Promise<any>;
  findUnique: (args?: any) => Promise<any>;
  findFirstOrThrow: (args?: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  createMany: (args: any) => Promise<{ count: number }>;
  update: (args: any) => Promise<any>;
  updateMany: (args: any) => Promise<{ count: number }>;
  delete: (args: any) => Promise<any>;
  deleteMany: (args: any) => Promise<{ count: number }>;
  upsert: (args: any) => Promise<any>;
  count: (args?: any) => Promise<number>;
  aggregate: (args?: any) => Promise<any>;
  groupBy: (args?: any) => Promise<any[]>;
};

export type UserDb = {
  category: Delegate;
  merchant: Delegate;
  paymentMethod: Delegate;
  entity: Delegate;
  expense: Delegate;
  receipt: Delegate;
  recurringExpense: Delegate;
  recurringRate: Delegate;
  apiKey: Delegate;
  pairingCode: Delegate;
  auditLog: Delegate;
  llmUsage: Delegate;
  insight: Delegate;
};

export function forUser(userId: string) {
  if (!userId) throw new Error("A user id is required.");
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return applyScope(model, operation, args as Record<string, any>, query as Query, userId);
        },
      },
    },
  }) as unknown as UserDb;
}

export function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
