import path from "node:path";

export const config = {
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 8000),
  apiJsonLimit: process.env.API_JSON_LIMIT || "5mb",
  uploadLimitBytes: Number(process.env.UPLOAD_LIMIT_BYTES || 10 * 1024 * 1024),
  publishedRotationPath:
    process.env.PUBLISHED_ROTATION_PATH || path.resolve(process.cwd(), "data/published-rotation.json"),
  agentsStorePath:
    process.env.AGENTS_STORE_PATH || path.resolve(process.cwd(), "data/agents.json"),
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "admin123",
  adminSessionCookieName: "rota_admin_session",
  adminSessionTtlMs: 1000 * 60 * 60 * 12
};
