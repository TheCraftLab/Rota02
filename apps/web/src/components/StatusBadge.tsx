import type { ReactNode } from "react";

interface StatusBadgeProps {
  tone: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}

const toneClasses: Record<StatusBadgeProps["tone"], string> = {
  neutral: "bg-gray-100 text-slate",
  success: "bg-mint/12 text-mint",
  warning: "bg-amber/12 text-amber",
  danger: "bg-coral/12 text-coral"
};

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
