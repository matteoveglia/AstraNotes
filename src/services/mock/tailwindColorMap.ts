const tailwindHexMap: Record<string, string> = {
  "text-blue-600": "#2563EB",
  "text-blue-500": "#3B82F6",
  "text-emerald-600": "#047857",
  "text-emerald-500": "#10B981",
  "text-amber-600": "#D97706",
  "text-amber-500": "#F59E0B",
  "text-green-600": "#16A34A",
  "text-green-500": "#22C55E",
  "text-violet-600": "#7C3AED",
  "text-violet-500": "#8B5CF6",
  "text-zinc-400": "#A1A1AA",
  "text-zinc-500": "#71717A",
  "text-zinc-600": "#52525B",
  "text-indigo-600": "#4F46E5",
  "text-orange-500": "#F97316",
  "text-red-600": "#DC2626",
  "text-emerald-900": "#064E3B",
  "text-emerald-300": "#6EE7B7",
  "bg-blue-100": "#DBEAFE",
  "bg-emerald-100": "#D1FAE5",
  "bg-amber-100": "#FEF3C7",
  "bg-green-100": "#DCFCE7",
  "bg-violet-100": "#EDE9FE",
  "bg-orange-100": "#FFEDD5",
  "bg-red-100": "#FEE2E2",
  "bg-zinc-100": "#F4F4F5",
  "bg-emerald-900/70": "rgba(6, 78, 59, 0.7)",
  "bg-emerald-800/70": "rgba(6, 95, 70, 0.7)",
};

export const tailwindTokenToHex = (
  token?: string,
  fallback = "#64748B",
): string => {
  if (!token) {
    return fallback;
  }
  return tailwindHexMap[token] ?? fallback;
};
