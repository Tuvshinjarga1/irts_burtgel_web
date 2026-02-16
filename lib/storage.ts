import { db } from "./firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDoc
} from "firebase/firestore";

export interface ClassInfo {
  id: string;
  name: string;
  studentIds: string[];
}

export interface Student {
  id: string;
  name: string;
  classId: string;
  descriptors: number[][];
  photoKeys: string[];
  createdAt: string;
}

export interface UnrecognizedFace {
  descriptor: number[];
  cropKey: string;
}

export interface AttendanceRecord {
  id: string;
  classId: string;
  date: string;
  timestamp: string;
  presentStudentIds: string[];
  photoKey: string;
  unrecognizedFaces: UnrecognizedFace[];
}

// --- Classes ---

const CLASSES_COLLECTION = "classes";

export async function getClasses(): Promise<ClassInfo[]> {
  const querySnapshot = await getDocs(collection(db, CLASSES_COLLECTION));
  return querySnapshot.docs.map(d => d.data() as ClassInfo);
}

export async function addClass(name: string): Promise<ClassInfo> {
  const newClassRef = doc(collection(db, CLASSES_COLLECTION));
  const newClass: ClassInfo = {
    id: newClassRef.id,
    name,
    studentIds: [],
  };
  await setDoc(newClassRef, newClass);
  return newClass;
}

export async function updateClass(id: string, name: string): Promise<void> {
  const classRef = doc(db, CLASSES_COLLECTION, id);
  await updateDoc(classRef, { name });
}

export async function deleteClass(id: string): Promise<void> {
  const classRef = doc(db, CLASSES_COLLECTION, id);
  await deleteDoc(classRef);

  // Also remove students from the class
  const students = await getStudentsByClass(id);
  for (const s of students) {
    await deleteStudent(s.id);
  }
}

export async function getClassById(id: string): Promise<ClassInfo | undefined> {
  const docRef = doc(db, CLASSES_COLLECTION, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as ClassInfo;
  }
  return undefined;
}

// --- Students ---

const STUDENTS_COLLECTION = "students";

export async function getStudents(): Promise<Student[]> {
  const querySnapshot = await getDocs(collection(db, STUDENTS_COLLECTION));
  return querySnapshot.docs.map(d => {
    const data = d.data();
    // Handle legacy or mapped descriptors
    let descriptors: number[][] = [];
    if (data.descriptorsJson) {
      try {
        descriptors = JSON.parse(data.descriptorsJson);
      } catch { }
    } else if (Array.isArray(data.descriptors)) {
      // If stored as array of objects or flat?
      // Fallback if we managed to store it differently.
      // For now, we assume descriptorsJson usage.
      descriptors = [];
    }

    return {
      ...data,
      descriptors,
    } as Student;
  });
}

