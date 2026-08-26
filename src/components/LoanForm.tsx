"use client";

import { useMemo, useState } from "react";
import { C, inputStyle } from "@/lib/design";
import { Button, Field, Select, TextInput } from "@/components/ui";
import BarcodeUpload from "@/components/BarcodeUpload";
import { calculateAnnuitySchedule, fmtEUR, uid } from "@/lib/loans";
import type { Installment, Loan, RepaymentType, Vrsta } from "@/lib/types";

const VRSTE_ZADUZENJA: Vrsta[] = ["Kredit", "Leasing", "Osiguranje"];
const REPAYMENT_LABELS: Record<RepaymentType, string> = {
  fixed: "Fiksna rata (ista svaki mjesec)",
  annuity: "Anuitet (izračunaj raspored)",
  custom: "Ručni raspored (rate se razlikuju)",
};

export type LoanFormData = Omit<Loan, "id"> & { id: string };
export type ScheduleRow = Omit<Installment, "id" | "loan_id"> & { id: string };

/** Interna radna verzija forme: numerička polja drže se kao string dok se uređuju, konvertiraju se u broj tek pri spremanju. */
type Draft = Omit<
  LoanFormData,
  "dan_naplate" | "iznos_rate" | "pocetna_glavnica" | "kamatna_stopa" | "preostala_glavnica" | "preostali_broj_rata"
> & {
  dan_naplate: string;
  iznos_rate: string;
  pocetna_glavnica: string;
  kamatna_stopa: string;
  preostala_glavnica: string;
  preostali_broj_rata: string;
};

const toDraft = (l: LoanFormData): Draft => ({
  ...l,
  dan_naplate: l.dan_naplate?.toString() ?? "",
  iznos_rate: l.iznos_rate?.toString() ?? "",
  pocetna_glavnica: l.pocetna_glavnica?.toString() ?? "",
  kamatna_stopa: l.kamatna_stopa?.toString() ?? "",
  preostala_glavnica: l.preostala_glavnica?.toString() ?? "",
  preostali_broj_rata: l.preostali_broj_rata?.toString() ?? "",
});

const toLoanFormData = (d: Draft): LoanFormData => ({
  ...d,
  dan_naplate: d.dan_naplate ? Number(d.dan_naplate) : null,
  iznos_rate: d.iznos_rate ? Number(d.iznos_rate) : null,
  pocetna_glavnica: d.pocetna_glavnica ? Number(d.pocetna_glavnica) : null,
  kamatna_stopa: d.kamatna_stopa ? Number(d.kamatna_stopa) : null,
  preostala_glavnica: d.preostala_glavnica ? Number(d.preostala_glavnica) : null,
  preostali_broj_rata: d.preostali_broj_rata ? Number(d.preostali_broj_rata) : null,
});

const emptyLoan = (): LoanFormData => ({
  id: uid(),
  entity_id: "",
  institucija: "",
  naziv: "",
  vrsta: "Kredit",
  repayment_type: "fixed",
  datum_podizanja: "",
  dan_naplate: null,
  iznos_rate: null,
  pocetna_glavnica: null,
  datum_dospijeca: "",
  kamatna_stopa: null,
  preostala_glavnica: null,
  preostali_broj_rata: null,
  upute_placanja: "",
  jamci: "",
  barcode_path: null,
  podaci_azurirano_na: "2026-07-31",
});

