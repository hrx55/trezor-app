"use client";

import { C } from "@/lib/design";
import { Badge, Stat } from "@/components/ui";
import { daysUntil, fmtDate, fmtEUR, nextInstallment, nextPaymentDate } from "@/lib/loans";
import type { Installment, Loan, LoanStatus } from "@/lib/types";

const STATUS_LABELS: Record<LoanStatus, string> = {
  aktivno: "Aktivno",
  otplaceno: "Otplaćeno",
  zatvoreno: "Zatvoreno",
  arhivirano: "Arhivirano",
};
const STATUS_TONE: Record<LoanStatus, "gold" | "success" | "neutral"> = {
  aktivno: "gold",
  otplaceno: "success",
  zatvoreno: "neutral",
  arhivirano: "neutral",
};

export function loanNextPayment(loan: Loan, installments: Installment[]) {
  if (loan.vrsta === "Osiguranje") {
    return loan.datum_sljedece_uplate;
  }
  if (loan.repayment_type === "fixed") {
    return nextPaymentDate(loan.dan_naplate);
  }
  const next = nextInstallment(installments);
  return next?.due_date ?? null;
}

export default function LoanCard({
  loan,
  installments,
  onEdit,
}: {
  loan: Loan;
  installments: Installment[];
  onEdit: () => void;
}) {
  const isInsurance = loan.vrsta === "Osiguranje";
  const np = loanNextPayment(loan, installments);
  const dLeft = daysUntil(np);
  const dueSoon = dLeft !== null && dLeft <= 2 && dLeft >= 0;
  const overdue = dLeft !== null && dLeft < 0;
  const policyDaysLeft = isInsurance ? daysUntil(loan.polica_istek) : null;
  const policyExpiringSoon = policyDaysLeft !== null && policyDaysLeft <= 30 && policyDaysLeft >= 0;

  return (
    <div
      onClick={onEdit}
      style={{
        background: C.surface,
        border: `1px solid ${dueSoon || policyExpiringSoon ? "rgba(217,105,95,0.5)" : C.border}`,
        borderRadius: 12,
        padding: "18px 20px",
        marginBottom: 14,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: C.serif, fontSize: 17.5, color: C.text }}>{loan.naziv || "Bez naziva"}</div>
          <div style={{ fontSize: 12, color: C.goldDim, marginTop: 3, fontFamily: C.mono }}>
            {loan.institucija ? loan.institucija + " · " : ""}
            {loan.vrsta}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {overdue && <Badge tone="danger">Kasni naplata</Badge>}
          {dueSoon && <Badge tone="danger">Naplata za {dLeft === 0 ? "danas" : dLeft + " dan(a)"}</Badge>}
          {policyExpiringSoon && <Badge tone="danger">Istek police za {policyDaysLeft} dan(a)</Badge>}
          <Badge tone={STATUS_TONE[loan.status]}>{STATUS_LABELS[loan.status]}</Badge>
          {!isInsurance && loan.repayment_type !== "fixed" && (
            <Badge tone="gold">{loan.repayment_type === "annuity" ? "Anuitet" : "Ručni raspored"}</Badge>
          )}
        </div>
      </div>

      {!isInsurance && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "10px 22px",
            fontFamily: C.mono,
            fontSize: 13,
          }}
        >
          <Stat label="Podignut" value={fmtDate(loan.datum_podizanja)} />
          <Stat label="Sljedeća naplata" value={np ? fmtDate(np) : "—"} />
          <Stat label="Rata" value={fmtEUR(loan.iznos_rate)} accent />
          <Stat label="Dospijeće" value={fmtDate(loan.datum_dospijeca)} />
          <Stat label="Kamata" value={(loan.kamatna_stopa ?? 0) + " %"} />
          <Stat label="Preostala glavnica" value={fmtEUR(loan.preostala_glavnica)} accent />
          <Stat label="Preostalo rata" value={loan.preostali_broj_rata ?? 0} />
        </div>
      )}

      {isInsurance && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "10px 22px",
            fontFamily: C.mono,
            fontSize: 13,
          }}
        >
          <Stat label="Broj police" value={loan.polica_broj || "—"} />
          <Stat label="Predmet osiguranja" value={loan.predmet_osiguranja || "—"} />
          <Stat label="Početak police" value={fmtDate(loan.polica_pocetak)} />
          <Stat label="Istek police" value={fmtDate(loan.polica_istek)} />
          <Stat label="Ukupna premija" value={fmtEUR(loan.ukupna_premija)} accent />
          <Stat label="Sljedeće plaćanje" value={np ? fmtDate(np) : "—"} />
        </div>
      )}

      {loan.jamci && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: C.mono }}>
          <span style={{ color: C.textFaint, textTransform: "uppercase", fontSize: 10.5, letterSpacing: "0.05em" }}>Jamac: </span>
          <span style={{ color: C.textSoft }}>{loan.jamci}</span>
        </div>
      )}
      {loan.napomena && (
        <div style={{ marginTop: 8, fontSize: 12.5, fontFamily: C.mono, color: C.textSoft }}>
          <span style={{ color: C.textFaint, textTransform: "uppercase", fontSize: 10.5, letterSpacing: "0.05em" }}>Napomena: </span>
          {loan.napomena}
        </div>
      )}
      <div style={{ marginTop: 8, display: "flex", gap: 14, fontSize: 11, color: C.textFaint, fontFamily: C.mono, flexWrap: "wrap" }}>
        {loan.podaci_azurirano_na && <span>Podaci točni na dan: {fmtDate(loan.podaci_azurirano_na)}</span>}
        {loan.updated_at && <span>Zadnje uređeno: {fmtDate(loan.updated_at.slice(0, 10))}</span>}
      </div>
    </div>
  );
}
