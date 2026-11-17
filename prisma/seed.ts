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

  console.log(`Seeded. Logins (password: ${DEMO_PASSWORD}): admin@mahall.test, resident@mahall.test`);
}

main().finally(() => prisma.$disconnect());
