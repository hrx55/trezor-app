export type EntityType = "business" | "personal";
export type Vrsta = "Kredit" | "Leasing" | "Osiguranje";
export type RepaymentType = "fixed" | "annuity" | "custom";
export type Role = "admin" | "staff" | "private";

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
  barcode_path: string | null;
  podaci_azurirano_na: string | null;
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
