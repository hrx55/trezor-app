"use client";

import { useState } from "react";
import TrezorApp from "@/components/TrezorApp";

export default function VaultApp({
  displayName,
  role,
  hasPrivateAccess,
}: {
  displayName: string;
  role: "admin" | "staff";
  hasPrivateAccess: boolean;
}) {
  const [mode, setMode] = useState<"business" | "personal">("business");

  if (mode === "personal") {
    return (
      <TrezorApp
        key="personal"
        entityType="personal"
        headerLabel="Privatne financije"
        displayName={displayName}
        viewSwitch={{ label: "🏢 Poslovni sef", onClick: () => setMode("business") }}
      />
    );
  }

  return (
    <TrezorApp
      key="business"
      entityType="business"
      headerLabel={role === "admin" ? "Admin" : "Suradnik"}
      displayName={displayName}
      showUsersLink={role === "admin"}
      viewSwitch={hasPrivateAccess ? { label: "🔒 Privatne financije", onClick: () => setMode("personal") } : undefined}
    />
  );
}
