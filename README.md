# Trezor

Aplikacija za praćenje kredita, leasinga i osiguranja. Next.js + Supabase (Postgres + Auth + Storage).

## Kako radi

- **Poslovni sef** (`/`) — vidljiv korisnicima s rolom `admin` ili `staff`. Sadrži sve poslovne subjekte (firme) i njihova zaduženja. "Ukupna tablica" zbraja samo poslovne subjekte.
- **Privatne financije** — vidljive isključivo korisniku s rolom `private` (Hrvoje). Zaseban login (drugi email/lozinka), potpuno odvojeno od poslovnog sefa. Ima svoju vlastitu "Ukupnu tablicu" koja zbraja samo njegove osobne stavke.
- Obje "aplikacije" dijele isti kod (`src/components/TrezorApp.tsx`), razlika je samo u tome koji tip subjekta (`business` vs `personal`) učitavaju — sigurnost (tko što vidi) provodi Postgres Row Level Security, ne frontend.

## Postavljanje Supabase projekta

1. Napravi besplatni projekt na [supabase.com](https://supabase.com).
2. U **SQL Editor** zalijepi i pokreni sadržaj [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). Ovo kreira tablice, RLS politike i storage bucketove.
3. U **Project Settings → API** kopiraj `Project URL` i `anon public` ključ u `.env.local` (vidi `.env.local.example`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
4. U **Authentication → Users** ručno dodaj korisnike (šef, cure, Hrvoje) — "Add user" s emailom i lozinkom. Ovo NIJE javna registracija, korisnike dodaje samo admin ovdje.
5. Za svakog dodanog korisnika, u **SQL Editor** pokreni (zamijeni UUID-ove s onima iz Auth Users tablice):
   ```sql
   insert into profiles (id, role, display_name) values
     ('UUID_ŠEFA', 'admin', 'Šef'),
     ('UUID_CURE_1', 'staff', 'Ime Prezime'),
     ('UUID_HRVOJE', 'private', 'Hrvoje');
   ```

## Lokalni razvoj

```bash
npm install
npm run dev
```

Otvori [http://localhost:3000](http://localhost:3000).

## Deploy (hosting na URL-u)

1. Push repozitorij na GitHub.
2. Na [vercel.com](https://vercel.com) → "New Project" → odaberi repo.
3. Dodaj iste env varijable (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) u Vercel → Project Settings → Environment Variables.
4. Deploy. Vercel daje javni URL koji svi mogu koristiti.

## Napomene

- Export u Excel/CSV: gumb "⬇ Export u Excel/CSV" u Ukupnoj tablici generira `.csv` datoteku koja se otvara izravno u Excelu (bez dodatnih biblioteka — namjerno, `xlsx` npm paket ima poznate neriješene sigurnosne ranjivosti).
- Način otplate po kreditu: fiksna rata / anuitet (auto-izračun rasporeda) / ručni raspored (za slučajeve kad rate nisu jednake, npr. varijabilna kamata).
- Slike barkoda/uplatnica spremaju se u privatne Supabase Storage bucketove, odvojeno za poslovne (`barcodes-business`) i privatne (`barcodes-private`) stavke.
