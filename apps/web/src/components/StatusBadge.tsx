import type { ReactNode } from "react";

interface StatusBadgeProps {
  tone: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}

const toneClasses: Record<StatusBadgeProps["tone"], string> = {
  neutral: "bg-slate/10 text-slate",
  success: "bg-mint/15 text-mint",
  warning: "bg-amber/15 text-amber",
  danger: "bg-coral/15 text-coral"
};

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
