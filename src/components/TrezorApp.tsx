"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/design";
import { Badge, Button, Field, Modal, TextInput } from "@/components/ui";
import LoanForm, { LoanFormData, ScheduleRow } from "@/components/LoanForm";
import LoanCard, { loanNextPayment } from "@/components/LoanCard";
import { daysUntil, fmtDate, fmtEUR } from "@/lib/loans";
import { exportToCsv } from "@/lib/csv";
import type { Entity, EntityType, Installment, Loan } from "@/lib/types";

type View = "home" | "entity" | "total";

export default function TrezorApp({
  entityType,
  headerLabel,
  displayName,
}: {
  entityType: EntityType;
  headerLabel: string;
  displayName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [installments, setInstallments] = useState<Record<string, Installment[]>>({});
  const [view, setView] = useState<View>("home");
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [editingLoan, setEditingLoan] = useState<{ mode: "new" | "edit"; entityId: string; loan?: Loan } | null>(null);
  const [error, setError] = useState("");

  const barcodeBucket = entityType === "business" ? "barcodes-business" : "barcodes-private";

  const load = async () => {
    setError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    const { data: entitiesData, error: entitiesErr } = await supabase
      .from("entities")
      .select("id, name, type, owner_id")
      .eq("type", entityType)
      .order("name");
    if (entitiesErr) {
      setError(entitiesErr.message);
      setLoading(false);
      return;
    }
    setEntities(entitiesData || []);

    const entityIds = (entitiesData || []).map((e) => e.id);
    if (entityIds.length === 0) {
      setLoans([]);
      setInstallments({});
      setLoading(false);
      return;
    }

    const { data: loansData, error: loansErr } = await supabase
      .from("loans")
      .select("*")
      .in("entity_id", entityIds)
      .order("created_at");
    if (loansErr) {
      setError(loansErr.message);
      setLoading(false);
      return;
    }
    setLoans(loansData || []);

    const loanIds = (loansData || []).map((l) => l.id);
    if (loanIds.length > 0) {
      const { data: installmentsData } = await supabase
        .from("installments")
        .select("*")
        .in("loan_id", loanIds)
        .order("seq_no");
      const grouped: Record<string, Installment[]> = {};
      (installmentsData || []).forEach((i) => {
        (grouped[i.loan_id] ||= []).push(i);
      });
      setInstallments(grouped);
    } else {
      setInstallments({});
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const addEntity = async (name: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("entities")
      .insert({ name, type: entityType, owner_id: entityType === "personal" ? userId : null });
    if (error) {
      setError(error.message);
      return;
    }
    setShowAddEntity(false);
    load();
  };

  const saveLoan = async (entityId: string, data: LoanFormData, schedule: ScheduleRow[]) => {
    const supabase = createClient();
    const { id, ...rest } = data;
    const { error: upsertErr } = await supabase.from("loans").upsert({ id, ...rest, entity_id: entityId });
    if (upsertErr) {
      setError(upsertErr.message);
      return;
    }

    await supabase.from("installments").delete().eq("loan_id", id);
    if (schedule.length > 0) {
      const rows = schedule.map((r) => ({
        id: r.id,
        loan_id: id,
        seq_no: r.seq_no,
        due_date: r.due_date,
        amount: r.amount,
        principal_amount: r.principal_amount,
        interest_amount: r.interest_amount,
        paid: r.paid,
      }));
      const { error: instErr } = await supabase.from("installments").insert(rows);
      if (instErr) {
        setError(instErr.message);
        return;
      }
    }

    setEditingLoan(null);
    load();
  };

  const deleteLoan = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("loans").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setEditingLoan(null);
    load();
  };

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.textFaint, fontFamily: C.mono, fontSize: 13 }}>Otvaram trezor…</div>
      </div>
    );
  }

  const entityLoans = (id: string) => loans.filter((l) => l.entity_id === id);
  const totalGlavnica = (id: string) => entityLoans(id).reduce((s, l) => s + (Number(l.preostala_glavnica) || 0), 0);
  const totalRate = (id: string) => entityLoans(id).reduce((s, l) => s + (Number(l.iznos_rate) || 0), 0);
  const activeEntity = entities.find((e) => e.id === activeEntityId) || null;

  const upcoming = loans
    .map((l) => {
      const np = loanNextPayment(l, installments[l.id] || []);
      const d = daysUntil(np);
      return { loan: l, np, d };
    })
    .filter((x) => x.d !== null && x.d <= 2 && x.d >= 0)
    .sort((a, b) => (a.d as number) - (b.d as number));

  const exportTotalCsv = () => {
    const headers = [
      "Subjekt",
      "Institucija",
      "Naziv",
      "Vrsta",
      "Način otplate",
      "Sljedeća naplata",
      "Rata",
      "Dospijeće",
      "Kamata (%)",
      "Preostala glavnica",
      "Preostalo rata",
      "Jamac",
      "Podaci točni na dan",
    ];
    const rows = loans.map((l) => {
      const ent = entities.find((e) => e.id === l.entity_id);
      const np = loanNextPayment(l, installments[l.id] || []);
      return [
        ent?.name ?? "",
        l.institucija,
        l.naziv,
        l.vrsta,
        l.repayment_type,
        np ? fmtDate(np) : "",
        l.iznos_rate ?? "",
        fmtDate(l.datum_dospijeca),
        l.kamatna_stopa ?? "",
        l.preostala_glavnica ?? "",
        l.preostali_broj_rata ?? "",
        l.jamci,
        fmtDate(l.podaci_azurirano_na),
      ];
    });
    exportToCsv(`trezor-${entityType}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "36px 20px 60px" }}>
        <div style={{ marginBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.25em", color: C.gold, fontFamily: C.mono, marginBottom: 6 }}>
              TREZOR · {headerLabel} · {displayName}
            </div>
            <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 30, margin: 0, color: C.text }}>
              {view === "home" && "Pregled zaduženja"}
              {view === "entity" && activeEntity?.name}
              {view === "total" && "Ukupna tablica"}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {view !== "home" && (
              <Button variant="ghost" onClick={() => setView("home")}>
                ← Natrag na izbornik
              </Button>
            )}
            <Button variant="ghost" onClick={signOut}>
              Odjava
            </Button>
          </div>
        </div>

        {error && (
          <div style={{ background: C.dangerBg, border: `1px solid rgba(217,105,95,0.4)`, color: C.danger, padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 18 }}>
            {error}
          </div>
        )}

        {upcoming.length > 0 && view === "home" && (
          <div style={{ background: C.dangerBg, border: `1px solid rgba(217,105,95,0.35)`, borderRadius: 12, padding: "16px 20px", marginBottom: 26 }}>
            <div style={{ color: C.danger, fontFamily: C.mono, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              ⏰ Naplata uskoro
            </div>
            {upcoming.map(({ loan: l, np, d }) => {
              const ent = entities.find((e) => e.id === l.entity_id);
              return (
                <div key={l.id} style={{ fontSize: 13.5, color: C.text, marginBottom: 4 }}>
                  <strong>{l.naziv}</strong> ({ent?.name}) — {fmtEUR(l.iznos_rate)} dana {d === 0 ? "danas" : fmtDate(np)}
                </div>
              );
            })}
          </div>
        )}

        {view === "home" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {entities.map((ent) => {
              const ls = entityLoans(ent.id);
              const dueCount = ls.filter((l) => {
                const d = daysUntil(loanNextPayment(l, installments[l.id] || []));
                return d !== null && d <= 2 && d >= 0;
              }).length;
              return (
                <div
                  key={ent.id}
                  onClick={() => {
                    setActiveEntityId(ent.id);
                    setView("entity");
                  }}
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    padding: 22,
                    cursor: "pointer",
                    borderTop: `3px solid ${C.gold}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Badge tone="gold">{entityType === "business" ? "Poslovni subjekt" : "Osobno"}</Badge>
                    {dueCount > 0 && <Badge tone="danger">{dueCount} dospijeva</Badge>}
                  </div>
                  <div style={{ fontFamily: C.serif, fontSize: 19, margin: "14px 0 18px", color: C.text }}>{ent.name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: C.mono, fontSize: 12.5 }}>
                    <div>
                      <div style={{ color: C.textFaint, fontSize: 10.5, textTransform: "uppercase", marginBottom: 3 }}>Zaduženja</div>
                      <div style={{ color: C.text }}>{ls.length}</div>
                    </div>
                    <div>
                      <div style={{ color: C.textFaint, fontSize: 10.5, textTransform: "uppercase", marginBottom: 3 }}>Mj. rate</div>
                      <div style={{ color: C.text }}>{fmtEUR(totalRate(ent.id))}</div>
                    </div>
                    <div>
                      <div style={{ color: C.textFaint, fontSize: 10.5, textTransform: "uppercase", marginBottom: 3 }}>Glavnica</div>
                      <div style={{ color: C.goldBright, fontWeight: 600 }}>{fmtEUR(totalGlavnica(ent.id))}</div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div
              onClick={() => setView("total")}
              style={{
                background: `linear-gradient(135deg, ${C.surface}, ${C.bgAlt})`,
                border: `1px solid ${C.gold}`,
                borderRadius: 14,
                padding: 22,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ fontFamily: C.serif, fontSize: 19, color: C.goldBright, marginBottom: 10 }}>📊 Ukupna tablica</div>
              <div style={{ fontFamily: C.mono, fontSize: 12.5, color: C.textSoft }}>
                {loans.length} stavki, {fmtEUR(loans.reduce((s, l) => s + (Number(l.preostala_glavnica) || 0), 0))} glavnice
              </div>
            </div>

            <div
              onClick={() => setShowAddEntity(true)}
              style={{
                border: `1.5px dashed ${C.border}`,
                borderRadius: 14,
                padding: 22,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.textFaint,
                fontFamily: C.mono,
                fontSize: 13,
                minHeight: 120,
              }}
            >
              + Novi {entityType === "business" ? "poslovni subjekt" : "subjekt"}
            </div>
          </div>
        )}

        {view === "entity" && activeEntity && (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 14,
                marginBottom: 22,
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 18,
              }}
            >
              <div>
                <div style={{ color: C.textFaint, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, fontFamily: C.mono }}>
                  Ukupno zaduženja
                </div>
                <div style={{ fontFamily: C.serif, fontSize: 20, color: C.text }}>{entityLoans(activeEntity.id).length}</div>
              </div>
              <div>
                <div style={{ color: C.textFaint, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, fontFamily: C.mono }}>
                  Ukupno mjesečnih rata
                </div>
                <div style={{ fontFamily: C.serif, fontSize: 20, color: C.goldBright }}>{fmtEUR(totalRate(activeEntity.id))}</div>
              </div>
              <div>
                <div style={{ color: C.textFaint, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, fontFamily: C.mono }}>
                  Ukupno preostale glavnice
                </div>
                <div style={{ fontFamily: C.serif, fontSize: 20, color: C.goldBright }}>{fmtEUR(totalGlavnica(activeEntity.id))}</div>
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <Button variant="primary" onClick={() => setEditingLoan({ mode: "new", entityId: activeEntity.id })}>
                + Novi kredit / leasing / osiguranje
              </Button>
            </div>
            {entityLoans(activeEntity.id).length === 0 && (
              <div style={{ color: C.textFaint, fontFamily: C.mono, fontSize: 13, padding: "30px 0" }}>
                Nema unesenih zaduženja za ovaj subjekt.
              </div>
            )}
            {entityLoans(activeEntity.id).map((l) => (
              <LoanCard
                key={l.id}
                loan={l}
                installments={installments[l.id] || []}
                onEdit={() => setEditingLoan({ mode: "edit", entityId: activeEntity.id, loan: l })}
              />
            ))}
          </div>
        )}

        {view === "total" && (
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div style={{ color: C.textFaint, fontSize: 12.5, fontFamily: C.mono }}>
                {entityType === "business"
                  ? "Zbraja samo poslovne subjekte."
                  : "Zbraja samo tvoje osobne stavke — vidljivo isključivo tebi."}
              </div>
              <Button variant="ghost" onClick={exportTotalCsv}>
                ⬇ Export u Excel/CSV
              </Button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: C.mono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Subjekt", "Institucija", "Naziv", "Vrsta", "Sljedeća naplata", "Rata", "Dospijeće", "Kamata", "Preostala glavnica", "Preostalo rata", "Jamac"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: C.textFaint, fontWeight: 400, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => {
                  const ent = entities.find((e) => e.id === l.entity_id);
                  const np = loanNextPayment(l, installments[l.id] || []);
                  const d = daysUntil(np);
                  const dueSoon = d !== null && d <= 2 && d >= 0;
                  return (
                    <tr
                      key={l.id}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                      onClick={() => {
                        if (!ent) return;
                        setActiveEntityId(ent.id);
                        setEditingLoan({ mode: "edit", entityId: ent.id, loan: l });
                      }}
                    >
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{ent?.name}</td>
                      <td style={{ padding: "10px 12px", color: C.goldDim }}>{l.institucija || "—"}</td>
                      <td style={{ padding: "10px 12px", color: C.text }}>{l.naziv}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{l.vrsta}</td>
                      <td style={{ padding: "10px 12px", color: dueSoon ? C.danger : C.textSoft }}>{np ? fmtDate(np) : "—"}</td>
                      <td style={{ padding: "10px 12px", color: C.goldBright }}>{fmtEUR(l.iznos_rate)}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{fmtDate(l.datum_dospijeca)}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{l.kamatna_stopa ?? 0}%</td>
                      <td style={{ padding: "10px 12px", color: C.goldBright, fontWeight: 600 }}>{fmtEUR(l.preostala_glavnica)}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{l.preostali_broj_rata ?? 0}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{l.jamci || "—"}</td>
                    </tr>
                  );
                })}
                {loans.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: "24px 12px", color: C.textFaint }}>
                      Još nema unesenih zaduženja.
                    </td>
                  </tr>
                )}
              </tbody>
              {loans.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.gold}` }}>
                    <td colSpan={5} style={{ padding: "12px", color: C.goldBright, fontWeight: 600 }}>
                      UKUPNO
                    </td>
                    <td style={{ padding: "12px", color: C.goldBright, fontWeight: 600 }}>
                      {fmtEUR(loans.reduce((s, l) => s + (Number(l.iznos_rate) || 0), 0))}
                    </td>
                    <td colSpan={2}></td>
                    <td style={{ padding: "12px", color: C.goldBright, fontWeight: 600 }}>
                      {fmtEUR(loans.reduce((s, l) => s + (Number(l.preostala_glavnica) || 0), 0))}
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {showAddEntity && (
        <Modal title={`Novi ${entityType === "business" ? "poslovni subjekt" : "subjekt"}`} onClose={() => setShowAddEntity(false)}>
          <AddEntityForm onSave={addEntity} onCancel={() => setShowAddEntity(false)} />
        </Modal>
      )}

      {editingLoan && (
        <Modal title={editingLoan.mode === "new" ? "Novo zaduženje" : "Uredi zaduženje"} onClose={() => setEditingLoan(null)} wide>
          <LoanForm
            initial={
              editingLoan.mode === "edit" && editingLoan.loan
                ? (editingLoan.loan as unknown as LoanFormData)
                : null
            }
            initialSchedule={
              editingLoan.mode === "edit" && editingLoan.loan
                ? (installments[editingLoan.loan.id] || []).map((i) => ({
                    id: i.id,
                    seq_no: i.seq_no,
                    due_date: i.due_date,
                    amount: i.amount,
                    principal_amount: i.principal_amount,
                    interest_amount: i.interest_amount,
                    paid: i.paid,
                  }))
                : []
            }
            barcodeBucket={barcodeBucket}
            barcodePathPrefix={entityType === "business" ? editingLoan.entityId : userId || "unknown"}
            onSave={(data, schedule) => saveLoan(editingLoan.entityId, data, schedule)}
            onCancel={() => setEditingLoan(null)}
            onDelete={editingLoan.mode === "edit" && editingLoan.loan ? () => deleteLoan(editingLoan.loan!.id) : undefined}
          />
        </Modal>
      )}
    </div>
  );
}

function AddEntityForm({ onSave, onCancel }: { onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  return (
    <div>
      <Field label="Naziv subjekta">
        <TextInput placeholder="npr. Nova firma d.o.o." value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <Button variant="ghost" onClick={onCancel}>
          Odustani
        </Button>
        <Button variant="primary" onClick={() => name.trim() && onSave(name.trim())}>
          Dodaj
        </Button>
      </div>
    </div>
  );
}
