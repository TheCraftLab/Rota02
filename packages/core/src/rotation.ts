import { buildActivityCatalog } from "./catalog";
import { DEFAULT_SETTINGS } from "./constants";
import { evaluateAgentEligibility } from "./eligibility";
import type {
  AgentSchedule,
  CandidateReason,
  RotationCell,
  RotationResult,
  RotationSettings,
  RotationSummary,
  ParsedSchedule
} from "./types";
import {
  average,
  expandSlots,
  formatDisplayDate,
  minutesToTime,
  normalizeName,
  parseTimeToMinutes,
  standardDeviation
} from "./utils";

interface MutableCounter {
  total: number;
  byDate: Record<string, number>;
}

function rankCandidate(
  agent: AgentSchedule,
  date: string,
  previousAgentId: string | null,
  counters: Map<string, MutableCounter>,
  settings: RotationSettings
): number[] {
  const key = agent.normalizedName;
  const counter = counters.get(key) ?? { total: 0, byDate: {} };
  const totalAssigned = counter.total;
  const dayAssigned = counter.byDate[date] ?? 0;
  const consecutivePenalty =
    settings.avoidConsecutive && previousAgentId && previousAgentId === (agent.agentId ?? agent.normalizedName)
      ? 1
      : 0;

  if (settings.fairnessMode === "soft") {
    return [
      totalAssigned * 100 + dayAssigned * 10 + consecutivePenalty,
      totalAssigned,
      dayAssigned,
      consecutivePenalty
    ];
  }

  return [totalAssigned, dayAssigned, consecutivePenalty];
}

function compareCandidateReason(a: CandidateReason, b: CandidateReason): number {
  for (let index = 0; index < Math.max(a.decisionRank.length, b.decisionRank.length); index += 1) {
    const left = a.decisionRank[index] ?? 0;
    const right = b.decisionRank[index] ?? 0;
    if (left !== right) {
      return left - right;
    }
  }

  return a.agentName.localeCompare(b.agentName, "fr");
}

export function summarizeRotation(cells: RotationCell[], agents: AgentSchedule[]): RotationSummary {
  const agentSummaries = agents.map((agent) => {
    const assignedCells = cells.filter((cell) => cell.assignedAgentName === agent.displayName);
    const slotsByDate = assignedCells.reduce<Record<string, number>>((acc, cell) => {
      acc[cell.date] = (acc[cell.date] ?? 0) + 1;
      return acc;
    }, {});

    return {
      agentId: agent.agentId,
      agentName: agent.displayName,
      totalSlots: assignedCells.length,
      slotsByDate,
      overload: false
    };
  });

  const slotCounts = agentSummaries.map((item) => item.totalSlots);
  const avg = average(slotCounts);
  const deviation = standardDeviation(slotCounts);
  const threshold = avg + Math.max(1, deviation);

  const flagged = agentSummaries.map((summary) => ({
    ...summary,
    overload: summary.totalSlots > threshold
  }));

  const uncoveredSlots = cells.filter((cell) => cell.status === "uncovered").length;
  const fairnessScore = slotCounts.length
    ? Math.max(0, Math.round(100 - (deviation / Math.max(avg || 1, 1)) * 100))
    : 100;
  const alerts = flagged
    .filter((summary) => summary.overload)
    .map((summary) => `${summary.agentName} recoit plus de creneaux que la moyenne (${summary.totalSlots}).`);

  if (uncoveredSlots > 0) {
    alerts.push(`${uncoveredSlots} creneau(x) restent non couverts.`);
  }

  return {
    agentSummaries: flagged,
    uncoveredSlots,
    totalSlots: cells.length,
    fairnessScore,
    alerts
  };
}

