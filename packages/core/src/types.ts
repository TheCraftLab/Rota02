export interface ParsedInterval {
  start: string;
  end: string;
  activity: string;
  normalizedActivity: string;
  sourceLine: string;
}

export interface ParsedDay {
  date: string;
  intervals: ParsedInterval[];
  issues: string[];
}

export interface AgentSchedule {
  agentId: string | null;
  displayName: string;
  normalizedName: string;
  days: Record<string, ParsedDay>;
  preferences?: AgentPreferences;
}

export interface AgentPreferences {
  blockedDates?: string[];
  blockedWeekdays?: number[];
  preferFewerSlots?: boolean;
}

export interface ParseWarning {
  scope: "global" | "agent" | "day";
  message: string;
  agentName?: string;
  date?: string;
}

export interface ParsedSchedule {
  agents: AgentSchedule[];
  dates: string[];
  warnings: ParseWarning[];
  sourceMeta: {
    filename: string;
    mimeType: string;
    parsedAt: string;
  };
}

export interface RotationSettings {
  startTime: string;
  endTime: string;
  slotMinutes: 30 | 60;
  avoidConsecutive: boolean;
  fairnessMode: "strict" | "soft";
}

export interface CandidateReason {
  agentId: string | null;
  agentName: string;
  eligible: boolean;
  totalAssignedBefore: number;
  dayAssignedBefore: number;
  previousSlotAssigned: boolean;
  decisionRank: number[];
  notes: string[];
}

export interface RotationCellRestoreState {
  assignedAgentId: string | null;
  assignedAgentName: string;
  status: "assigned" | "uncovered" | "manual";
  reasons: string[];
  forcedManualOverride: boolean;
  originalAgentId: string | null;
  originalAgentName: string;
}

export interface RotationCell {
  date: string;
  slotStart: string;
  slotEnd: string;
  assignedAgentId: string | null;
  assignedAgentName: string;
  status: "assigned" | "uncovered" | "manual" | "disabled" | "holiday";
  reasons: string[];
  candidates: CandidateReason[];
  manualOverride?: {
    forced: boolean;
    originalAgentId: string | null;
    originalAgentName: string;
    restoreState?: RotationCellRestoreState;
  };
  holidayOverride?: {
    holidayName: string;
    cancelled: boolean;
    restoreState: RotationCellRestoreState;
  };
}

export interface AgentSummary {
  agentId: string | null;
  agentName: string;
  totalSlots: number;
  slotsByDate: Record<string, number>;
  overload: boolean;
}

export interface RotationSummary {
  agentSummaries: AgentSummary[];
  uncoveredSlots: number;
  totalSlots: number;
  fairnessScore: number;
  alerts: string[];
}

export interface RotationResult {
  dates: string[];
  slots: string[];
  cells: RotationCell[];
  summary: RotationSummary;
  settings: RotationSettings;
  detectedActivities: string[];
}
