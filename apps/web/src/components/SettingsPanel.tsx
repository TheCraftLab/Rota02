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
    <section className="panel-surface rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate/50 dark:text-gray-500">Settings</p>
          <h2 className="mt-2 text-xl font-semibold text-ink dark:text-white">Generation rules</h2>
        </div>
        <button
          type="button"
          disabled={disabled || loading}
          className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            void onGenerate();
          }}
        >
          {loading ? "Generating..." : "Generate rotation"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 p-4">
          <span className="text-xs font-medium text-slate/60 dark:text-gray-400">First slot</span>
          <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800 px-3 py-2.5">
            <p className="text-sm font-medium text-ink dark:text-white">08:30 - 10:00</p>
            <p className="mt-0.5 text-xs text-slate dark:text-gray-400">Fixed slot applied automatically.</p>
          </div>
        </div>
        <label className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 p-4">
          <span className="text-xs font-medium text-slate/60 dark:text-gray-400">End</span>
          <input
            className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-ink dark:text-white outline-none ring-accent-500/30 transition focus:border-accent-500 dark:focus:border-accent-500 focus:ring-4"
            type="time"
            value={settings.endTime}
            onChange={(event) => onSettingsChange({ endTime: event.target.value })}
          />
        </label>
        <label className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 p-4">
          <span className="text-xs font-medium text-slate/60 dark:text-gray-400">Granularity</span>
          <select
            className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-ink dark:text-white outline-none ring-accent-500/30 transition focus:border-accent-500 dark:focus:border-accent-500 focus:ring-4"
            value={settings.slotMinutes}
            onChange={(event) => onSettingsChange({ slotMinutes: Number(event.target.value) as 30 | 60 })}
          >
            <option value={60}>60 minutes</option>
            <option value={30}>30 minutes</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 px-4 py-3">
          <input
            className="h-4 w-4 accent-accent-500"
            type="checkbox"
            checked={settings.avoidConsecutive}
            onChange={(event) => onSettingsChange({ avoidConsecutive: event.target.checked })}
          />
          <span className="text-sm text-ink dark:text-white">Avoid consecutive repeats</span>
        </label>
        <label className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 px-4 py-3">
          <span className="text-xs font-medium text-slate/60 dark:text-gray-400">Fairness</span>
          <select
            className="mt-2 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-ink dark:text-white outline-none ring-accent-500/30 transition focus:border-accent-500 dark:focus:border-accent-500 focus:ring-4"
            value={settings.fairnessMode}
            onChange={(event) =>
              onSettingsChange({ fairnessMode: event.target.value as RotationSettings["fairnessMode"] })
            }
          >
            <option value="strict">Strict distribution</option>
            <option value="soft">Soft distribution</option>
          </select>
        </label>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 px-4 py-3">
          <span className="text-xs font-medium text-slate/60 dark:text-gray-400">Eligibility</span>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge tone="success">Open Time required</StatusBadge>
            <StatusBadge tone="warning">Short paid break tolerated</StatusBadge>
            <StatusBadge tone="neutral">Other blocking activities</StatusBadge>
          </div>
        </div>
      </div>
    </section>
  );
}
