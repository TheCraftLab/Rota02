import { resolveActivityCategory } from "./catalog";
import type { AgentSchedule, ParsedInterval, RotationSettings } from "./types";
import { intersectRange, rangeContains } from "./utils";

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
    const category = resolveActivityCategory(interval.activity, settings);
    return category === "ineligible" && intersectRange(interval.start, interval.end, slotStart, slotEnd);
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
    const category = resolveActivityCategory(interval.activity, settings);
    return category === "eligible" && rangeContains(interval.start, interval.end, slotStart, slotEnd);
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

