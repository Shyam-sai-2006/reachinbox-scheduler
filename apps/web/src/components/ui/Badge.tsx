import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "scheduled" | "sent" | "failed" | "sending" | "neutral" | "success";
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  className,
}) => {
  const styles = {
    scheduled: "bg-amber-50 text-amber-700 border-amber-200/60",
    sending: "bg-blue-50 text-blue-700 border-blue-200/60 animate-pulse",
    sent: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    failed: "bg-rose-50 text-rose-700 border-rose-200/60",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize",
          styles[variant],
          className,
        ),
      )}
    >
      {children}
    </span>
  );
};
