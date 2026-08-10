import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import {
  type AgentPreferences,
  compareIsoDate,
  getFrenchPublicHolidayLabel,
  formatDisplayDate,
  DEFAULT_SETTINGS,
  normalizeName,
  parseTimeToMinutes,
  removeAgentForDate,
  summarizeRotation,
  toClipboardTable,
  type AgentSchedule,
  type ParseWarning,
  type ParsedSchedule,
  type RotationCell,
  type RotationCellRestoreState,
  type RotationResult,
  type RotationSettings
} from "@rota/core";
import { AdminLogin } from "./components/AdminLogin";
import { InspectorDrawer } from "./components/InspectorDrawer";
import { RotationTable } from "./components/RotationTable";
import { SettingsPanel } from "./components/SettingsPanel";
import { SummaryPanel } from "./components/SummaryPanel";
import { UploadCard } from "./components/UploadCard";
import { StatusBadge } from "./components/StatusBadge";
import {
  deleteManagedAgent,
  downloadExport,
  fetchAdminSession,
  fetchManagedAgents,
  fetchPublishedRotation,
  generateRotationRequest,
  loginAdmin,
  logoutAdmin,
  parseFile,
  publishRotation,
  updateAgentPreferences,
  type ManagedAgent,
  type PublishedRotationResponse
} from "./lib/api";
import { saveBlob } from "./lib/download";

function cellKey(cell: RotationCell): string {
  return `${cell.date}-${cell.slotStart}`;
}

function resolveAgentKey(agentId: string | null, agentName: string): string {
  return agentId ?? normalizeName(agentName);
}

function buildAgentListFromRotation(rotation: RotationResult | null): AgentSchedule[] {
  if (!rotation) {
    return [];
  }

  const byKey = new Map<string, AgentSchedule>();
  for (const cell of rotation.cells) {
    for (const candidate of cell.candidates) {
      const key = resolveAgentKey(candidate.agentId, candidate.agentName);
      if (byKey.has(key)) {
        continue;
      }

      byKey.set(key, {
        agentId: candidate.agentId,
        displayName: candidate.agentName,
        normalizedName: normalizeName(candidate.agentName),
        days: {}
      });
    }
  }

  return [...byKey.values()].sort((left, right) => left.displayName.localeCompare(right.displayName, "fr"));
}

interface DateAgentOption {
  key: string;
  displayName: string;
  slots: number;
}

function collectAssignedAgentsForDate(rotation: RotationResult, date: string): DateAgentOption[] {
  const byKey = new Map<string, DateAgentOption>();

  for (const cell of rotation.cells) {
    if (cell.date !== date) {
      continue;
    }
    if (cell.status === "disabled" || cell.status === "holiday" || cell.assignedAgentName === "Non couvert") {
      continue;
    }

    const key = resolveAgentKey(cell.assignedAgentId, cell.assignedAgentName);
    const current = byKey.get(key);
    if (current) {
      current.slots += 1;
      continue;
    }

    byKey.set(key, {
      key,
      displayName: cell.assignedAgentName,
      slots: 1
    });
  }

  return [...byKey.values()].sort((left, right) => left.displayName.localeCompare(right.displayName, "fr"));
}

function getPathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname || "/";
}

function navigateTo(pathname: string, onChange: (pathname: string) => void): void {
  if (typeof window === "undefined") {
    return;
  }

  window.history.pushState({}, "", pathname);
  onChange(pathname);
}

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getTodayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cloneWarnings(warnings: ParseWarning[]): ParseWarning[] {
  return warnings.map((warning) => ({ ...warning }));
}

function cloneAgent(agent: AgentSchedule): AgentSchedule {
  return {
    ...agent,
    days: Object.fromEntries(
      Object.entries(agent.days).map(([date, day]) => [
        date,
        {
          ...day,
          intervals: day.intervals.map((interval) => ({ ...interval })),
          issues: [...day.issues]
        }
      ])
    )
  };
}

function pruneParsedSchedulePastDates(parsed: ParsedSchedule, referenceDate: string): ParsedSchedule {
  const filteredAgents = parsed.agents
    .map((agent) => {
      const days = Object.fromEntries(
        Object.entries(agent.days)
          .filter(([date]) => date >= referenceDate)
          .map(([date, day]) => [
            date,
            {
              ...day,
              intervals: day.intervals.map((interval) => ({ ...interval })),
              issues: [...day.issues]
            }
          ])
      );

      return {
        ...agent,
        days
      };
    })
    .filter((agent) => Object.keys(agent.days).length > 0);

  const dateSet = new Set(parsed.dates.filter((date) => date >= referenceDate));
  for (const agent of filteredAgents) {
    for (const date of Object.keys(agent.days)) {
      dateSet.add(date);
    }
  }

  return {
    ...parsed,
    agents: filteredAgents,
    dates: [...dateSet].sort(compareIsoDate),
    warnings: cloneWarnings(parsed.warnings)
  };
}