export async function getStudentsByClass(classId: string): Promise<Student[]> {
  const q = query(collection(db, STUDENTS_COLLECTION), where("classId", "==", classId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(d => {
    const data = d.data();
    let descriptors: number[][] = [];
    if (data.descriptorsJson) {
      try {
        descriptors = JSON.parse(data.descriptorsJson);
      } catch { }
    }
    return {
      ...data,
      descriptors
    } as Student;
  });
}

export async function addStudent(
  name: string,
  classId: string,
  descriptors: number[][],
  photoKeys: string[]
): Promise<Student> {
  const newStudentRef = doc(collection(db, STUDENTS_COLLECTION));
  const newStudent: Student = {
    id: newStudentRef.id,
    name,
    classId,
    descriptors, // We will exclude this from the raw save below
    photoKeys,
    createdAt: new Date().toISOString(),
  };

  // Convert descriptors to JSON string for storage
  const dataToSave = {
    ...newStudent,
    descriptorsJson: JSON.stringify(descriptors),
  };
  // @ts-ignore - removing descriptors property before save to avoid mixing types if we were strict
  delete dataToSave.descriptors;

  await setDoc(newStudentRef, dataToSave);

  // Add student to class
  // Note: This requires reading the class document and updating it.
  const classRef = doc(db, CLASSES_COLLECTION, classId);
  const clsSnap = await getDoc(classRef);
  if (clsSnap.exists()) {
    const clsData = clsSnap.data() as ClassInfo;
    const updatedStudentIds = [...clsData.studentIds, newStudent.id];
    await updateDoc(classRef, { studentIds: updatedStudentIds });
  }

  return newStudent;
}

export async function updateStudent(id: string, updates: Partial<Student>): Promise<void> {
  const studentRef = doc(db, STUDENTS_COLLECTION, id);

  const dataToSave: any = { ...updates };
  if (updates.descriptors) {
    dataToSave.descriptorsJson = JSON.stringify(updates.descriptors);
    delete dataToSave.descriptors;
  }

  await updateDoc(studentRef, dataToSave);
}

export async function addDescriptorToStudent(
  studentId: string,
  descriptor: number[],
  photoKey?: string
): Promise<void> {
  const studentRef = doc(db, STUDENTS_COLLECTION, studentId);
  const studentSnap = await getDoc(studentRef);

  if (studentSnap.exists()) {
    const data = studentSnap.data();
    let descriptors: number[][] = [];
    if (data.descriptorsJson) {
      try {
        descriptors = JSON.parse(data.descriptorsJson);
      } catch { }
    }

    descriptors.push(descriptor);

    const updates: any = {
      descriptorsJson: JSON.stringify(descriptors)
    };

    if (photoKey) {
      const photoKeys = data.photoKeys || [];
      updates.photoKeys = [...photoKeys, photoKey];
    }

    await updateDoc(studentRef, updates);
  }
}

export async function deleteStudent(id: string): Promise<void> {
  const studentRef = doc(db, STUDENTS_COLLECTION, id);
  // Get student to know classId before deleting?
  const sSnap = await getDoc(studentRef);
  if (sSnap.exists()) {
    const sData = sSnap.data();
    const classId = sData.classId;

    await deleteDoc(studentRef);

    // Remove from class
    if (classId) {
      const classRef = doc(db, CLASSES_COLLECTION, classId);
      const cSnap = await getDoc(classRef);
      if (cSnap.exists()) {
        const cData = cSnap.data() as ClassInfo;
        const updatedIds = cData.studentIds.filter(sid => sid !== id);
        await updateDoc(classRef, { studentIds: updatedIds });
      }
    }
  }
}

export async function getStudentById(id: string): Promise<Student | undefined> {
  const docRef = doc(db, STUDENTS_COLLECTION, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    let descriptors: number[][] = [];
    if (data.descriptorsJson) {
      try { descriptors = JSON.parse(data.descriptorsJson); } catch { }
    }
    return { ...data, descriptors } as Student;
  }
  return undefined;
}


// --- Attendance Records ---

const ATTENDANCE_COLLECTION = "attendance_records";

export async function getAttendanceRecords(): Promise<AttendanceRecord[]> {
  const querySnapshot = await getDocs(collection(db, ATTENDANCE_COLLECTION));
  return querySnapshot.docs.map(d => {
    const data = d.data();
    // Handle unrecognizedFaces descriptors if needed (also JSON?)
    // UnrecognizedFace has descriptor: number[].
    // If we store it as map in Firestore, it handles number[] fine.
    return data as AttendanceRecord;
  });
}

export async function addAttendanceRecord(
  record: Omit<AttendanceRecord, "id">
): Promise<AttendanceRecord> {
  const newRecordRef = doc(collection(db, ATTENDANCE_COLLECTION));
  const newRecord: AttendanceRecord = {
    ...record,
    id: newRecordRef.id,
  };

  // Clean up any undefined
  const dataToSave = JSON.parse(JSON.stringify(newRecord));
  await setDoc(newRecordRef, dataToSave);
  return newRecord;
}

export async function getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
  const q = query(collection(db, ATTENDANCE_COLLECTION), where("date", "==", date));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as AttendanceRecord);
}

export async function getAttendanceByClassAndDate(
  classId: string,
  date: string
): Promise<AttendanceRecord[]> {
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where("classId", "==", classId),
    where("date", "==", date)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as AttendanceRecord);
}

export async function deleteAttendanceRecord(id: string): Promise<void> {
  await deleteDoc(doc(db, ATTENDANCE_COLLECTION, id));
}

