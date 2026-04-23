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
import { average, buildRotationSlots, formatDisplayDate, getFrenchPublicHolidayLabel, normalizeName, standardDeviation } from "./utils";

interface MutableCounter {
  total: number;
  byDate: Record<string, number>;
}

const NON_COVERED_NAME = "Non couvert";
const HOLIDAY_NAME = "Ferie";
const DISABLED_SLOT_NAME = "Creneau libere";

function resolveAgentKey(agentId: string | null, agentName: string): string {
  return agentId ?? normalizeName(agentName);
}

function isCountedAssignment(cell: RotationCell): boolean {
  if (cell.status === "disabled" || cell.status === "holiday") {
    return false;
  }

  return (
    cell.assignedAgentName !== NON_COVERED_NAME &&
    cell.assignedAgentName !== HOLIDAY_NAME &&
    cell.assignedAgentName !== DISABLED_SLOT_NAME
  );
}

function readCounter(counters: Map<string, MutableCounter>, key: string, date: string): [number, number] {
  const counter = counters.get(key);
  return [counter?.total ?? 0, counter?.byDate[date] ?? 0];
}

function incrementCounter(counters: Map<string, MutableCounter>, key: string, date: string): void {
  const current = counters.get(key) ?? { total: 0, byDate: {} };
  current.total += 1;
  current.byDate[date] = (current.byDate[date] ?? 0) + 1;
  counters.set(key, current);
}

function buildAssignmentCounters(cells: RotationCell[]): Map<string, MutableCounter> {
  const counters = new Map<string, MutableCounter>();

  for (const cell of cells) {
    if (!isCountedAssignment(cell)) {
      continue;
    }

    const key = resolveAgentKey(cell.assignedAgentId, cell.assignedAgentName);
    incrementCounter(counters, key, cell.date);
  }

  return counters;
}

function buildRemovalReasons(
  removedAgentName: string,
  date: string,
  replacementName: string,
  globalBefore: number,
  dayBefore: number
): string[] {
  return [
    `Reaffectation automatique: ${removedAgentName} est retire(e) de la journee ${formatDisplayDate(date)}.`,
    `${replacementName} est choisi car il a le moins de creneaux (${globalBefore} global, ${dayBefore} sur la journee).`
  ];
}

