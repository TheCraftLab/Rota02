import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/constants";
import { evaluateAgentEligibility } from "../src/eligibility";
import { parseNiceWfmText } from "../src/parser";
import { generateRotation, removeAgentForDate, summarizeRotation } from "../src/rotation";
import { buildRotationSlots } from "../src/utils";

const SAMPLE_INPUT = `
Agent: 3109542 Assfeld, Isabel
07/04/2026 09:00 18:00 Open Time
11:00 12:00 Brief
12:00 13:00 Pause repas
08/04/2026 09:00 17:00 Open Time

Agent: 3109550 Martin, Lea
07/04/2026 09:00 18:00 Open Time
10:00 10:30 Petite pause remuneree exclue
08/04/2026 00:00 23:59 Libre

Agent: 3109551 Petit, Marc
07/04/2026 09:00 18:00 Alternance Ecole/WH
08/04/2026 09:00 18:00 Open Time
`;

const CONCATENATED_AGENT_HEADER_INPUT = `
Agent: 3010957 Defougere, Lucie DateDebutFinActivite planifieeDebutFin
07/04/2026 09:00 18:00 Open Time
`;

const NICE_PDF_EXTRACT_INPUT = `
Horaires d’agent
Plage de dates: 06/04/26 - 11/04/26
Agent: 3055492 Bedani, Anais DateDébutFinActivité planifiéeDébutFin
07/04/2608:3017:36Open Time08:3010:30 Petite pause remuneree exclue10:3010:45 Open Time10:4512:30 Pause repas12:3013:30 Open Time13:3015:45 Petite pause remuneree exclue15:4516:00 Open Time16:0017:36
08/04/2608:3017:30Open Time08:3010:30
Nivois, Kevin 06/04/26 21:29Page 1 de 22
Horaires d’agent06/04/26 - 11/04/26
Agent: 3055492 Bedani, Anais DateDébutFinActivité planifiéeDébutFin
Petite pause remuneree exclue10:3010:45 Open Time10:4512:30 Pause repas12:3013:30 Open Time13:3015:00 Petite pause remuneree exclue15:0015:15 Open Time15:1517:30
10/04/26Libre
`;

const METADATA_DATE_INPUT = `
Export genere le 23/04/26 a 11:42
Agent: 3109542 Assfeld, Isabel
27/04/2026 09:00 18:00 Open Time
`;

const BALANCED_REMOVAL_INPUT = `
Agent: 3109001 Alpha, Alice
07/04/2026 08:30 13:00 Open Time

Agent: 3109002 Bravo, Bob
07/04/2026 08:30 13:00 Open Time

Agent: 3109003 Charlie, Chloe
07/04/2026 08:30 13:00 Open Time
`;

describe("parseNiceWfmText", () => {
  it("detects agents, dates and intervals from a NICE-style export", () => {
    const parsed = parseNiceWfmText(SAMPLE_INPUT, "sample.txt", "text/plain", new Date("2026-04-01T10:00:00Z"));

    expect(parsed.agents).toHaveLength(3);
    expect(parsed.dates).toEqual(["2026-04-07", "2026-04-08"]);
    expect(parsed.agents[0]?.days["2026-04-07"]?.intervals).toHaveLength(3);
    expect(parsed.agents[0]?.displayName).toBe("Isabel ASSFELD");
    expect(parsed.agents[2]?.days["2026-04-08"]?.intervals[0]?.activity).toBe("Open Time");
  });

  it("cuts concatenated NICE column headers from the agent line", () => {
    const parsed = parseNiceWfmText(CONCATENATED_AGENT_HEADER_INPUT);

    expect(parsed.agents).toHaveLength(1);
    expect(parsed.agents[0]?.agentId).toBe("3010957");
    expect(parsed.agents[0]?.displayName).toBe("Lucie DEFOUGERE");
  });

  it("parses NICE compact day lines and continues the same day after a page break", () => {
    const parsed = parseNiceWfmText(
      NICE_PDF_EXTRACT_INPUT,
      "view-4.pdf",
      "application/pdf",
      new Date("2026-04-06T10:00:00Z")
    );

    expect(parsed.agents).toHaveLength(1);
    expect(parsed.agents[0]?.displayName).toBe("Anais BEDANI");
    expect(parsed.dates).toEqual(["2026-04-07", "2026-04-08", "2026-04-10"]);
    expect(parsed.agents[0]?.days["2026-04-08"]?.intervals).toHaveLength(7);
    expect(parsed.agents[0]?.days["2026-04-08"]?.intervals[0]).toMatchObject({
      activity: "Open Time",
      start: "08:30",
      end: "10:30"
    });
    expect(parsed.agents[0]?.days["2026-04-10"]?.intervals[0]).toMatchObject({
      activity: "Libre",
      start: "00:00",
      end: "23:59"
    });
  });

  it("ignores metadata dates outside agent context", () => {
    const parsed = parseNiceWfmText(METADATA_DATE_INPUT, "metadata.txt", "text/plain", new Date("2026-04-23T11:42:00Z"));

    expect(parsed.dates).toEqual(["2026-04-27"]);
    expect(parsed.agents[0]?.days["2026-04-27"]?.intervals).toHaveLength(1);
  });
});

