import { createRemoteJWKSet, jwtVerify } from "jose";

const firebaseJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function getAuthenticatedUserId(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Please sign in with Google first.");
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("Missing FIREBASE_PROJECT_ID");
  }

  const token = authorization.slice("Bearer ".length);
  const { payload } = await jwtVerify(token, firebaseJwks, {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`
  });

  if (!payload.sub) {
    throw new Error("Invalid Firebase ID token");
  }

  return payload.sub;
}
