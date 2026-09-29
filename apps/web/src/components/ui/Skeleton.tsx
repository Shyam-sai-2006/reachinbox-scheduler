import React from "react";

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="w-full animate-pulse divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between py-4 px-6 gap-4"
        >
          <div className="w-1/4 h-4 bg-slate-200 rounded"></div>
          <div className="w-2/5 h-4 bg-slate-200 rounded"></div>
          <div className="w-1/6 h-4 bg-slate-200 rounded"></div>
          <div className="w-16 h-6 bg-slate-200 rounded-full"></div>
        </div>
      ))}
    </div>
  );
};
