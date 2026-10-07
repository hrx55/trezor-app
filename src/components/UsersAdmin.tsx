"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { C } from "@/lib/design";
import { Badge, Button, Field, Modal, Select, TextInput } from "@/components/ui";
import { fmtDate } from "@/lib/loans";
import type { Role } from "@/lib/types";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  staff: "Suradnik (staff)",
  private: "Privatno",
};
const ROLE_TONE: Record<Role, "gold" | "success" | "neutral"> = {
  admin: "gold",
  staff: "neutral",
  private: "success",
};

type UserRow = {
  id: string;
  email: string | null;
  created_at: string;
  role: Role | null;
  display_name: string | null;
};

export default function UsersAdmin() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setError(body?.error || `Greška pri dohvaćanju korisnika (HTTP ${res.status}).`);
        return;
      }
      setUsers(body.users);
    } catch {
      setError("Greška u mrežnoj komunikaciji sa serverom.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "36px 20px 60px" }}>
        <div style={{ marginBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.25em", color: C.gold, fontFamily: C.mono, marginBottom: 6 }}>TREZOR · ADMIN</div>
            <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 30, margin: 0, color: C.text }}>Korisnici</h1>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="ghost" onClick={() => router.push("/")}>
              ← Natrag na sef
            </Button>
            <Button variant="primary" onClick={() => setShowAdd(true)}>
              + Dodaj korisnika
            </Button>
          </div>
        </div>

        {error && (
          <div style={{ background: C.dangerBg, border: `1px solid rgba(217,105,95,0.4)`, color: C.danger, padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 18 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: C.textFaint, fontFamily: C.mono, fontSize: 13 }}>Učitavam…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: C.mono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Ime", "Email", "Rola", "Registriran"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", color: C.textFaint, fontWeight: 400, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px 12px", color: C.text }}>{u.display_name || "—"}</td>
                    <td style={{ padding: "10px 12px", color: C.textSoft }}>{u.email}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {u.role ? <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</Badge> : <Badge tone="danger">Bez profila</Badge>}
                    </td>
                    <td style={{ padding: "10px 12px", color: C.textSoft }}>{fmtDate(u.created_at.slice(0, 10))}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: "24px 12px", color: C.textFaint }}>
                      Nema registriranih korisnika.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Novi korisnik" onClose={() => setShowAdd(false)}>
          <AddUserForm
            onDone={() => {
              setShowAdd(false);
              load();
            }}
            onCancel={() => setShowAdd(false)}
          />
        </Modal>
      )}
    </div>
  );
}

function AddUserForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: displayName, role }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setError(body?.error || `Greška pri kreiranju korisnika (HTTP ${res.status}).`);
        return;
      }
      onDone();
    } catch {
      setError("Greška u mrežnoj komunikaciji sa serverom.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Field label="Ime za prikaz">
        <TextInput placeholder="npr. Ana Anić" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
      </Field>
      <Field label="Email">
        <TextInput type="email" placeholder="ime@skipper4you.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Lozinka">
        <TextInput type="password" placeholder="min. 8 znakova" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Rola">
        <Select
          options={["Admin", "Suradnik (staff)", "Privatno"]}
          value={role === "admin" ? "Admin" : role === "staff" ? "Suradnik (staff)" : "Privatno"}
          onChange={(e) => {
            const map: Record<string, Role> = { Admin: "admin", "Suradnik (staff)": "staff", Privatno: "private" };
            setRole(map[e.target.value]);
          }}
        />
      </Field>
      {error && <div style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <Button variant="ghost" onClick={onCancel}>
          Odustani
        </Button>
        <Button variant="primary" onClick={submit} disabled={saving}>
          {saving ? "Spremam…" : "Dodaj"}
        </Button>
      </div>
    </div>
  );
}
