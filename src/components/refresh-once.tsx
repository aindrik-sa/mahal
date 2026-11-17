"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders server layouts once (e.g. to update the unread badge after marking notifications read). */
export function RefreshOnce({ when }: { when: boolean }) {
  const router = useRouter();
  useEffect(() => { if (when) router.refresh(); }, [when, router]);
  return null;
}
