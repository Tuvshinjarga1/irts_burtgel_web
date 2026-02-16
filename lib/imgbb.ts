
const IMGBB_API_KEY = "4f1b1fc0a342c602dc2ebb0f9a4da6f6";
const IMGBB_API_URL = "https://api.imgbb.com/1/upload";

interface ImgBBResponse {
    data: {
        id: string;
        title: string;
        url_viewer: string;
        url: string;
        display_url: string;
        width: string;
        height: string;
        size: string;
        time: string;
        expiration: string;
        image: {
            filename: string;
            name: string;
            mime: string;
            extension: string;
            url: string;
        };
        thumb: {
            filename: string;
            name: string;
            mime: string;
            extension: string;
            url: string;
        };
        medium?: {
            filename: string;
            name: string;
            mime: string;
            extension: string;
            url: string;
        };
        delete_url: string;
    };
    success: boolean;
    status: number;
}

/**
 * Uploads an image (Blob or File) to ImgBB and returns the direct URL.
 * @param imageFile The image blob or file to upload.
 * @returns The URL of the uploaded image.
 */
export async function uploadImageToImgBB(imageFile: Blob | File): Promise<string> {
    const formData = new FormData();
    formData.append("image", imageFile);

    // If using 'expiration' parameter, add it here.
    // formData.append("expiration", "600"); 

    const url = `${IMGBB_API_URL}?key=${IMGBB_API_KEY}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ImgBB Upload Failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result: ImgBBResponse = await response.json();

        if (result.success) {
            return result.data.url;
        } else {
            throw new Error("ImgBB reported failure despite 200 OK.");
        }
    } catch (error) {
        console.error("Error uploading to ImgBB:", error);
        throw error;
    }
}
