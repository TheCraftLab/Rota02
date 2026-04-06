import type { AgentSchedule, ParseWarning, ParsedDay, ParsedInterval, ParsedSchedule } from "./types";
import { compareIsoDate, inferIsoDate, normalizeActivityLabel, normalizeName, normalizeText, normalizeWhitespace } from "./utils";

const DATE_PATTERN = /(\d{2}\/\d{2}(?:\/(?:\d{4}|\d{2}))?)/;
const TIME_RANGE_PATTERN =
  /(?<start>\d{1,2}:\d{2})\s*(?:-|a|->|>|au|to)?\s*(?<end>\d{1,2}:\d{2})\s*(?<label>.*)$/i;
const AGENT_HEADER_SUFFIX_PATTERN =
  /\s+(?:Date\s*Debut\s*Fin\s*Activite(?:\s*planifiee)?\s*Debut\s*Fin|DateDebutFinActivite(?:\s*planifiee)?DebutFin|Date\s*Activite|DateDebutFin)\b.*$/i;
const NICE_DAY_START_PATTERN =
  /^(?<date>\d{2}\/\d{2}(?:\/(?:\d{4}|\d{2}))?)\s*(?<plannedStart>\d{1,2}:\d{2})\s*(?<plannedEnd>\d{1,2}:\d{2})\s*(?<activity>.+?)\s*(?<slotStart>\d{1,2}:\d{2})\s*(?<slotEnd>\d{1,2}:\d{2})$/i;
const NICE_CONTINUATION_PATTERN =
  /^(?<activity>.+?)\s*(?<start>\d{1,2}:\d{2})\s*(?<end>\d{1,2}:\d{2})$/i;
const NICE_DAY_STATUS_PATTERN =
  /^(?<date>\d{2}\/\d{2}(?:\/(?:\d{4}|\d{2}))?)\s*(?<activity>Libre|Conge.*|Absence.*|Off)$/i;

function splitLogicalLines(input: string): string[] {
  const baseLines = normalizeWhitespace(input)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const logicalLines: string[] = [];

  for (const line of baseLines) {
    const previous = logicalLines.at(-1);
    const isContinuation =
      previous &&
      !line.match(/^Agent\s*:/i) &&
      !line.match(DATE_PATTERN) &&
      !line.match(TIME_RANGE_PATTERN) &&
      !line.match(/^\d{1,2}:\d{2}$/);

    if (isContinuation) {
      logicalLines[logicalLines.length - 1] = `${previous} ${line}`;
      continue;
    }

    logicalLines.push(line);
  }

  return logicalLines;
}

function isNoiseLine(line: string): boolean {
  const normalized = normalizeText(line).replace(/[’']/g, "'").toLowerCase();
  return (
    /horaires d.?agent/.test(normalized) ||
    normalized.startsWith("plage de dates:") ||
    /date\s*debut\s*fin\s*activite\s*planifiee\s*debut\s*fin/.test(normalized) ||
    /page\s+\d+\s+de\s+\d+/.test(normalized)
  );
}

function ensureDay(agent: AgentSchedule, date: string): ParsedDay {
  if (!agent.days[date]) {
    agent.days[date] = {
      date,
      intervals: [],
      issues: []
    };
  }

  return agent.days[date];
}

function createAgent(raw: string): AgentSchedule {
  const match = raw.match(/^Agent\s*:\s*(?:(\d+)\s+)?(.+)$/i);
  const displayName = sanitizeAgentName(match?.[2] ?? raw.replace(/^Agent\s*:/i, "").trim());
  return {
    agentId: match?.[1] ?? null,
    displayName,
    normalizedName: normalizeName(displayName),
    days: {}
  };
}

function sanitizeAgentName(rawName: string): string {
  let value = normalizeText(rawName)
    .replace(AGENT_HEADER_SUFFIX_PATTERN, "")
    .replace(DATE_PATTERN, "")
    .trim();

  const commaNameMatch = value.match(/^([^,]+),\s*(.+)$/);
  if (commaNameMatch) {
    value = formatDisplayName(commaNameMatch[2] ?? "", commaNameMatch[1] ?? "");
  } else {
    value = formatDisplayNameFromFlatValue(value);
  }

  return normalizeText(value);
}

function formatDisplayName(firstNameRaw: string, lastNameRaw: string): string {
  const firstName = toTitleCase(firstNameRaw);
  const lastName = normalizeText(lastNameRaw).toUpperCase();
  return `${firstName} ${lastName}`.trim();
}

function formatDisplayNameFromFlatValue(value: string): string {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return toTitleCase(value);
  }

  const lastName = parts.pop() ?? "";
  const firstName = parts.join(" ");
  return formatDisplayName(firstName, lastName);
}

function toTitleCase(value: string): string {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .map((segment) =>
          segment ? `${segment.charAt(0).toUpperCase()}${segment.slice(1).toLowerCase()}` : segment
        )
        .join("-")
    )
    .join(" ");
}

