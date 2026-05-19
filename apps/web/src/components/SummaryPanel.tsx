import { formatDisplayDate, type RotationResult } from "@rota/core";
import { StatusBadge } from "./StatusBadge";

interface SummaryPanelProps {
  rotation: RotationResult;
}

export function SummaryPanel({ rotation }: SummaryPanelProps) {
  const holidaySlots = rotation.cells.filter((cell) => cell.status === "holiday").length;

  return (
    <section className="panel-surface layout-safe overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate/50 dark:text-gray-500">Controle</p>
          <h2 className="mt-2 text-xl font-semibold text-ink dark:text-white">Vision d'ensemble</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="success">Equite {rotation.summary.fairnessScore}%</StatusBadge>
          <StatusBadge tone={rotation.summary.uncoveredSlots > 0 ? "danger" : "neutral"}>
            {rotation.summary.uncoveredSlots} non couvert(s)
          </StatusBadge>
          {holidaySlots > 0 ? <StatusBadge tone="neutral">{holidaySlots} ferie(s)</StatusBadge> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="layout-safe rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 p-4">
          <p className="text-sm font-medium text-ink dark:text-white">Repartition par agent</p>
          <div className="mt-4 max-w-full overflow-x-auto">
            <table className="min-w-[600px] w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-slate dark:text-gray-400">
                  <th className="pb-2 pr-4 font-medium">Agent</th>
                  <th className="pb-2 pr-4 font-medium">Total</th>
                  <th className="pb-2 pr-4 font-medium">Par jour</th>
                  <th className="pb-2 font-medium">Alerte</th>
                </tr>
              </thead>
              <tbody className="text-ink dark:text-white">
                {rotation.summary.agentSummaries.map((summary) => (
                  <tr key={summary.agentName} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="py-2.5 pr-4 font-medium">{summary.agentName}</td>
                    <td className="py-2.5 pr-4">{summary.totalSlots}</td>
                    <td className="py-2.5 pr-4 text-xs text-slate dark:text-gray-400">
                      {Object.entries(summary.slotsByDate)
                        .map(([date, count]) => `${formatDisplayDate(date)}: ${count}`)
                        .join(" | ") || "Aucun"}
                    </td>
                    <td className="py-2.5">
                      {summary.overload ? <StatusBadge tone="warning">Surveillance</StatusBadge> : <span className="text-xs text-slate/50 dark:text-gray-500">RAS</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="layout-safe rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 p-4">
          <p className="text-sm font-medium text-ink dark:text-white">Alertes</p>
          <div className="mt-4 flex flex-col gap-2">
            {rotation.summary.alerts.length ? (
              rotation.summary.alerts.map((alert) => (
                <div key={alert} className="rounded-lg border border-danger/15 bg-danger/5 px-4 py-3 text-sm text-danger dark:text-danger">
                  {alert}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-success/15 bg-success/5 px-4 py-3 text-sm text-success dark:text-success">
                Aucun desequilibre critique detecte.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
