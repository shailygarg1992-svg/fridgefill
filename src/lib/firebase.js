import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB3Ux-FvgoL_3eO-lp1AmEsiQbd4wfiVhI",
  authDomain: "fridgefill-shopper.firebaseapp.com",
  projectId: "fridgefill-shopper",
  storageBucket: "fridgefill-shopper.firebasestorage.app",
  messagingSenderId: "148402498640",
  appId: "1:148402498640:web:3430a3d9ca73e001f4f555",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
