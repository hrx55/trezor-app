import type { Installment, Loan } from "./types";

/**
 * Automatsko odbijanje rata. Spremljena stanja (preostala glavnica, broj rata) su zadnje ručno
 * provjereno stanje na dan `podaci_azurirano_na`; ovdje se iz njega izračunava trenutno stanje.
 * Ništa se ne zapisuje u bazu — izračun se radi pri svakom prikazu, pa nema rizika da se rata
 * odbije dvaput i novi unos računovodstva automatski postaje nova osnova.
 */

export interface Projection {
  /** Koliko je rata automatski odbijeno od datuma stanja. */
  applied: number;
  /** Datum stanja od kojeg se računa (podaci_azurirano_na) — samo za fixed. */
  since: string | null;
  baseGlavnica: number | null;
  baseBrojRata: number | null;
}

export type ProjectedLoan = Loan & { projection?: Projection };

const pad = (n: number) => String(n).padStart(2, "0");

export const localIso = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Datum u mjesecu; ako mjesec nema taj dan (npr. 31. u lipnju), vraća zadnji dan mjeseca. */
export function clampedIso(year: number, month0: number, day: number): string {
  const last = new Date(year, month0 + 1, 0).getDate();
  return `${year}-${pad(month0 + 1)}-${pad(Math.min(day, last))}`;
}

/** Svi datumi naplate (dan u mjesecu) u rasponu (after, upTo]. */
export function paymentDatesBetween(dan: number, after: string, upTo: string): string[] {
  const out: string[] = [];
  const [ay, am] = after.split("-").map(Number);
  let y = ay;
  let m = am - 1;
  for (let i = 0; i < 600; i++) {
    const iso = clampedIso(y, m, dan);
    if (iso > upTo) break;
    if (iso > after) out.push(iso);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function projectLoan(loan: Loan, installments: Installment[], today: string = localIso()): ProjectedLoan {
  if (loan.vrsta === "Osiguranje" || loan.status !== "aktivno") return loan;

  if (loan.repayment_type === "fixed") {
    const rata = Number(loan.iznos_rate) || 0;
    const dan = Number(loan.dan_naplate) || 0;
    const base = loan.preostala_glavnica;
    const count = loan.preostali_broj_rata;
    const anchor = loan.podaci_azurirano_na;
    if (!anchor || dan < 1 || dan > 31 || rata <= 0 || base === null || base <= 0) return loan;
    if (count !== null && count <= 0) return loan;

    const monthlyRate = (Number(loan.kamatna_stopa) || 0) / 1200;
    let balance = base;
    let applied = 0;
    const dueCount = paymentDatesBetween(dan, anchor, today).length;
    for (let i = 0; i < dueCount; i++) {
      if (balance <= 0 || (count !== null && applied >= count)) break;
      const interest = round2(balance * monthlyRate);
      const principalPart = Math.min(balance, Math.max(0, rata - interest));
      balance = round2(balance - principalPart);
      applied++;
    }
    if (applied === 0) return loan;

    return {
      ...loan,
      preostala_glavnica: balance,
      preostali_broj_rata: count === null ? null : count - applied,
      projection: { applied, since: anchor, baseGlavnica: base, baseBrojRata: count },
    };
  }

  // anuitet / ručni raspored: raspored je vremenski određen, pa je rata plaćena kad dospije
  if (installments.length === 0) return loan;
  const isPaid = (r: Installment) => r.paid || r.due_date <= today;
  const open = installments.filter((r) => !isPaid(r));
  const autoPaid = installments.filter((r) => !r.paid && r.due_date <= today).length;
  if (autoPaid === 0) return loan;

  const remaining = round2(open.reduce((s, r) => s + (Number(r.principal_amount) || 0), 0));
  const next = [...open].sort((a, b) => a.seq_no - b.seq_no)[0];
  return {
    ...loan,
    preostala_glavnica: remaining,
    preostali_broj_rata: open.length,
    iznos_rate: next ? next.amount : loan.iznos_rate,
    projection: { applied: autoPaid, since: null, baseGlavnica: loan.preostala_glavnica, baseBrojRata: loan.preostali_broj_rata },
  };
}

/** Sljedeći datum naplate za raspored: prva neplaćena rata koja dospijeva danas ili kasnije. */
export function nextScheduledDate(installments: Installment[], today: string = localIso()): string | null {
  const upcoming = installments
    .filter((r) => !r.paid && r.due_date >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  return upcoming[0]?.due_date ?? null;
}
