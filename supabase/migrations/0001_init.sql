-- ============================================================
-- TREZOR: inicijalna shema
-- Role: admin/staff vide poslovne subjekte (Ukupna tablica = samo firme)
--       private vidi samo svoj osobni subjekt (svoj login, odvojen od sefa)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- PROFILI (1:1 s auth.users) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff', 'private')),
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own"
  on profiles for select
  using (id = auth.uid());

-- ---------- SUBJEKTI (firme ili osobno) ----------
create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('business', 'personal')),
  owner_id uuid references auth.users(id) on delete cascade, -- postavljeno samo za type='personal'
  created_at timestamptz not null default now()
);

alter table entities enable row level security;

create policy "entities_business_rw"
  on entities for all
  using (
    type = 'business'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
  with check (
    type = 'business'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  );

create policy "entities_personal_rw"
  on entities for all
  using (
    type = 'personal'
    and owner_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private')
  )
  with check (
    type = 'personal'
    and owner_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private')
  );

-- ---------- KREDITI / LEASINZI / OSIGURANJA ----------
create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  institucija text not null default '',
  naziv text not null default '',
  vrsta text not null check (vrsta in ('Kredit', 'Leasing', 'Osiguranje')) default 'Kredit',
  repayment_type text not null check (repayment_type in ('fixed', 'annuity', 'custom')) default 'fixed',
  datum_podizanja date,
  dan_naplate int check (dan_naplate between 1 and 31),
  iznos_rate numeric(14,2), -- za fixed: fiksni iznos rate; za annuity/custom: prikaz sljedeće rate
  pocetna_glavnica numeric(14,2), -- iznos kredita na dan podizanja (potrebno za anuitetski izračun)
  datum_dospijeca date,
  kamatna_stopa numeric(6,3),
  preostala_glavnica numeric(14,2),
  preostali_broj_rata int,
  upute_placanja text default '',
  jamci text default '',
  barcode_path text, -- putanja u Supabase Storage bucketu 'barcodes'
  podaci_azurirano_na date, -- datum na koji su podaci točni (npr. 2026-07-31)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table loans enable row level security;

create policy "loans_via_entity"
  on loans for all
  using (
    exists (
      select 1 from entities e
      where e.id = loans.entity_id
      and (
        (e.type = 'business' and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff')))
        or
        (e.type = 'personal' and e.owner_id = auth.uid() and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private'))
      )
    )
  )
  with check (
    exists (
      select 1 from entities e
      where e.id = loans.entity_id
      and (
        (e.type = 'business' and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff')))
        or
        (e.type = 'personal' and e.owner_id = auth.uid() and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private'))
      )
    )
  );

-- ---------- OTPLATNI PLAN (za anuitet / custom raspored kad rate nisu jednake) ----------
create table if not exists installments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id) on delete cascade,
  seq_no int not null,
  due_date date not null,
  amount numeric(14,2) not null,
  principal_amount numeric(14,2),
  interest_amount numeric(14,2),
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  unique (loan_id, seq_no)
);

alter table installments enable row level security;

create policy "installments_via_loan"
  on installments for all
  using (
    exists (
      select 1 from loans l
      join entities e on e.id = l.entity_id
      where l.id = installments.loan_id
      and (
        (e.type = 'business' and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff')))
        or
        (e.type = 'personal' and e.owner_id = auth.uid() and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private'))
      )
    )
  )
  with check (
    exists (
      select 1 from loans l
      join entities e on e.id = l.entity_id
      where l.id = installments.loan_id
      and (
        (e.type = 'business' and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff')))
        or
        (e.type = 'personal' and e.owner_id = auth.uid() and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private'))
      )
    )
  );

-- ---------- updated_at trigger ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists loans_set_updated_at on loans;
create trigger loans_set_updated_at
  before update on loans
  for each row execute function set_updated_at();

-- ---------- Storage bucketovi za barkodove/uplatnice (odvojeni po vlasništvu) ----------
-- 'barcodes-business': dostupno adminu/staffu. Path konvencija: {entityId}/{loanId}/{filename}
-- 'barcodes-private':  dostupno samo vlasniku (role='private'). Path konvencija: {auth.uid()}/{loanId}/{filename}
insert into storage.buckets (id, name, public)
values ('barcodes-business', 'barcodes-business', false),
       ('barcodes-private', 'barcodes-private', false)
on conflict (id) do nothing;

create policy "barcodes_business_rw"
  on storage.objects for all
  using (
    bucket_id = 'barcodes-business'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff'))
  )
  with check (
    bucket_id = 'barcodes-business'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff'))
  );

create policy "barcodes_private_rw_own_folder"
  on storage.objects for all
  using (
    bucket_id = 'barcodes-private'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private')
  )
  with check (
    bucket_id = 'barcodes-private'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private')
  );
