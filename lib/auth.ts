import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "@/lib/db";

export async function getAuthenticatedUserId(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Please sign in with Google first.");
  }

  const token = authorization.slice("Bearer ".length);
  const decodedToken = await getAuth(getAdminApp()).verifyIdToken(token);

  return decodedToken.uid;
}
