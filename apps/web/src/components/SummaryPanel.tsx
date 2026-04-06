import { formatDisplayDate, type RotationResult } from "@rota/core";
import { StatusBadge } from "./StatusBadge";

interface SummaryPanelProps {
  rotation: RotationResult;
}

export function SummaryPanel({ rotation }: SummaryPanelProps) {
  return (
    <section className="panel-surface layout-safe overflow-hidden rounded-4xl border border-white/70 p-6 shadow-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70">Controle</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Vision d'ensemble et alertes de charge</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="success">Equite {rotation.summary.fairnessScore}%</StatusBadge>
          <StatusBadge tone={rotation.summary.uncoveredSlots > 0 ? "danger" : "neutral"}>
            {rotation.summary.uncoveredSlots} non couvert(s)
          </StatusBadge>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="layout-safe rounded-3xl bg-white/70 p-4">
          <p className="text-sm font-semibold text-ink">Repartition par agent</p>
          <div className="mt-4 max-w-full overflow-x-auto">
            <table className="min-w-[640px] w-full text-left text-sm">
              <thead className="text-slate/70">
                <tr>
                  <th className="pb-3 pr-4 font-semibold">Agent</th>
                  <th className="pb-3 pr-4 font-semibold">Total</th>
                  <th className="pb-3 pr-4 font-semibold">Par jour</th>
                  <th className="pb-3 font-semibold">Alerte</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {rotation.summary.agentSummaries.map((summary) => (
                  <tr key={summary.agentName} className="border-t border-slate/10">
                    <td className="py-3 pr-4 font-medium">{summary.agentName}</td>
                    <td className="py-3 pr-4">{summary.totalSlots}</td>
                    <td className="py-3 pr-4 text-xs text-slate">
                      {Object.entries(summary.slotsByDate)
                        .map(([date, count]) => `${formatDisplayDate(date)}: ${count}`)
                        .join(" | ") || "Aucun"}
                    </td>
                    <td className="py-3">{summary.overload ? <StatusBadge tone="warning">Surveillance</StatusBadge> : "RAS"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="layout-safe rounded-3xl bg-white/70 p-4">
          <p className="text-sm font-semibold text-ink">Alertes</p>
          <div className="mt-4 flex flex-col gap-3">
            {rotation.summary.alerts.length ? (
              rotation.summary.alerts.map((alert) => (
                <div key={alert} className="rounded-2xl border border-coral/20 bg-coral/10 px-4 py-3 text-sm text-coral">
                  {alert}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-mint/20 bg-mint/10 px-4 py-3 text-sm text-mint">
                Aucun desequilibre critique n'a ete detecte.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
