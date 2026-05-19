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
    <section className="panel-surface rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-panel">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate/50 dark:text-gray-500">Import NICE WFM</p>
          <h2 className="mt-2 text-xl font-semibold text-ink dark:text-white">Upload PDF or text export</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-slate dark:text-gray-400">
            The parser reconstructs agents, dates and time slots, keeping the raw data
            to regenerate rotation without reimport.
          </p>
        </div>
        {parsedSchedule ? <StatusBadge tone="success">{parsedSchedule.agents.length} agent(s)</StatusBadge> : null}
      </div>

      <div
        className={`rounded-xl border-2 border-dashed p-8 transition ${
          dragOver ? "border-accent-500 bg-accent-500/5 dark:border-accent-500 dark:bg-accent-500/10" : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-slate-700"
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
            <p className="text-sm font-medium text-ink dark:text-white">Drag and drop your schedule file</p>
            <p className="mt-1 text-xs text-slate dark:text-gray-400">
              Supported formats: PDF, TXT, CSV, LOG — up to 10 MB.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => inputRef.current?.click()}
          >
            {loading ? "Analyzing..." : "Import file"}
          </button>
        </div>
      </div>

      {parsedSchedule ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-slate/50 dark:text-gray-500">Detected agents</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {parsedSchedule.agents.map((agent) => (
                <StatusBadge key={agent.normalizedName} tone="neutral">
                  {agent.displayName}
                </StatusBadge>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-slate/50 dark:text-gray-500">Detected dates</p>
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