export function generateRotation(
  parsedSchedule: ParsedSchedule,
  inputSettings: Partial<RotationSettings> = {}
): RotationResult {
  const settings: RotationSettings = {
    ...DEFAULT_SETTINGS,
    ...inputSettings
  };
  const dates = parsedSchedule.dates;
  const slotStarts = expandSlots(settings.startTime, settings.endTime, settings.slotMinutes);
  const counters = new Map<string, MutableCounter>();
  const cells: RotationCell[] = [];

  let previousAgentId: string | null = null;

  for (const date of dates) {
    previousAgentId = null;

    for (const slotStart of slotStarts) {
      const slotEnd = minutesToTime(parseTimeToMinutes(slotStart) + settings.slotMinutes);

      const candidates: CandidateReason[] = parsedSchedule.agents.map((agent) => {
        const eligibility = evaluateAgentEligibility(agent, date, slotStart, slotEnd, settings);
        const rank = rankCandidate(agent, date, previousAgentId, counters, settings);
        const agentKey = agent.agentId ?? agent.normalizedName;
        const counter = counters.get(agent.normalizedName) ?? { total: 0, byDate: {} };

        return {
          agentId: agent.agentId,
          agentName: agent.displayName,
          eligible: eligibility.eligible,
          totalAssignedBefore: counter.total,
          dayAssignedBefore: counter.byDate[date] ?? 0,
          previousSlotAssigned: previousAgentId === agentKey,
          decisionRank: rank,
          notes: eligibility.reasons
        };
      });

      const eligibleCandidates = candidates.filter((candidate) => candidate.eligible).sort(compareCandidateReason);
      const selected = eligibleCandidates[0];

      if (!selected) {
        cells.push({
          date,
          slotStart,
          slotEnd,
          assignedAgentId: null,
          assignedAgentName: "Non couvert",
          status: "uncovered",
          reasons: ["Aucun agent ne couvre integralement ce creneau."],
          candidates
        });
        previousAgentId = null;
        continue;
      }

      const counterKey = parsedSchedule.agents.find(
        (agent) => agent.displayName === selected.agentName
      )?.normalizedName;
      if (counterKey) {
        const counter = counters.get(counterKey) ?? { total: 0, byDate: {} };
        counter.total += 1;
        counter.byDate[date] = (counter.byDate[date] ?? 0) + 1;
        counters.set(counterKey, counter);
      }

      previousAgentId = selected.agentId ?? normalizeFallbackId(selected.agentName);
      cells.push({
        date,
        slotStart,
        slotEnd,
        assignedAgentId: selected.agentId,
        assignedAgentName: selected.agentName,
        status: "assigned",
        reasons: [
          `${selected.agentName} est choisi car il a le moins de creneaux globaux.`,
          `${selected.agentName} a ${selected.dayAssignedBefore} creneau(x) sur la journee avant affectation.`,
          selected.previousSlotAssigned
            ? "Aucune meilleure alternative n'evitait la repetition consecutive."
            : "Une repetition consecutive a ete evitee."
        ],
        candidates
      });
    }
  }

  const detectedActivities = buildActivityCatalog(
    parsedSchedule.agents.flatMap((agent) =>
      Object.values(agent.days).flatMap((day) => day.intervals.map((interval) => interval.activity))
    ),
    settings
  ).map((entry) => entry.activity);

  return {
    dates,
    slots: slotStarts,
    cells,
    summary: summarizeRotation(cells, parsedSchedule.agents),
    settings,
    detectedActivities
  };
}

function normalizeFallbackId(value: string): string {
  return normalizeName(value);
}

export function toClipboardTable(rotation: RotationResult): string {
  const header = ["Heure", ...rotation.dates.map(formatDisplayDate)];
  const lines = [header.join("\t")];

  for (const slot of rotation.slots) {
    const row = [slot];
    for (const date of rotation.dates) {
      const cell = rotation.cells.find((item) => item.date === date && item.slotStart === slot);
      row.push(cell?.assignedAgentName ?? "");
    }
    lines.push(row.join("\t"));
  }

  return lines.join("\n");
}
