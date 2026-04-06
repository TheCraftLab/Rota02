import { normalizeName, type AgentSchedule, type RotationCell } from "@rota/core";
import { StatusBadge } from "./StatusBadge";

interface InspectorDrawerProps {
  cell: RotationCell | null;
  agents: AgentSchedule[];
  onClose: () => void;
  onManualAssign: (cell: RotationCell, agentKey: string | null) => void;
}

function resolveAgentKey(agentId: string | null, agentName: string): string {
  return agentId ?? normalizeName(agentName);
}

export function InspectorDrawer({ cell, agents, onClose, onManualAssign }: InspectorDrawerProps) {
  if (!cell) {
    return (
      <aside className="panel-surface layout-safe overflow-hidden rounded-4xl border border-white/70 p-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70">Inspection</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">Aucune cellule selectionnee</h2>
        <p className="mt-2 text-sm text-slate">
          Cliquez sur un creneau du tableau pour voir la logique de decision et appliquer un ajustement manuel.
        </p>
      </aside>
    );
  }

  const availableCandidates = cell.candidates.filter((candidate) => candidate.eligible);
  const currentValue =
    cell.assignedAgentName === "Non couvert" ? "" : resolveAgentKey(cell.assignedAgentId, cell.assignedAgentName);

  return (
    <aside className="panel-surface layout-safe overflow-hidden rounded-4xl border border-white/70 p-6 shadow-panel xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70">Inspection</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            {cell.date} - {cell.slotStart}-{cell.slotEnd}
          </h2>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate/15 px-4 py-2 text-sm font-semibold text-slate"
          onClick={onClose}
        >
          Fermer
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <StatusBadge tone={cell.status === "uncovered" ? "danger" : cell.status === "manual" ? "warning" : "success"}>
          {cell.assignedAgentName}
        </StatusBadge>
        {cell.manualOverride?.forced ? <StatusBadge tone="danger">Forcage hors eligibilite</StatusBadge> : null}
      </div>

      <div className="mt-6 rounded-3xl bg-white/70 p-4">
        <p className="text-sm font-semibold text-ink">Pourquoi ce choix ?</p>
        <div className="mt-3 flex flex-col gap-2">
          {cell.reasons.map((reason) => (
            <div key={reason} className="rounded-2xl bg-sand px-4 py-3 text-sm text-slate break-words">
              {reason}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-3xl bg-white/70 p-4">
        <label className="block">
          <span className="text-sm font-semibold text-ink">Retouche manuelle</span>
          <select
            className="mt-3 w-full rounded-2xl border border-slate/15 bg-white px-3 py-3 text-sm text-ink outline-none ring-amber/30 transition focus:ring-4"
            value={currentValue}
            onChange={(event) => onManualAssign(cell, event.target.value || null)}
          >
            <option value="">Non couvert</option>
            {availableCandidates.length ? (
              <optgroup label="Agents disponibles">
                {availableCandidates.map((candidate) => (
                  <option key={resolveAgentKey(candidate.agentId, candidate.agentName)} value={resolveAgentKey(candidate.agentId, candidate.agentName)}>
                    {candidate.agentName}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Tous les agents">
              {agents.map((agent) => (
                <option key={resolveAgentKey(agent.agentId, agent.displayName)} value={resolveAgentKey(agent.agentId, agent.displayName)}>
                  {agent.displayName}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      <div className="mt-6 rounded-3xl bg-white/70 p-4">
        <p className="text-sm font-semibold text-ink">Classement des candidats</p>
        <div className="mt-3 flex flex-col gap-3">
          {cell.candidates.map((candidate) => (
            <div key={resolveAgentKey(candidate.agentId, candidate.agentName)} className="rounded-2xl border border-slate/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{candidate.agentName}</p>
                  <p className="mt-1 text-xs text-slate">
                    Global: {candidate.totalAssignedBefore} - Jour: {candidate.dayAssignedBefore}
                  </p>
                </div>
                <StatusBadge tone={candidate.eligible ? "success" : "danger"}>
                  {candidate.eligible ? "Eligible" : "Bloque"}
                </StatusBadge>
              </div>
              <div className="mt-3 flex flex-col gap-2 break-words text-sm text-slate">
                {candidate.notes.map((note) => (
                  <div key={note}>{note}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
