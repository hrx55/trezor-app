"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/design";
import { Badge, Button, Field, Modal, TextInput } from "@/components/ui";
import LoanForm, { LoanFormData, ScheduleRow } from "@/components/LoanForm";
import LoanCard, { loanNextPayment } from "@/components/LoanCard";
import { DocumentRow } from "@/components/DocumentsUpload";
import { daysUntil, fmtDate, fmtEUR } from "@/lib/loans";
import { exportToCsv } from "@/lib/csv";
import type { Entity, EntityType, Installment, Loan, LoanDocument } from "@/lib/types";

type View = "home" | "entity" | "total";
const STALE_DATA_DAYS = 30;
const POLICY_EXPIRY_DAYS = 30;

export default function TrezorApp({
  entityType,
  headerLabel,
  displayName,
  showUsersLink,
}: {
  entityType: EntityType;
  headerLabel: string;
  displayName: string;
  showUsersLink?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [installments, setInstallments] = useState<Record<string, Installment[]>>({});
  const [documents, setDocuments] = useState<Record<string, LoanDocument[]>>({});
  const [view, setView] = useState<View>("home");
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const [showAddEntity, setShowAddEntity] = useState(false);
  const [editingLoan, setEditingLoan] = useState<{ mode: "new" | "edit"; entityId: string; loan?: Loan } | null>(null);
  const [loanFormDirty, setLoanFormDirty] = useState(false);
  const [entityFormDirty, setEntityFormDirty] = useState(false);
  const [error, setError] = useState("");

  const UNSAVED_CHANGES_WARNING = "Izlaskom bez spremanja gubiš sve podatke koje si upravo unio/la. Jesi li siguran/sigurna?";

  const closeLoanModal = () => {
    if (loanFormDirty && !window.confirm(UNSAVED_CHANGES_WARNING)) return;
    setEditingLoan(null);
  };

  const closeAddEntityModal = () => {
    if (entityFormDirty && !window.confirm(UNSAVED_CHANGES_WARNING)) return;
    setShowAddEntity(false);
  };

  const barcodeBucket = entityType === "business" ? "barcodes-business" : "barcodes-private";
  const documentsBucket = entityType === "business" ? "documents-business" : "documents-private";

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
      setDocuments({});
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
      const [{ data: installmentsData }, { data: documentsData }] = await Promise.all([
        supabase.from("installments").select("*").in("loan_id", loanIds).order("seq_no"),
        supabase.from("loan_documents").select("*").in("loan_id", loanIds).order("created_at"),
      ]);
      const groupedInstallments: Record<string, Installment[]> = {};
      (installmentsData || []).forEach((i) => {
        (groupedInstallments[i.loan_id] ||= []).push(i);
      });
      setInstallments(groupedInstallments);

      const groupedDocs: Record<string, LoanDocument[]> = {};
      (documentsData || []).forEach((d) => {
        (groupedDocs[d.loan_id] ||= []).push(d);
      });
      setDocuments(groupedDocs);
    } else {
      setInstallments({});
      setDocuments({});
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

  const saveLoan = async (entityId: string, data: LoanFormData, schedule: ScheduleRow[], docs: DocumentRow[]) => {
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

    await supabase.from("loan_documents").delete().eq("loan_id", id);
    if (docs.length > 0) {
      const rows = docs.map((d) => ({ id: d.id, loan_id: id, naziv: d.naziv, tip: d.tip, storage_path: d.storage_path }));
      const { error: docsErr } = await supabase.from("loan_documents").insert(rows);
      if (docsErr) {
        setError(docsErr.message);
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

  const deleteEntity = async (id: string) => {
    if (!confirm("Obrisati subjekt i sva njegova zaduženja? Ovo je nepovratno.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("entities").delete().eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setView("home");
    setActiveEntityId(null);
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
  const creditLoans = (list: Loan[]) => list.filter((l) => l.vrsta !== "Osiguranje");
  const insuranceLoans = (list: Loan[]) => list.filter((l) => l.vrsta === "Osiguranje");
  const totalGlavnica = (id: string) => creditLoans(entityLoans(id)).reduce((s, l) => s + (Number(l.preostala_glavnica) || 0), 0);
  const totalRate = (id: string) => creditLoans(entityLoans(id)).reduce((s, l) => s + (Number(l.iznos_rate) || 0), 0);
  const totalPremija = (id: string) => insuranceLoans(entityLoans(id)).reduce((s, l) => s + (Number(l.ukupna_premija) || 0), 0);
  const activeEntity = entities.find((e) => e.id === activeEntityId) || null;

  const paymentsDueSoon = loans
    .map((l) => {
      const np = loanNextPayment(l, installments[l.id] || []);
      const d = daysUntil(np);
      return { loan: l, np, d };
    })
    .filter((x) => x.d !== null && x.d <= 2 && x.d >= 0)
    .sort((a, b) => (a.d as number) - (b.d as number));

  const policiesExpiringSoon = loans
    .filter((l) => l.vrsta === "Osiguranje" && l.polica_istek)
    .map((l) => ({ loan: l, d: daysUntil(l.polica_istek) }))
    .filter((x) => x.d !== null && x.d <= POLICY_EXPIRY_DAYS && x.d >= 0)
    .sort((a, b) => (a.d as number) - (b.d as number));

  const staleDataLoans = loans
    .filter((l) => l.podaci_azurirano_na)
    .map((l) => ({ loan: l, d: daysUntil(l.podaci_azurirano_na) }))
    .filter((x) => x.d !== null && x.d < -STALE_DATA_DAYS)
    .sort((a, b) => (a.d as number) - (b.d as number));

  const exportCsv = (which: "krediti" | "osiguranja") => {
    const rows = which === "krediti" ? creditLoans(loans) : insuranceLoans(loans);
    const headers =
      which === "krediti"
        ? [
            "Subjekt",
            "Institucija",
            "Naziv",
            "Vrsta",
            "Status",
            "Način otplate",
            "Sljedeća naplata",
            "Rata",
            "Dospijeće",
            "Kamata (%)",
            "Preostala glavnica",
            "Preostalo rata",
            "Jamac",
            "Napomena",
            "Podaci točni na dan",
          ]
        : [
            "Subjekt",
            "Institucija",
            "Naziv",
            "Status",
            "Broj police",
            "Predmet osiguranja",
            "Početak police",
            "Istek police",
            "Ukupna premija",
            "Sljedeće plaćanje",
            "Napomena",
            "Podaci točni na dan",
          ];
    const dataRows = rows.map((l) => {
      const ent = entities.find((e) => e.id === l.entity_id);
      const np = loanNextPayment(l, installments[l.id] || []);
      if (which === "krediti") {
        return [
          ent?.name ?? "",
          l.institucija,
          l.naziv,
          l.vrsta,
          l.status,
          l.repayment_type,
          np ? fmtDate(np) : "",
          l.iznos_rate ?? "",
          fmtDate(l.datum_dospijeca),
          l.kamatna_stopa ?? "",
          l.preostala_glavnica ?? "",
          l.preostali_broj_rata ?? "",
          l.jamci,
          l.napomena,
          fmtDate(l.podaci_azurirano_na),
        ];
      }
      return [
        ent?.name ?? "",
        l.institucija,
        l.naziv,
        l.status,
        l.polica_broj ?? "",
        l.predmet_osiguranja ?? "",
        fmtDate(l.polica_pocetak),
        fmtDate(l.polica_istek),
        l.ukupna_premija ?? "",
        np ? fmtDate(np) : "",
        l.napomena,
        fmtDate(l.podaci_azurirano_na),
      ];
    });
    exportToCsv(`trezor-${entityType}-${which}-${new Date().toISOString().slice(0, 10)}.csv`, headers, dataRows);
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
            {showUsersLink && (
              <Button variant="ghost" onClick={() => router.push("/admin/users")}>
                👤 Korisnici
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

        {view === "home" && (paymentsDueSoon.length > 0 || policiesExpiringSoon.length > 0 || staleDataLoans.length > 0) && (
          <div style={{ background: C.dangerBg, border: `1px solid rgba(217,105,95,0.35)`, borderRadius: 12, padding: "16px 20px", marginBottom: 26 }}>
            {paymentsDueSoon.length > 0 && (
              <>
                <div style={{ color: C.danger, fontFamily: C.mono, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                  ⏰ Naplata uskoro
                </div>
                {paymentsDueSoon.map(({ loan: l, np, d }) => {
                  const ent = entities.find((e) => e.id === l.entity_id);
                  return (
                    <div key={l.id} style={{ fontSize: 13.5, color: C.text, marginBottom: 4 }}>
                      <strong>{l.naziv}</strong> ({ent?.name}) — {fmtEUR(l.vrsta === "Osiguranje" ? l.ukupna_premija : l.iznos_rate)}{" "}
                      dana {d === 0 ? "danas" : fmtDate(np)}
                    </div>
                  );
                })}
              </>
            )}
            {policiesExpiringSoon.length > 0 && (
              <>
                <div style={{ color: C.danger, fontFamily: C.mono, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", margin: "14px 0 8px" }}>
                  🛡 Istek police uskoro
                </div>
                {policiesExpiringSoon.map(({ loan: l, d }) => {
                  const ent = entities.find((e) => e.id === l.entity_id);
                  return (
                    <div key={l.id} style={{ fontSize: 13.5, color: C.text, marginBottom: 4 }}>
                      <strong>{l.naziv}</strong> ({ent?.name}) — istječe {fmtDate(l.polica_istek)} (za {d} dan(a))
                    </div>
                  );
                })}
              </>
            )}
            {staleDataLoans.length > 0 && (
              <>
                <div style={{ color: C.danger, fontFamily: C.mono, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", margin: "14px 0 8px" }}>
                  🔄 Potrebno ažuriranje podataka
                </div>
                {staleDataLoans.map(({ loan: l }) => {
                  const ent = entities.find((e) => e.id === l.entity_id);
                  return (
                    <div key={l.id} style={{ fontSize: 13.5, color: C.text, marginBottom: 4 }}>
                      <strong>{l.naziv}</strong> ({ent?.name}) — podaci od {fmtDate(l.podaci_azurirano_na)}, provjeri preostalu glavnicu/premiju
                    </div>
                  );
                })}
              </>
            )}
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
                {creditLoans(loans).length} kredita/leasinga, {insuranceLoans(loans).length} osiguranja
              </div>
            </div>

            <div
              onClick={() => {
                setEntityFormDirty(false);
                setShowAddEntity(true);
              }}
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
              <div>
                <div style={{ color: C.textFaint, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, fontFamily: C.mono }}>
                  Osiguranja (premija/god.)
                </div>
                <div style={{ fontFamily: C.serif, fontSize: 20, color: C.goldBright }}>{fmtEUR(totalPremija(activeEntity.id))}</div>
              </div>
            </div>
            <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between" }}>
              <Button
                variant="primary"
                onClick={() => {
                  setLoanFormDirty(false);
                  setEditingLoan({ mode: "new", entityId: activeEntity.id });
                }}
              >
                + Novi kredit / leasing / osiguranje
              </Button>
              <Button variant="danger" onClick={() => deleteEntity(activeEntity.id)}>
                Obriši subjekt
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
                onEdit={() => {
                  setLoanFormDirty(false);
                  setEditingLoan({ mode: "edit", entityId: activeEntity.id, loan: l });
                }}
              />
            ))}
          </div>
        )}

        {view === "total" && (
          <div style={{ overflowX: "auto" }}>
            <div style={{ color: C.textFaint, fontSize: 12.5, fontFamily: C.mono, marginBottom: 14 }}>
              {entityType === "business"
                ? "Zbraja samo poslovne subjekte."
                : "Zbraja samo tvoje osobne stavke — vidljivo isključivo tebi."}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 18, color: C.text, margin: 0 }}>Krediti i leasinzi</h2>
              <Button variant="ghost" onClick={() => exportCsv("krediti")}>
                ⬇ Export u Excel/CSV
              </Button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: C.mono, marginBottom: 34 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Subjekt", "Institucija", "Naziv", "Vrsta", "Status", "Sljedeća naplata", "Rata", "Dospijeće", "Kamata", "Preostala glavnica", "Preostalo rata", "Jamac"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: C.textFaint, fontWeight: 400, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creditLoans(loans).map((l) => {
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
                        setLoanFormDirty(false);
                        setEditingLoan({ mode: "edit", entityId: ent.id, loan: l });
                      }}
                    >
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{ent?.name}</td>
                      <td style={{ padding: "10px 12px", color: C.goldDim }}>{l.institucija || "—"}</td>
                      <td style={{ padding: "10px 12px", color: C.text }}>{l.naziv}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{l.vrsta}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{l.status}</td>
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
                {creditLoans(loans).length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding: "24px 12px", color: C.textFaint }}>
                      Još nema unesenih kredita/leasinga.
                    </td>
                  </tr>
                )}
              </tbody>
              {creditLoans(loans).length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.gold}` }}>
                    <td colSpan={6} style={{ padding: "12px", color: C.goldBright, fontWeight: 600 }}>
                      UKUPNO
                    </td>
                    <td style={{ padding: "12px", color: C.goldBright, fontWeight: 600 }}>
                      {fmtEUR(creditLoans(loans).reduce((s, l) => s + (Number(l.iznos_rate) || 0), 0))}
                    </td>
                    <td colSpan={2}></td>
                    <td style={{ padding: "12px", color: C.goldBright, fontWeight: 600 }}>
                      {fmtEUR(creditLoans(loans).reduce((s, l) => s + (Number(l.preostala_glavnica) || 0), 0))}
                    </td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 18, color: C.text, margin: 0 }}>Osiguranja</h2>
              <Button variant="ghost" onClick={() => exportCsv("osiguranja")}>
                ⬇ Export u Excel/CSV
              </Button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: C.mono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Subjekt", "Institucija", "Naziv", "Status", "Broj police", "Predmet", "Istek police", "Ukupna premija", "Sljedeće plaćanje"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: C.textFaint, fontWeight: 400, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insuranceLoans(loans).map((l) => {
                  const ent = entities.find((e) => e.id === l.entity_id);
                  const policyDaysLeft = daysUntil(l.polica_istek);
                  const expiringSoon = policyDaysLeft !== null && policyDaysLeft <= POLICY_EXPIRY_DAYS && policyDaysLeft >= 0;
                  return (
                    <tr
                      key={l.id}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                      onClick={() => {
                        if (!ent) return;
                        setActiveEntityId(ent.id);
                        setLoanFormDirty(false);
                        setEditingLoan({ mode: "edit", entityId: ent.id, loan: l });
                      }}
                    >
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{ent?.name}</td>
                      <td style={{ padding: "10px 12px", color: C.goldDim }}>{l.institucija || "—"}</td>
                      <td style={{ padding: "10px 12px", color: C.text }}>{l.naziv}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{l.status}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{l.polica_broj || "—"}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{l.predmet_osiguranja || "—"}</td>
                      <td style={{ padding: "10px 12px", color: expiringSoon ? C.danger : C.textSoft }}>{fmtDate(l.polica_istek)}</td>
                      <td style={{ padding: "10px 12px", color: C.goldBright, fontWeight: 600 }}>{fmtEUR(l.ukupna_premija)}</td>
                      <td style={{ padding: "10px 12px", color: C.textSoft }}>{fmtDate(l.datum_sljedece_uplate)}</td>
                    </tr>
                  );
                })}
                {insuranceLoans(loans).length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: "24px 12px", color: C.textFaint }}>
                      Još nema unesenih osiguranja.
                    </td>
                  </tr>
                )}
              </tbody>
              {insuranceLoans(loans).length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.gold}` }}>
                    <td colSpan={7} style={{ padding: "12px", color: C.goldBright, fontWeight: 600 }}>
                      UKUPNO
                    </td>
                    <td style={{ padding: "12px", color: C.goldBright, fontWeight: 600 }}>
                      {fmtEUR(insuranceLoans(loans).reduce((s, l) => s + (Number(l.ukupna_premija) || 0), 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {showAddEntity && (
        <Modal title={`Novi ${entityType === "business" ? "poslovni subjekt" : "subjekt"}`} onClose={closeAddEntityModal}>
          <AddEntityForm onSave={addEntity} onCancel={closeAddEntityModal} onDirtyChange={setEntityFormDirty} />
        </Modal>
      )}

      {editingLoan && (
        <Modal title={editingLoan.mode === "new" ? "Novo zaduženje" : "Uredi zaduženje"} onClose={closeLoanModal} wide>
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
            initialDocuments={
              editingLoan.mode === "edit" && editingLoan.loan
                ? (documents[editingLoan.loan.id] || []).map((d) => ({ id: d.id, naziv: d.naziv, tip: d.tip, storage_path: d.storage_path }))
                : []
            }
            barcodeBucket={barcodeBucket}
            barcodePathPrefix={entityType === "business" ? editingLoan.entityId : userId || "unknown"}
            documentsBucket={documentsBucket}
            onSave={(data, schedule, docs) => saveLoan(editingLoan.entityId, data, schedule, docs)}
            onCancel={closeLoanModal}
            onDirtyChange={setLoanFormDirty}
            onDelete={editingLoan.mode === "edit" && editingLoan.loan ? () => deleteLoan(editingLoan.loan!.id) : undefined}
          />
        </Modal>
      )}
    </div>
  );
}

function AddEntityForm({
  onSave,
  onCancel,
  onDirtyChange,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    onDirtyChange?.(name.trim() !== "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

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
