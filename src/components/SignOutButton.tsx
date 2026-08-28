"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="min-h-[44px] rounded-md border border-white/20 px-4 text-sm font-medium text-white/80 hover:border-accent hover:text-accent"
    >
      Sign out
    </button>
  );
}