export default function LoanForm({
  initial,
  initialSchedule,
  barcodeBucket,
  barcodePathPrefix,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: LoanFormData | null;
  initialSchedule: ScheduleRow[];
  barcodeBucket: "barcodes-business" | "barcodes-private";
  barcodePathPrefix: string;
  onSave: (data: LoanFormData, schedule: ScheduleRow[]) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [f, setF] = useState<Draft>(toDraft(initial || emptyLoan()));
  const [schedule, setSchedule] = useState<ScheduleRow[]>(initialSchedule);
  const [broj_rata, setBrojRata] = useState(String(initialSchedule.length || f.preostali_broj_rata || ""));
  const [datumPrveRate, setDatumPrveRate] = useState(f.datum_podizanja || "");

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const derivedFromSchedule = useMemo(() => {
    const unpaid = schedule.filter((r) => !r.paid).sort((a, b) => a.seq_no - b.seq_no);
    const preostalaGlavnica = unpaid.reduce((s, r) => s + (Number(r.principal_amount) || 0), 0);
    return {
      preostalaGlavnica,
      preostaliBrojRata: unpaid.length,
      sljedecaRata: unpaid[0] || null,
    };
  }, [schedule]);

  const generateAnnuity = () => {
    const principal = Number(f.pocetna_glavnica) || 0;
    const rate = Number(f.kamatna_stopa) || 0;
    const n = parseInt(broj_rata, 10);
    if (!principal || !n || !datumPrveRate) {
      alert("Za generiranje anuiteta unesi početnu glavnicu, kamatnu stopu, broj rata i datum prve rate.");
      return;
    }
    const generated = calculateAnnuitySchedule({
      principal,
      annualRatePercent: rate,
      numberOfInstallments: n,
      startDate: datumPrveRate,
    });
    setSchedule(generated.map((g) => ({ id: uid(), ...g, paid: false })));
  };

  const addCustomRow = () => {
    const seq = schedule.length + 1;
    setSchedule((prev) => [
      ...prev,
      { id: uid(), seq_no: seq, due_date: "", amount: 0, principal_amount: 0, interest_amount: 0, paid: false },
    ]);
  };

  const updateRow = (id: string, patch: Partial<ScheduleRow>) => {
    setSchedule((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setSchedule((prev) => prev.filter((r) => r.id !== id).map((r, i) => ({ ...r, seq_no: i + 1 })));
  };

  const handleSave = () => {
    if (!f.naziv.trim()) return;
    const usesSchedule = f.repayment_type !== "fixed";
    const base = toLoanFormData(f);
    const finalData: LoanFormData = {
      ...base,
      datum_podizanja: base.datum_podizanja || null,
      datum_dospijeca: base.datum_dospijeca || null,
      podaci_azurirano_na: base.podaci_azurirano_na || null,
      preostala_glavnica: usesSchedule ? derivedFromSchedule.preostalaGlavnica : base.preostala_glavnica,
      preostali_broj_rata: usesSchedule ? derivedFromSchedule.preostaliBrojRata : base.preostali_broj_rata,
      iznos_rate: usesSchedule ? derivedFromSchedule.sljedecaRata?.amount ?? base.iznos_rate : base.iznos_rate,
    };
    const cleanSchedule = schedule.filter((r) => r.due_date);
    onSave(finalData, usesSchedule ? cleanSchedule : []);
  };

  return (
    <div>
      <Field label="Naziv financijske institucije">
        <TextInput placeholder="npr. Raiffeisenbank, RBA Leasing..." value={f.institucija} onChange={set("institucija")} />
      </Field>
      <Field label="Naziv zaduženja">
        <TextInput placeholder="npr. Stambeni kredit PBZ" value={f.naziv} onChange={set("naziv")} />
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Vrsta">
            <Select
              options={VRSTE_ZADUZENJA}
              value={f.vrsta}
              onChange={(e) => setF((prev) => ({ ...prev, vrsta: e.target.value as Vrsta }))}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Kamatna stopa (% god.)">
            <TextInput type="number" step="0.01" placeholder="4.5" value={f.kamatna_stopa} onChange={set("kamatna_stopa")} />
          </Field>
        </div>
      </div>

      <Field label="Način otplate">
        <Select
          options={Object.values(REPAYMENT_LABELS)}
          value={REPAYMENT_LABELS[f.repayment_type]}
          onChange={(e) => {
            const entry = (Object.entries(REPAYMENT_LABELS) as [RepaymentType, string][]).find(
              ([, label]) => label === e.target.value
            );
            if (entry) setF((prev) => ({ ...prev, repayment_type: entry[0] }));
          }}
        />
      </Field>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Datum podizanja kredita">
            <TextInput type="date" value={f.datum_podizanja ?? ""} onChange={set("datum_podizanja")} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Datum konačnog dospijeća">
            <TextInput type="date" value={f.datum_dospijeca ?? ""} onChange={set("datum_dospijeca")} />
          </Field>
        </div>
      </div>

      {f.repayment_type === "fixed" && (
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="Dan u mjesecu naplate rate">
              <TextInput type="number" min="1" max="31" placeholder="npr. 15" value={f.dan_naplate} onChange={set("dan_naplate")} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Iznos rate">
              <TextInput type="number" step="0.01" placeholder="0.00" value={f.iznos_rate} onChange={set("iznos_rate")} />
            </Field>
          </div>
        </div>
      )}

      {f.repayment_type !== "fixed" && (
        <div
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
            background: C.bgAlt,
          }}
        >
          {f.repayment_type === "annuity" && (
            <>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Početna glavnica (iznos kredita)">
                    <TextInput type="number" step="0.01" value={f.pocetna_glavnica} onChange={set("pocetna_glavnica")} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="Broj rata">
                    <TextInput type="number" value={broj_rata} onChange={(e) => setBrojRata(e.target.value)} />
                  </Field>
                </div>
              </div>
              <Field label="Datum prve rate">
                <TextInput type="date" value={datumPrveRate} onChange={(e) => setDatumPrveRate(e.target.value)} />
              </Field>
              <Button type="button" variant="ghost" onClick={generateAnnuity} style={{ marginBottom: 14 }}>
                ⚙ Generiraj raspored rata
              </Button>
            </>
          )}

          {schedule.length > 0 && (
            <div style={{ overflowX: "auto", marginBottom: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, fontFamily: C.mono }}>
                <thead>
                  <tr>
                    {["#", "Datum", "Iznos rate", "Glavnica", "Kamata", "Plaćeno", ""].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: C.textFaint, fontWeight: 400 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((r) => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "4px 8px", color: C.textSoft }}>{r.seq_no}</td>
                      <td style={{ padding: "4px 8px" }}>
                        <input
                          type="date"
                          value={r.due_date}
                          onChange={(e) => updateRow(r.id, { due_date: e.target.value })}
                          style={{ ...inputStyle, padding: "5px 8px", fontSize: 12.5 }}
                        />
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        <input
                          type="number"
                          step="0.01"
                          value={r.amount}
                          onChange={(e) => updateRow(r.id, { amount: Number(e.target.value) })}
                          style={{ ...inputStyle, padding: "5px 8px", fontSize: 12.5, width: 90 }}
                        />
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        <input
                          type="number"
                          step="0.01"
                          value={r.principal_amount ?? 0}
                          onChange={(e) => updateRow(r.id, { principal_amount: Number(e.target.value) })}
                          style={{ ...inputStyle, padding: "5px 8px", fontSize: 12.5, width: 90 }}
                        />
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        <input
                          type="number"
                          step="0.01"
                          value={r.interest_amount ?? 0}
                          onChange={(e) => updateRow(r.id, { interest_amount: Number(e.target.value) })}
                          style={{ ...inputStyle, padding: "5px 8px", fontSize: 12.5, width: 90 }}
                        />
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "center" }}>
                        <input type="checkbox" checked={r.paid} onChange={(e) => updateRow(r.id, { paid: e.target.checked })} />
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          style={{ background: "none", border: "none", color: C.danger, cursor: "pointer" }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Button type="button" variant="ghost" onClick={addCustomRow}>
            + Dodaj ratu ručno
          </Button>

          {schedule.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: C.textSoft, fontFamily: C.mono }}>
              Preostalo rata: <strong style={{ color: C.goldBright }}>{derivedFromSchedule.preostaliBrojRata}</strong> · Preostala
              glavnica: <strong style={{ color: C.goldBright }}>{fmtEUR(derivedFromSchedule.preostalaGlavnica)}</strong>
            </div>
          )}
        </div>
      )}

      {f.repayment_type === "fixed" && (
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="Preostala glavnica">
              <TextInput type="number" step="0.01" placeholder="0.00" value={f.preostala_glavnica} onChange={set("preostala_glavnica")} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Preostali broj rata">
              <TextInput type="number" placeholder="0" value={f.preostali_broj_rata} onChange={set("preostali_broj_rata")} />
            </Field>
          </div>
        </div>
      )}

      <Field label="Podaci točni na dan">
        <TextInput type="date" value={f.podaci_azurirano_na ?? ""} onChange={set("podaci_azurirano_na")} />
      </Field>

      <Field label="Upute za plaćanje (IBAN, poziv na broj, model...)">
        <textarea
          value={f.upute_placanja}
          onChange={set("upute_placanja")}
          rows={3}
          style={{ ...inputStyle, resize: "vertical", fontFamily: C.mono, fontSize: 13 }}
          placeholder="HR00 0000 0000 0000 0000 0, model HR00, poziv na broj ..."
        />
      </Field>
      <Field label="Jamac / jamci kredita">
        <TextInput placeholder="npr. Ivan Ivić, Ana Anić" value={f.jamci} onChange={set("jamci")} />
      </Field>
      <Field label="Barkod / uplatnica">
        <BarcodeUpload
          bucket={barcodeBucket}
          pathPrefix={barcodePathPrefix}
          path={f.barcode_path}
          onChange={(p) => setF((prev) => ({ ...prev, barcode_path: p }))}
        />
      </Field>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
        <div>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Obriši
            </Button>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Odustani
          </Button>
          <Button type="button" variant="primary" onClick={handleSave}>
            Spremi
          </Button>
        </div>
      </div>
    </div>
  );
}
