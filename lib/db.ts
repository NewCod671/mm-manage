import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

declare global {
  var firebaseAdminReady: boolean | undefined;
}

function getPrivateKey() {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!privateKey) {
    return null;
  }

  return privateKey.replace(/\\n/g, "\n");
}

export function getDb() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY"
    );
  }

  if (!globalThis.firebaseAdminReady && getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
    globalThis.firebaseAdminReady = true;
  }

  return getFirestore();
}