describe("evaluateAgentEligibility", () => {
  it("blocks a slot when a brief overlaps the slot", () => {
    const parsed = parseNiceWfmText(SAMPLE_INPUT);
    const agent = parsed.agents.find((item) => item.displayName === "Isabel ASSFELD");

    expect(agent).toBeDefined();

    const result = evaluateAgentEligibility(agent!, "2026-04-07", "11:00", "12:00", DEFAULT_SETTINGS);

    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("Brief");
  });

  it("blocks any non-open-time activity", () => {
    const parsed = parseNiceWfmText(SAMPLE_INPUT);
    const agent = parsed.agents.find((item) => item.displayName === "Marc PETIT");

    expect(agent).toBeDefined();

    const blocked = evaluateAgentEligibility(agent!, "2026-04-07", "09:00", "10:00", DEFAULT_SETTINGS);

    expect(blocked.eligible).toBe(false);
  });

  it("does not block paid short breaks", () => {
    const parsed = parseNiceWfmText(SAMPLE_INPUT);
    const agent = parsed.agents.find((item) => item.displayName === "Lea MARTIN");

    expect(agent).toBeDefined();

    const result = evaluateAgentEligibility(agent!, "2026-04-07", "10:00", "11:00", DEFAULT_SETTINGS);

    expect(result.eligible).toBe(true);
    expect(result.blockingIntervals).toHaveLength(0);
  });

  it("applies admin blocked-date preferences", () => {
    const parsed = parseNiceWfmText(SAMPLE_INPUT);
    const agent = parsed.agents.find((item) => item.displayName === "Lea MARTIN");

    expect(agent).toBeDefined();

    agent!.preferences = { blockedDates: ["2026-04-07"] };

    const result = evaluateAgentEligibility(agent!, "2026-04-07", "09:00", "10:00", DEFAULT_SETTINGS);

    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("date bloquee");
  });
});

describe("buildRotationSlots", () => {
  it("generates 60-minute slots from a half-hour start", () => {
    expect(buildRotationSlots("08:30", "12:00", 60)).toEqual([
      { start: "08:30", end: "09:30" },
      { start: "09:30", end: "10:30" },
      { start: "10:30", end: "11:30" },
      { start: "11:30", end: "12:00" }
    ]);
  });

  it("generates 30-minute slots from a half-hour start", () => {
    expect(buildRotationSlots("08:30", "10:00", 30)).toEqual([
      { start: "08:30", end: "09:00" },
      { start: "09:00", end: "09:30" },
      { start: "09:30", end: "10:00" }
    ]);
  });
});

