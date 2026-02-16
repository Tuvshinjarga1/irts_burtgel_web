import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDGlwL7L7CjRGVQi_tG8yXII4syPHUklyk",
    authDomain: "diplom-irts-burtgel-44713.firebaseapp.com",
    projectId: "diplom-irts-burtgel-44713",
    storageBucket: "diplom-irts-burtgel-44713.firebasestorage.app",
    messagingSenderId: "931208584550",
    appId: "1:931208584550:web:319afaf85bf89ba5dbbca7",
    measurementId: "G-BS8D9L02TN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const db = getFirestore(app);
export const auth = getAuth(app);

// Analytics (only on client side)
export const analytics = typeof window !== "undefined"
    ? isSupported().then(yes => yes ? getAnalytics(app) : null)
    : null;

export default app;
