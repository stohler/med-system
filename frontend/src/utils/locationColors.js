const LOCATION_PALETTE = [
  { bg: "#eef2ff", border: "#6366f1", text: "#312e81" },
  { bg: "#ecfeff", border: "#06b6d4", text: "#155e75" },
  { bg: "#f0fdf4", border: "#22c55e", text: "#14532d" },
  { bg: "#fff7ed", border: "#f97316", text: "#9a3412" },
  { bg: "#fff1f2", border: "#f43f5e", text: "#881337" },
  { bg: "#f5f3ff", border: "#8b5cf6", text: "#4c1d95" },
  { bg: "#f0f9ff", border: "#0ea5e9", text: "#0c4a6e" },
];

function hashString(value) {
  let hash = 0;
  const source = String(value || "");
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getLocationColor(locationId) {
  const index = hashString(locationId || "default") % LOCATION_PALETTE.length;
  return LOCATION_PALETTE[index];
}
