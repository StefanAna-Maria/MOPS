import { prisma } from "./prisma.js";
import { deleteUserUploads } from "./uploads.js";

/** The kinds of emailed codes; their rows are named after the address, not linked to the user. */
const CODE_TYPES = ["email-verification", "forget-password", "sign-in", "change-email"];

/**
 * US-12 (CA-12.1): removes an account and everything it holds, for good. Deleting the user also deletes, through the
 * database's cascades, the sessions, the password, the profile, the company, the documents with their products, the
 * uploaded files' records with their readings and the user's categories. Two things are not linked to the user and
 * are removed here: the emailed codes and the uploaded photos and PDFs on disk.
 */
export async function deleteAccount(user: { id: string; email: string }) {
  await prisma.$transaction([
    prisma.verification.deleteMany({
      where: { identifier: { in: CODE_TYPES.map((type) => `${type}-otp-${user.email}`) } },
    }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);
  // After the database: if removing the files fails, the account is already gone and nobody can reach them.
  await deleteUserUploads(user.id).catch((error) => {
    console.error(`Could not remove the uploaded files of deleted user ${user.id}`, error);
  });
}
