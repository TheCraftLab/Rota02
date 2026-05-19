import { ACCENT_COLORS, type AccentColor } from "../lib/theme";

interface ColorPickerProps {
  accentColor: AccentColor;
  onColorChange: (color: AccentColor) => void;
}

export function ColorPicker({ accentColor, onColorChange }: ColorPickerProps) {
  return (
    <section className="panel-surface rounded-4xl border border-gray-200 dark:border-gray-700 p-5 shadow-panel">
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-slate/50 dark:text-slate">Couleur d'accent</p>
        <p className="mt-1 text-sm text-slate dark:text-gray-400">
          Personnalisez la couleur principale de l'interface
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {(Object.entries(ACCENT_COLORS) as [AccentColor, typeof ACCENT_COLORS[AccentColor]][]).map(([color, data]) => (
          <button
            key={color}
            type="button"
            onClick={() => onColorChange(color)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              accentColor === color
                ? "ring-2 ring-offset-2 dark:ring-offset-slate-800"
                : "border border-gray-200 dark:border-gray-700"
            }`}
            style={{
              backgroundColor: data.light,
              borderColor: data.light,
              color: "white",
              ...(accentColor === color && {
                outlineColor: data.light,
                outlineWidth: "2px",
                outlineOffset: "2px"
              })
            }}
          >
            {accentColor === color && "✓"} {data.label}
          </button>
        ))}
      </div>
    </section>
  );
}
