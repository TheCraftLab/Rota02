import { useState } from "react";

interface AdminLoginProps {
  loading: boolean;
  onLogin: (password: string) => Promise<void>;
}

export function AdminLogin({ loading, onLogin }: AdminLoginProps) {
  const [password, setPassword] = useState("");

  return (
    <section className="panel-surface mx-auto max-w-md rounded-4xl border border-gray-100 p-8 shadow-panel">
      <p className="text-xs font-medium uppercase tracking-widest text-slate/50">Acces admin</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink">Connexion requise</h2>
      <p className="mt-2 text-sm text-slate">
        Entrez le mot de passe administrateur pour acceder a l'import, a la generation et a la publication.
      </p>

      <form
        className="mt-6 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onLogin(password);
        }}
      >
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-slate/70">Mot de passe</span>
          <input
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-ink outline-none ring-amber/30 transition focus:border-amber/60 focus:ring-4"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mot de passe admin"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </section>
  );
}
