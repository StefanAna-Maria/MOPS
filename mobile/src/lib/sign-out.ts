import { authClient } from "./auth-client";

let signedOutThisSession = false;

export function hasSignedOutThisSession() {
  return signedOutThisSession;
}

export async function signOut() {
  signedOutThisSession = true;
  await authClient.signOut();
}
