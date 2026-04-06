import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/constants";
import { evaluateAgentEligibility } from "../src/eligibility";
import { parseNiceWfmText } from "../src/parser";
import { generateRotation } from "../src/rotation";

const SAMPLE_INPUT = `
Agent: 3109542 Assfeld, Isabel
07/04/2026
09:00 18:00 Open Time
11:00 12:00 Brief
12:00 13:00 Pause repas

08/04/2026
09:00 17:00 Open Time

Agent: 3109550 Martin, Lea
07/04/2026
09:00 18:00 Open Time
10:00 10:30 Petite pause remuneree exclue

08/04/2026
00:00 23:59 Libre

Agent: 3109551 Petit, Marc
07/04/2026
09:00 18:00 Alternance Ecole/WH

08/04/2026
09:00 18:00 Open Time
`;

const CONCATENATED_AGENT_HEADER_INPUT = `
Agent: 3010957 Defougere, Lucie DateDebutFinActivite planifieeDebutFin
07/04/2026
09:00 18:00 Open Time
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
});

describe("generateRotation", () => {
  it("creates a deterministic and balanced rotation", () => {
    const parsed = parseNiceWfmText(SAMPLE_INPUT);
    const settings = {
      ...DEFAULT_SETTINGS,
      startTime: "09:00",
      endTime: "13:00",
      slotMinutes: 60
    };
    const rotation = generateRotation(parsed, settings);
    const secondPass = generateRotation(parsed, settings);

    const firstDayAssignments = rotation.cells
      .filter((cell) => cell.date === "2026-04-07")
      .map((cell) => cell.assignedAgentName);

    expect(firstDayAssignments).toEqual(["Isabel ASSFELD", "Isabel ASSFELD", "Lea MARTIN", "Lea MARTIN"]);
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
});
