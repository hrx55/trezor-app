import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UsersAdmin from "@/components/UsersAdmin";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, display_name").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") redirect("/");

  return <UsersAdmin />;
}
