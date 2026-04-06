import pdf from "pdf-parse";

export async function extractTextFromUpload(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  const lowerName = filename.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const result = await pdf(buffer);
    return result.text;
  }

  if (
    mimeType.startsWith("text/") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".log")
  ) {
    return buffer.toString("utf-8");
  }

  throw new Error("Format non supporte. Chargez un PDF ou un fichier texte.");
}

