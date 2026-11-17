import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateInvoices, settlePayment } from "../src/lib/billing";

const prisma = new PrismaClient();

// Demo data for local development only.
const DEMO_PASSWORD = "mahall123";

async function main() {
  const existing = await prisma.masjid.findFirst();
  if (existing) {
    console.log("Seed skipped: database already has data.");
    return;
  }

  const masjid = await prisma.masjid.create({
    data: { name: "Juma Masjid Demo Mahall", address: "Main Road, Demo Town", phone: "+91 90000 00000" },
  });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.user.create({
    data: { masjidId: masjid.id, name: "Mahall Admin", email: "admin@mahall.test", passwordHash: hash, role: "ADMIN" },
  });

  const families = [
    { name: "Puthiyaveettil", house: "Puthiyaveettil House", no: "12", ward: "Ward 1", head: "Abdul Rahman", members: [["Fathima", "FEMALE", "Wife"], ["Muhammed Shafi", "MALE", "Son"], ["Ayisha", "FEMALE", "Daughter"]] },
    { name: "Kunnumpurath", house: "Kunnumpurath", no: "27", ward: "Ward 2", head: "Ibrahim Kutty", members: [["Sainaba", "FEMALE", "Wife"], ["Anas", "MALE", "Son"]] },
    { name: "Valiyakath", house: "Valiyakath Manzil", no: "8", ward: "Ward 1", head: "Moideen", members: [["Khadeeja", "FEMALE", "Wife"]] },
    { name: "Thottathil", house: "Thottathil", no: "41", ward: "Ward 3", head: "Haris", members: [["Rahmath", "FEMALE", "Wife"], ["Hiba", "FEMALE", "Daughter"], ["Hamdan", "MALE", "Son"]] },
  ] as const;

  let famSeq = 0;
  let memSeq = 0;
  const code = (p: string, n: number) => `${p}-${String(n).padStart(4, "0")}`;

  for (const [i, f] of families.entries()) {
    const family = await prisma.family.create({
      data: {
        masjidId: masjid.id, familyCode: code("FAM", ++famSeq), familyName: f.name, houseName: f.house,
        houseNumber: f.no, ward: f.ward, registrationDate: new Date(2024, 0, 15), address: `${f.house}, ${f.ward}, Demo Town`, primaryPhone: `+91 98470 0000${i}`,
      },
    });
    const head = await prisma.member.create({
      data: {
        masjidId: masjid.id, memberCode: code("MEM", ++memSeq), familyId: family.id, fullName: f.head,
        gender: "MALE", relationship: "Head", phone: `+91 98470 0000${i}`, dateOfBirth: new Date(1970 + i * 3, 4, 10),
      },
    });
    await prisma.family.update({ where: { id: family.id }, data: { headMemberId: head.id } });
    for (const [name, gender, rel] of f.members) {
      await prisma.member.create({
        data: { masjidId: masjid.id, memberCode: code("MEM", ++memSeq), familyId: family.id, fullName: name, gender, relationship: rel },
      });
    }
    if (i === 0) {
      await prisma.user.create({
        data: { masjidId: masjid.id, name: f.head, email: "resident@mahall.test", passwordHash: hash, role: "RESIDENT", memberId: head.id },
      });
    }
  }
  await prisma.masjid.update({ where: { id: masjid.id }, data: { familySeq: famSeq, memberSeq: memSeq } });

  const termStart = new Date(2025, 3, 1);
  const board = [
    ["Abdul Rahman", "President"], ["K. Haris", "Vice President"], ["Ibrahim Kutty", "General Secretary"],
    ["Shameer P.", "Joint Secretary"], ["Moideen", "Treasurer"], ["Ashraf V.", "Executive Committee Member"],
  ];
  for (const [i, [name, designation]] of board.entries()) {
    await prisma.boardMember.create({
      data: { masjidId: masjid.id, fullName: name, designation, phone: `+91 94460 1000${i}`, termStart, sortOrder: i },
    });
  }
  await prisma.boardMember.create({
    data: { masjidId: masjid.id, fullName: "Usman M.", designation: "President", termStart: new Date(2022, 3, 1), termEnd: new Date(2025, 2, 31), status: "PREVIOUS" },
  });

  // Subscription plan for the current Indian financial year (April start).
  const now = new Date();
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const plan = await prisma.subscriptionPlan.create({
    data: { masjidId: masjid.id, name: `FY ${fy}-${String(fy + 1).slice(2)}`, startMonth: new Date(Date.UTC(fy, 3, 1)), annualAmount: 1200, monthlyAmount: 100,
      dueDay: 10, graceDays: 5, lateFee: 10, upiId: "demomasjid@okaxis", upiName: "Demo Juma Masjid" },
  });
  await generateInvoices(plan);
  const admin = await prisma.user.findFirstOrThrow({ where: { masjidId: masjid.id, role: "ADMIN" } });
  const fams = await prisma.family.findMany({ where: { masjidId: masjid.id }, orderBy: { familyCode: "asc" } });
  // FAM-0001: paid 6 months in cash. FAM-0002: paid everything due so far by bank. FAM-0003: nothing paid. FAM-0004: 2 months paid + one UPI awaiting verification.
  const pay = async (famIdx: number, months: number, method: "CASH" | "BANK_TRANSFER" | "UPI_MANUAL", verify: boolean, reference: string | null) => {
    const invs = await prisma.subscriptionInvoice.findMany({ where: { familyId: fams[famIdx].id, status: "PENDING" }, orderBy: { periodMonth: "asc" }, take: months });
    if (!invs.length) return;
    const p = await prisma.payment.create({
      data: { masjidId: masjid.id, familyId: fams[famIdx].id, amount: invs.length * 100, method, reference, paidOn: new Date(), submittedById: admin.id,
        allocations: { create: invs.map((i) => ({ invoiceId: i.id, amount: 100 })) } },
    });
    if (verify) await prisma.$transaction((tx) => settlePayment(tx, p.id, admin.id));
  };
  const dueSoFar = await prisma.subscriptionInvoice.count({ where: { familyId: fams[1].id, dueDate: { lte: now } } });
  await pay(0, 6, "CASH", true, null);
  await pay(1, Math.max(1, dueSoFar), "BANK_TRANSFER", true, "NEFT0012345");
  await pay(3, 2, "CASH", true, null);
  await pay(3, 1, "UPI_MANUAL", false, "412398765432");

  // Meetings and an announcement (Phase 3).
  const residents = (await prisma.user.findMany({ where: { masjidId: masjid.id, role: "RESIDENT" }, select: { id: true } })).map((u) => u.id);
  const day = 864e5;
  const upcoming = await prisma.meeting.create({
    data: { masjidId: masjid.id, meetingCode: "MTG-0001", title: "Annual General Body Meeting", category: "General Body Meeting", createdById: admin.id,
      startsAt: new Date(Date.now() + 10 * day), location: "Masjid hall", attendance: "Family heads required", status: "PUBLISHED",
      description: "All family heads are requested to attend after Isha prayer.",
      agenda: { create: [{ position: 1, title: "Presentation of annual accounts" }, { position: 2, title: "Madrasa renovation proposal", details: "Estimate of ₹4.5 lakh from the building committee." }, { position: 3, title: "Ramadan programme planning" }] } },
  });
  await prisma.meeting.create({
    data: { masjidId: masjid.id, meetingCode: "MTG-0002", title: "Committee Meeting – September", category: "Committee Meeting", createdById: admin.id,
      startsAt: new Date(Date.now() - 50 * day), location: "Masjid office", status: "COMPLETED", minutesPublishedAt: new Date(Date.now() - 45 * day),
      minutes: "Present: 9 of 11 committee members.\nThe treasurer presented the August accounts. Members discussed the water tank repair.",
      agenda: { create: [{ position: 1, title: "Water tank repair", resolution: "Approved up to ₹35,000; work to finish before Rabi al-Awwal." }, { position: 2, title: "Subscription collection drive", resolution: "Ward volunteers to visit families with 3+ months pending." }] } },
  });
  await prisma.masjid.update({ where: { id: masjid.id }, data: { meetingSeq: 2 } });
  await prisma.notification.create({
    data: { masjidId: masjid.id, title: "General Body Meeting: Annual General Body Meeting", body: "All family heads are requested to attend. Agenda: annual accounts, madrasa renovation, Ramadan planning.",
      category: "MEETING", priority: "IMPORTANT", audience: "ALL", audienceLabel: "All residents", createdById: admin.id, meetingId: upcoming.id,
      recipients: { create: residents.map((userId) => ({ userId })) } },
  });
  await prisma.notification.create({
    data: { masjidId: masjid.id, title: "Water supply interruption", body: "Ablution area water will be off on Friday from 9 am to 11 am for tank cleaning.",
      category: "NOTICE", audience: "ALL", audienceLabel: "All residents", createdById: admin.id, publishAt: new Date(Date.now() - 2 * day),
      recipients: { create: residents.map((userId) => ({ userId })) } },
  });

  // Application forms (Phase 4). Field wording must follow the masjid's actual verification process.
  type F = { label: string; type: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "SELECT" | "RADIO" | "CHECKBOX" | "FILE" | "DECLARATION"; required?: boolean; options?: string[]; helpText?: string };
  const mkForm = (name: string, category: "MARRIAGE_CERTIFICATE" | "MEMBERSHIP_CERTIFICATE", description: string, certificateTemplate: string, fields: F[]) =>
    prisma.form.create({
      data: {
        masjidId: masjid.id, name, category, description, certificateTemplate, isActive: true,
        fields: { create: fields.map((x, i) => ({ position: i + 1, label: x.label, type: x.type, required: x.required ?? false, options: x.options ?? [], helpText: x.helpText })) },
      },
    });
  await mkForm(
    "Marriage Certificate", "MARRIAGE_CERTIFICATE",
    "Apply for a certificate of a nikah solemnised under this Mahall. Keep scanned copies of the documents ready.",
    "This is to certify that the Nikah of {{Groom's name}}, son of {{Groom's father's name}}, and {{Bride's name}}, daughter of {{Bride's father's name}}, was solemnised on {{Marriage date}} at {{Marriage location}}, in the presence of witnesses, according to Islamic Shariah, and is recorded in the marriage register of {{masjid}}.\n\nCertificate No. {{certificate_no}}, issued on {{date}}.",
    [
      { label: "Groom's name", type: "TEXT", required: true },
      { label: "Groom's father's name", type: "TEXT", required: true },
      { label: "Bride's name", type: "TEXT", required: true },
      { label: "Bride's father's name", type: "TEXT", required: true },
      { label: "Marriage date", type: "DATE", required: true },
      { label: "Marriage location", type: "TEXT", required: true },
      { label: "Bride's family details", type: "TEXTAREA", helpText: "House name, Mahall, contact" },
      { label: "Groom's family details", type: "TEXTAREA", helpText: "House name, Mahall, contact" },
      { label: "Guardian (wali) name and relationship", type: "TEXT", required: true },
      { label: "Contact number", type: "TEXT", required: true },
      { label: "Purpose of certificate", type: "SELECT", options: ["Passport / visa", "Government records", "Personal", "Other"] },
      { label: "Nikah register copy or photos", type: "FILE", required: true },
      { label: "ID proof of bride and groom", type: "FILE", required: true, helpText: "Aadhaar or passport" },
      { label: "Additional information", type: "TEXTAREA" },
      { label: "Declaration", type: "DECLARATION", required: true, helpText: "I declare that the information given is true and the documents attached are genuine." },
    ],
  );
  await mkForm(
    "Mahall Membership Certificate", "MEMBERSHIP_CERTIFICATE",
    "Certifies that the applicant's family is a registered member of this Mahall.",
    "This is to certify that {{applicant}} of {{family}} is a registered member of {{masjid}}. This certificate is issued on request for the purpose of {{Purpose}}.\n\nCertificate No. {{certificate_no}}, issued on {{date}}.",
    [
      { label: "Purpose", type: "RADIO", required: true, options: ["Marriage", "Employment", "Education", "Other"] },
      { label: "Details", type: "TEXTAREA" },
      { label: "Declaration", type: "DECLARATION", required: true, helpText: "I declare that the information given is true." },
    ],
  );

  // Finance (Phase 5): opening balance at FY start, monthly income and expenses, published through last month.
  const ist = (y: number, m: number, d: number) => new Date(`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+05:30`);
  await prisma.masjid.update({ where: { id: masjid.id }, data: { openingBalance: 185000, openingBalanceDate: ist(fy, 3, 1) } });
  let incSeq = (await prisma.masjid.findUniqueOrThrow({ where: { id: masjid.id } })).incomeSeq;
  let expSeq = 0;
  const monthsSoFar: { y: number; m: number }[] = [];
  for (let k = 0; k < 12; k++) {
    const y = k < 9 ? fy : fy + 1, m = (k + 3) % 12;
    if (ist(y, m, 1) > now) break;
    monthsSoFar.push({ y, m });
  }
  for (const [k, { y, m }] of monthsSoFar.entries()) {
    const day = (d: number) => { const t = ist(y, m, d); return t > now ? now : t; };
    const inc = [
      { category: "DONATION" as const, description: "Friday collection", amount: 18000 + k * 750, method: "CASH" as const, d: 8 },
      { category: "DONATION" as const, description: "Donation for madrasa", amount: 5000 + (k % 3) * 2500, method: "UPI" as const, d: 15, donorName: "Well-wisher (anonymous)" },
      ...(m === 8 ? [{ category: "EVENT_COLLECTION" as const, description: "Nabidinam programme collection", amount: 42000, method: "CASH" as const, d: 20 }] : []),
    ];
    const exp = [
      { category: "ELECTRICITY" as const, description: "KSEB electricity bill", amount: 6200 + k * 180, method: "UPI" as const, d: 5, recipient: "KSEB" },
      { category: "WATER" as const, description: "Water authority bill", amount: 900, method: "UPI" as const, d: 6, recipient: "Kerala Water Authority" },
      { category: "STAFF_SALARY" as const, description: "Imam and muezzin salary", amount: 28000, method: "BANK_TRANSFER" as const, d: 1, recipient: "Masjid staff", approvedBy: "Treasurer" },
      ...(k === 2 ? [{ category: "MAINTENANCE" as const, description: "Water tank repair", amount: 32500, method: "CHEQUE" as const, d: 18, recipient: "Al-Ameen Plumbing", approvedBy: "Committee resolution" }] : []),
      ...(m === 8 ? [{ category: "RELIGIOUS_ACTIVITIES" as const, description: "Nabidinam programme expenses", amount: 27500, method: "CASH" as const, d: 21, approvedBy: "Secretary" }] : []),
    ];
    for (const x of inc) await prisma.income.create({ data: { masjidId: masjid.id, txnCode: `INC-${String(++incSeq).padStart(5, "0")}`, category: x.category, description: x.description, amount: x.amount, date: day(x.d), method: x.method, donorName: "donorName" in x ? x.donorName : null, recordedById: admin.id } });
    for (const x of exp) await prisma.expense.create({ data: { masjidId: masjid.id, txnCode: `EXP-${String(++expSeq).padStart(5, "0")}`, category: x.category, description: x.description, amount: x.amount, date: day(x.d), method: x.method, recipient: "recipient" in x ? x.recipient : null, approvedBy: "approvedBy" in x ? x.approvedBy : null, recordedById: admin.id } });
  }
  await prisma.masjid.update({ where: { id: masjid.id }, data: { incomeSeq: incSeq, expenseSeq: expSeq, financePublishedThrough: ist(now.getFullYear(), now.getMonth(), 1) } });

  console.log(`Seeded. Logins (password: ${DEMO_PASSWORD}): admin@mahall.test, resident@mahall.test`);
}

main().finally(() => prisma.$disconnect());
