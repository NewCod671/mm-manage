type FirebaseLikeError = {
  code?: number | string;
  message?: string;
};

export function getFirebaseErrorMessage(error: unknown) {
  const firebaseError = error as FirebaseLikeError;
  const message = firebaseError.message ?? "Firebase error";
  const code = firebaseError.code;

  if (code === 5 || code === "5" || message.includes("5 NOT_FOUND")) {
    return "Firestore database not found. Create Firestore Database in Firebase project mm-manage using Native mode and the default database.";
  }

  if (
    code === 7 ||
    code === "7" ||
    message.includes("PERMISSION_DENIED") ||
    message.includes("firestore.googleapis.com")
  ) {
    return "Firestore API is disabled or the service account has no Firestore permission. Enable Firestore API and grant Cloud Datastore User.";
  }

  return message;
}
