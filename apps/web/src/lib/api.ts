import type { ParsedSchedule, RotationResult, RotationSettings } from "@rota/core";

interface ParseResponse {
  parsedSchedule: ParsedSchedule;
  settings: RotationSettings;
}

export interface PublishedRotationResponse {
  rotation: RotationResult;
  publishedAt: string;
}

export interface AdminSessionResponse {
  authenticated: boolean;
}

async function parseApiError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => ({ error: fallback }));
  const error = new Error(payload.error ?? fallback);
  if (response.status === 401) {
    error.name = "AuthError";
  }
  return error;
}

export async function parseFile(file: File): Promise<ParseResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/parse", {
    method: "POST",
    body: formData,
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw await parseApiError(response, "Erreur d'analyse.");
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
    body: JSON.stringify({ parsedSchedule, settings }),
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw await parseApiError(response, "Erreur de generation.");
  }

  return response.json();
}

export async function downloadExport(rotation: RotationResult, kind: "csv" | "xlsx" | "pdf"): Promise<Blob> {
  const response = await fetch(`/api/export/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ rotation }),
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw await parseApiError(response, "Erreur d'export.");
  }

  return response.blob();
}

export async function publishRotation(rotation: RotationResult): Promise<PublishedRotationResponse> {
  const response = await fetch("/api/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ rotation }),
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw await parseApiError(response, "Erreur de publication.");
  }

  return response.json();
}

export async function fetchPublishedRotation(): Promise<PublishedRotationResponse | null> {
  const response = await fetch("/api/published");

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await parseApiError(response, "Erreur de chargement public.");
  }

  return response.json();
}

export async function fetchAdminSession(): Promise<AdminSessionResponse> {
  const response = await fetch("/api/admin/session", {
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw await parseApiError(response, "Erreur de session admin.");
  }

  return response.json();
}

export async function loginAdmin(password: string): Promise<AdminSessionResponse> {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: JSON.stringify({ password })
  });

  if (!response.ok) {
    throw await parseApiError(response, "Erreur de connexion admin.");
  }

  return response.json();
}

export async function logoutAdmin(): Promise<AdminSessionResponse> {
  const response = await fetch("/api/admin/logout", {
    method: "POST",
    credentials: "same-origin"
  });

  if (!response.ok) {
    throw await parseApiError(response, "Erreur de deconnexion admin.");
  }

  return response.json();
}
