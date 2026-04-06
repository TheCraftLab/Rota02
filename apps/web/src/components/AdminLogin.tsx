import { useState } from "react";

interface AdminLoginProps {
  loading: boolean;
  onLogin: (password: string) => Promise<void>;
}

export function AdminLogin({ loading, onLogin }: AdminLoginProps) {
  const [password, setPassword] = useState("");

  return (
    <section className="panel-surface mx-auto max-w-xl rounded-4xl border border-white/70 p-8 shadow-panel">
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate/70">Acces admin</p>
      <h2 className="mt-2 text-3xl font-semibold text-ink">Connexion requise</h2>
      <p className="mt-3 text-sm text-slate">
        Entrez le mot de passe administrateur pour acceder a l'import, a la generation et a la publication.
      </p>

      <form
        className="mt-6 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onLogin(password);
        }}
      >
        <label className="rounded-3xl bg-white/70 p-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate/70">Mot de passe</span>
          <input
            className="mt-3 w-full rounded-2xl border border-slate/15 bg-white px-3 py-3 text-sm text-ink outline-none ring-amber/30 transition focus:ring-4"
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
          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </section>
  );
}
