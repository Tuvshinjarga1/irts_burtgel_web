import { uploadImageToImgBB } from "./imgbb";

// We no longer use IndexedDB.
// The "key" for a photo will now be the Full URL from ImgBB.
// For compatibility with existing calls, we might keep the signature but return the URL.

export async function savePhoto(key: string, blob: Blob): Promise<string> {
  // We ignore 'key' because ImgBB generates its own ID/URL, 
  // OR we could use 'key' as the filename if ImgBB API supported it easily, 
  // but for now we just upload.
  // The caller should ideally use the returned URL as the key.

  // However, the existing code:
  // const photoKey = `student-${uuid}`;
  // await savePhoto(photoKey, blob);
  // addStudent(..., [photoKey]);

  // We need to change the flow so that the caller gets the URL.
  // But to satisfy the immediate tool change, let's just upload.
  const url = await uploadImageToImgBB(blob);
  return url;
}

export async function getPhoto(key: string): Promise<Blob | null> {
  // Fetching the image from URL as blob (if needed)
  try {
    const res = await fetch(key);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function deletePhoto(key: string): Promise<void> {
  // ImgBB API requires a delete URL or specific API call to delete, 
  // which we don't have stored unless we change the data model significantly.
  // For now, no-op.
  return Promise.resolve();
}

export async function getPhotoURL(key: string): Promise<string | null> {
  // The 'key' is now assumed to be the URL itself.
  return key;
}

