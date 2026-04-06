import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config";

interface SessionPayload {
  exp: number;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signValue(value: string): string {
  return crypto.createHmac("sha256", config.adminSessionSecret).update(value).digest("base64url");
}

function createSessionToken(): string {
  const payload: SessionPayload = {
    exp: Date.now() + config.adminSessionTtlMs
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) {
    return {};
  }

  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || rawValue.length === 0) {
      return acc;
    }

    acc[rawKey] = decodeURIComponent(rawValue.join("="));
    return acc;
  }, {});
}

function readSessionToken(request: Request): string | null {
  const cookies = parseCookies(request);
  return cookies[config.adminSessionCookieName] ?? null;
}

function verifySessionToken(token: string | null): boolean {
  if (!token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = signValue(payload);
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as SessionPayload;
    return Number.isFinite(parsed.exp) && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function buildCookieValue(token: string, maxAgeMs: number): string {
  const secure = process.env.NODE_ENV === "production" ? "" : "";
  return `${config.adminSessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}

function buildExpiredCookieValue(): string {
  return `${config.adminSessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAdminAuthenticated(request: Request): boolean {
  return verifySessionToken(readSessionToken(request));
}

export function requireAdminAuth(request: Request, response: Response, next: NextFunction): void {
  if (!isAdminAuthenticated(request)) {
    response.status(401).json({ error: "Authentification admin requise." });
    return;
  }

  next();
}

export function loginAdmin(response: Response): void {
  const token = createSessionToken();
  response.setHeader("Set-Cookie", buildCookieValue(token, config.adminSessionTtlMs));
}

export function logoutAdmin(response: Response): void {
  response.setHeader("Set-Cookie", buildExpiredCookieValue());
}

export function verifyAdminPassword(password: string): boolean {
  return safeEqual(password, config.adminPassword);
}
