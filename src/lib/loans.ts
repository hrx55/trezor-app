import type { Installment } from "./types";

export function fmtEUR(n: number | null | undefined) {
  const v = Number(n) || 0;
  return v.toLocaleString("hr-HR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function daysUntil(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** Sljedeći datum naplate na temelju dana u mjesecu. */
export function nextPaymentDate(danNaplate: number | null | undefined): string | null {
  const d = Number(danNaplate);
  if (!d || d < 1 || d > 31) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let candidate = new Date(today.getFullYear(), today.getMonth(), d);
  if (candidate < today) {
    candidate = new Date(today.getFullYear(), today.getMonth() + 1, d);
  }
  const yyyy = candidate.getFullYear();
  const mm = String(candidate.getMonth() + 1).padStart(2, "0");
  const dd = String(candidate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Anuitetski izračun: jednaka rata kroz cijeli vijek kredita, s promjenjivim
 * omjerom kamate/glavnice po rati (standardna francuska amortizacija).
 */
export function calculateAnnuitySchedule(params: {
  principal: number;
  annualRatePercent: number;
  numberOfInstallments: number;
  startDate: string; // YYYY-MM-DD prve rate
}): { seq_no: number; due_date: string; amount: number; principal_amount: number; interest_amount: number }[] {
  const { principal, annualRatePercent, numberOfInstallments, startDate } = params;
  const monthlyRate = annualRatePercent / 100 / 12;
  const n = numberOfInstallments;

  const payment =
    monthlyRate === 0
      ? principal / n
      : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));

  const schedule = [];
  let balance = principal;
  const [y, m, d] = startDate.split("-").map(Number);

  for (let i = 1; i <= n; i++) {
    const interest = balance * monthlyRate;
    let principalPortion = payment - interest;
    if (i === n) principalPortion = balance; // zaokruživanje zadnje rate na točan ostatak
    balance = Math.max(0, balance - principalPortion);

    const dueDate = new Date(y, m - 1 + (i - 1), d);
    const yyyy = dueDate.getFullYear();
    const mm = String(dueDate.getMonth() + 1).padStart(2, "0");
    const dd = String(dueDate.getDate()).padStart(2, "0");

    schedule.push({
      seq_no: i,
      due_date: `${yyyy}-${mm}-${dd}`,
      amount: Math.round((principalPortion + interest) * 100) / 100,
      principal_amount: Math.round(principalPortion * 100) / 100,
      interest_amount: Math.round(interest * 100) / 100,
    });
  }
  return schedule;
}

/** Sljedeća neplaćena rata iz custom/anuitetskog rasporeda. */
export function nextInstallment(installments: Installment[]): Installment | null {
  const unpaid = installments.filter((i) => !i.paid).sort((a, b) => a.seq_no - b.seq_no);
  return unpaid[0] || null;
}

export function uid() {
  return crypto.randomUUID();
}
