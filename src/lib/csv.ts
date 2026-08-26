function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",;\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportToCsv(filename: string, headers: string[], rows: unknown[][]) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(";"));
  const csvContent = "﻿" + lines.join("\r\n"); // BOM za ispravan prikaz č/š/ž u Excelu
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
