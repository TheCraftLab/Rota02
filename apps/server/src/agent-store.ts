import fs from "node:fs/promises";
import path from "node:path";
import { normalizeName, type AgentPreferences, type AgentSchedule, type ParsedSchedule } from "@rota/core";

export interface StoredAgent {
  id: string;
  agentId: string | null;
  displayName: string;
  normalizedName: string;
  preferences: AgentPreferences;
  createdAt: string;
  updatedAt: string;
}

interface AgentStoreRecord {
  agents: StoredAgent[];
  updatedAt: string;
}

export interface AgentUpsertResult {
  agents: StoredAgent[];
  createdCount: number;
  updatedCount: number;
}

function defaultPreferences(): AgentPreferences {
  return {
    blockedDates: [],
    blockedWeekdays: [],
    preferFewerSlots: false
  };
}

function sanitizePreferences(preferences: AgentPreferences | undefined): AgentPreferences {
  const blockedDates = [...new Set((preferences?.blockedDates ?? []).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort(
    (left, right) => left.localeCompare(right)
  );
  const blockedWeekdays = [...new Set((preferences?.blockedWeekdays ?? []).filter((value) => Number.isInteger(value) && value >= 1 && value <= 7))].sort(
    (left, right) => left - right
  );

  return {
    blockedDates,
    blockedWeekdays,
    preferFewerSlots: Boolean(preferences?.preferFewerSlots)
  };
}

function toStoreAgent(candidate: StoredAgent): StoredAgent {
  return {
    ...candidate,
    agentId: candidate.agentId ?? null,
    normalizedName: normalizeName(candidate.normalizedName || candidate.displayName),
    preferences: sanitizePreferences(candidate.preferences)
  };
}

function resolveAgentKey(agentId: string | null, normalizedName: string): string {
  return agentId ?? normalizedName;
}

function findAgentIndex(agents: StoredAgent[], candidate: AgentSchedule): number {
  if (candidate.agentId) {
    const byAgentId = agents.findIndex((item) => item.agentId === candidate.agentId);
    if (byAgentId >= 0) {
      return byAgentId;
    }
  }

  return agents.findIndex((item) => item.normalizedName === candidate.normalizedName);
}

async function readStore(filePath: string): Promise<AgentStoreRecord> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as AgentStoreRecord;
    const agents = (parsed.agents ?? []).map(toStoreAgent);
    return {
      agents,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString()
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        agents: [],
        updatedAt: new Date(0).toISOString()
      };
    }

    throw error;
  }
}

async function writeStore(filePath: string, record: AgentStoreRecord): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
}

function sortAgents(agents: StoredAgent[]): StoredAgent[] {
  return [...agents].sort((left, right) => left.displayName.localeCompare(right.displayName, "fr"));
}

export async function listStoredAgents(filePath: string): Promise<StoredAgent[]> {
  const store = await readStore(filePath);
  return sortAgents(store.agents);
}

export async function upsertAgentsFromImport(filePath: string, importedAgents: AgentSchedule[]): Promise<AgentUpsertResult> {
  const store = await readStore(filePath);
  const now = new Date().toISOString();
  const nextAgents = [...store.agents];
  let createdCount = 0;
  let updatedCount = 0;

  for (const importedAgent of importedAgents) {
    const index = findAgentIndex(nextAgents, importedAgent);

    if (index < 0) {
      nextAgents.push({
        id: resolveAgentKey(importedAgent.agentId, importedAgent.normalizedName),
        agentId: importedAgent.agentId,
        displayName: importedAgent.displayName,
        normalizedName: importedAgent.normalizedName,
        preferences: defaultPreferences(),
        createdAt: now,
        updatedAt: now
      });
      createdCount += 1;
      continue;
    }

    const current = nextAgents[index]!;
    nextAgents[index] = {
      ...current,
      agentId: importedAgent.agentId ?? current.agentId,
      displayName: importedAgent.displayName,
      normalizedName: importedAgent.normalizedName,
      updatedAt: now
    };
    updatedCount += 1;
  }

  const payload: AgentStoreRecord = {
    agents: sortAgents(nextAgents),
    updatedAt: now
  };
  await writeStore(filePath, payload);

  return {
    agents: payload.agents,
    createdCount,
    updatedCount
  };
}

export function applyStoredPreferencesToSchedule(
  parsedSchedule: ParsedSchedule,
  storedAgents: StoredAgent[]
): ParsedSchedule {
  if (!storedAgents.length) {
    return parsedSchedule;
  }

  const byAgentId = new Map<string, StoredAgent>();
  const byNormalizedName = new Map<string, StoredAgent>();
  for (const storedAgent of storedAgents) {
    if (storedAgent.agentId) {
      byAgentId.set(storedAgent.agentId, storedAgent);
    }
    byNormalizedName.set(storedAgent.normalizedName, storedAgent);
  }

  const nextAgents: AgentSchedule[] = [];
  for (const agent of parsedSchedule.agents) {
    const storedAgent =
      (agent.agentId ? byAgentId.get(agent.agentId) : undefined) ?? byNormalizedName.get(agent.normalizedName);
    if (!storedAgent) {
      continue;
    }

    nextAgents.push({
      ...agent,
      preferences: sanitizePreferences(storedAgent.preferences)
    });
  }

  const nextDates = [
    ...new Set(
      nextAgents.flatMap((agent) => Object.keys(agent.days))
    )
  ].sort((left, right) => left.localeCompare(right));

  return {
    ...parsedSchedule,
    agents: nextAgents,
    dates: nextDates
  };
}

export async function updateStoredAgentPreferences(
  filePath: string,
  id: string,
  patch: Partial<AgentPreferences>
): Promise<StoredAgent> {
  const store = await readStore(filePath);
  const index = store.agents.findIndex((agent) => agent.id === id);
  if (index < 0) {
    throw new Error("Agent introuvable.");
  }

  const current = store.agents[index]!;
  const next: StoredAgent = {
    ...current,
    preferences: sanitizePreferences({
      ...current.preferences,
      ...patch
    }),
    updatedAt: new Date().toISOString()
  };
  store.agents[index] = next;
  store.updatedAt = next.updatedAt;
  store.agents = sortAgents(store.agents);
  await writeStore(filePath, store);
  return next;
}

export async function deleteStoredAgent(filePath: string, id: string): Promise<boolean> {
  const store = await readStore(filePath);
  const before = store.agents.length;
  const nextAgents = store.agents.filter((agent) => agent.id !== id);
  if (nextAgents.length === before) {
    return false;
  }

  store.agents = sortAgents(nextAgents);
  store.updatedAt = new Date().toISOString();
  await writeStore(filePath, store);
  return true;
}
