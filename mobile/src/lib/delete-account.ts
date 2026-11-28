import { apiFetch } from "./api";
import { signOut } from "./sign-out";

/**
 * US-12: deletes the account on the server, then removes the session kept on the phone, which opens "Intră în cont"
 * (CA-12.2). Returns false when the server refused. Throws when the server could not be reached.
 */
export async function deleteAccount(): Promise<boolean> {
  const response = await apiFetch("/api/me", { method: "DELETE" });
  // 401: the session is already gone (e.g. the account was deleted from another phone), so sign out here too.
  if (!response.ok && response.status !== 401) {
    return false;
  }
  // If clearing fails now, the next request answers 401 and signs the user out then.
  await signOut().catch(() => {});
  return true;
}
