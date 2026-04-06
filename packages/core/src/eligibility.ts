import type { AgentSchedule, ParsedInterval, RotationSettings } from "./types";
import { normalizeActivityLabel } from "./utils";
import { intersectRange, rangeContains } from "./utils";

const OPEN_TIME_ACTIVITY = "open time";

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  matchedEligibleIntervals: ParsedInterval[];
  blockingIntervals: ParsedInterval[];
}

export function evaluateAgentEligibility(
  agent: AgentSchedule,
  date: string,
  slotStart: string,
  slotEnd: string,
  settings: RotationSettings
): EligibilityResult {
  const day = agent.days[date];

  if (!day) {
    return {
      eligible: false,
      reasons: ["Aucun horaire detecte pour ce jour."],
      matchedEligibleIntervals: [],
      blockingIntervals: []
    };
  }

  const blockingIntervals = day.intervals.filter((interval) => {
    return (
      normalizeActivityLabel(interval.activity) !== OPEN_TIME_ACTIVITY &&
      intersectRange(interval.start, interval.end, slotStart, slotEnd)
    );
  });

  if (blockingIntervals.length) {
    return {
      eligible: false,
      reasons: blockingIntervals.map(
        (interval) => `Indisponible a cause de "${interval.activity}" (${interval.start}-${interval.end}).`
      ),
      matchedEligibleIntervals: [],
      blockingIntervals
    };
  }

  const matchedEligibleIntervals = day.intervals.filter((interval) => {
    return (
      normalizeActivityLabel(interval.activity) === OPEN_TIME_ACTIVITY &&
      rangeContains(interval.start, interval.end, slotStart, slotEnd)
    );
  });

  if (!matchedEligibleIntervals.length) {
    return {
      eligible: false,
      reasons: ["Aucune activite eligible ne couvre tout le creneau."],
      matchedEligibleIntervals: [],
      blockingIntervals: []
    };
  }

  return {
    eligible: true,
    reasons: matchedEligibleIntervals.map(
      (interval) => `Disponible via "${interval.activity}" (${interval.start}-${interval.end}).`
    ),
    matchedEligibleIntervals,
    blockingIntervals: []
  };
}
