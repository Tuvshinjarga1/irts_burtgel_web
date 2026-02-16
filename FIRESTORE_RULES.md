# Firestore Security Rules Тохиргоо

## Асуудал

Firebase Authentication амжилттай ажиллаж байна, гэхдээ Firestore-д хэрэглэгчийн мэдээлэл хадгалахад **permission-denied** алдаа гарч байна.

## Шийдэл

Firebase Console дээр Firestore Security Rules тохируулах хэрэгтэй.

### 1. Firebase Console руу орох

1. [Firebase Console](https://console.firebase.google.com/) руу орох
2. Өөрийн project (`diplom-irts-burtgel-44713`) сонгох

### 2. Firestore Database руу орох

1. Зүүн талын menu-с **Firestore Database** сонгох
2. **Rules** tab дээр дарах

### 3. Security Rules засах

Одоогийн rules-г дараах байдлаар солих:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Users collection - зөвхөн нэвтэрсэн хэрэглэгч өөрийн мэдээлэл үзэх/засах
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId;
    }
    
    // Classes collection - нэвтэрсэн хэрэглэгч бүгд үзэх/засах
    match /classes/{classId} {
      allow read, write: if request.auth != null;
    }
    
    // Students collection - нэвтэрсэн хэрэглэгч бүгд үзэх/засах
    match /students/{studentId} {
      allow read, write: if request.auth != null;
    }
    
    // Attendance collection - нэвтэрсэн хэрэглэгч бүгд үзэх/засах
    match /attendance/{attendanceId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 4. Publish хийх

1. **Publish** товч дээр дарах
2. Баталгаажуулах

## Тайлбар

- **`request.auth != null`**: Зөвхөн нэвтэрсэн хэрэглэгчид хандах эрхтэй
- **`request.auth.uid == userId`**: Хэрэглэгч зөвхөн өөрийн мэдээлэлтэй ажиллах эрхтэй
- **`allow read, write`**: Унших болон бичих эрх

## Туршилт

Rules тохируулсны дараа:

1. Browser-ийн console цэвэрлэх (F12 → Console → Clear)
2. Дахин бүртгүүлж үзэх
3. Амжилттай бүртгэгдэх ёстой

## Хэрэв асуудал үргэлжилвэл

Browser console дээр дараах мэдээлэл харагдах ёстой:
```
Registration error: [error details]
```

Энэ мэдээллийг илгээж өгвөл би илүү тодорхой тусална.
