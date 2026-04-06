import { formatDisplayDate, formatWeekday, type RotationCell, type RotationResult } from "@rota/core";

interface RotationTableProps {
  rotation: RotationResult;
  selectedCellKey: string | null;
  onSelectCell?: (cell: RotationCell) => void;
  interactive?: boolean;
  title?: string;
  description?: string;
}

function cellKey(cell: RotationCell): string {
  return `${cell.date}-${cell.slotStart}`;
}

export function RotationTable({
  rotation,
  selectedCellKey,
  onSelectCell,
  interactive = true,
  title = "Rotation de chat editable",
  description = "Cliquez sur une cellule pour afficher les raisons de choix ou la modifier."
}: RotationTableProps) {
  return (
    <section className="panel-surface layout-safe overflow-hidden rounded-4xl border border-white/70 p-6 shadow-panel">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70">Tableau</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{title}</h2>
          <p className="mt-2 text-sm text-slate">{description}</p>
        </div>
      </div>

      <div className="grid-table max-w-full overflow-x-auto overflow-y-auto rounded-3xl border border-slate/10 bg-white/80">
        <table className="min-w-max w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-sand">
            <tr>
              <th className="sticky left-0 z-20 min-w-[88px] border-b border-r border-slate/10 bg-sand px-4 py-3 font-semibold text-ink">
                Heure
              </th>
              {rotation.dates.map((date) => (
              <th key={date} className="min-w-[180px] border-b border-slate/10 px-4 py-3 font-semibold text-ink">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate/70">{formatWeekday(date)}</div>
                  <div className="mt-1">{formatDisplayDate(date)}</div>
              </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rotation.slots.map((slot) => (
              <tr key={slot}>
                <td className="sticky left-0 min-w-[88px] border-b border-r border-slate/10 bg-white px-4 py-3 font-semibold text-slate">
                  {slot}
                </td>
                {rotation.dates.map((date) => {
                  const cell = rotation.cells.find((item) => item.date === date && item.slotStart === slot);
                  if (!cell) {
                    return (
                      <td key={`${date}-${slot}`} className="border-b border-slate/10 px-4 py-3 text-slate">
                        -
                      </td>
                    );
                  }

                  const selected = selectedCellKey === cellKey(cell);
                  const tone =
                    cell.status === "uncovered"
                      ? "bg-coral/10 text-coral"
                      : cell.status === "manual"
                        ? "bg-amber/10 text-amber"
                        : "bg-mint/10 text-ink";

                  return (
                    <td key={cellKey(cell)} className="min-w-[180px] border-b border-slate/10 px-3 py-3 align-top">
                      {interactive ? (
                        <button
                          type="button"
                          title={cell.reasons.join(" ")}
                          className={`w-full break-words rounded-2xl border px-4 py-3 text-left transition ${
                            selected ? "border-ink shadow-lg" : "border-transparent"
                          } ${tone}`}
                          onClick={() => onSelectCell?.(cell)}
                        >
                          <div className="font-semibold">{cell.assignedAgentName}</div>
                          <div className="mt-1 text-xs opacity-80">{cell.slotStart} - {cell.slotEnd}</div>
                        </button>
                      ) : (
                        <div className={`w-full break-words rounded-2xl border px-4 py-3 text-left ${tone}`}>
                          <div className="font-semibold">{cell.assignedAgentName}</div>
                          <div className="mt-1 text-xs opacity-80">{cell.slotStart} - {cell.slotEnd}</div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
