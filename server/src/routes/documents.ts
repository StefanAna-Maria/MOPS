import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
import { requireSession, type SessionVariables } from "../lib/session.js";
import { resolveContext } from "../lib/context.js";
import { categoryName, customCategoryNames, isUsersCategory } from "../lib/categories.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  amountToCents,
  centsToAmount,
  computeCategoryShares,
  DEFAULT_DOCUMENT_FILTER,
  DEFAULT_TIME_ZONE,
  DOCUMENT_FILTER_TYPES,
  isDocumentFilter,
  isValidTimeZone,
  monthBounds,
  monthVariationPercent,
  previousMonthBounds,
  todayInTimeZone,
  validateManualExpense,
  type CategoryBreakdownItem,
  type ExpenseDocument,
  type MonthSummary,
} from "@ocrinvoice/shared";

const documents = new Hono<{ Variables: SessionVariables }>();

documents.use("*", requireSession);

export const documentWithLines = { lines: { orderBy: { position: "asc" } } } satisfies Prisma.DocumentInclude;

type DocumentWithLines = Prisma.DocumentGetPayload<{ include: typeof documentWithLines }>;

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function utcDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** `customNames`: the user's own categories (US-03), to show their names; built-in ones are named from their code. */
export function serializeDocument(
  document: DocumentWithLines,
  customNames: Map<string, string> = new Map(),
): ExpenseDocument {
  return {
    id: document.id,
    context: document.companyId ? "company" : "personal",
    type: document.type,
    merchant: document.merchant,
    date: toIsoDate(document.date),
    time: document.time,
    total: document.total.toFixed(2),
    category: document.category,
    categoryName: categoryName(document.category, customNames),
    paymentMethod: document.paymentMethod,
    note: document.note,
    fileId: document.fileId,
    createdAt: document.createdAt.toISOString(),
    lines: document.lines.map((line) => ({
      id: line.id,
      position: line.position,
      name: line.name,
      amount: line.amount.toFixed(2),
      category: line.category,
      // US-09: invoice lines only; null for manual expenses and receipts.
      quantity: line.quantity === null ? null : line.quantity.toString(),
      unitPrice: line.unitPrice === null ? null : line.unitPrice.toFixed(2),
      vatAmount: line.vatAmount === null ? null : line.vatAmount.toFixed(2),
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


type SummaryDocumentInput = {
  total: Prisma.Decimal;
  category: string;
  lines?: Array<{ amount: Prisma.Decimal; category: string }>;
};

function aggregateMonthDocuments(
  docs: SummaryDocumentInput[],
  customNames: Map<string, string>,
): { totalCents: number; byCategory: CategoryBreakdownItem[] } {
  let totalCents = 0;
  const byCategoryMap = new Map<string, { cents: number; count: number }>();

  for (const doc of docs) {
    const docCents = amountToCents(doc.total.toFixed(2));
    totalCents += docCents;

    // For scanned receipts/invoices with product lines matching the document total, attribute each line
    // to its own category so multi-category receipts (e.g. Alimente + Beauty) reflect every category accurately.
    // Only split when every category's net contribution within the document is positive, so category sums always
    // add up to the exact monthly total (CA-16.2).
    const lines = doc.lines ?? [];
    const linesByCategory = new Map<string, number>();
    let linesSum = 0;
    for (const line of lines) {
      const lineCents = amountToCents(line.amount.toFixed(2));
      linesSum += lineCents;
      linesByCategory.set(line.category, (linesByCategory.get(line.category) ?? 0) + lineCents);
    }
    const canSplitByLines =
      lines.length > 0 &&
      linesSum === docCents &&
      [...linesByCategory.values()].every((cents) => cents > 0);

    if (canSplitByLines) {
      for (const [category, lineCents] of linesByCategory) {
        const entry = byCategoryMap.get(category) ?? { cents: 0, count: 0 };
        entry.cents += lineCents;
        entry.count += 1;
        byCategoryMap.set(category, entry);
      }
    } else {
      const entry = byCategoryMap.get(doc.category) ?? { cents: 0, count: 0 };
      entry.cents += docCents;
      entry.count += 1;
      byCategoryMap.set(doc.category, entry);
    }
  }

  const sortedCategories = [...byCategoryMap.entries()]
    .filter(([, { cents }]) => cents > 0)
    .map(([category, { cents, count }]) => ({
      category,
      categoryName: categoryName(category, customNames),
      total: centsToAmount(cents),
      count,
      cents,
    }))
    .sort((a, b) => b.cents - a.cents || a.categoryName.localeCompare(b.categoryName, "ro"));

  const shares = computeCategoryShares(sortedCategories.map((item) => item.cents));
  const byCategory: CategoryBreakdownItem[] = sortedCategories.map(({ cents: _cents, ...item }, index) => ({
    ...item,
    percent: shares[index],
  }));

  return { totalCents, byCategory };
}

function buildMonthSummary(
  month: string,
  previousMonth: string,
  currentDocuments: SummaryDocumentInput[],
  previousDocuments: SummaryDocumentInput[],
  customNames: Map<string, string>,
): MonthSummary {
  const current = aggregateMonthDocuments(currentDocuments, customNames);
  const previous = aggregateMonthDocuments(previousDocuments, customNames);
  const previousCents = previousDocuments.length > 0 ? previous.totalCents : null;

  return {
    month,
    total: centsToAmount(current.totalCents),
    count: currentDocuments.length,
    previousMonth,
    previousTotal: previousCents !== null ? centsToAmount(previousCents) : null,
    variationPercent: monthVariationPercent(current.totalCents, previousCents),
    byCategory: current.byCategory,
    previousByCategory: previous.byCategory,
  };
}

// CA-04.1 / CA-04.5 / CA-04.6 / US-05 / US-16: the signed-in user's documents from the current month in the phone's
// time zone, newest first, for one profile only (?context=personal|company), plus the full month's summary, category
// breakdown (current and previous month) and variation against the previous month (independent of the ?type= filter).
documents.get("/", async (c) => {
  const user = c.get("user");
  const context = await resolveContext(user.id, c.req.query("context"));
  if (!context.ok) {
    return c.json({ code: context.code }, context.status);
  }
  // CA-15.1: ?type=ALL|RECEIPTS|INVOICES|MANUAL shows only one kind of document; nothing means all of them.
  const filter = c.req.query("type") ?? DEFAULT_DOCUMENT_FILTER;
  if (!isDocumentFilter(filter)) {
    return c.json({ code: "INVALID_FILTER" }, 400);
  }
  const types = DOCUMENT_FILTER_TYPES[filter];
  const today = todayInTimeZone(requestTimeZone(c.req.header("X-Time-Zone")));
  const { start, end } = monthBounds(today);
  const prev = previousMonthBounds(today);
  const currentMonthWhere = {
    userId: user.id,
    companyId: context.companyId,
    date: { gte: utcDate(start), lt: utcDate(end) },
  };
  const summarySelect = { total: true, category: true, lines: { select: { amount: true, category: true } } };

  const [names, found, allCurrentForSummary, previousMonthDocs] = await Promise.all([
    customCategoryNames(user.id),
    prisma.document.findMany({
      where: {
        ...currentMonthWhere,
        ...(types ? { type: { in: [...types] } } : {}),
      },
      include: documentWithLines,
      orderBy: [{ date: "desc" }, { time: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    }),
    types
      ? prisma.document.findMany({
          where: currentMonthWhere,
          select: summarySelect,
        })
      : Promise.resolve(null),
    prisma.document.findMany({
      where: {
        userId: user.id,
        companyId: context.companyId,
        date: { gte: utcDate(prev.start), lt: utcDate(prev.end) },
      },
      select: summarySelect,
    }),
  ]);

  const summary = buildMonthSummary(
    start.slice(0, 7),
    prev.start.slice(0, 7),
    allCurrentForSummary ?? found,
    previousMonthDocs,
    names,
  );

  return c.json({
    month: start.slice(0, 7),
    documents: found.map((document) => serializeDocument(document, names)),
    summary,
  });
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
  return c.json({ document: serializeDocument(document, await customCategoryNames(user.id)) });
});

/** US-13: the fields of an edit, as the app sends them (`merchant` is the manual expense's description). */
const EDIT_FIELDS = ["merchant", "amount", "date", "category", "paymentMethod"] as const;

const EDIT_FIELD_OF_VALIDATION = { description: "merchant" } as const;

// CA-13.1 / CA-13.2: corrects a saved document: merchant, date, amount, category, payment and note, with the same
// checks as when an expense is added (CA-03). The app sends all of them (the note may be left out to have none).
// A manual expense has one product named and valued like the expense, which follows the edit; the products of a
// scanned receipt or invoice stay as they were read and checked (only the document's own values change).
// Another user's document gets the same 404 as a missing one.
documents.patch("/:id", async (c) => {
  const user = c.get("user");
  const existing = await prisma.document.findFirst({
    where: { id: c.req.param("id"), userId: user.id },
    include: documentWithLines,
  });
  if (!existing) {
    return c.json({ code: "DOCUMENT_NOT_FOUND" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const data = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  // validateManualExpense gives a missing category or payment a default; an edit must not reset them silently.
  const missing = EDIT_FIELDS.filter((field) => data[field] === undefined);
  if (missing.length > 0) {
    return c.json({ code: "INVALID_EXPENSE", fields: missing }, 400);
  }

  const today = todayInTimeZone(requestTimeZone(c.req.header("X-Time-Zone")));
  const result = validateManualExpense({ ...data, description: data.merchant }, today);
  if (!result.ok) {
    const fields = result.fields.map((field) => EDIT_FIELD_OF_VALIDATION[field as "description"] ?? field);
    return c.json({ code: "INVALID_EXPENSE", fields }, 400);
  }
  const edited = result.value;
  // US-03: a category the user created must be theirs (a built-in code is always fine).
  if (!(await isUsersCategory(user.id, edited.category))) {
    return c.json({ code: "INVALID_EXPENSE", fields: ["category"] }, 400);
  }

  const updated = await prisma.document.update({
    where: { id: existing.id },
    data: {
      merchant: edited.description,
      date: utcDate(edited.date),
      total: edited.amount,
      category: edited.category,
      paymentMethod: edited.paymentMethod,
      note: edited.note,
      ...(existing.type === "MANUAL"
        ? { lines: { updateMany: { where: {}, data: { name: edited.description, amount: edited.amount, category: edited.category } } } }
        : {}),
    },
    include: documentWithLines,
  });
  return c.json({ document: serializeDocument(updated, await customCategoryNames(user.id)) });
});

// CA-07.1 / CA-07.2: deletes one of the signed-in user's documents with its lines, so it leaves the list and the
// totals. Another user's document gets the same 404 as a missing one. A scanned photo stays stored (see US-12).
documents.delete("/:id", async (c) => {
  const user = c.get("user");
  const { count } = await prisma.document.deleteMany({ where: { id: c.req.param("id"), userId: user.id } });
  if (count === 0) {
    return c.json({ code: "DOCUMENT_NOT_FOUND" }, 404);
  }
  return c.body(null, 204);
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
  // US-03: a category the user created must be theirs (a built-in code is always fine).
  if (!(await isUsersCategory(user.id, result.value.category))) {
    return c.json({ code: "INVALID_EXPENSE", fields: ["category"] }, 400);
  }
  const names = await customCategoryNames(user.id);

  const context = await resolveContext(user.id, body?.context);
  if (!context.ok) {
    return c.json({ code: context.code }, context.status);
  }

  // CA-03.6: a retry or a second tap with the same request id returns the expense saved the first time.
  const existing = await findByRequestId(user.id, clientRequestId);
  if (existing) {
    return c.json({ document: serializeDocument(existing, names) }, 200);
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
    return c.json({ document: serializeDocument(created, names) }, 201);
  } catch (error) {
    // Two identical requests raced past the lookup above; the unique index kept only one.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const saved = await findByRequestId(user.id, clientRequestId);
      if (saved) {
        return c.json({ document: serializeDocument(saved, names) }, 200);
      }
    }
    throw error;
  }
});

export default documents;
