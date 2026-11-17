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

**Next:** Phase 3, notifications and meetings. Phase 4, applications and form builder. Phase 5, income and expenses.

## Notes

- Residents log in with the phone or email on their member record. Admins create the account from the family page using "Invite to portal" and share the generated link. The same button issues password-reset links (there is no email provider yet).
- Residents only see aggregate Mahall figures, the public board and their own family.
