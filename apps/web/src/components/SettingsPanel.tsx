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
    <section className="panel-surface rounded-4xl border border-white/70 p-6 shadow-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70">Parametres</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Regles de generation visibles et rejouables</h2>
        </div>
        <button
          type="button"
          disabled={disabled || loading}
          className="rounded-full bg-amber px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber/90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            void onGenerate();
          }}
        >
          {loading ? "Generation..." : "Generer la rotation"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl bg-white/70 p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate/70">Premier creneau</span>
          <div className="mt-3 rounded-2xl border border-slate/15 bg-white px-3 py-3">
            <p className="text-sm font-semibold text-ink">08:30 - 10:00</p>
            <p className="mt-1 text-xs text-slate">Creneau fixe applique automatiquement a chaque generation.</p>
          </div>
        </div>
        <label className="rounded-3xl bg-white/70 p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate/70">Fin</span>
          <input
            className="mt-3 w-full rounded-2xl border border-slate/15 bg-white px-3 py-3 text-sm text-ink outline-none ring-amber/30 transition focus:ring-4"
            type="time"
            value={settings.endTime}
            onChange={(event) => onSettingsChange({ endTime: event.target.value })}
          />
        </label>
        <label className="rounded-3xl bg-white/70 p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate/70">Granularite</span>
          <select
            className="mt-3 w-full rounded-2xl border border-slate/15 bg-white px-3 py-3 text-sm text-ink outline-none ring-amber/30 transition focus:ring-4"
            value={settings.slotMinutes}
            onChange={(event) => onSettingsChange({ slotMinutes: Number(event.target.value) as 30 | 60 })}
          >
            <option value={60}>60 minutes</option>
            <option value={30}>30 minutes</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="flex items-center gap-3 rounded-3xl bg-white/70 px-4 py-4">
          <input
            className="h-4 w-4 accent-amber"
            type="checkbox"
            checked={settings.avoidConsecutive}
            onChange={(event) => onSettingsChange({ avoidConsecutive: event.target.checked })}
          />
          <span className="text-sm font-medium text-ink">Eviter les repetitions consecutives</span>
        </label>
        <label className="rounded-3xl bg-white/70 px-4 py-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate/70">Equite</span>
          <select
            className="mt-2 w-full rounded-2xl border border-slate/15 bg-white px-3 py-3 text-sm text-ink outline-none ring-amber/30 transition focus:ring-4"
            value={settings.fairnessMode}
            onChange={(event) =>
              onSettingsChange({ fairnessMode: event.target.value as RotationSettings["fairnessMode"] })
            }
          >
            <option value="strict">Repartition stricte</option>
            <option value="soft">Repartition souple</option>
          </select>
        </label>
        <div className="rounded-3xl bg-white/70 px-4 py-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate/70">Etat</span>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge tone="success">Open Time uniquement</StatusBadge>
            <StatusBadge tone="warning">Tout le reste bloque</StatusBadge>
          </div>
        </div>
      </div>
    </section>
  );
}
