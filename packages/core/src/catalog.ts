import { DEFAULT_ACTIVITY_RULES } from "./constants";
import type { ActivityCatalogEntry, ActivityCategory, ActivityRule, RotationSettings } from "./types";
import { normalizeActivityLabel } from "./utils";

function detectRule(activity: string, rules: ActivityRule[]): ActivityRule | undefined {
  const normalized = normalizeActivityLabel(activity);

  return rules.find((rule) => {
    if (normalizeActivityLabel(rule.label) === normalized) {
      return true;
    }

    return rule.aliases.some((alias) => normalized.includes(normalizeActivityLabel(alias)));
  });
}

export function resolveActivityCategory(
  activity: string,
  settings: RotationSettings,
  rules: ActivityRule[] = DEFAULT_ACTIVITY_RULES
): ActivityCategory {
  const normalized = normalizeActivityLabel(activity);

  if (settings.eligibleActivities.includes(normalized)) {
    return "eligible";
  }

  if (settings.ineligibleActivities.includes(normalized)) {
    return "ineligible";
  }

  const rule = detectRule(activity, rules);
  if (!rule) {
    return "unknown";
  }

  if (rule.category === "conditional") {
    return settings.allowAlternance ? "eligible" : "ineligible";
  }

  return rule.category;
}

export function buildActivityCatalog(
  activities: string[],
  settings: RotationSettings,
  rules: ActivityRule[] = DEFAULT_ACTIVITY_RULES
): ActivityCatalogEntry[] {
  return [...new Set(activities)]
    .map((activity) => {
      const rule = detectRule(activity, rules);
      return {
        activity,
        normalizedActivity: normalizeActivityLabel(activity),
        category: resolveActivityCategory(activity, settings, rules),
        configurable: rule?.configurable ?? true
      };
    })
    .sort((a, b) => a.activity.localeCompare(b.activity, "fr"));
}

