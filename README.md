# Mahall

Masjid-based community management web app. Next.js 15 (App Router) + PostgreSQL + Prisma.

## Run locally

Requires Node 20+ and Docker Desktop (running).

```bash
npm install
npm run db:up        # starts PostgreSQL in Docker (port 5435)
npm run db:migrate   # creates tables (first time: name the migration e.g. "init")
npm run db:seed      # demo masjid, families, board
npm run dev          # http://localhost:3000
```

Demo logins (password `mahall123`, local only):

- Admin: `admin@mahall.test`
- Resident: `resident@mahall.test`

## Status

**Phase 1 (done):** login and sessions, invite and reset links, families and members (auto IDs, search and filters, duplicate checks, CSV import and export), board management with previous committees, admin and resident dashboards, resident profile, audit log. Every record is scoped by `masjidId`.

**Phase 2 (done):** yearly subscription plans billed per family in monthly installments, due day, grace period and late fee, exemptions, waivers and adjustments. Residents pay by UPI using a QR code or a UPI app link, then submit the UTR. Admins verify or reject submissions and record cash or bank payments. Payments go to the oldest installments first, and receipts can be printed. There are collection and pending reports with CSV export. No payment gateway is used.

**Phase 3 (done):** in-app notifications sent to all residents, specific families, selected members, residents with pending subscription, board members or wards. They support priority, scheduled publishing, expiry, an attachment link, read counts and withdrawal, and residents see an unread badge. Automated subscription reminders (upcoming, due today, overdue) never send duplicates, even when two runs overlap, and payment events notify the family. Meetings have agendas, draft, publish and cancel with notifications, minutes and resolutions that stay private until published.

**Phase 4 (done):** form builder with text, long text, number, date, dropdown, radio, checkbox, file upload and declaration fields. Required fields, reordering and activation are supported, and each form can have a certificate template. Residents fill forms in, save drafts, attach documents, submit to get an APP-YYYY-NNNN ID, answer requests for more information and resubmit, then download the certificate. Admins review, request information, approve or reject, and issue a certificate by generating it from the template (CERT-YYYY-NNNN, printable) and/or uploading a signed PDF. Every status change is kept in history and notifies the applicant. Submitted applications keep a copy of the form fields as they were at submission.

**Phase 5 (done):** income and expense ledgers using the PRD categories and methods, with receipts or supporting documents attached and kept private (admins only), donor and vendor details, and an approver for expenses. Records are voided with a reason rather than deleted. Verified subscription payments are added to income automatically. The overview covers a financial year (April to March) with total, net and balance (from an opening balance), the current month's figures, a monthly chart with a table view, and category breakdowns, plus a CSV export for the year. Residents see only the summary published through a chosen month: totals, the chart, categories and expense descriptions, with no donor names, references, receipts or vendors.

All five PRD modules are now built. **Possible next steps:** super-admin tools for multiple masjids, web push, email or WhatsApp delivery, S3 storage and malware scanning, Malayalam and Arabic, and QR codes to verify certificates.

## File uploads

Uploads are stored privately in `storage/` (gitignored, set `STORAGE_DIR` to change). Only PDF, JPG and PNG are accepted, and the type is checked from the file contents, not its name. Files are limited to 5 MB each and 10 per application. Downloads go through `/files/[id]`, which only lets masjid admins and the applicant themselves download a file. **Before production:** move storage to S3-compatible object storage (`src/lib/storage.ts`) and add malware scanning (marked TODO there).

## Scheduled reminders

Reminders run whenever an admin opens the dashboard. In production, also call this once a day from a scheduler:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-host>/api/cron/reminders
```

## Notes

- Residents log in with the phone or email on their member record. Admins create the account from the family page using "Invite to portal" and share the generated link. The same button issues password-reset links (there is no email provider yet).
- Residents only see aggregate Mahall figures, the public board and their own family.
