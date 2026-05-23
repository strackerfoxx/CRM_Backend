import admin from "firebase-admin";

let firebaseApp;

function getFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are not configured");
  }

  firebaseApp = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });

  return firebaseApp;
}

export async function verifyFirebasePhoneToken(idToken) {
  if (!idToken) {
    throw new Error("Firebase ID token is required");
  }

  const app = getFirebaseApp();
  const decodedToken = await app.auth().verifyIdToken(idToken, true);

  if (!decodedToken.phone_number) {
    throw new Error("Token does not include a verified phone number");
  }

  return decodedToken;
}
