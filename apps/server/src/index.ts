import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import express from "express";
import multer from "multer";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  generateRotation,
  parseNiceWfmText,
  toClipboardTable,
  type AgentPreferences,
  type RotationResult,
  type RotationSettings,
  type ParsedSchedule
} from "@rota/core";
import {
  applyStoredPreferencesToSchedule,
  deleteStoredAgent,
  listStoredAgents,
  updateStoredAgentPreferences,
  upsertAgentsFromImport
} from "./agent-store";
import { isAdminAuthenticated, loginAdmin, logoutAdmin, requireAdminAuth, verifyAdminPassword } from "./auth";
import { config } from "./config";
import { buildRotationCsv, buildRotationPdf, buildRotationWorkbook } from "./exporters";
import { extractTextFromUpload } from "./file-extractor";
import { readPublishedRotation, writePublishedRotation } from "./published-store";

const app = express();
const httpServer = createServer(app);

// Socket.io — compatible reverse proxy (Nginx Proxy Manager)
// Dans NPM : activer "WebSocket Support" sur le proxy host.
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  transports: ["websocket", "polling"],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Faire confiance au premier proxy (NPM) pour les headers X-Forwarded-*
app.set("trust proxy", 1);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploadLimitBytes
  }
});

app.disable("x-powered-by");
app.use(
  cors({
    origin: true,
    credentials: true
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

app.get("/api/agents", requireAdminAuth, async (_request, response) => {
  try {
    const agents = await listStoredAgents(config.agentsStorePath);
    response.json({ agents });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Impossible de charger les agents."
    });
  }
});

app.patch("/api/agents/:id/preferences", requireAdminAuth, async (request, response) => {
  try {
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    if (!id) {
      response.status(400).json({ error: "Identifiant agent manquant." });
      return;
    }

    const preferences = (request.body?.preferences ?? {}) as Partial<AgentPreferences>;
    const agent = await updateStoredAgentPreferences(config.agentsStorePath, id, preferences);
    response.json({ agent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de mettre a jour les preferences.";
    response.status(message === "Agent introuvable." ? 404 : 400).json({ error: message });
  }
});

app.delete("/api/agents/:id", requireAdminAuth, async (request, response) => {
  try {
    const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    if (!id) {
      response.status(400).json({ error: "Identifiant agent manquant." });
      return;
    }

    const deleted = await deleteStoredAgent(config.agentsStorePath, id);
    if (!deleted) {
      response.status(404).json({ error: "Agent introuvable." });
      return;
    }

    response.status(204).send();
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Impossible de supprimer l'agent."
    });
  }
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
    const syncResult = await upsertAgentsFromImport(config.agentsStorePath, parsedSchedule.agents);

    response.json({
      parsedSchedule,
      settings: DEFAULT_SETTINGS,
      agentSync: {
        createdCount: syncResult.createdCount,
        updatedCount: syncResult.updatedCount
      }
    });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Echec de l'analyse du fichier."
    });
  }
});

app.post("/api/generate", requireAdminAuth, async (request, response) => {
  try {
    const parsedSchedule = request.body.parsedSchedule as ParsedSchedule | undefined;
    const settings = request.body.settings as Partial<RotationSettings> | undefined;

    if (!parsedSchedule?.agents?.length) {
      response.status(400).json({ error: "Aucune donnee planifiable n'a ete fournie." });
      return;
    }

    const storedAgents = await listStoredAgents(config.agentsStorePath);
    const scheduleWithPreferences = applyStoredPreferencesToSchedule(parsedSchedule, storedAgents);
    if (!scheduleWithPreferences.agents.length) {
      response.status(400).json({ error: "Aucun agent actif disponible apres application de la base agents." });
      return;
    }

    const rotation = generateRotation(scheduleWithPreferences, settings);
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

// Utiliser httpServer (et non app.listen) pour que Socket.io intercepte les upgrades WebSocket
httpServer.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(`Rota Chat Generator listening on http://${config.host}:${config.port}`);
});

export { io };
