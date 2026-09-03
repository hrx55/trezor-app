export type EntityType = "business" | "personal";
export type Vrsta = "Kredit" | "Leasing" | "Osiguranje";
export type RepaymentType = "fixed" | "annuity" | "custom";
export type Role = "admin" | "staff" | "private";
export type LoanStatus = "aktivno" | "otplaceno" | "zatvoreno" | "arhivirano";
export type DocumentType = "Ugovor" | "Otplatni plan" | "Polica" | "Ostalo";

export interface Profile {
  id: string;
  role: Role;
  display_name: string;
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  owner_id: string | null;
}

export interface Loan {
  id: string;
  entity_id: string;
  institucija: string;
  naziv: string;
  vrsta: Vrsta;
  status: LoanStatus;
  repayment_type: RepaymentType;
  datum_podizanja: string | null;
  dan_naplate: number | null;
  iznos_rate: number | null;
  pocetna_glavnica: number | null;
  datum_dospijeca: string | null;
  kamatna_stopa: number | null;
  preostala_glavnica: number | null;
  preostali_broj_rata: number | null;
  upute_placanja: string;
  jamci: string;
  napomena: string;
  barcode_path: string | null;
  podaci_azurirano_na: string | null;
  updated_at?: string;
  // Osiguranje-specific (vrsta === 'Osiguranje') — odvojeno od kredita/leasinga u izračunima
  polica_broj: string | null;
  predmet_osiguranja: string | null;
  polica_pocetak: string | null;
  polica_istek: string | null;
  ukupna_premija: number | null;
  datum_sljedece_uplate: string | null;
}

export interface Installment {
  id: string;
  loan_id: string;
  seq_no: number;
  due_date: string;
  amount: number;
  principal_amount: number | null;
  interest_amount: number | null;
  paid: boolean;
}

export interface LoanDocument {
  id: string;
  loan_id: string;
  naziv: string;
  tip: DocumentType;
  storage_path: string;
}
