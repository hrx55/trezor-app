"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/design";
import { Button, Field, TextInput } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Pogrešan email ili lozinka.");
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: C.text,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: 20,
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 32,
          width: "100%",
          maxWidth: 380,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.25em", color: C.gold, fontFamily: C.mono, marginBottom: 6 }}>
          TREZOR
        </div>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 26, margin: "0 0 22px", color: C.text }}>
          Prijava
        </h1>
        <Field label="Email">
          <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Lozinka">
          <TextInput type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && (
          <div style={{ color: C.danger, fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}
        <Button type="submit" variant="primary" disabled={loading} style={{ width: "100%", marginTop: 6 }}>
          {loading ? "Prijava…" : "Uđi u trezor"}
        </Button>
      </form>
    </div>
  );
}