function mergeWarnings(left: ParseWarning[], right: ParseWarning[]): ParseWarning[] {
  const seen = new Set<string>();
  const merged: ParseWarning[] = [];

  for (const warning of [...left, ...right]) {
    const key = `${warning.scope}|${warning.agentName ?? ""}|${warning.date ?? ""}|${warning.message}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push({ ...warning });
  }

  return merged;
}

function mergeParsedSchedules(
  existing: ParsedSchedule | null,
  incoming: ParsedSchedule,
  referenceDate: string
): ParsedSchedule {
  const nextIncoming = pruneParsedSchedulePastDates(incoming, referenceDate);
  if (!existing) {
    return nextIncoming;
  }

  const nextExisting = pruneParsedSchedulePastDates(existing, referenceDate);
  const byKey = new Map<string, AgentSchedule>();

  for (const agent of nextExisting.agents) {
    const key = resolveAgentKey(agent.agentId, agent.displayName);
    byKey.set(key, cloneAgent(agent));
  }

  for (const agent of nextIncoming.agents) {
    const key = resolveAgentKey(agent.agentId, agent.displayName);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, cloneAgent(agent));
      continue;
    }

    const mergedDays = { ...current.days };
    for (const [date, day] of Object.entries(agent.days)) {
      mergedDays[date] = {
        ...day,
        intervals: day.intervals.map((interval) => ({ ...interval })),
        issues: [...day.issues]
      };
    }

    byKey.set(key, {
      ...current,
      agentId: agent.agentId ?? current.agentId,
      displayName: agent.displayName || current.displayName,
      normalizedName: agent.normalizedName || current.normalizedName,
      days: mergedDays
    });
  }

  const mergedAgents = [...byKey.values()]
    .filter((agent) => Object.keys(agent.days).length > 0)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "fr"));
  const dateSet = new Set<string>();
  for (const date of [...nextExisting.dates, ...nextIncoming.dates]) {
    if (date >= referenceDate) {
      dateSet.add(date);
    }
  }
  for (const agent of mergedAgents) {
    for (const date of Object.keys(agent.days)) {
      if (date >= referenceDate) {
        dateSet.add(date);
      }
    }
  }

  return {
    ...nextIncoming,
    agents: mergedAgents,
    dates: [...dateSet].sort(compareIsoDate),
    warnings: mergeWarnings(nextExisting.warnings, nextIncoming.warnings)
  };
}

function pruneRotationPastDates(rotation: RotationResult, referenceDate: string): RotationResult {
  const nextDates = rotation.dates.filter((date) => date >= referenceDate).sort(compareIsoDate);
  const allowedDates = new Set(nextDates);
  const nextCells = rotation.cells.filter((cell) => allowedDates.has(cell.date));

  if (nextDates.length === rotation.dates.length && nextCells.length === rotation.cells.length) {
    return rotation;
  }

  const nextRotation: RotationResult = {
    ...rotation,
    dates: nextDates,
    cells: nextCells
  };

  return {
    ...nextRotation,
    summary: summarizeRotation(nextCells, buildAgentListFromRotation(nextRotation))
  };
}

function mergeRotations(
  existing: RotationResult | null,
  incoming: RotationResult,
  referenceDate: string
): RotationResult {
  const nextIncoming = pruneRotationPastDates(incoming, referenceDate);
  if (!existing) {
    return nextIncoming;
  }

  const nextExisting = pruneRotationPastDates(existing, referenceDate);
  const dates = [...new Set([...nextExisting.dates, ...nextIncoming.dates])].sort(compareIsoDate);
  const slots = [...new Set([...nextExisting.slots, ...nextIncoming.slots])].sort(
    (left, right) => parseTimeToMinutes(left) - parseTimeToMinutes(right)
  );
  const allowedDates = new Set(dates);
  const allowedSlots = new Set(slots);
  const byKey = new Map<string, RotationCell>();

  for (const cell of nextExisting.cells) {
    byKey.set(cellKey(cell), cell);
  }
  for (const cell of nextIncoming.cells) {
    byKey.set(cellKey(cell), cell);
  }

  const cells = [...byKey.values()]
    .filter((cell) => allowedDates.has(cell.date) && allowedSlots.has(cell.slotStart))
    .sort((left, right) => {
      const byDate = compareIsoDate(left.date, right.date);
      if (byDate !== 0) {
        return byDate;
      }
      return parseTimeToMinutes(left.slotStart) - parseTimeToMinutes(right.slotStart);
    });
  const merged: RotationResult = {
    ...nextIncoming,
    dates,
    slots,
    cells,
    detectedActivities: [...new Set([...nextExisting.detectedActivities, ...nextIncoming.detectedActivities])]
  };

  return {
    ...merged,
    summary: summarizeRotation(cells, buildAgentListFromRotation(merged))
  };
}

const DISABLED_SLOT_NAME = "Creneau libere";
const WEEKDAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 7, label: "Dim" }
];

function buildRestoreState(cell: RotationCell): RotationCellRestoreState {
  return {
    assignedAgentId: cell.assignedAgentId,
    assignedAgentName: cell.assignedAgentName,
    status: cell.status === "manual" || cell.status === "uncovered" ? cell.status : "assigned",
    reasons: [...cell.reasons],
    forcedManualOverride: cell.manualOverride?.forced ?? false,
    originalAgentId: cell.manualOverride?.originalAgentId ?? cell.assignedAgentId,
    originalAgentName: cell.manualOverride?.originalAgentName ?? cell.assignedAgentName
  };
}

function restoreDisabledCell(cell: RotationCell): RotationCell {
  const restoreState = cell.manualOverride?.restoreState;
  const { manualOverride: _manualOverride, ...baseCell } = cell;
  if (!restoreState) {
    return {
      ...baseCell,
      assignedAgentId: null,
      assignedAgentName: "Non couvert",
      status: "uncovered",
      reasons: ["Aucun agent ne couvre integralement ce creneau."]
    };
  }

  if (restoreState.status === "manual") {
    return {
      ...baseCell,
      assignedAgentId: restoreState.assignedAgentId,
      assignedAgentName: restoreState.assignedAgentName,
      status: restoreState.status,
      reasons: [...restoreState.reasons],
      manualOverride: {
        forced: restoreState.forcedManualOverride,
        originalAgentId: restoreState.originalAgentId,
        originalAgentName: restoreState.originalAgentName
      }
    };
  }

  return {
    ...baseCell,
    assignedAgentId: restoreState.assignedAgentId,
    assignedAgentName: restoreState.assignedAgentName,
    status: restoreState.status,
    reasons: [...restoreState.reasons]
  };
}

function buildManualOverride(cell: RotationCell, forced: boolean): NonNullable<RotationCell["manualOverride"]> {
  const { restoreState, ...currentOverride } = cell.manualOverride ?? {
    forced,
    originalAgentId: cell.assignedAgentId,
    originalAgentName: cell.assignedAgentName
  };

  return {
    ...currentOverride,
    forced
  };
}

function applyHolidayToCell(cell: RotationCell, holidayName: string): RotationCell {
  return {
    ...cell,
    assignedAgentId: null,
    assignedAgentName: "Ferie",
    status: "holiday",
    reasons: [`Jour ferie en France: ${holidayName}.`],
    holidayOverride: {
      holidayName,
      cancelled: false,
      restoreState: buildRestoreState(cell)
    }
  };
}

function restoreHolidayCell(cell: RotationCell): RotationCell {
  const holidayOverride = cell.holidayOverride;
  if (!holidayOverride) {
    return cell;
  }

  const { holidayOverride: _holidayOverride, manualOverride: _manualOverride, ...baseCell } = cell;
  const restored =
    holidayOverride.restoreState.status === "manual"
      ? {
          ...baseCell,
          assignedAgentId: holidayOverride.restoreState.assignedAgentId,
          assignedAgentName: holidayOverride.restoreState.assignedAgentName,
          status: holidayOverride.restoreState.status,
          reasons: [...holidayOverride.restoreState.reasons],
          manualOverride: {
            forced: holidayOverride.restoreState.forcedManualOverride,
            originalAgentId: holidayOverride.restoreState.originalAgentId,
            originalAgentName: holidayOverride.restoreState.originalAgentName
          }
        }
      : {
          ...baseCell,
          assignedAgentId: holidayOverride.restoreState.assignedAgentId,
          assignedAgentName: holidayOverride.restoreState.assignedAgentName,
          status: holidayOverride.restoreState.status,
          reasons: [...holidayOverride.restoreState.reasons]
        };

  return {
    ...restored,
    holidayOverride: {
      ...holidayOverride,
      cancelled: true
    }
  };
}

function formatBlockedDates(value: string[] | undefined): string {
  return (value ?? []).join(", ");
}

function parseBlockedDatesInput(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)))].sort(
    (left, right) => left.localeCompare(right)
  );
}

interface RouteLinkProps {
  active: boolean;
  children: string;
  href: string;
  onNavigate: (href: string) => void;
}

function RouteLink({ active, children, href, onNavigate }: RouteLinkProps) {
  return (
    <button
      type="button"
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-ink text-white"
          : "border border-gray-200 bg-white text-slate hover:bg-gray-50"
      }`}
      onClick={() => onNavigate(href)}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [pathname, setPathname] = useState<string>(getPathname);
  const [todayIsoDate, setTodayIsoDate] = useState<string>(() => getTodayIsoDate());
  const [parsedSchedule, setParsedSchedule] = useState<ParsedSchedule | null>(null);
  const [settings, setSettings] = useState<RotationSettings>(DEFAULT_SETTINGS);
  const [rotation, setRotation] = useState<RotationResult | null>(null);
  const [published, setPublished] = useState<PublishedRotationResponse | null>(null);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminChecking, setAdminChecking] = useState(true);
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [removedAgentDate, setRemovedAgentDate] = useState<string>("");
  const [removedAgentKey, setRemovedAgentKey] = useState<string>("");
  const [parseLoading, setParseLoading] = useState(false);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publishLoading, setPublishLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<"csv" | "xlsx" | "pdf" | "copy" | null>(null);
  const [managedAgents, setManagedAgents] = useState<ManagedAgent[]>([]);
  const [managedAgentsLoading, setManagedAgentsLoading] = useState(false);
  const [agentActionLoadingId, setAgentActionLoadingId] = useState<string | null>(null);
  const [blockedDatesInput, setBlockedDatesInput] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredRotation = useDeferredValue(rotation);
  const selectedCell =
    deferredRotation?.cells.find((cell) => cellKey(cell) === selectedCellKey) ?? null;
  const isAdminRoute = pathname.startsWith("/admin");
  const currentAgents = parsedSchedule?.agents ?? buildAgentListFromRotation(rotation);
  const removableAgents = useMemo(() => {
    if (!deferredRotation || !removedAgentDate) {
      return [];
    }

    return collectAssignedAgentsForDate(deferredRotation, removedAgentDate);
  }, [deferredRotation, removedAgentDate]);

  async function refreshManagedAgents() {
    if (!isAdminRoute || !adminAuthenticated) {
      setManagedAgents([]);
      return;
    }

    setManagedAgentsLoading(true);
    try {
      const agents = await fetchManagedAgents();
      setManagedAgents(agents);
      setBlockedDatesInput(
        Object.fromEntries(agents.map((agent) => [agent.id, formatBlockedDates(agent.preferences.blockedDates)]))
      );
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de chargement des agents."));
    } finally {
      setManagedAgentsLoading(false);
    }
  }

  useEffect(() => {
    const handlePopState = () => setPathname(getPathname());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTodayIsoDate((current) => {
        const next = getTodayIsoDate();
        return next === current ? current : next;
      });
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    startTransition(() => {
      setParsedSchedule((current) => (current ? pruneParsedSchedulePastDates(current, todayIsoDate) : current));
      setRotation((current) => (current ? pruneRotationPastDates(current, todayIsoDate) : current));
      setPublished((current) =>
        current
          ? {
              ...current,
              rotation: pruneRotationPastDates(current.rotation, todayIsoDate)
            }
          : current
      );
    });
  }, [todayIsoDate]);

  useEffect(() => {
    let cancelled = false;

    async function loadPublished() {
      setPublicLoading(true);
      try {
        const nextPublished = await fetchPublishedRotation();
        if (!cancelled) {
          setPublished(
            nextPublished
              ? {
                  ...nextPublished,
                  rotation: pruneRotationPastDates(nextPublished.rotation, todayIsoDate)
                }
              : null
          );
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Erreur de chargement public.");
        }
      } finally {
        if (!cancelled) {
          setPublicLoading(false);
        }
      }
    }

    void loadPublished();

    return () => {
      cancelled = true;
    };
  }, [todayIsoDate]);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminSession() {
      if (!isAdminRoute) {
        setAdminChecking(false);
        return;
      }

      setAdminChecking(true);
      try {
        const session = await fetchAdminSession();
        if (!cancelled) {
          setAdminAuthenticated(session.authenticated);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Erreur de session admin.");
          setAdminAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setAdminChecking(false);
        }
      }
    }

    void loadAdminSession();

    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);

  useEffect(() => {
    void refreshManagedAgents();
  }, [isAdminRoute, adminAuthenticated]);

  useEffect(() => {
    if (!isAdminRoute || !adminAuthenticated || parsedSchedule || rotation || !published?.rotation) {
      return;
    }

    startTransition(() => {
      setRotation(published.rotation);
      setSettings(published.rotation.settings);
      setSelectedCellKey(published.rotation.cells[0] ? cellKey(published.rotation.cells[0]) : null);
    });
  }, [adminAuthenticated, isAdminRoute, parsedSchedule, published, rotation]);

  useEffect(() => {
    if (!deferredRotation) {
      setRemovedAgentDate("");
      return;
    }

    const firstDate = deferredRotation.dates[0] ?? "";
    setRemovedAgentDate((current) => (deferredRotation.dates.includes(current) ? current : firstDate));
  }, [deferredRotation]);

  useEffect(() => {
    setRemovedAgentKey((current) => (removableAgents.some((option) => option.key === current) ? current : removableAgents[0]?.key ?? ""));
  }, [removableAgents]);

  function handleAuthError(caughtError: unknown, fallback: string): string {
    if (caughtError instanceof Error && caughtError.name === "AuthError") {
      setAdminAuthenticated(false);
      return "Authentification admin requise.";
    }

    return caughtError instanceof Error ? caughtError.message : fallback;
  }

  async function handleFileSelected(file: File) {
    setParseLoading(true);
    setError(null);

    try {
      const response = await parseFile(file);
      startTransition(() => {
        setParsedSchedule((current) => mergeParsedSchedules(current, response.parsedSchedule, todayIsoDate));
        setSettings(response.settings);
      });
      await refreshManagedAgents();
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur d'import."));
    } finally {
      setParseLoading(false);
    }
  }

  function updateSettings(patch: Partial<RotationSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  async function handleGenerate() {
    if (!parsedSchedule) {
      return;
    }

    const scheduleToGenerate = pruneParsedSchedulePastDates(parsedSchedule, todayIsoDate);
    if (!scheduleToGenerate.dates.length) {
      setError("Aucune date du jour ou future detectee dans les imports.");
      return;
    }

    setGenerationLoading(true);
    setError(null);

    try {
      const generatedRotation = await generateRotationRequest(scheduleToGenerate, settings);
      const nextRotation = mergeRotations(rotation, generatedRotation, todayIsoDate);
      startTransition(() => {
        setParsedSchedule(scheduleToGenerate);
        setRotation(nextRotation);
        setSelectedCellKey((current) =>
          current && nextRotation.cells.some((cell) => cellKey(cell) === current)
            ? current
            : nextRotation.cells[0]
              ? cellKey(nextRotation.cells[0])
              : null
        );
      });
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de generation."));
    } finally {
      setGenerationLoading(false);
    }
  }

  async function handlePublish() {
    if (!rotation) {
      return;
    }

    const rotationToPublish = pruneRotationPastDates(rotation, todayIsoDate);
    if (!rotationToPublish.dates.length) {
      setError("Aucune colonne a publier: les dates sont toutes passees.");
      return;
    }

    setPublishLoading(true);
    setError(null);
    try {
      const nextPublished = await publishRotation(rotationToPublish);
      setRotation(rotationToPublish);
      setPublished({
        ...nextPublished,
        rotation: pruneRotationPastDates(nextPublished.rotation, todayIsoDate)
      });
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de publication."));
    } finally {
      setPublishLoading(false);
    }
  }

  async function handleExport(kind: "csv" | "xlsx" | "pdf") {
    if (!rotation) {
      return;
    }

    setExportLoading(kind);
    setError(null);
    try {
      const blob = await downloadExport(rotation, kind);
      saveBlob(blob, `rotation-chat.${kind}`);
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur d'export."));
    } finally {
      setExportLoading(null);
    }
  }

  async function handleCopy() {
    if (!rotation) {
      return;
    }

    setExportLoading("copy");
    setError(null);
    try {
      await navigator.clipboard.writeText(toClipboardTable(rotation));
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Impossible de copier le tableau."));
    } finally {
      setExportLoading(null);
    }
  }

  async function handleAdminLogin(password: string) {
    setAdminLoginLoading(true);
    setError(null);

    try {
      const session = await loginAdmin(password);
      setAdminAuthenticated(session.authenticated);
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de connexion admin."));
    } finally {
      setAdminLoginLoading(false);
    }
  }

  async function handleAdminLogout() {
    setError(null);
    try {
      await logoutAdmin();
      setAdminAuthenticated(false);
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de deconnexion admin."));
    }
  }

  async function handleAgentPreferenceUpdate(agent: ManagedAgent, patch: Partial<AgentPreferences>) {
    setAgentActionLoadingId(agent.id);
    setError(null);

    try {
      const updatedAgent = await updateAgentPreferences(agent.id, patch);
      setManagedAgents((current) => current.map((item) => (item.id === updatedAgent.id ? updatedAgent : item)));
      setBlockedDatesInput((current) => ({
        ...current,
        [updatedAgent.id]: formatBlockedDates(updatedAgent.preferences.blockedDates)
      }));
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de mise a jour des preferences agent."));
    } finally {
      setAgentActionLoadingId(null);
    }
  }

  async function handleDeleteAgent(agent: ManagedAgent) {
    const confirmed = window.confirm(`Supprimer ${agent.displayName} de la base agents ?`);
    if (!confirmed) {
      return;
    }

    setAgentActionLoadingId(agent.id);
    setError(null);

    try {
      await deleteManagedAgent(agent.id);
      setManagedAgents((current) => current.filter((item) => item.id !== agent.id));
      setBlockedDatesInput((current) => {
        const next = { ...current };
        delete next[agent.id];
        return next;
      });
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de suppression agent."));
    } finally {
      setAgentActionLoadingId(null);
    }
  }

  function handleToggleDisabled(cell: RotationCell) {
    if (!rotation) {
      return;
    }

    startTransition(() => {
      const nextCells = rotation.cells.map((currentCell) => {
        if (cellKey(currentCell) !== cellKey(cell)) {
          return currentCell;
        }

        if (currentCell.status === "disabled") {
          return restoreDisabledCell(currentCell);
        }

        return {
          ...currentCell,
          assignedAgentId: null,
          assignedAgentName: DISABLED_SLOT_NAME,
          status: "disabled" as const,
          reasons: ["Creneau libere manuellement depuis l'administration."],
          manualOverride: {
            forced: currentCell.manualOverride?.forced ?? false,
            originalAgentId: currentCell.manualOverride?.originalAgentId ?? currentCell.assignedAgentId,
            originalAgentName: currentCell.manualOverride?.originalAgentName ?? currentCell.assignedAgentName,
            restoreState: buildRestoreState(currentCell)
          }
        };
      });

      const nextSelectedKey = cell.status === "disabled" ? cellKey(cell) : null;
      setSelectedCellKey(nextSelectedKey);
      setRotation({
        ...rotation,
        cells: nextCells,
        summary: summarizeRotation(nextCells, currentAgents)
      });
    });
  }

  function handleToggleHoliday(cell: RotationCell) {
    if (!rotation) {
      return;
    }

    const holidayName = cell.holidayOverride?.holidayName ?? getFrenchPublicHolidayLabel(cell.date);
    if (!holidayName) {
      return;
    }

    startTransition(() => {
      const holidayActive = rotation.cells.some((currentCell) => currentCell.date === cell.date && currentCell.status === "holiday");
      const nextCells = rotation.cells.map((currentCell) => {
        if (currentCell.date !== cell.date) {
          return currentCell;
        }

        if (holidayActive) {
          return restoreHolidayCell(currentCell);
        }

        return applyHolidayToCell(currentCell, holidayName);
      });

      setRotation({
        ...rotation,
        cells: nextCells,
        summary: summarizeRotation(nextCells, currentAgents)
      });
    });
  }

  function handleManualAssign(cell: RotationCell, agentKey: string | null) {
    if (!rotation) {
      return;
    }

    startTransition(() => {
      const nextCells = rotation.cells.map((currentCell) => {
        if (cellKey(currentCell) !== cellKey(cell)) {
          return currentCell;
        }

        if (!agentKey) {
          return {
            ...currentCell,
            assignedAgentId: null,
            assignedAgentName: "Non couvert",
            status: "manual" as const,
            reasons: ["Affectation manuelle: creneau laisse non couvert."],
            manualOverride: buildManualOverride(currentCell, false)
          };
        }

        const agent = (parsedSchedule?.agents ?? currentAgents).find(
          (item) => resolveAgentKey(item.agentId, item.displayName) === agentKey
        );
        const candidate = currentCell.candidates.find(
          (item) => resolveAgentKey(item.agentId, item.agentName) === agentKey
        );
        const forced = candidate ? !candidate.eligible : true;

        return {
          ...currentCell,
          assignedAgentId: agent?.agentId ?? candidate?.agentId ?? null,
          assignedAgentName: agent?.displayName ?? candidate?.agentName ?? "Non couvert",
          status: "manual" as const,
          reasons: [
            forced
              ? "Affectation manuelle forcee sur un agent non eligible selon les regles actuelles."
              : "Affectation manuelle realisee sur un agent eligible."
          ],
          manualOverride: buildManualOverride(currentCell, forced)
        };
      });

      setRotation({
        ...rotation,
        cells: nextCells,
        summary: summarizeRotation(nextCells, currentAgents)
      });
    });
  }

  function handleRemoveAgentFromDate() {
    if (!rotation || !removedAgentDate || !removedAgentKey) {
      return;
    }

    startTransition(() => {
      const nextRotation = removeAgentForDate(rotation, currentAgents, removedAgentDate, removedAgentKey);
      setRotation(nextRotation);
      setSelectedCellKey((current) => {
        if (!current) {
          return current;
        }

        const selectedCell = nextRotation.cells.find((cell) => cellKey(cell) === current);
        if (!selectedCell) {
          return null;
        }

        return selectedCell.assignedAgentId || selectedCell.assignedAgentName !== "Non couvert" ? current : null;
      });
    });
  }

  if (!isAdminRoute) {
    return (
      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6">
          <div className="panel-surface rounded-4xl border border-gray-100 px-6 py-5 shadow-panel">
            <p className="text-xs font-medium uppercase tracking-widest text-slate/50">
              Atelier11.app
            </p>
        
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Planning Chat
            </h1>
        
            <p className="mt-2 text-sm font-medium text-slate">
              Nous sommes le{" "}
              {new Intl.DateTimeFormat("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
              }).format(new Date())}
            </p>
          </div>
        </header>

        {error ? (
          <div className="mb-5 rounded-xl border border-coral/20 bg-coral/8 px-4 py-3 text-sm text-coral">
            {error}
          </div>
        ) : null}

        {publicLoading ? (
          <section className="panel-surface rounded-4xl border border-gray-100 p-10 text-center shadow-panel">
            <p className="text-base font-medium text-ink">Chargement de la rotation publiee...</p>
          </section>
        ) : published?.rotation &&
    published.rotation.dates.length > 0 &&
    published.rotation.cells.length > 0 ? (
  <div className="grid gap-5">
    <RotationTable
      rotation={published.rotation}
      selectedCellKey={null}
      interactive={false}
      title="Rotation chat"
      description={'Publication du ${formatPublishedAt(published.publishedAt)}'}
      density="kiosk"
    />
  </div>
) : (
  <section className="panel-surface rounded-4xl border border-gray-100 p-10 text-center shadow-panel">
    <p className="text-base font-medium text-ink">
      Aucun planning actif pour le moment.
    </p>
    <p className="mt-2 text-sm text-slate">
      La rotation publiee est vide ou ne contient plus de dates futures.
      Passez par l'administration pour importer un fichier NICE WFM,
      generer une nouvelle rotation puis la publier.
    </p>
  </section>
)}

        <footer className="mt-8 border-t border-gray-100 px-2 pt-5 text-sm text-slate/60">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Atelier11.app</p>
            {published?.publishedAt ? (
              <p>Derniere mise a jour : {formatPublishedAt(published.publishedAt)}</p>
            ) : null}
            <button
              type="button"
              className="text-left text-sm font-medium text-slate underline underline-offset-4 hover:text-ink sm:text-right"
              onClick={() => navigateTo("/admin", setPathname)}
            >
              Acces administration
            </button>
          </div>
        </footer>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate/50">Atelier11.app — Administration</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Rotation de chat
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Import NICE WFM, generation, retouches et publication vers l'index public.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RouteLink active={pathname === "/admin"} href="/admin" onNavigate={(href) => navigateTo(href, setPathname)}>
            Admin
          </RouteLink>
          <RouteLink active={false} href="/" onNavigate={(href) => navigateTo(href, setPathname)}>
            Index public
          </RouteLink>
          {published?.publishedAt ? (
            <StatusBadge tone="success">Publie {formatPublishedAt(published.publishedAt)}</StatusBadge>
          ) : null}
          <StatusBadge tone={isPending ? "warning" : "neutral"}>{isPending ? "Mise a jour..." : "Pret"}</StatusBadge>
          {adminAuthenticated ? (
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate hover:bg-gray-50"
              onClick={() => void handleAdminLogout()}
            >
              Se deconnecter
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="mb-5 rounded-xl border border-coral/20 bg-coral/8 px-4 py-3 text-sm text-coral">
          {error}
        </div>
      ) : null}

      {adminChecking ? (
        <section className="panel-surface rounded-4xl border border-gray-100 p-10 text-center shadow-panel">
          <p className="text-base font-medium text-ink">Verification de la session admin...</p>
        </section>
      ) : !adminAuthenticated ? (
        <AdminLogin loading={adminLoginLoading} onLogin={handleAdminLogin} />
      ) : (
        <div className="grid gap-5">
          <section className="panel-surface rounded-4xl border border-gray-100 p-5 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-slate/50">Base agents</p>
                <p className="mt-1 text-sm text-slate">
                  Les agents detectes a l'import sont ajoutes automatiquement ici. Vous pouvez gerer leurs preferences et les supprimer.
                </p>
              </div>
              <StatusBadge tone="neutral">{managedAgents.length} agent(s)</StatusBadge>
            </div>

            {managedAgentsLoading ? (
              <p className="mt-4 text-sm text-slate">Chargement des agents...</p>
            ) : managedAgents.length ? (
              <div className="mt-4 grid gap-3">
                {managedAgents.map((agent) => {
                  const loading = agentActionLoadingId === agent.id;
                  const currentWeekdays = new Set(agent.preferences.blockedWeekdays ?? []);
                  const blockedDatesValue = blockedDatesInput[agent.id] ?? formatBlockedDates(agent.preferences.blockedDates);

                  return (
                    <article key={agent.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{agent.displayName}</p>
                          <p className="text-xs text-slate/70">{agent.agentId ? `ID NICE: ${agent.agentId}` : `Cle: ${agent.id}`}</p>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg border border-coral/30 bg-coral/8 px-3 py-1.5 text-xs font-medium text-coral transition hover:bg-coral/15 disabled:opacity-60"
                          onClick={() => void handleDeleteAgent(agent)}
                          disabled={loading}
                        >
                          Supprimer
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            agent.preferences.preferFewerSlots
                              ? "border-amber/40 bg-amber/20 text-amber"
                              : "border-gray-200 bg-white text-slate hover:bg-gray-50"
                          } disabled:opacity-60`}
                          onClick={() =>
                            void handleAgentPreferenceUpdate(agent, {
                              preferFewerSlots: !agent.preferences.preferFewerSlots
                            })
                          }
                          disabled={loading}
                        >
                          {agent.preferences.preferFewerSlots ? "Preference: moins de creneaux (active)" : "Preference: moins de creneaux"}
                        </button>
                      </div>

                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate/70">Jours a ne pas planifier</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {WEEKDAY_OPTIONS.map((option) => {
                            const selected = currentWeekdays.has(option.value);
                            const nextWeekdays = selected
                              ? (agent.preferences.blockedWeekdays ?? []).filter((value) => value !== option.value)
                              : [...(agent.preferences.blockedWeekdays ?? []), option.value];

                            return (
                              <button
                                key={`${agent.id}-${option.value}`}
                                type="button"
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                                  selected
                                    ? "border-ink bg-ink text-white"
                                    : "border-gray-200 bg-white text-slate hover:bg-gray-50"
                                } disabled:opacity-60`}
                                onClick={() =>
                                  void handleAgentPreferenceUpdate(agent, {
                                    blockedWeekdays: nextWeekdays
                                  })
                                }
                                disabled={loading}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate/70">Dates bloquees (format AAAA-MM-JJ, separees par virgule)</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input
                            type="text"
                            value={blockedDatesValue}
                            onChange={(event) =>
                              setBlockedDatesInput((current) => ({
                                ...current,
                                [agent.id]: event.target.value
                              }))
                            }
                            placeholder="2026-05-01, 2026-05-08"
                            className="min-w-[280px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-ink outline-none ring-amber/30 transition focus:border-amber/60 focus:ring-4"
                            disabled={loading}
                          />
                          <button
                            type="button"
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-slate transition hover:bg-gray-50 disabled:opacity-60"
                            onClick={() =>
                              void handleAgentPreferenceUpdate(agent, {
                                blockedDates: parseBlockedDatesInput(blockedDatesValue)
                              })
                            }
                            disabled={loading}
                          >
                            Enregistrer dates
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate">Aucun agent en base pour le moment. Importez un fichier pour les detecter.</p>
            )}
          </section>

          <UploadCard parsedSchedule={parsedSchedule} loading={parseLoading} onFileSelected={handleFileSelected} />
          <SettingsPanel
            settings={settings}
            disabled={!parsedSchedule}
            loading={generationLoading}
            onGenerate={handleGenerate}
            onSettingsChange={updateSettings}
          />

          {parsedSchedule?.warnings.length ? (
            <section className="panel-surface rounded-4xl border border-gray-100 p-5 shadow-panel">
              <p className="text-xs font-medium uppercase tracking-widest text-slate/50">Qualite d'import</p>
              <div className="mt-3 grid gap-2">
                {parsedSchedule.warnings.map((warning) => (
                  <div key={`${warning.scope}-${warning.message}`} className="rounded-lg bg-amber/8 px-4 py-3 text-sm text-slate">
                    {warning.message}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {deferredRotation ? (
            <div className="grid gap-5">
              <section className="panel-surface layout-safe overflow-hidden rounded-4xl border border-gray-100 p-5 shadow-panel">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-amber px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber/90 disabled:opacity-60"
                    onClick={() => void handlePublish()}
                    disabled={publishLoading}
                  >
                    {publishLoading ? "Publication..." : "Publier sur l'index"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate disabled:opacity-60"
                    onClick={() => void handleExport("xlsx")}
                    disabled={exportLoading !== null}
                  >
                    {exportLoading === "xlsx" ? "Export..." : "Exporter .xlsx"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-slate hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => void handleExport("pdf")}
                    disabled={exportLoading !== null}
                  >
                    {exportLoading === "pdf" ? "Export..." : "Exporter .pdf"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-slate hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => void handleExport("csv")}
                    disabled={exportLoading !== null}
                  >
                    {exportLoading === "csv" ? "Export..." : "Exporter .csv"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-slate hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => void handleCopy()}
                    disabled={exportLoading !== null}
                  >
                    {exportLoading === "copy" ? "Copie..." : "Copier le tableau"}
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-ink">Retirer un agent sur une journee</p>
                  <p className="mt-1 text-xs text-slate">
                    Les creneaux de l'agent retire sont reassignes automatiquement vers les agents eligibles les moins charges.
                  </p>

                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]">
                    <label className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <span className="text-xs font-medium text-slate/70">Date</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-ink outline-none ring-amber/30 transition focus:border-amber/60 focus:ring-4"
                        value={removedAgentDate}
                        onChange={(event) => setRemovedAgentDate(event.target.value)}
                      >
                        {deferredRotation.dates.map((date) => (
                          <option key={date} value={date}>
                            {formatDisplayDate(date)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <span className="text-xs font-medium text-slate/70">Agent</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-ink outline-none ring-amber/30 transition focus:border-amber/60 focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60"
                        value={removedAgentKey}
                        onChange={(event) => setRemovedAgentKey(event.target.value)}
                        disabled={!removedAgentDate || !removableAgents.length}
                      >
                        {removableAgents.map((agent) => (
                          <option key={agent.key} value={agent.key}>
                            {agent.displayName} ({agent.slots} creneau{agent.slots > 1 ? "x" : ""})
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      className="self-end rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-slate transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleRemoveAgentFromDate}
                      disabled={!removedAgentDate || !removedAgentKey}
                    >
                      Retirer cet agent
                    </button>
                  </div>
                </div>
              </section>
              <RotationTable
                rotation={deferredRotation}
                selectedCellKey={selectedCellKey}
                onSelectCell={(cell) => setSelectedCellKey(cellKey(cell))}
                onToggleDisabled={handleToggleDisabled}
              />
              <SummaryPanel rotation={deferredRotation} />
              <InspectorDrawer
                cell={selectedCell}
                agents={currentAgents}
                onClose={() => setSelectedCellKey(null)}
                onManualAssign={handleManualAssign}
                onToggleHoliday={handleToggleHoliday}
              />
            </div>
          ) : (
            <section className="panel-surface rounded-4xl border border-gray-100 p-10 text-center shadow-panel">
              <p className="text-base font-medium text-ink">La rotation apparaitra ici apres analyse et generation.</p>
              <p className="mt-2 text-sm text-slate">
                Une fois publiee, elle sera visible directement sur l'index public du site.
              </p>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
