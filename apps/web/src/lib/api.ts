import type { ParsedSchedule, RotationResult, RotationSettings } from "@rota/core";

interface ParseResponse {
  parsedSchedule: ParsedSchedule;
  settings: RotationSettings;
}

export interface PublishedRotationResponse {
  rotation: RotationResult;
  publishedAt: string;
}

export async function parseFile(file: File): Promise<ParseResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/parse", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Erreur d'analyse." }));
    throw new Error(payload.error ?? "Erreur d'analyse.");
  }

  return response.json();
}

export async function generateRotationRequest(
  parsedSchedule: ParsedSchedule,
  settings: RotationSettings
): Promise<RotationResult> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ parsedSchedule, settings })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Erreur de generation." }));
    throw new Error(payload.error ?? "Erreur de generation.");
  }

  return response.json();
}

export async function downloadExport(rotation: RotationResult, kind: "csv" | "xlsx" | "pdf"): Promise<Blob> {
  const response = await fetch(`/api/export/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ rotation })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Erreur d'export." }));
    throw new Error(payload.error ?? "Erreur d'export.");
  }

  return response.blob();
}

export async function publishRotation(rotation: RotationResult): Promise<PublishedRotationResponse> {
  const response = await fetch("/api/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ rotation })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Erreur de publication." }));
    throw new Error(payload.error ?? "Erreur de publication.");
  }

  return response.json();
}

export async function fetchPublishedRotation(): Promise<PublishedRotationResponse | null> {
  const response = await fetch("/api/published");

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Erreur de chargement public." }));
    throw new Error(payload.error ?? "Erreur de chargement public.");
  }

  return response.json();
}
