import type { CSSProperties } from "react";

export const C = {
  bg: "#0D0F13",
  bgAlt: "#12151B",
  surface: "#181C24",
  surfaceHover: "#20252F",
  border: "#2A303C",
  borderLight: "#363D4A",
  gold: "#C6A15B",
  goldBright: "#E4C88A",
  goldDim: "#8A733F",
  text: "#ECE8DF",
  textSoft: "#A8AFBD",
  textFaint: "#6B7280",
  danger: "#D9695F",
  dangerBg: "#2A1917",
  success: "#5FA37A",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'SF Mono', 'Courier New', monospace",
} as const;

export const inputStyle: CSSProperties = {
  width: "100%",
  background: C.bgAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  padding: "10px 12px",
  fontSize: 14.5,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};
