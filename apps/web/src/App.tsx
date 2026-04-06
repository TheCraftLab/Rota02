import { useDeferredValue, useEffect, useState, useTransition } from "react";
import {
  DEFAULT_SETTINGS,
  normalizeName,
  summarizeRotation,
  toClipboardTable,
  type ParsedSchedule,
  type RotationCell,
  type RotationResult,
  type RotationSettings
} from "@rota/core";
import { AdminLogin } from "./components/AdminLogin";
import { InspectorDrawer } from "./components/InspectorDrawer";
import { RotationTable } from "./components/RotationTable";
import { SettingsPanel } from "./components/SettingsPanel";
import { SummaryPanel } from "./components/SummaryPanel";
import { UploadCard } from "./components/UploadCard";
import { StatusBadge } from "./components/StatusBadge";
import {
  downloadExport,
  fetchAdminSession,
  fetchPublishedRotation,
  generateRotationRequest,
  loginAdmin,
  logoutAdmin,
  parseFile,
  publishRotation,
  type PublishedRotationResponse
} from "./lib/api";
import { saveBlob } from "./lib/download";

function cellKey(cell: RotationCell): string {
  return `${cell.date}-${cell.slotStart}`;
}

function resolveAgentKey(agentId: string | null, agentName: string): string {
  return agentId ?? normalizeName(agentName);
}

function getPathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname || "/";
}

function navigateTo(pathname: string, onChange: (pathname: string) => void): void {
  if (typeof window === "undefined") {
    return;
  }

  window.history.pushState({}, "", pathname);
  onChange(pathname);
}

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

interface RouteLinkProps {
  active: boolean;
  children: string;
  href: string;
  onNavigate: (href: string) => void;
}

