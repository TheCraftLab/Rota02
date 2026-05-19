import type { ReactNode } from "react";

interface StatusBadgeProps {
  tone: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}

const toneClasses: Record<StatusBadgeProps["tone"], string> = {
  neutral: "bg-gray-100 dark:bg-gray-700 text-slate dark:text-gray-300",
  success: "bg-success/12 text-success dark:text-success",
  warning: "bg-accent-500/12 text-accent-500 dark:text-accent-500",
  danger: "bg-danger/12 text-danger dark:text-danger"
};

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
