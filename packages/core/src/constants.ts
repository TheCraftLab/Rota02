import type { RotationSettings } from "./types";

export const DEFAULT_SETTINGS: RotationSettings = {
  startTime: "08:30",
  endTime: "18:00",
  slotMinutes: 60,
  avoidConsecutive: true,
  fairnessMode: "strict"
};
