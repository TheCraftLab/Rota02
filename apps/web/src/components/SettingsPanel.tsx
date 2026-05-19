import type { RotationSettings } from "@rota/core";
import { StatusBadge } from "./StatusBadge";

interface SettingsPanelProps {
  settings: RotationSettings;
  disabled: boolean;
  loading: boolean;
  onGenerate: () => Promise<void>;
  onSettingsChange: (patch: Partial<RotationSettings>) => void;
}

export function SettingsPanel({
  settings,
  disabled,
  loading,
  onGenerate,
  onSettingsChange
}: SettingsPanelProps) {
  return (
    <section className="panel-surface rounded-4xl border border-gray-100 p-6 shadow-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate/50">Parametres</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Regles de generation</h2>
        </div>
        <button
          type="button"
          disabled={disabled || loading}
          className="rounded-lg bg-amber px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber/90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            void onGenerate();
          }}
        >
          {loading ? "Generation..." : "Generer la rotation"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <span className="text-xs font-medium text-slate/60">Premier creneau</span>
          <div className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-sm font-medium text-ink">08:30 - 10:00</p>
            <p className="mt-0.5 text-xs text-slate">Creneau fixe applique automatiquement.</p>
          </div>
        </div>
        <label className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <span className="text-xs font-medium text-slate/60">Fin</span>
          <input
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-amber/30 transition focus:border-amber/60 focus:ring-4"
            type="time"
            value={settings.endTime}
            onChange={(event) => onSettingsChange({ endTime: event.target.value })}
          />
        </label>
        <label className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <span className="text-xs font-medium text-slate/60">Granularite</span>
          <select
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-amber/30 transition focus:border-amber/60 focus:ring-4"
            value={settings.slotMinutes}
            onChange={(event) => onSettingsChange({ slotMinutes: Number(event.target.value) as 30 | 60 })}
          >
            <option value={60}>60 minutes</option>
            <option value={30}>30 minutes</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <input
            className="h-4 w-4 accent-amber"
            type="checkbox"
            checked={settings.avoidConsecutive}
            onChange={(event) => onSettingsChange({ avoidConsecutive: event.target.checked })}
          />
          <span className="text-sm text-ink">Eviter les repetitions consecutives</span>
        </label>
        <label className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <span className="text-xs font-medium text-slate/60">Equite</span>
          <select
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-amber/30 transition focus:border-amber/60 focus:ring-4"
            value={settings.fairnessMode}
            onChange={(event) =>
              onSettingsChange({ fairnessMode: event.target.value as RotationSettings["fairnessMode"] })
            }
          >
            <option value="strict">Repartition stricte</option>
            <option value="soft">Repartition souple</option>
          </select>
        </label>
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <span className="text-xs font-medium text-slate/60">Eligibilite</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge tone="success">Open Time requis</StatusBadge>
            <StatusBadge tone="warning">Pause remuneree courte toleree</StatusBadge>
            <StatusBadge tone="neutral">Autres activites bloquantes</StatusBadge>
          </div>
        </div>
      </div>
    </section>
  );
}
