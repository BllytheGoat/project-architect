"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

export function LogoutButton({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await apiPost("/api/auth/logout", {});
        } finally {
          router.push("/");
          router.refresh();
        }
      }}
    >
      {busy ? "Signing out…" : label}
    </Button>
  );
}
