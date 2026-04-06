import cors from "cors";
import express from "express";
import multer from "multer";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  generateRotation,
  parseNiceWfmText,
  toClipboardTable,
  type RotationResult,
  type RotationSettings,
  type ParsedSchedule
} from "@rota/core";
import { isAdminAuthenticated, loginAdmin, logoutAdmin, requireAdminAuth, verifyAdminPassword } from "./auth";
import { config } from "./config";
import { buildRotationCsv, buildRotationPdf, buildRotationWorkbook } from "./exporters";
import { extractTextFromUpload } from "./file-extractor";
import { readPublishedRotation, writePublishedRotation } from "./published-store";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploadLimitBytes
  }
});

app.disable("x-powered-by");
app.use(
  cors({
    origin: true
  })
);
app.use(express.json({ limit: config.apiJsonLimit }));

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get("/api/admin/session", (request, response) => {
  response.json({
    authenticated: isAdminAuthenticated(request)
  });
});

app.post("/api/admin/login", (request, response) => {
  const password = typeof request.body?.password === "string" ? request.body.password : "";

  if (!verifyAdminPassword(password)) {
    response.status(401).json({ error: "Mot de passe invalide." });
    return;
  }

  loginAdmin(response);
  response.json({ authenticated: true });
});

app.post("/api/admin/logout", (_request, response) => {
  logoutAdmin(response);
  response.json({ authenticated: false });
});

app.get("/api/published", async (_request, response) => {
  try {
    const published = await readPublishedRotation(config.publishedRotationPath);
    if (!published) {
      response.status(404).json({ error: "Aucune rotation n'a encore ete publiee." });
      return;
    }

    response.json(published);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Impossible de charger la rotation publiee."
    });
  }
});

app.post("/api/parse", requireAdminAuth, upload.single("file"), async (request, response) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: "Aucun fichier n'a ete envoye." });
      return;
    }

    const extractedText = await extractTextFromUpload(
      request.file.buffer,
      request.file.originalname,
      request.file.mimetype
    );
    const parsedSchedule = parseNiceWfmText(
      extractedText,
      request.file.originalname,
      request.file.mimetype,
      new Date()
    );
    response.json({
      parsedSchedule,
      settings: DEFAULT_SETTINGS
    });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Echec de l'analyse du fichier."
    });
  }
});

app.post("/api/generate", requireAdminAuth, (request, response) => {
  try {
    const parsedSchedule = request.body.parsedSchedule as ParsedSchedule | undefined;
    const settings = request.body.settings as Partial<RotationSettings> | undefined;

    if (!parsedSchedule?.agents?.length) {
      response.status(400).json({ error: "Aucune donnee planifiable n'a ete fournie." });
      return;
    }

    const rotation = generateRotation(parsedSchedule, settings);
    response.json(rotation);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Echec de generation de la rotation."
    });
  }
});

app.post("/api/export/csv", requireAdminAuth, (request, response) => {
  const rotation = request.body.rotation as RotationResult | undefined;
  if (!rotation) {
    response.status(400).json({ error: "Rotation absente." });
    return;
  }

  const csv = buildRotationCsv(rotation);
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", 'attachment; filename="rotation-chat.csv"');
  response.send(csv);
});

app.post("/api/export/xlsx", requireAdminAuth, async (request, response) => {
  try {
    const rotation = request.body.rotation as RotationResult | undefined;
    if (!rotation) {
      response.status(400).json({ error: "Rotation absente." });
      return;
    }

    const buffer = await buildRotationWorkbook(rotation);
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    response.setHeader("Content-Disposition", 'attachment; filename="rotation-chat.xlsx"');
    response.send(buffer);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Echec de l'export Excel."
    });
  }
});

app.post("/api/export/pdf", requireAdminAuth, async (request, response) => {
  try {
    const rotation = request.body.rotation as RotationResult | undefined;
    if (!rotation) {
      response.status(400).json({ error: "Rotation absente." });
      return;
    }

    const buffer = await buildRotationPdf(rotation);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", 'attachment; filename="rotation-chat.pdf"');
    response.send(buffer);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Echec de l'export PDF."
    });
  }
});

app.post("/api/export/clipboard", requireAdminAuth, (request, response) => {
  const rotation = request.body.rotation as RotationResult | undefined;
  if (!rotation) {
    response.status(400).json({ error: "Rotation absente." });
    return;
  }

  response.json({
    clipboard: toClipboardTable(rotation)
  });
});

app.post("/api/publish", requireAdminAuth, async (request, response) => {
  try {
    const rotation = request.body.rotation as RotationResult | undefined;
    if (!rotation) {
      response.status(400).json({ error: "Rotation absente." });
      return;
    }

    const published = await writePublishedRotation(config.publishedRotationPath, rotation);
    response.json(published);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Impossible de publier la rotation."
    });
  }
});

const webDistPath = path.resolve(__dirname, "../../web/dist");

app.use(express.static(webDistPath));
app.get("*", (request, response, next) => {
  if (request.path.startsWith("/api/")) {
    next();
    return;
  }

  response.sendFile(path.join(webDistPath, "index.html"), (error) => {
    if (error) {
      next();
    }
  });
});

app.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(`Rota Chat Generator listening on http://${config.host}:${config.port}`);
});
