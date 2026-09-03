-- ============================================================
-- TREZOR: dopune po povratnoj informaciji računovodstva
-- - status stavke, napomena
-- - zasebna polja za osiguranja (odvojeno od kredita/leasinga u izračunima)
-- - prilozi (ugovor / otplatni plan / polica / ostalo)
-- ============================================================

alter table loans
  add column if not exists status text not null default 'aktivno' check (status in ('aktivno', 'otplaceno', 'zatvoreno', 'arhivirano')),
  add column if not exists napomena text not null default '',
  add column if not exists polica_broj text,
  add column if not exists predmet_osiguranja text,
  add column if not exists polica_pocetak date,
  add column if not exists polica_istek date,
  add column if not exists ukupna_premija numeric(14,2),
  add column if not exists datum_sljedece_uplate date;

-- ---------- PRILOZI (ugovor, otplatni plan, polica, ostalo) ----------
create table if not exists loan_documents (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id) on delete cascade,
  naziv text not null default '',
  tip text not null check (tip in ('Ugovor', 'Otplatni plan', 'Polica', 'Ostalo')) default 'Ostalo',
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table loan_documents enable row level security;

create policy "loan_documents_via_loan"
  on loan_documents for all
  using (
    exists (
      select 1 from loans l
      join entities e on e.id = l.entity_id
      where l.id = loan_documents.loan_id
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
      where l.id = loan_documents.loan_id
      and (
        (e.type = 'business' and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff')))
        or
        (e.type = 'personal' and e.owner_id = auth.uid() and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private'))
      )
    )
  );

-- ---------- Storage bucketovi za priloge (odvojeni po vlasništvu, isti obrazac kao barkodovi) ----------
insert into storage.buckets (id, name, public)
values ('documents-business', 'documents-business', false),
       ('documents-private', 'documents-private', false)
on conflict (id) do nothing;

create policy "documents_business_rw"
  on storage.objects for all
  using (
    bucket_id = 'documents-business'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff'))
  )
  with check (
    bucket_id = 'documents-business'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff'))
  );

create policy "documents_private_rw_own_folder"
  on storage.objects for all
  using (
    bucket_id = 'documents-private'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private')
  )
  with check (
    bucket_id = 'documents-private'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'private')
  );
