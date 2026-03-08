import { FaceRecognizer } from "@/components/face-recognizer";

export const metadata = {
  title: "Царай Таних - AI Face Recognition",
  description: "Зураг оруулан царайгаа таниулах хуудас",
};

export default function RecognizerPage() {
  return (
    <div className="container py-10 space-y-6">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Царай Таних</h1>
        <p className="text-muted-foreground text-lg">
          Танигдаагүй хүмүүсийг бүртгэж аван сургах боломжтой.
        </p>
      </div>
      <div className="flex justify-center">
        <FaceRecognizer />
      </div>
    </div>
  );
}
