import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
import { requireSession, type SessionVariables } from "../lib/session.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  DEFAULT_TIME_ZONE,
  isDocumentContext,
  isValidTimeZone,
  monthBounds,
  todayInTimeZone,
  validateManualExpense,
  type ExpenseDocument,
} from "@ocrinvoice/shared";

const documents = new Hono<{ Variables: SessionVariables }>();

documents.use("*", requireSession);

const documentWithLines = { lines: { orderBy: { position: "asc" } } } satisfies Prisma.DocumentInclude;

type DocumentWithLines = Prisma.DocumentGetPayload<{ include: typeof documentWithLines }>;

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function serializeDocument(document: DocumentWithLines): ExpenseDocument {
  return {
    id: document.id,
    context: document.companyId ? "company" : "personal",
    type: document.type,
    merchant: document.merchant,
    date: toIsoDate(document.date),
    time: document.time,
    total: document.total.toFixed(2),
    category: document.category,
    paymentMethod: document.paymentMethod,
    note: document.note,
    createdAt: document.createdAt.toISOString(),
    lines: document.lines.map((line) => ({
      id: line.id,
      position: line.position,
      name: line.name,
      amount: line.amount.toFixed(2),
      category: line.category,
    })),
  };
}

export function requestTimeZone(header: string | undefined) {
  return isValidTimeZone(header) ? header : DEFAULT_TIME_ZONE;
}

function isClientRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);
}

function findByRequestId(userId: string, clientRequestId: string) {
  return prisma.document.findUnique({
    where: { userId_clientRequestId: { userId, clientRequestId } },
    include: documentWithLines,
  });
}

function utcDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

type ContextResult = { ok: true; companyId: string | null } | { ok: false; status: 400 | 404; code: string };

/**
 * The profile a request works in. "personal" (or nothing) means documents without a company; "company" means the
 * signed-in user's own company. The company is never taken from the request, so nobody can use another user's.
 */
async function resolveContext(userId: string, context: unknown): Promise<ContextResult> {
  if (context === undefined || context === null || context === "personal") {
    return { ok: true, companyId: null };
  }
  if (!isDocumentContext(context)) {
    return { ok: false, status: 400, code: "INVALID_CONTEXT" };
  }
  const company = await prisma.company.findUnique({ where: { ownerId: userId }, select: { id: true } });
  if (!company) {
    return { ok: false, status: 404, code: "COMPANY_NOT_FOUND" };
  }
  return { ok: true, companyId: company.id };
}

// CA-04.1 / CA-04.5 / CA-04.6: the signed-in user's documents from the current month in the phone's time zone,
// newest first, for one profile only (?context=personal|company): the personal and company lists never mix.
documents.get("/", async (c) => {
  const user = c.get("user");
  const context = await resolveContext(user.id, c.req.query("context"));
  if (!context.ok) {
    return c.json({ code: context.code }, context.status);
  }
  const today = todayInTimeZone(requestTimeZone(c.req.header("X-Time-Zone")));
  const { start, end } = monthBounds(today);

  const found = await prisma.document.findMany({
    where: { userId: user.id, companyId: context.companyId, date: { gte: utcDate(start), lt: utcDate(end) } },
    include: documentWithLines,
    orderBy: [{ date: "desc" }, { time: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });

  return c.json({ month: start.slice(0, 7), documents: found.map(serializeDocument) });
});

// CA-06.1 / CA-06.2: one document with its lines. Another user's document gets the same 404 as a missing one,
// so its existence is not revealed.
documents.get("/:id", async (c) => {
  const user = c.get("user");
  const document = await prisma.document.findFirst({
    where: { id: c.req.param("id"), userId: user.id },
    include: documentWithLines,
  });
  if (!document) {
    return c.json({ code: "DOCUMENT_NOT_FOUND" }, 404);
  }
  return c.json({ document: serializeDocument(document) });
});

documents.post("/manual", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const clientRequestId = body?.clientRequestId;
  if (!isClientRequestId(clientRequestId)) {
    return c.json({ code: "INVALID_REQUEST_ID" }, 400);
  }

  const today = todayInTimeZone(requestTimeZone(c.req.header("X-Time-Zone")));
  const result = validateManualExpense(body, today);
  if (!result.ok) {
    return c.json({ code: "INVALID_EXPENSE", fields: result.fields }, 400);
  }

  const context = await resolveContext(user.id, body?.context);
  if (!context.ok) {
    return c.json({ code: context.code }, context.status);
  }

  // CA-03.6: a retry or a second tap with the same request id returns the expense saved the first time.
  const existing = await findByRequestId(user.id, clientRequestId);
  if (existing) {
    return c.json({ document: serializeDocument(existing) }, 200);
  }

  const expense = result.value;
  try {
    const created = await prisma.document.create({
      data: {
        userId: user.id,
        companyId: context.companyId,
        type: "MANUAL",
        merchant: expense.description,
        date: utcDate(expense.date),
        time: null,
        total: expense.amount,
        category: expense.category,
        paymentMethod: expense.paymentMethod,
        note: expense.note,
        clientRequestId,
        lines: {
          create: [{ position: 1, name: expense.description, amount: expense.amount, category: expense.category }],
        },
      },
      include: documentWithLines,
    });
    return c.json({ document: serializeDocument(created) }, 201);
  } catch (error) {
    // Two identical requests raced past the lookup above; the unique index kept only one.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const saved = await findByRequestId(user.id, clientRequestId);
      if (saved) {
        return c.json({ document: serializeDocument(saved) }, 200);
      }
    }
    throw error;
  }
});

export default documents;