describe("generateRotation", () => {
  it("uses exactly the dates detected in the import file", () => {
    const parsed = parseNiceWfmText(SAMPLE_INPUT);
    const rotation = generateRotation(parsed, { ...DEFAULT_SETTINGS, startTime: "09:00", endTime: "11:00", slotMinutes: 60 });

    expect(rotation.dates).toEqual(parsed.dates);
    expect([...new Set(rotation.cells.map((cell) => cell.date))]).toEqual(parsed.dates);
  });

  it("creates a deterministic and balanced rotation", () => {
    const parsed = parseNiceWfmText(SAMPLE_INPUT);
    const settings = { ...DEFAULT_SETTINGS, startTime: "09:00", endTime: "13:00", slotMinutes: 60 };
    const rotation = generateRotation(parsed, settings);
    const secondPass = generateRotation(parsed, settings);
    const firstDayAssignments = rotation.cells
      .filter((cell) => cell.date === "2026-04-07")
      .map((cell) => cell.assignedAgentName);

    expect(rotation.slots).toEqual(["09:00", "10:00", "11:00", "12:00"]);
    expect(firstDayAssignments).toEqual(["Isabel ASSFELD", "Lea MARTIN", "Lea MARTIN", "Lea MARTIN"]);
    expect(rotation.cells.map((cell) => cell.assignedAgentName)).toEqual(
      secondPass.cells.map((cell) => cell.assignedAgentName)
    );
    expect(
      rotation.cells.every((cell) => {
        if (cell.status === "uncovered") {
          return cell.candidates.every((candidate) => !candidate.eligible);
        }

        return cell.candidates.some(
          (candidate) => candidate.agentName === cell.assignedAgentName && candidate.eligible
        );
      })
    ).toBe(true);
    expect(rotation.summary.fairnessScore).toBeGreaterThan(0);
  });

  it("excludes manually liberated slots from summary totals", () => {
    const parsed = parseNiceWfmText(SAMPLE_INPUT);
    const rotation = generateRotation(parsed, { ...DEFAULT_SETTINGS, startTime: "09:00", endTime: "11:00", slotMinutes: 60 });
    const firstCell = rotation.cells[0];

    expect(firstCell).toBeDefined();

    const nextCells = rotation.cells.map((cell, index) =>
      index === 0
        ? {
            ...cell,
            assignedAgentId: null,
            assignedAgentName: "Creneau libere",
            status: "disabled" as const,
            reasons: ["Creneau libere manuellement depuis l'administration."]
          }
        : cell
    );
    const summary = summarizeRotation(nextCells, parsed.agents);

    expect(summary.totalSlots).toBe(rotation.cells.length - 1);
    expect(summary.uncoveredSlots).toBe(rotation.cells.filter((cell) => cell.status === "uncovered").length);
    expect(summary.agentSummaries.find((item) => item.agentName === "Isabel ASSFELD")?.totalSlots).toBe(1);
  });

  it("marks French public holidays across the whole day and excludes them from active totals", () => {
    const parsed = parseNiceWfmText(`
Agent: 3109542 Assfeld, Isabel
01/05/2026 08:30 18:00 Open Time
`);
    const rotation = generateRotation(parsed, DEFAULT_SETTINGS);

    expect(rotation.cells.every((cell) => cell.status === "holiday")).toBe(true);
    expect(rotation.cells.every((cell) => cell.assignedAgentName === "Ferie")).toBe(true);
    expect(rotation.summary.totalSlots).toBe(0);
    expect(rotation.summary.uncoveredSlots).toBe(0);
  });

  it("reassigns a removed agent day to the least-loaded eligible agents", () => {
    const parsed = parseNiceWfmText(BALANCED_REMOVAL_INPUT);
    const rotation = generateRotation(parsed, { ...DEFAULT_SETTINGS, startTime: "08:30", endTime: "13:00", slotMinutes: 60 });
    const alice = parsed.agents.find((agent) => agent.displayName === "Alice ALPHA");

    expect(alice).toBeDefined();

    const withoutAlice = removeAgentForDate(
      rotation,
      parsed.agents,
      "2026-04-07",
      alice!.agentId ?? alice!.normalizedName
    );
    const dayCells = withoutAlice.cells.filter((cell) => cell.date === "2026-04-07");
    const assignments = dayCells.map((cell) => cell.assignedAgentName);

    expect(assignments).toEqual(["Chloe CHARLIE", "Bob BRAVO", "Chloe CHARLIE", "Bob BRAVO", "Bob BRAVO"]);
    expect(dayCells.every((cell) => cell.assignedAgentName !== "Alice ALPHA")).toBe(true);
    expect(dayCells.filter((cell) => cell.status === "manual")).toHaveLength(2);
  });
});
