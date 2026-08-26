"use client";

import TrezorApp from "@/components/TrezorApp";

export default function VaultApp({ displayName, role }: { displayName: string; role: "admin" | "staff" }) {
  return <TrezorApp entityType="business" headerLabel={role === "admin" ? "Admin" : "Suradnik"} displayName={displayName} />;
}
