"use client";

import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { C, inputStyle } from "@/lib/design";

export function Badge({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "danger" | "success" | "neutral" }) {
  const tones = {
    gold: { bg: "rgba(198,161,91,0.14)", fg: C.goldBright, bd: "rgba(198,161,91,0.35)" },
    danger: { bg: "rgba(217,105,95,0.14)", fg: C.danger, bd: "rgba(217,105,95,0.4)" },
    success: { bg: "rgba(95,163,122,0.14)", fg: C.success, bd: "rgba(95,163,122,0.35)" },
    neutral: { bg: "rgba(168,175,189,0.1)", fg: C.textSoft, bd: C.border },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        fontSize: 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "3px 9px",
        borderRadius: 999,
        fontFamily: C.mono,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: C.textFaint,
          marginBottom: 6,
          fontFamily: C.mono,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

export function Select({ options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { options: string[] }) {
  return (
    <select {...props} style={{ ...inputStyle, ...(props.style || {}) }}>
      {options.map((o) => (
        <option key={o} value={o} style={{ background: C.bgAlt }}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: { background: C.gold, color: "#1A1508", border: `1px solid ${C.gold}`, fontWeight: 600 },
    ghost: { background: "transparent", color: C.textSoft, border: `1px solid ${C.border}` },
    danger: { background: "transparent", color: C.danger, border: `1px solid rgba(217,105,95,0.4)` },
  } as const;
  return (
    <button
      {...props}
      style={{
        ...styles[variant],
        padding: "10px 18px",
        borderRadius: 8,
        fontSize: 13.5,
        letterSpacing: "0.02em",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "opacity .15s, transform .1s",
        ...(props.style || {}),
      }}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5,6,8,0.72)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "5vh 16px",
        zIndex: 100,
        overflowY: "auto",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          width: "100%",
          maxWidth: wide ? 640 : 460,
          padding: 26,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontFamily: C.serif, fontSize: 20, color: C.text, margin: 0, fontWeight: 400 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: C.textFaint, fontSize: 20, cursor: "pointer", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div>
      <div style={{ color: C.textFaint, fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ color: accent ? C.goldBright : C.text, fontWeight: accent ? 600 : 400 }}>{value}</div>
    </div>
  );
}
