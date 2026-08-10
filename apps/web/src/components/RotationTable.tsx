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

function isDisplayableCell(cell: RotationCell | undefined): boolean {
  if (!cell) return false;

  if (cell.status === "holiday") return true;
  if (cell.status === "manual") return true;
  if (cell.status === "disabled") return true;
  if (cell.status === "uncovered") return true;

  const agentName = cell.assignedAgentName?.trim();

  return Boolean(agentName);
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

  const visibleSlots = rotation.slots.filter((slot) =>
    rotation.dates.some((date) => {
      const cell = rotation.cells.find((item) => item.date === date && item.slotStart === slot);
      return isDisplayableCell(cell);
    })
  );

  if (visibleSlots.length === 0) {
    return (
      <section className="panel-surface layout-safe overflow-hidden rounded-4xl border border-white/70 p-6 shadow-panel">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70">Tableau</p>
            <h2 className={'mt-2 font-semibold text-ink ${isKiosk ? "text-3xl sm:text-4xl" : "text-2xl"}'}>
              {title}
            </h2>
            <p className={'mt-2 text-slate ${isKiosk ? "text-base" : "text-sm"}'}>{description}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-dashed border-slate/20 bg-white/70 p-6 text-center">
          <div className={'font-semibold text-ink ${isKiosk ? "text-xl" : "text-base"}'}>
            Aucun créneau à afficher pour cette rotation.
          </div>
          <p className={'mt-2 text-slate ${isKiosk ? "text-base" : "text-sm"}'}>
            Aucun créneau actif ne couvre les horaires configurés. Vérifiez le fichier importé ou ajustez les
            paramètres de début, de fin et de durée des créneaux.
          </p>
        </div>
      </section>
    );
  }

  const manualCount = rotation.cells.filter((cell) => cell.status === "manual").length;
  const holidayCount = rotation.cells.filter((cell) => cell.status === "holiday").length;

  return (
    <section className="panel-surface layout-safe overflow-hidden rounded-4xl border border-white/70 p-6 shadow-panel">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70">Tableau</p>
          <h2 className={'mt-2 font-semibold text-ink ${isKiosk ? "text-3xl sm:text-4xl" : "text-2xl"}'}>
            {title}
          </h2>
          <p className={'mt-2 text-slate ${isKiosk ? "text-base" : "text-sm"}'}>{description}</p>
        </div>

        {manualCount > 0 || holidayCount > 0 ? (
          <div className="flex flex-wrap gap-2">
            {manualCount > 0 ? (
              <StatusBadge tone="warning">{manualCount} modification(s) manuelle(s) en jaune</StatusBadge>
            ) : null}

            {holidayCount > 0 ? <StatusBadge tone="neutral">{holidayCount} créneau(x) férié(s)</StatusBadge> : null}
          </div>
        ) : null}
      </div>

      <div className="grid-table max-w-full overflow-x-auto overflow-y-auto rounded-3xl border border-slate/10 bg-white/80">
        <table className={'min-w-max w-full border-separate border-spacing-0 text-left ${isKiosk ? "text-base" : "text-sm"}'}>
          <thead className="sticky top-0 z-10 bg-sand">
            <tr>
              <th className="sticky left-0 z-30 min-w-[88px] border-b border-r border-slate/10 bg-sand px-4 py-3 font-semibold text-ink shadow-[6px_0_8px_-8px_rgba(15,25,35,0.4)]">
                Heure
              </th>
          
              {rotation.dates.map((date) => (
                <th
                  key={date}
                  className="min-w-[180px] border-b border-slate/10 px-4 py-3 font-semibold text-ink"
                >
                  <div className="text-xs uppercase tracking-[0.12em] text-slate/70">
                    {formatWeekday(date)}
                  </div>
                  <div className="mt-1 text-base font-bold text-ink">
                    {formatDisplayDate(date)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleSlots.map((slot) => (
              <tr key={slot}>
                <td
                  className={`sticky left-0 z-20 min-w-[88px] border-b border-r border-slate/10 px-4 font-semibold shadow-[6px_0_8px_-8px_rgba(15,25,35,0.25)] ${
                    isKiosk ? "bg-[#edf2f7] py-4 text-ink" : "bg-white py-3 text-slate"
                  }`}
                >
                  {slot}
                </td>

                {rotation.dates.map((date) => {
                  const cell = rotation.cells.find((item) => item.date === date && item.slotStart === slot);

                  if (!cell) {
                    return (
                      <td key={'${date}-${slot}'} className="border-b border-slate/10 px-4 py-3 text-slate">
                        -
                      </td>
                    );
                  }

                  const selected = selectedCellKey === cellKey(cell);

                  const tone =
                    cell.status === "holiday"
                      ? "border-slate/20 bg-sand text-ink"
                      : cell.status === "disabled"
                        ? "border-slate/20 bg-slate/10 text-slate"
                        : cell.status === "uncovered"
                          ? "border-coral/30 bg-coral/10 text-coral"
                          : cell.status === "manual"
                            ? "border-amber/40 bg-amber/25 text-amber"
                            : "border-mint/20 bg-mint/10 text-ink";

                  return (
                    <td
                      key={cellKey(cell)}
                      className={'min-w-[180px] border-b border-slate/10 px-3 align-top ${isKiosk ? "py-4" : "py-3"}'}
                    >
                      {interactive ? (
                        <div
                          className={`relative w-full break-words rounded-2xl border transition ${
                            selected ? "border-ink shadow-lg" : "border-transparent"
                          } ${tone}`}
                        >
                          {onToggleDisabled && cell.status !== "holiday" ? (
                            <button
                              type="button"
                              className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-white/90 text-sm font-semibold text-slate shadow-sm transition hover:bg-white"
                              title={cell.status === "disabled" ? "Rétablir ce créneau" : "Libérer ce créneau"}
                              aria-label={cell.status === "disabled" ? "Rétablir ce créneau" : "Libérer ce créneau"}
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
                            className={'w-full text-left ${isKiosk ? "px-4 py-4 pr-12" : "px-4 py-3 pr-12"}'}
                            onClick={() => onSelectCell?.(cell)}
                          >
                            <div className={'font-semibold ${isKiosk ? "text-lg" : ""}'}>{cell.assignedAgentName}</div>
                            <div className={'mt-1 opacity-80 ${isKiosk ? "text-sm" : "text-xs"}'}>
                              {cell.slotStart} - {cell.slotEnd}
                            </div>
                          </button>
                        </div>
                      ) : (
                        <div
                          className={`w-full break-words rounded-2xl border px-4 text-left ${tone} ${
                            isKiosk ? "py-4" : "py-3"
                          }`}
                        >
                          <div className={'font-semibold ${isKiosk ? "text-lg" : ""}'}>{cell.assignedAgentName}</div>
                          <div className={'mt-1 opacity-80 ${isKiosk ? "text-sm" : "text-xs"}'}>
                            {cell.slotStart} - {cell.slotEnd}
                          </div>
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
