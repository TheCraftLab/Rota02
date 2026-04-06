export const config = {
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 8080),
  apiJsonLimit: process.env.API_JSON_LIMIT || "5mb",
  uploadLimitBytes: Number(process.env.UPLOAD_LIMIT_BYTES || 10 * 1024 * 1024)
};

