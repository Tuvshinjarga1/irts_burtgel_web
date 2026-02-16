import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export type UserRole = "teacher" | "student";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  studentId?: string; // linked to a Student record for student role
  classId?: string;   // which class the student belongs to
  createdAt: string;
}

const USERS_COLLECTION = "users";

// Get user metadata from Firestore
export async function getUserMetadata(uid: string): Promise<User | null> {
  try {
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, uid));
    if (userDoc.exists()) {
      return userDoc.data() as User;
    }
    return null;
  } catch (error) {
    console.error("Error getting user metadata:", error);
    return null;
  }
}

// Register a new user with Firebase Auth and store metadata in Firestore
export async function registerUser(
  name: string,
  email: string,
  password: string,
  role: UserRole,
  studentId?: string,
  classId?: string
): Promise<{ success: boolean; error?: string; user?: User }> {
  try {
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    const uid = userCredential.user.uid;

    // Create user metadata in Firestore
    const userData: User = {
      id: uid,
      name,
      email,
      role,
      studentId,
      classId,
      createdAt: new Date().toISOString(),
    };

    // Remove undefined fields (Firestore doesn't accept undefined)
    const dataToSave: any = { ...userData };
    if (dataToSave.studentId === undefined) delete dataToSave.studentId;
    if (dataToSave.classId === undefined) delete dataToSave.classId;

    await setDoc(doc(db, USERS_COLLECTION, uid), dataToSave);

    return { success: true, user: userData };
  } catch (error: any) {
    console.error("Registration error:", error);
    let errorMessage = "Бүртгэл амжилтгүй";

    if (error.code === "auth/email-already-in-use") {
      errorMessage = "Энэ имэйл хаяг бүртгэлтэй байна";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Имэйл хаяг буруу байна";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Нууц үг хэтэрхий сул байна";
    } else if (error.code === "permission-denied") {
      errorMessage = "Firestore-д хандах эрх байхгүй. Firebase Console дээр Security Rules тохируулна уу.";
    }

    return { success: false, error: errorMessage };
  }
}

// Login user with Firebase Auth
export async function loginUser(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: User }> {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    const uid = userCredential.user.uid;
    const userData = await getUserMetadata(uid);

    if (!userData) {
      return { success: false, error: "Хэрэглэгчийн мэдээлэл олдсонгүй" };
    }

    return { success: true, user: userData };
  } catch (error: any) {
    let errorMessage = "Нэвтрэх боломжгүй";

    if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
      errorMessage = "Имэйл эсвэл нууц үг буруу байна";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Имэйл хаяг буруу байна";
    } else if (error.code === "auth/invalid-credential") {
      errorMessage = "Имэйл эсвэл нууц үг буруу байна";
    }

    return { success: false, error: errorMessage };
  }
}

// Get current Firebase user
export function getCurrentFirebaseUser(): FirebaseUser | null {
  return auth.currentUser;
}

// Get current user session (metadata from Firestore)
export async function getSession(): Promise<User | null> {
  const firebaseUser = getCurrentFirebaseUser();
  if (!firebaseUser) return null;

  return await getUserMetadata(firebaseUser.uid);
}

// Logout user
export async function logout(): Promise<void> {
  await signOut(auth);
}

// Listen to auth state changes
export function onAuthStateChange(
  callback: (user: FirebaseUser | null) => void
): () => void {
  return onAuthStateChanged(auth, callback);
}

// Update user's student link
export async function updateUserStudentLink(
  userId: string,
  studentId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, USERS_COLLECTION, userId), {
      studentId,
    });
  } catch (error) {
    console.error("Error updating user student link:", error);
    throw error;
  }
}

// Legacy functions for compatibility (no-ops or minimal implementations)
export function setSession(user: User) {
  // No longer needed - Firebase handles session
  console.warn("setSession is deprecated with Firebase Auth");
}

export function clearSession() {
  // No longer needed - use logout() instead
  console.warn("clearSession is deprecated - use logout() instead");
}

export function ensureDefaultTeacher() {
  // No longer needed - users register via Firebase
  return true;
}

