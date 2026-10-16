-- ============================================================
-- TREZOR: račun može imati poslovni pristup (admin/staff) I privatne financije
-- Flag profiles.private_access daje pristup osobnim subjektima uz postojeću rolu.
-- ============================================================

alter table profiles add column if not exists private_access boolean not null default false;

create or replace function public.has_private_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.role = 'private' or p.private_access)
  );
$$;

-- ---------- entities ----------
drop policy if exists "entities_personal_rw" on entities;
create policy "entities_personal_rw"
  on entities for all
  using (type = 'personal' and owner_id = auth.uid() and public.has_private_access())
  with check (type = 'personal' and owner_id = auth.uid() and public.has_private_access());

-- ---------- loans ----------
drop policy if exists "loans_via_entity" on loans;
create policy "loans_via_entity"
  on loans for all
  using (
    exists (
      select 1 from entities e
      where e.id = loans.entity_id
      and (
        (e.type = 'business' and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','staff')))
        or
        (e.type = 'personal' and e.owner_id = auth.uid() and public.has_private_access())
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
        (e.type = 'personal' and e.owner_id = auth.uid() and public.has_private_access())
      )
    )
  );

-- ---------- installments ----------
drop policy if exists "installments_via_loan" on installments;
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
        (e.type = 'personal' and e.owner_id = auth.uid() and public.has_private_access())
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
        (e.type = 'personal' and e.owner_id = auth.uid() and public.has_private_access())
      )
    )
  );

-- ---------- loan_documents ----------
drop policy if exists "loan_documents_via_loan" on loan_documents;
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
        (e.type = 'personal' and e.owner_id = auth.uid() and public.has_private_access())
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
        (e.type = 'personal' and e.owner_id = auth.uid() and public.has_private_access())
      )
    )
  );

-- ---------- storage (privatni bucketovi) ----------
drop policy if exists "barcodes_private_rw_own_folder" on storage.objects;
create policy "barcodes_private_rw_own_folder"
  on storage.objects for all
  using (
    bucket_id = 'barcodes-private'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_private_access()
  )
  with check (
    bucket_id = 'barcodes-private'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_private_access()
  );

drop policy if exists "documents_private_rw_own_folder" on storage.objects;
create policy "documents_private_rw_own_folder"
  on storage.objects for all
  using (
    bucket_id = 'documents-private'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_private_access()
  )
  with check (
    bucket_id = 'documents-private'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_private_access()
  );
