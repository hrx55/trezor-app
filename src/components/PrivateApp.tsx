"use client";

import TrezorApp from "@/components/TrezorApp";

export default function PrivateApp({ displayName }: { displayName: string }) {
  return <TrezorApp entityType="personal" headerLabel="Privatne financije" displayName={displayName} />;
}