function extractActivityLabel(fallback: string, line: string, nextLine?: string): string {
  if (fallback.trim()) {
    return normalizeText(fallback);
  }

  if (nextLine && !nextLine.match(TIME_RANGE_PATTERN) && !nextLine.match(DATE_PATTERN)) {
    return normalizeText(nextLine);
  }

  return normalizeText(line);
}

export function parseNiceWfmText(
  input: string,
  filename = "import.txt",
  mimeType = "text/plain",
  now = new Date()
): ParsedSchedule {
  const logicalLines = splitLogicalLines(input);
  const warnings: ParseWarning[] = [];
  const dates = new Set<string>();
  const agentMap = new Map<string, AgentSchedule>();
  const lastDateByAgent = new Map<string, string>();
  const defaultYear = now.getFullYear();

  let currentAgent: AgentSchedule | null = null;
  let currentDate: string | null = null;

  for (let index = 0; index < logicalLines.length; index += 1) {
    const line = logicalLines[index]!;

    if (/^Agent\s*:/i.test(line)) {
      const nextAgent = createAgent(line);
      const existing = agentMap.get(nextAgent.normalizedName);
      currentAgent = existing ?? nextAgent;
      if (!existing) {
        agentMap.set(nextAgent.normalizedName, nextAgent);
      }
      currentDate = lastDateByAgent.get(currentAgent.normalizedName) ?? null;
      continue;
    }

    if (isNoiseLine(line)) {
      continue;
    }

    const dayStatus = line.match(NICE_DAY_STATUS_PATTERN);
    if (dayStatus?.groups?.date && dayStatus.groups.activity) {
      const dateInLine = inferIsoDate(dayStatus.groups.date, defaultYear);
      if (!dateInLine) {
        continue;
      }

      currentDate = dateInLine;
      dates.add(dateInLine);

      if (!currentAgent) {
        warnings.push({
          scope: "global",
          message: `Journee ignoree faute de contexte agent: ${line}`
        });
        continue;
      }

      lastDateByAgent.set(currentAgent.normalizedName, currentDate);
      const day = ensureDay(currentAgent, currentDate);
      day.intervals.push({
        start: "00:00",
        end: "23:59",
        activity: normalizeText(dayStatus.groups.activity),
        normalizedActivity: normalizeActivityLabel(dayStatus.groups.activity),
        sourceLine: line
      });
      continue;
    }

    const niceDayStart = line.match(NICE_DAY_START_PATTERN);
    if (
      niceDayStart?.groups?.date &&
      niceDayStart.groups.activity &&
      niceDayStart.groups.slotStart &&
      niceDayStart.groups.slotEnd
    ) {
      const dateInLine = inferIsoDate(niceDayStart.groups.date, defaultYear);
      if (!dateInLine) {
        continue;
      }

      currentDate = dateInLine;
      dates.add(dateInLine);

      if (!currentAgent) {
        warnings.push({
          scope: "global",
          message: `Journee NICE ignoree faute de contexte agent: ${line}`
        });
        continue;
      }

      lastDateByAgent.set(currentAgent.normalizedName, currentDate);
      const day = ensureDay(currentAgent, currentDate);
      day.intervals.push({
        start: niceDayStart.groups.slotStart.padStart(5, "0"),
        end: niceDayStart.groups.slotEnd.padStart(5, "0"),
        activity: normalizeText(niceDayStart.groups.activity),
        normalizedActivity: normalizeActivityLabel(niceDayStart.groups.activity),
        sourceLine: line
      });
      continue;
    }

    const dateInLine = inferIsoDate(line, defaultYear);
    if (dateInLine) {
      currentDate = dateInLine;
      dates.add(dateInLine);
      if (!currentAgent) {
        warnings.push({
          scope: "global",
          message: `Date detectee sans agent contexte: ${line}`
        });
      } else {
        ensureDay(currentAgent, dateInLine);
      }
      continue;
    }

    const continuation = line.match(NICE_CONTINUATION_PATTERN);
    if (continuation?.groups?.activity && continuation.groups.start && continuation.groups.end) {
      if (!currentAgent || !currentDate) {
        warnings.push({
          scope: "global",
          message: `Sous-creneau ignore faute de contexte agent/date: ${line}`
        });
        continue;
      }

      const day = ensureDay(currentAgent, currentDate);
      const activity = normalizeText(continuation.groups.activity);
      day.intervals.push({
        start: continuation.groups.start.padStart(5, "0"),
        end: continuation.groups.end.padStart(5, "0"),
        activity,
        normalizedActivity: normalizeActivityLabel(activity),
        sourceLine: line
      });
      continue;
    }

    const timeRange = line.match(TIME_RANGE_PATTERN);
    if (timeRange?.groups?.start && timeRange.groups.end) {
      if (!currentAgent || !currentDate) {
        warnings.push({
          scope: "global",
          message: `Plage ignoree faute de contexte agent/date: ${line}`
        });
        continue;
      }

      lastDateByAgent.set(currentAgent.normalizedName, currentDate);
      const day = ensureDay(currentAgent, currentDate);
      const label = extractActivityLabel(
        timeRange.groups.label ?? "",
        line,
        logicalLines[index + 1]
      );

      const interval: ParsedInterval = {
        start: timeRange.groups.start.padStart(5, "0"),
        end: timeRange.groups.end.padStart(5, "0"),
        activity: label,
        normalizedActivity: normalizeActivityLabel(label),
        sourceLine: line
      };

      day.intervals.push(interval);
      continue;
    }

    if (currentAgent && currentDate && /^(Libre|Conge|Absence|Off)\b/i.test(line)) {
      lastDateByAgent.set(currentAgent.normalizedName, currentDate);
      const day = ensureDay(currentAgent, currentDate);
      day.intervals.push({
        start: "00:00",
        end: "23:59",
        activity: normalizeText(line),
        normalizedActivity: normalizeActivityLabel(line),
        sourceLine: line
      });
      continue;
    }
  }

  const agents = [...agentMap.values()]
    .map((agent) => {
      for (const day of Object.values(agent.days)) {
        day.intervals.sort((a, b) => {
          if (a.start === b.start) {
            return a.end.localeCompare(b.end);
          }
          return a.start.localeCompare(b.start);
        });
        if (!day.intervals.length) {
          day.issues.push("Aucun intervalle detecte pour cette journee.");
        }
      }
      return agent;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));

  if (!agents.length) {
    warnings.push({
      scope: "global",
      message: "Aucun agent n'a ete detecte dans le document."
    });
  }

  return {
    agents,
    dates: [...dates].sort(compareIsoDate),
    warnings,
    sourceMeta: {
      filename,
      mimeType,
      parsedAt: now.toISOString()
    }
  };
}
