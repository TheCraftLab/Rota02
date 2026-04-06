import { useRef, useState } from "react";
import type { ParsedSchedule } from "@rota/core";
import { StatusBadge } from "./StatusBadge";

interface UploadCardProps {
  parsedSchedule: ParsedSchedule | null;
  loading: boolean;
  onFileSelected: (file: File) => Promise<void>;
}

export function UploadCard({ parsedSchedule, loading, onFileSelected }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    await onFileSelected(file);
  }

  return (
    <section className="panel-surface rounded-4xl border border-white/70 p-6 shadow-panel">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70">Import NICE WFM</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Chargez un PDF ou un export texte</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Le parser reconstruit les agents, les dates et les sous-creneaux, puis conserve la matiere brute
            pour regenerer la rotation sans reimport.
          </p>
        </div>
        {parsedSchedule ? <StatusBadge tone="success">{parsedSchedule.agents.length} agent(s)</StatusBadge> : null}
      </div>

      <div
        className={`rounded-3xl border-2 border-dashed p-8 transition ${
          dragOver ? "border-amber bg-amber/10" : "border-slate/25 bg-white/50"
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragOver(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDrop={async (event) => {
          event.preventDefault();
          setDragOver(false);
          await handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept=".pdf,.txt,.csv,.log,text/plain,application/pdf"
          onChange={(event) => {
            void handleFiles(event.target.files);
          }}
        />
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg font-semibold text-ink">Glissez-deposez votre fichier d'horaires</p>
            <p className="mt-2 text-sm text-slate">
              Formats supportes: PDF, TXT, CSV, LOG. Taille recommandee: jusqu'a 10 Mo.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => inputRef.current?.click()}
          >
            {loading ? "Analyse en cours..." : "Importer un fichier"}
          </button>
        </div>
      </div>

      {parsedSchedule ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate/70">Agents detectes</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {parsedSchedule.agents.map((agent) => (
                <StatusBadge key={agent.normalizedName} tone="neutral">
                  {agent.displayName}
                </StatusBadge>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate/70">Dates detectees</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {parsedSchedule.dates.map((date) => (
                <StatusBadge key={date} tone="neutral">
                  {date}
                </StatusBadge>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
