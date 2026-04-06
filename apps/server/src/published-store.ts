import fs from "node:fs/promises";
import path from "node:path";
import type { RotationResult } from "@rota/core";

export interface PublishedRotationRecord {
  rotation: RotationResult;
  publishedAt: string;
}

export async function readPublishedRotation(filePath: string): Promise<PublishedRotationRecord | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as PublishedRotationRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writePublishedRotation(
  filePath: string,
  rotation: RotationResult
): Promise<PublishedRotationRecord> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload: PublishedRotationRecord = {
    rotation,
    publishedAt: new Date().toISOString()
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}
