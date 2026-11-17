import { isDocumentContext } from "@ocrinvoice/shared";
import { prisma } from "./prisma.js";

export type ContextResult = { ok: true; companyId: string | null } | { ok: false; status: 400 | 404; code: string };

/**
 * The profile a request works in. "personal" (or nothing) means no company; "company" means the signed-in user's own
 * company. The company is never taken from the request, so nobody can use another user's.
 */
export async function resolveContext(userId: string, context: unknown): Promise<ContextResult> {
  if (context === undefined || context === null || context === "" || context === "personal") {
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
