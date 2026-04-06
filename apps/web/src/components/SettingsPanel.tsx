import type { ActivityCatalogEntry, RotationSettings } from "@rota/core";
import { StatusBadge } from "./StatusBadge";

interface SettingsPanelProps {
  settings: RotationSettings;
  activities: ActivityCatalogEntry[];
  disabled: boolean;
  loading: boolean;
  onGenerate: () => Promise<void>;
  onSettingsChange: (patch: Partial<RotationSettings>) => void;
  onActivityChange: (normalizedActivity: string, category: "eligible" | "ineligible" | "unknown") => void;
}

function getMode(settings: RotationSettings, normalizedActivity: string): "eligible" | "ineligible" | "unknown" {
  if (settings.eligibleActivities.includes(normalizedActivity)) {
    return "eligible";
  }

  if (settings.ineligibleActivities.includes(normalizedActivity)) {
    return "ineligible";
  }

  return "unknown";
}

export function SettingsPanel({
  settings,
  activities,
  disabled,
  loading,
  onGenerate,
  onSettingsChange,
  onActivityChange
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
        <label className="rounded-3xl bg-white/70 p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate/70">Debut</span>
          <input
            className="mt-3 w-full rounded-2xl border border-slate/15 bg-white px-3 py-3 text-sm text-ink outline-none ring-amber/30 transition focus:ring-4"
            type="time"
            value={settings.startTime}
            onChange={(event) => onSettingsChange({ startTime: event.target.value })}
          />
        </label>
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

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex items-center gap-3 rounded-3xl bg-white/70 px-4 py-4">
          <input
            className="h-4 w-4 accent-amber"
            type="checkbox"
            checked={settings.allowAlternance}
            onChange={(event) => onSettingsChange({ allowAlternance: event.target.checked })}
          />
          <span className="text-sm font-medium text-ink">Autoriser `Alternance Ecole/WH`</span>
        </label>
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
            <StatusBadge tone="success">{settings.eligibleActivities.length} eligibles</StatusBadge>
            <StatusBadge tone="warning">{settings.ineligibleActivities.length} non eligibles</StatusBadge>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Catalogue d'activites</p>
            <p className="text-sm text-slate">
              Chaque activite peut etre forcee en eligible, non eligible, ou laissee neutre.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {activities.map((activity) => {
            const mode = getMode(settings, activity.normalizedActivity);
            const baseTone =
              mode === "eligible" ? "border-mint/30 bg-mint/10" : mode === "ineligible" ? "border-coral/25 bg-coral/10" : "border-slate/15 bg-white/70";
            return (
              <div key={activity.normalizedActivity} className={`rounded-3xl border p-4 ${baseTone}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{activity.activity}</p>
                    <p className="mt-1 text-xs text-slate">
                      Detection initiale: <span className="font-semibold">{activity.category}</span>
                    </p>
                  </div>
                  <StatusBadge tone={mode === "eligible" ? "success" : mode === "ineligible" ? "danger" : "neutral"}>
                    {mode}
                  </StatusBadge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-2 text-xs font-semibold ${
                      mode === "eligible" ? "bg-mint text-white" : "bg-white text-slate"
                    }`}
                    onClick={() => onActivityChange(activity.normalizedActivity, "eligible")}
                  >
                    Eligible
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-2 text-xs font-semibold ${
                      mode === "ineligible" ? "bg-coral text-white" : "bg-white text-slate"
                    }`}
                    onClick={() => onActivityChange(activity.normalizedActivity, "ineligible")}
                  >
                    Non eligible
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-2 text-xs font-semibold ${
                      mode === "unknown" ? "bg-slate text-white" : "bg-white text-slate"
                    }`}
                    onClick={() => onActivityChange(activity.normalizedActivity, "unknown")}
                  >
                    Neutre
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
