import type { ActivityRule, RotationSettings } from "./types";
import { normalizeActivityLabel } from "./utils";

export const DEFAULT_ACTIVITY_RULES: ActivityRule[] = [
  {
    label: "Open Time",
    aliases: ["open time", "production", "chat", "disponible"],
    category: "eligible",
    description: "Activite disponible par defaut."
  },
  {
    label: "Brief",
    aliases: ["brief", "briefing"],
    category: "ineligible",
    configurable: true,
    description: "Un brief bloque le creneau s'il le recouvre."
  },
  {
    label: "Pause repas",
    aliases: ["pause repas", "repas", "dejeuner"],
    category: "ineligible",
    description: "Pause repas non eligible."
  },
  {
    label: "Petite pause remuneree exclue",
    aliases: ["petite pause remuneree exclue", "pause remuneree exclue", "pause"],
    category: "ineligible",
    description: "Pause courte non eligible."
  },
  {
    label: "Conge paye",
    aliases: ["conge paye", "cp", "vacation", "holiday"],
    category: "ineligible",
    description: "Absence non eligible."
  },
  {
    label: "Libre",
    aliases: ["libre", "off", "repos"],
    category: "ineligible",
    description: "Journee libre."
  },
  {
    label: "Alternance Ecole/WH",
    aliases: ["alternance ecole/wh", "alternance ecole wh", "alternance"],
    category: "conditional",
    configurable: true,
    description: "Eligible uniquement si l'option est activee."
  }
];

export const DEFAULT_SETTINGS: RotationSettings = {
  startTime: "09:00",
  endTime: "18:00",
  slotMinutes: 60,
  avoidConsecutive: true,
  fairnessMode: "strict",
  allowAlternance: false,
  eligibleActivities: DEFAULT_ACTIVITY_RULES.filter((rule) => rule.category === "eligible").map(
    (rule) => normalizeActivityLabel(rule.label)
  ),
  ineligibleActivities: DEFAULT_ACTIVITY_RULES.filter((rule) => rule.category === "ineligible").map(
    (rule) => normalizeActivityLabel(rule.label)
  )
};

