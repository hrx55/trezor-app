import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VaultApp from "@/components/VaultApp";
import PrivateApp from "@/components/PrivateApp";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return (
      <div style={{ padding: 40, color: "#ECE8DF", background: "#0D0F13", minHeight: "100vh" }}>
        Račun nema dodijeljenu ulogu (profile). Zamoli admina da ti postavi rolu u tablici `profiles`.
      </div>
    );
  }

  if (profile.role === "private") {
    return <PrivateApp displayName={profile.display_name} />;
  }

  return <VaultApp displayName={profile.display_name} role={profile.role as "admin" | "staff"} />;
}