function RouteLink({ active, children, href, onNavigate }: RouteLinkProps) {
  return (
    <button
      type="button"
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-ink text-white" : "border border-slate/15 bg-white/80 text-slate hover:bg-white"
      }`}
      onClick={() => onNavigate(href)}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [pathname, setPathname] = useState<string>(getPathname);
  const [parsedSchedule, setParsedSchedule] = useState<ParsedSchedule | null>(null);
  const [settings, setSettings] = useState<RotationSettings>(DEFAULT_SETTINGS);
  const [rotation, setRotation] = useState<RotationResult | null>(null);
  const [published, setPublished] = useState<PublishedRotationResponse | null>(null);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminChecking, setAdminChecking] = useState(true);
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publishLoading, setPublishLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<"csv" | "xlsx" | "pdf" | "copy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredRotation = useDeferredValue(rotation);
  const selectedCell =
    deferredRotation?.cells.find((cell) => cellKey(cell) === selectedCellKey) ?? null;
  const isAdminRoute = pathname.startsWith("/admin");

  useEffect(() => {
    const handlePopState = () => setPathname(getPathname());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPublished() {
      setPublicLoading(true);
      try {
        const nextPublished = await fetchPublishedRotation();
        if (!cancelled) {
          setPublished(nextPublished);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Erreur de chargement public.");
        }
      } finally {
        if (!cancelled) {
          setPublicLoading(false);
        }
      }
    }

    void loadPublished();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminSession() {
      if (!isAdminRoute) {
        setAdminChecking(false);
        return;
      }

      setAdminChecking(true);
      try {
        const session = await fetchAdminSession();
        if (!cancelled) {
          setAdminAuthenticated(session.authenticated);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Erreur de session admin.");
          setAdminAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setAdminChecking(false);
        }
      }
    }

    void loadAdminSession();

    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);

  function handleAuthError(caughtError: unknown, fallback: string): string {
    if (caughtError instanceof Error && caughtError.name === "AuthError") {
      setAdminAuthenticated(false);
      return "Authentification admin requise.";
    }

    return caughtError instanceof Error ? caughtError.message : fallback;
  }

  async function handleFileSelected(file: File) {
    setParseLoading(true);
    setError(null);

    try {
      const response = await parseFile(file);
      startTransition(() => {
        setParsedSchedule(response.parsedSchedule);
        setSettings(response.settings);
        setRotation(null);
        setSelectedCellKey(null);
      });
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur d'import."));
    } finally {
      setParseLoading(false);
    }
  }

  function updateSettings(patch: Partial<RotationSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  async function handleGenerate() {
    if (!parsedSchedule) {
      return;
    }

    setGenerationLoading(true);
    setError(null);

    try {
      const nextRotation = await generateRotationRequest(parsedSchedule, settings);
      startTransition(() => {
        setRotation(nextRotation);
        setSelectedCellKey(nextRotation.cells[0] ? cellKey(nextRotation.cells[0]) : null);
      });
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de generation."));
    } finally {
      setGenerationLoading(false);
    }
  }

  async function handlePublish() {
    if (!rotation) {
      return;
    }

    setPublishLoading(true);
    setError(null);
    try {
      const nextPublished = await publishRotation(rotation);
      setPublished(nextPublished);
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de publication."));
    } finally {
      setPublishLoading(false);
    }
  }

  async function handleExport(kind: "csv" | "xlsx" | "pdf") {
    if (!rotation) {
      return;
    }

    setExportLoading(kind);
    setError(null);
    try {
      const blob = await downloadExport(rotation, kind);
      saveBlob(blob, `rotation-chat.${kind}`);
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur d'export."));
    } finally {
      setExportLoading(null);
    }
  }

  async function handleCopy() {
    if (!rotation) {
      return;
    }

    setExportLoading("copy");
    setError(null);
    try {
      await navigator.clipboard.writeText(toClipboardTable(rotation));
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Impossible de copier le tableau."));
    } finally {
      setExportLoading(null);
    }
  }

  async function handleAdminLogin(password: string) {
    setAdminLoginLoading(true);
    setError(null);

    try {
      const session = await loginAdmin(password);
      setAdminAuthenticated(session.authenticated);
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de connexion admin."));
    } finally {
      setAdminLoginLoading(false);
    }
  }

  async function handleAdminLogout() {
    setError(null);
    try {
      await logoutAdmin();
      setAdminAuthenticated(false);
    } catch (caughtError) {
      setError(handleAuthError(caughtError, "Erreur de deconnexion admin."));
    }
  }

  function handleManualAssign(cell: RotationCell, agentKey: string | null) {
    if (!rotation || !parsedSchedule) {
      return;
    }

    startTransition(() => {
      const nextCells = rotation.cells.map((currentCell) => {
        if (cellKey(currentCell) !== cellKey(cell)) {
          return currentCell;
        }

        if (!agentKey) {
          return {
            ...currentCell,
            assignedAgentId: null,
            assignedAgentName: "Non couvert",
            status: "manual" as const,
            reasons: ["Affectation manuelle: creneau laisse non couvert."],
            manualOverride: currentCell.manualOverride
              ? { ...currentCell.manualOverride, forced: false }
              : {
                  forced: false,
                  originalAgentId: currentCell.assignedAgentId,
                  originalAgentName: currentCell.assignedAgentName
                }
          };
        }

        const agent = parsedSchedule.agents.find(
          (item) => resolveAgentKey(item.agentId, item.displayName) === agentKey
        );
        const candidate = currentCell.candidates.find(
          (item) => resolveAgentKey(item.agentId, item.agentName) === agentKey
        );
        const forced = candidate ? !candidate.eligible : true;

        return {
          ...currentCell,
          assignedAgentId: agent?.agentId ?? candidate?.agentId ?? null,
          assignedAgentName: agent?.displayName ?? candidate?.agentName ?? "Non couvert",
          status: "manual" as const,
          reasons: [
            forced
              ? "Affectation manuelle forcee sur un agent non eligible selon les regles actuelles."
              : "Affectation manuelle realisee sur un agent eligible."
          ],
          manualOverride: currentCell.manualOverride
            ? { ...currentCell.manualOverride, forced }
            : {
                forced,
                originalAgentId: currentCell.assignedAgentId,
                originalAgentName: currentCell.assignedAgentName
              }
        };
      });

      setRotation({
        ...rotation,
        cells: nextCells,
        summary: summarizeRotation(nextCells, parsedSchedule.agents)
      });
    });
  }

  if (!isAdminRoute) {
    return (
      <main className="mx-auto max-w-[1600px] overflow-x-clip px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <div className="panel-surface rounded-4xl border border-white/70 px-6 py-6 shadow-panel sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-slate/60">Atelier11.app</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Planning Chat</h1>
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-3xl border border-coral/25 bg-coral/10 px-5 py-4 text-sm text-coral">
            {error}
          </div>
        ) : null}

        {publicLoading ? (
          <section className="panel-surface rounded-4xl border border-white/70 p-10 text-center shadow-panel">
            <p className="text-lg font-semibold text-ink">Chargement de la rotation publiee...</p>
          </section>
        ) : published?.rotation ? (
          <div className="grid gap-6">
            <RotationTable
              rotation={published.rotation}
              selectedCellKey={null}
              interactive={false}
              title="Rotation chat"
              description={`Publication du ${formatPublishedAt(published.publishedAt)}`}
              density="kiosk"
            />
          </div>
        ) : (
          <section className="panel-surface rounded-4xl border border-white/70 p-10 text-center shadow-panel">
            <p className="text-lg font-semibold text-ink">Aucune rotation n'est encore publiee.</p>
            <p className="mt-2 text-sm text-slate">
              Passez par l'administration pour importer un fichier NICE WFM, generer une rotation puis la publier.
            </p>
          </section>
        )}

        <footer className="mt-8 border-t border-slate/10 px-2 pt-6 text-sm text-slate">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Atelier11.app</p>
            {published?.publishedAt ? (
              <p>Derniere mise a jour: {formatPublishedAt(published.publishedAt)}</p>
            ) : null}
            <button
              type="button"
              className="text-left font-semibold text-slate underline underline-offset-4 hover:text-ink sm:text-right"
              onClick={() => navigateTo("/admin", setPathname)}
            >
              Acces administration
            </button>
          </div>
        </footer>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] overflow-x-clip px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.34em] text-slate/70">Atelier11.app - Administration</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Generez puis publiez la rotation de chat.
          </h1>
          <p className="mt-4 max-w-3xl text-base text-slate">
            L'administration gere l'import NICE WFM, la generation, les retouches et la publication vers l'index public.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RouteLink active={pathname === "/admin"} href="/admin" onNavigate={(href) => navigateTo(href, setPathname)}>
            Admin
          </RouteLink>
          <RouteLink active={false} href="/" onNavigate={(href) => navigateTo(href, setPathname)}>
            Voir l'index public
          </RouteLink>
          {published?.publishedAt ? (
            <StatusBadge tone="success">Derniere publication {formatPublishedAt(published.publishedAt)}</StatusBadge>
          ) : null}
          <StatusBadge tone={isPending ? "warning" : "success"}>{isPending ? "Mise a jour..." : "Pret"}</StatusBadge>
          {adminAuthenticated ? (
            <button
              type="button"
              className="rounded-full border border-slate/15 bg-white/80 px-4 py-2 text-sm font-semibold text-slate hover:bg-white"
              onClick={() => void handleAdminLogout()}
            >
              Se deconnecter
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="mb-6 rounded-3xl border border-coral/25 bg-coral/10 px-5 py-4 text-sm text-coral">
          {error}
        </div>
      ) : null}

      {adminChecking ? (
        <section className="panel-surface rounded-4xl border border-white/70 p-10 text-center shadow-panel">
          <p className="text-lg font-semibold text-ink">Verification de la session admin...</p>
        </section>
      ) : !adminAuthenticated ? (
        <AdminLogin loading={adminLoginLoading} onLogin={handleAdminLogin} />
      ) : (
      <div className="grid gap-6">
        <UploadCard parsedSchedule={parsedSchedule} loading={parseLoading} onFileSelected={handleFileSelected} />
        <SettingsPanel
          settings={settings}
          disabled={!parsedSchedule}
          loading={generationLoading}
          onGenerate={handleGenerate}
          onSettingsChange={updateSettings}
        />

        {parsedSchedule?.warnings.length ? (
          <section className="panel-surface rounded-4xl border border-white/70 p-6 shadow-panel">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70">Qualite d'import</p>
            <div className="mt-4 grid gap-3">
              {parsedSchedule.warnings.map((warning) => (
                <div key={`${warning.scope}-${warning.message}`} className="rounded-3xl bg-amber/10 px-4 py-3 text-sm text-slate">
                  {warning.message}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {deferredRotation ? (
          <div className="grid gap-6">
            <section className="panel-surface layout-safe overflow-hidden rounded-4xl border border-white/70 p-6 shadow-panel">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-full bg-amber px-5 py-3 text-sm font-semibold text-white"
                  onClick={() => void handlePublish()}
                  disabled={publishLoading}
                >
                  {publishLoading ? "Publication..." : "Publier sur l'index"}
                </button>
                <button
                  type="button"
                  className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
                  onClick={() => void handleExport("xlsx")}
                  disabled={exportLoading !== null}
                >
                  {exportLoading === "xlsx" ? "Export Excel..." : "Exporter en .xlsx"}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate/15 bg-white px-5 py-3 text-sm font-semibold text-slate"
                  onClick={() => void handleExport("pdf")}
                  disabled={exportLoading !== null}
                >
                  {exportLoading === "pdf" ? "Export PDF..." : "Exporter en .pdf"}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate/15 bg-white px-5 py-3 text-sm font-semibold text-slate"
                  onClick={() => void handleExport("csv")}
                  disabled={exportLoading !== null}
                >
                  {exportLoading === "csv" ? "Export CSV..." : "Exporter en .csv"}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate/15 bg-white px-5 py-3 text-sm font-semibold text-slate"
                  onClick={() => void handleCopy()}
                  disabled={exportLoading !== null}
                >
                  {exportLoading === "copy" ? "Copie..." : "Copier le tableau"}
                </button>
              </div>
            </section>
            <RotationTable
              rotation={deferredRotation}
              selectedCellKey={selectedCellKey}
              onSelectCell={(cell) => setSelectedCellKey(cellKey(cell))}
            />
            <SummaryPanel rotation={deferredRotation} />
            <InspectorDrawer
              cell={selectedCell}
              agents={parsedSchedule?.agents ?? []}
              onClose={() => setSelectedCellKey(null)}
              onManualAssign={handleManualAssign}
            />
          </div>
        ) : (
          <section className="panel-surface rounded-4xl border border-white/70 p-10 text-center shadow-panel">
            <p className="text-lg font-semibold text-ink">La rotation apparaitra ici apres analyse et generation.</p>
            <p className="mt-2 text-sm text-slate">
              Une fois publiee, elle sera visible directement sur l'index public du site.
            </p>
          </section>
        )}
      </div>
      )}
    </main>
  );
}
