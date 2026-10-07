import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

const VALID_ROLES: Role[] = ["admin", "staff", "private"];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return null;

  return user;
}

export async function GET() {
  try {
    const caller = await requireAdmin();
    if (!caller) {
      return NextResponse.json({ error: "Samo admin može vidjeti popis korisnika." }, { status: 403 });
    }

    const admin = createAdminClient();
    const [{ data: authUsers, error: authErr }, { data: profiles, error: profilesErr }] = await Promise.all([
      admin.auth.admin.listUsers(),
      admin.from("profiles").select("id, role, display_name, created_at"),
    ]);
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 });

    const profileById = new Map((profiles || []).map((p) => [p.id, p]));
    const users = authUsers.users.map((u) => {
      const profile = profileById.get(u.id);
      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        role: profile?.role ?? null,
        display_name: profile?.display_name ?? null,
      };
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error("GET /api/admin/users failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Nepoznata greška na serveru." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const caller = await requireAdmin();
    if (!caller) {
      return NextResponse.json({ error: "Samo admin može dodavati korisnike." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const displayName = typeof body?.display_name === "string" ? body.display_name.trim() : "";
    const role = body?.role as Role;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Nevažeći email." }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Lozinka mora imati barem 8 znakova." }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json({ error: "Ime za prikaz je obavezno." }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Nevažeća rola." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      return NextResponse.json({ error: createErr?.message || "Kreiranje korisnika nije uspjelo." }, { status: 500 });
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .insert({ id: created.user.id, role, display_name: displayName });
    if (profileErr) {
      // profil nije uspio - ukloni auth korisnika da ne ostane "siroče" bez role
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    return NextResponse.json({ id: created.user.id, email, role, display_name: displayName }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/users failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Nepoznata greška na serveru." }, { status: 500 });
  }
}
