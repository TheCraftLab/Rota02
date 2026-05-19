import { useState } from "react";

interface AdminLoginProps {
  loading: boolean;
  onLogin: (password: string) => Promise<void>;
}

export function AdminLogin({ loading, onLogin }: AdminLoginProps) {
  const [password, setPassword] = useState("");

  return (
    <section className="panel-surface mx-auto max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 p-8 shadow-panel">
      <p className="text-xs font-medium uppercase tracking-widest text-slate/50 dark:text-gray-500">Admin access</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink dark:text-white">Login required</h2>
      <p className="mt-2 text-sm text-slate dark:text-gray-400">
        Enter the admin password to access import, generation and publishing.
      </p>

      <form
        className="mt-6 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onLogin(password);
        }}
      >
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-slate/70 dark:text-gray-400">Password</span>
          <input
            className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-ink dark:text-white outline-none ring-accent-500/30 transition focus:border-accent-500 dark:focus:border-accent-500 focus:ring-4"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Admin password"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </section>
  );
}
