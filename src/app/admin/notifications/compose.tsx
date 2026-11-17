"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { sendNotification } from "./actions";

const CATEGORIES: [string, string][] = [
  ["NOTICE", "Community notice"], ["MEETING", "General body meeting"], ["EMERGENCY", "Emergency"], ["ACTIVITY", "Masjid activity"],
  ["EVENT", "Holiday & event"], ["SUBSCRIPTION", "Subscription reminder"], ["PAYMENT", "Payment"], ["APPLICATION", "Certificate application"],
];
const AUDIENCES: [string, string][] = [
  ["ALL", "All residents"], ["PENDING_SUBSCRIPTION", "Residents with pending subscription"], ["WARDS", "Specific areas / wards"],
  ["FAMILIES", "Specific families"], ["MEMBERS", "Selected members"], ["BOARD", "Board members"],
];

export function Compose({ wards }: { wards: string[] }) {
  const [audience, setAudience] = useState("ALL");
  const [category, setCategory] = useState("NOTICE");
  return (
    <ActionForm action={sendNotification} resetOnOk className="card grid gap-4 sm:grid-cols-2" submit="Publish notification" pendingLabel="Publishing…">
      <label className="field sm:col-span-2"><span>Title *</span><input name="title" maxLength={120} required /></label>
      <label className="field sm:col-span-2"><span>Description *</span><textarea name="body" rows={4} maxLength={4000} required /></label>
      <label className="field"><span>Category</span>
        <select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label className="field"><span>Priority</span>
        <select name="priority" defaultValue={category === "EMERGENCY" ? "URGENT" : "NORMAL"} key={category}>
          <option value="NORMAL">Normal</option><option value="IMPORTANT">Important</option><option value="URGENT">Urgent</option>
        </select>
      </label>
      <label className="field sm:col-span-2"><span>Target audience</span>
        <select name="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>{AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      {audience === "WARDS" && (
        <fieldset className="sm:col-span-2 flex flex-wrap gap-3 text-sm">
          {wards.length === 0 && <span className="text-stone-500">No wards recorded on families yet.</span>}
          {wards.map((w) => <label key={w} className="flex items-center gap-1.5"><input type="checkbox" name="wards" value={w} />{w}</label>)}
        </fieldset>
      )}
      {(audience === "FAMILIES" || audience === "MEMBERS") && (
        <label className="field sm:col-span-2">
          <span>{audience === "FAMILIES" ? "Family IDs" : "Member IDs"} (comma or space separated)</span>
          <input name="codes" placeholder={audience === "FAMILIES" ? "FAM-0001, FAM-0004" : "MEM-0001, MEM-0007"} />
        </label>
      )}
      {audience === "BOARD" && <p className="sm:col-span-2 text-xs text-stone-500">Reaches admins, plus residents whose phone or email matches an active board member.</p>}
      <label className="field"><span>Publish at (blank = now)</span><input name="publishAt" type="datetime-local" /></label>
      <label className="field"><span>Expires at (optional)</span><input name="expiresAt" type="datetime-local" /></label>
      <label className="field sm:col-span-2"><span>Attachment link (optional)</span><input name="attachmentUrl" type="url" placeholder="https://drive.google.com/…" /></label>
      <p className="sm:col-span-2 text-xs text-stone-500">Delivered in-app to residents with an activated portal account. Every notification is kept in history.</p>
    </ActionForm>
  );
}
