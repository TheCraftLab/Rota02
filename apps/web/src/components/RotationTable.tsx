import { formatDisplayDate, formatWeekday, type RotationCell, type RotationResult } from "@rota/core";
import { StatusBadge } from "./StatusBadge";

interface RotationTableProps {
  rotation: RotationResult;
  selectedCellKey: string | null;
  onSelectCell?: (cell: RotationCell) => void;
  onToggleDisabled?: (cell: RotationCell) => void;
  interactive?: boolean;
  title?: string;
  description?: string;
  density?: "default" | "kiosk";
}

function cellKey(cell: RotationCell): string {
  return `${cell.date}-${cell.slotStart}`;
}

export function RotationTable({
  rotation,
  selectedCellKey,
  onSelectCell,
  onToggleDisabled,
  interactive = true,
  title = "Rotation de chat editable",
  description = "Cliquez sur une cellule pour afficher les raisons de choix ou la modifier.",
  density = "default"
}: RotationTableProps) {
  const isKiosk = density === "kiosk";
  const manualCount = rotation.cells.filter((cell) => cell.status === "manual").length;
  const holidayCount = rotation.cells.filter((cell) => cell.status === "holiday").length;

  return (
    <section className="panel-surface layout-safe overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-panel">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70 dark:text-gray-500">Table</p>
          <h2 className={`mt-2 font-semibold text-ink dark:text-white ${isKiosk ? "text-3xl sm:text-4xl" : "text-2xl"}`}>{title}</h2>
          <p className={`mt-2 text-slate dark:text-gray-400 ${isKiosk ? "text-base" : "text-sm"}`}>{description}</p>
        </div>
        {manualCount > 0 || holidayCount > 0 ? (
          <div className="flex flex-wrap gap-2">
            {manualCount > 0 ? (
              <StatusBadge tone="warning">
                {manualCount} manual change(s)
              </StatusBadge>
            ) : null}
            {holidayCount > 0 ? <StatusBadge tone="neutral">{holidayCount} holiday(s)</StatusBadge> : null}
          </div>
        ) : null}
      </div>

      <div className="grid-table max-w-full overflow-x-auto overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800">
        <table className={`min-w-max w-full border-separate border-spacing-0 text-left ${isKiosk ? "text-base" : "text-sm"}`}>
          <thead className={`sticky top-0 z-10 ${isKiosk ? "bg-ink dark:bg-slate-900" : "bg-sand dark:bg-slate-700"}`}>
            <tr>
              <th
                className={`sticky left-0 z-30 min-w-[88px] border-b border-r border-gray-200 dark:border-gray-600 px-4 font-semibold shadow-[6px_0_8px_-8px_rgba(15,25,35,0.4)] dark:shadow-[6px_0_8px_-8px_rgba(0,0,0,0.6)] ${
                  isKiosk ? "bg-ink dark:bg-slate-900 py-4 text-white" : "bg-sand dark:bg-slate-700 py-3 text-ink dark:text-white"
                }`}
              >
                Time
              </th>
              {rotation.dates.map((date) => (
                <th
                  key={date}
                  className={`min-w-[180px] border-b border-gray-200 dark:border-gray-600 px-4 font-semibold ${
                    isKiosk ? "py-4 text-white" : "py-3 text-ink dark:text-white"
                  }`}
                >
                  <div className={`uppercase tracking-[0.12em] ${isKiosk ? "text-sm text-white/70" : "text-xs text-slate/70 dark:text-gray-400"}`}>
                    {formatWeekday(date)}
                  </div>
                  <div className="mt-1">{formatDisplayDate(date)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rotation.slots.map((slot) => (
              <tr key={slot}>
                <td
                  className={`sticky left-0 z-20 min-w-[88px] border-b border-r border-gray-200 dark:border-gray-600 px-4 font-semibold shadow-[6px_0_8px_-8px_rgba(15,25,35,0.25)] dark:shadow-[6px_0_8px_-8px_rgba(0,0,0,0.4)] ${
                    isKiosk ? "bg-gray-50 dark:bg-slate-800 py-4 text-ink dark:text-white" : "bg-white dark:bg-slate-800 py-3 text-slate dark:text-gray-400"
                  }`}
                >
                  {slot}
                </td>
                {rotation.dates.map((date) => {
                  const cell = rotation.cells.find((item) => item.date === date && item.slotStart === slot);
                  if (!cell) {
                    return (
                      <td key={`${date}-${slot}`} className="border-b border-gray-200 dark:border-gray-600 px-4 py-3 text-slate dark:text-gray-400">
                        -
                      </td>
                    );
                  }

                  const selected = selectedCellKey === cellKey(cell);
                  const tone =
                    cell.status === "holiday"
                      ? "border-gray-200 dark:border-gray-600 bg-sand dark:bg-slate-700 text-ink dark:text-white"
                      : cell.status === "disabled"
                      ? "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-slate-700 text-slate dark:text-gray-400"
                      : cell.status === "uncovered"
                      ? "border-danger/30 dark:border-danger/50 bg-danger/10 dark:bg-danger/20 text-danger dark:text-danger"
                      : cell.status === "manual"
                        ? "border-accent-500/40 dark:border-accent-500/50 bg-accent-500/25 dark:bg-accent-500/20 text-accent-500 dark:text-accent-500"
                        : "border-success/20 dark:border-success/30 bg-success/10 dark:bg-success/20 text-ink dark:text-white";

                  return (
                    <td
                      key={cellKey(cell)}
                      className={`min-w-[180px] border-b border-gray-200 dark:border-gray-600 px-3 align-top ${isKiosk ? "py-4" : "py-3"}`}
                    >
                      {interactive ? (
                        <div
                          className={`relative w-full break-words rounded-xl border transition ${
                            selected ? "border-accent-500 shadow-lg dark:shadow-lg" : "border-transparent"
                          } ${tone}`}
                        >
                          {onToggleDisabled && cell.status !== "holiday" ? (
                            <button
                              type="button"
                              className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-sm font-semibold text-slate dark:text-gray-300 shadow-sm transition hover:bg-gray-100 dark:hover:bg-slate-600"
                              title={cell.status === "disabled" ? "Restore slot" : "Free slot"}
                              aria-label={cell.status === "disabled" ? "Restore slot" : "Free slot"}
                              onClick={(event) => {
                                event.stopPropagation();
                                onToggleDisabled(cell);
                              }}
                            >
                              {cell.status === "disabled" ? "+" : "x"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            title={cell.reasons.join(" ")}
                            className={`w-full text-left ${isKiosk ? "px-4 py-4 pr-12" : "px-4 py-3 pr-12"}`}
                            onClick={() => onSelectCell?.(cell)}
                          >
                            <div className={`font-semibold ${isKiosk ? "text-lg" : ""}`}>{cell.assignedAgentName}</div>
                            <div className={`mt-1 opacity-80 ${isKiosk ? "text-sm" : "text-xs"}`}>{cell.slotStart} - {cell.slotEnd}</div>
                          </button>
                        </div>
                      ) : (
                        <div className={`w-full break-words rounded-xl border px-4 text-left ${tone} ${isKiosk ? "py-4" : "py-3"}`}>
                          <div className={`font-semibold ${isKiosk ? "text-lg" : ""}`}>{cell.assignedAgentName}</div>
                          <div className={`mt-1 opacity-80 ${isKiosk ? "text-sm" : "text-xs"}`}>{cell.slotStart} - {cell.slotEnd}</div>
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
