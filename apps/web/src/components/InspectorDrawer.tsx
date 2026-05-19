import { normalizeName, type AgentSchedule, type RotationCell } from "@rota/core";
import { StatusBadge } from "./StatusBadge";

interface InspectorDrawerProps {
  cell: RotationCell | null;
  agents: AgentSchedule[];
  onClose: () => void;
  onManualAssign: (cell: RotationCell, agentKey: string | null) => void;
  onToggleHoliday: (cell: RotationCell) => void;
}

function resolveAgentKey(agentId: string | null, agentName: string): string {
  return agentId ?? normalizeName(agentName);
}

export function InspectorDrawer({ cell, agents, onClose, onManualAssign, onToggleHoliday }: InspectorDrawerProps) {
  if (!cell) {
    return null;
  }

  const holidayManaged = cell.status === "holiday" || cell.holidayOverride?.cancelled;
  const assignmentLocked = cell.status === "holiday";
  const currentValue =
    cell.status === "disabled" || cell.status === "holiday" || cell.assignedAgentName === "Non couvert"
      ? ""
      : resolveAgentKey(cell.assignedAgentId, cell.assignedAgentName);
  const candidateKeys = new Set(cell.candidates.map((candidate) => resolveAgentKey(candidate.agentId, candidate.agentName)));
  const candidates = [
    ...cell.candidates,
    ...agents
      .filter((agent) => !candidateKeys.has(resolveAgentKey(agent.agentId, agent.displayName)))
      .map((agent) => ({
        agentId: agent.agentId,
        agentName: agent.displayName,
        eligible: false,
        totalAssignedBefore: 0,
        dayAssignedBefore: 0,
        previousSlotAssigned: false,
        decisionRank: [],
        notes: ["Agent indisponible ou absent du calcul courant pour ce creneau."]
      }))
  ];
  const statusTone =
    cell.status === "holiday"
      ? "neutral"
      : cell.status === "disabled"
        ? "neutral"
        : cell.status === "uncovered"
          ? "danger"
          : cell.status === "manual"
            ? "warning"
            : "success";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="panel-surface layout-safe max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-4xl border border-gray-100 p-6 shadow-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate/50">Modification du creneau</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              {cell.date} — {cell.slotStart}–{cell.slotEnd}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate hover:bg-gray-50"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge tone={statusTone}>
            {cell.assignedAgentName}
          </StatusBadge>
          {cell.status === "holiday" ? <StatusBadge tone="neutral">Jour ferie</StatusBadge> : null}
          {cell.holidayOverride?.holidayName ? (
            <StatusBadge tone={cell.status === "holiday" ? "neutral" : "warning"}>
              {cell.holidayOverride.holidayName}
            </StatusBadge>
          ) : null}
          {cell.status === "manual" ? <StatusBadge tone="warning">Modification manuelle</StatusBadge> : null}
          {cell.status === "disabled" ? <StatusBadge tone="neutral">Creneau libere</StatusBadge> : null}
          {cell.manualOverride?.forced ? <StatusBadge tone="danger">Forcage hors eligibilite</StatusBadge> : null}
        </div>

        {holidayManaged ? (
          <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Gestion du jour ferie</p>
                <p className="mt-1 text-sm text-slate">
                  {cell.status === "holiday"
                    ? "Cette journee est actuellement marquee ferie sur tout le tableau."
                    : "Le jour ferie a ete annule et peut etre reapplique si besoin."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-slate hover:bg-gray-50"
                onClick={() => onToggleHoliday(cell)}
              >
                {cell.status === "holiday" ? "Annuler le ferie" : "Reappliquer le ferie"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-ink">Affectation rapide</p>
              <p className="mt-1 text-sm text-slate">
                Cliquez sur un agent pour le remplacer sur ce creneau.
              </p>
            </div>
            <button
              type="button"
              disabled={assignmentLocked}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                currentValue === ""
                  ? "bg-coral text-white hover:bg-coral/90"
                  : "border border-gray-200 bg-white text-slate hover:bg-gray-50"
              } disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={() => onManualAssign(cell, null)}
            >
              Laisser non couvert
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-sm font-medium text-ink">Pourquoi ce choix ?</p>
          <div className="mt-3 flex flex-col gap-2">
            {cell.reasons.map((reason) => (
              <div key={reason} className="rounded-lg bg-sand px-4 py-3 text-sm text-slate break-words">
                {reason}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-sm font-medium text-ink">Agents disponibles</p>
          <div className="mt-3 flex flex-col gap-2">
            {candidates.map((candidate) => {
              const candidateKey = resolveAgentKey(candidate.agentId, candidate.agentName);
              const selected = currentValue === candidateKey;

              return (
                <button
                  key={candidateKey}
                  type="button"
                  disabled={assignmentLocked}
                  className={`rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected
                      ? "border-amber bg-amber/8"
                      : candidate.eligible
                        ? "border-mint/25 bg-mint/4 hover:border-mint/40 hover:bg-mint/8"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                  onClick={() => onManualAssign(cell, candidateKey)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{candidate.agentName}</p>
                      <p className="mt-0.5 text-xs text-slate">
                        Global : {candidate.totalAssignedBefore} — Jour : {candidate.dayAssignedBefore}
                      </p>
                    </div>
                    <StatusBadge tone={candidate.eligible ? "success" : "danger"}>
                      {candidate.eligible ? "Disponible" : "Bloque"}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 flex flex-col gap-1 break-words text-xs text-slate">
                    {candidate.notes.map((note) => (
                      <div key={note}>{note}</div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