function buildUncoveredReasons(removedAgentName: string, date: string): string[] {
  return [
    `Reaffectation automatique: ${removedAgentName} est retire(e) de la journee ${formatDisplayDate(date)}.`,
    "Aucun autre agent eligible n'etait disponible pour ce creneau."
  ];
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
  const activeCells = cells.filter((cell) => cell.status !== "disabled" && cell.status !== "holiday");
  const agentSummaries = agents.map((agent) => {
    const assignedCells = activeCells.filter((cell) => cell.assignedAgentName === agent.displayName);
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

  const uncoveredSlots = activeCells.filter((cell) => cell.status === "uncovered").length;
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
    totalSlots: activeCells.length,
    fairnessScore,
    alerts
  };
}

export function removeAgentForDate(
  rotation: RotationResult,
  agents: AgentSchedule[],
  date: string,
  removedAgentKey: string
): RotationResult {
  if (!removedAgentKey || !rotation.dates.includes(date)) {
    return rotation;
  }

  const slotRank = new Map(rotation.slots.map((slot, index) => [slot, index]));
  const nextCells = [...rotation.cells];
  const counters = buildAssignmentCounters(nextCells);
  const removedAgentName =
    agents.find((agent) => resolveAgentKey(agent.agentId, agent.displayName) === removedAgentKey)?.displayName ??
    nextCells.find((cell) => resolveAgentKey(cell.assignedAgentId, cell.assignedAgentName) === removedAgentKey)
      ?.assignedAgentName ??
    "Agent retire";

  const targetIndices = nextCells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => {
      if (cell.date !== date || cell.status === "disabled" || cell.status === "holiday") {
        return false;
      }
      return resolveAgentKey(cell.assignedAgentId, cell.assignedAgentName) === removedAgentKey;
    })
    .sort((left, right) => (slotRank.get(left.cell.slotStart) ?? 0) - (slotRank.get(right.cell.slotStart) ?? 0))
    .map((entry) => entry.index);

  if (!targetIndices.length) {
    return rotation;
  }

  for (const index of targetIndices) {
    const currentCell = nextCells[index];
    if (!currentCell) {
      continue;
    }

    const eligibleReplacements = currentCell.candidates
      .filter((candidate) => candidate.eligible)
      .filter((candidate) => resolveAgentKey(candidate.agentId, candidate.agentName) !== removedAgentKey)
      .sort((left, right) => {
        const leftKey = resolveAgentKey(left.agentId, left.agentName);
        const rightKey = resolveAgentKey(right.agentId, right.agentName);
        const [leftTotal, leftDay] = readCounter(counters, leftKey, date);
        const [rightTotal, rightDay] = readCounter(counters, rightKey, date);

        if (leftTotal !== rightTotal) {
          return leftTotal - rightTotal;
        }

        if (leftDay !== rightDay) {
          return leftDay - rightDay;
        }

        return left.agentName.localeCompare(right.agentName, "fr");
      });

    const replacement = eligibleReplacements[0];
    if (!replacement) {
      const { manualOverride: _manualOverride, ...baseCell } = currentCell;
      nextCells[index] = {
        ...baseCell,
        assignedAgentId: null,
        assignedAgentName: NON_COVERED_NAME,
        status: "uncovered",
        reasons: buildUncoveredReasons(removedAgentName, date)
      };
      continue;
    }

    const replacementKey = resolveAgentKey(replacement.agentId, replacement.agentName);
    const [globalBefore, dayBefore] = readCounter(counters, replacementKey, date);
    incrementCounter(counters, replacementKey, date);

    nextCells[index] = {
      ...currentCell,
      assignedAgentId: replacement.agentId,
      assignedAgentName: replacement.agentName,
      status: "manual",
      reasons: buildRemovalReasons(removedAgentName, date, replacement.agentName, globalBefore, dayBefore),
      manualOverride: {
        forced: false,
        originalAgentId: currentCell.manualOverride?.originalAgentId ?? currentCell.assignedAgentId,
        originalAgentName: currentCell.manualOverride?.originalAgentName ?? currentCell.assignedAgentName
      }
    };
  }

  return {
    ...rotation,
    cells: nextCells,
    summary: summarizeRotation(nextCells, agents)
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
  const slots = buildRotationSlots(settings.startTime, settings.endTime, settings.slotMinutes);
  const counters = new Map<string, MutableCounter>();
  const cells: RotationCell[] = [];

  let previousAgentId: string | null = null;

  for (const date of dates) {
    previousAgentId = null;
    const holidayName = getFrenchPublicHolidayLabel(date);

    for (const slot of slots) {
      const slotStart = slot.start;
      const slotEnd = slot.end;

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
        const baseCell: RotationCell = {
          date,
          slotStart,
          slotEnd,
          assignedAgentId: null,
          assignedAgentName: "Non couvert",
          status: "uncovered",
          reasons: ["Aucun agent ne couvre integralement ce creneau."],
          candidates
        };

        if (holidayName) {
          cells.push({
            ...baseCell,
            assignedAgentName: "Ferie",
            status: "holiday",
            reasons: [`Jour ferie en France: ${holidayName}.`],
            holidayOverride: {
              holidayName,
              cancelled: false,
              restoreState: {
                assignedAgentId: baseCell.assignedAgentId,
                assignedAgentName: baseCell.assignedAgentName,
                status: "uncovered",
                reasons: [...baseCell.reasons],
                forcedManualOverride: false,
                originalAgentId: null,
                originalAgentName: "Non couvert"
              }
            }
          });
          previousAgentId = null;
          continue;
        }

        cells.push(baseCell);
        previousAgentId = null;
        continue;
      }

      const baseCell: RotationCell = {
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
      };

      if (holidayName) {
        cells.push({
          ...baseCell,
          assignedAgentId: null,
          assignedAgentName: "Ferie",
          status: "holiday",
          reasons: [`Jour ferie en France: ${holidayName}.`],
          holidayOverride: {
            holidayName,
            cancelled: false,
            restoreState: {
              assignedAgentId: baseCell.assignedAgentId,
              assignedAgentName: baseCell.assignedAgentName,
              status: "assigned",
              reasons: [...baseCell.reasons],
              forcedManualOverride: false,
              originalAgentId: baseCell.assignedAgentId,
              originalAgentName: baseCell.assignedAgentName
            }
          }
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
      cells.push(baseCell);
    }
  }

  const detectedActivities = [
    ...new Set(
      parsedSchedule.agents.flatMap((agent) =>
        Object.values(agent.days).flatMap((day) => day.intervals.map((interval) => interval.activity))
      )
    )
  ].sort((a, b) => a.localeCompare(b, "fr"));

  return {
    dates,
    slots: slots.map((slot) => slot.start),
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
