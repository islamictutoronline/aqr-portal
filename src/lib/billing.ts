import { Dataset, Row, findRate, invoiceBalance, klDay, Rate, feeReference } from './core';
import { classRateOverride, feeRows, CHARGEABLE_ATTENDANCE } from './reporting';
// Bayaran ikut amaun (migrasi 52): sesi dibayar, kredit sesi, sesi ganti dan tiruan demo bagi
// session_invoice_for / record_family_payment.

const sum = (rows: Row[], key = 'sessions') => rows.reduce((n, r) => n + Number(r[key] || 0), 0);
const verified = (data: Dataset, pid: unknown) =>
  (data.payments ?? []).find((p) => p.id === pid)?.status === 'verified';

// Baki kredit sesi seorang murid, boleh dihadkan kepada kredit sehingga bulan tertentu.
export function creditBalance(data: Dataset, studentId: unknown, upto?: string, skipUse?: string) {
  const credits = (data.session_credits ?? []).filter(
    (c) => c.student_id === studentId && (!upto || String(c.period) <= upto),
  );
  const uses = (data.session_credit_uses ?? []).filter(
    (u) => u.student_id === studentId && u.period !== skipUse,
  );
  return sum(credits) - sum(uses);
}

// Sesi dan amaun (sen) yang sudah dibayar bagi seorang anak pada satu invois (sama seperti
// private.child_invoice_paid). Invois dibayar penuh tanpa baris sesi = semua sesinya dibayar.
export function childInvoicePaid(data: Dataset, inv: Row, studentId: unknown) {
  const items = (data.invoice_items ?? []).filter(
    (x) => x.invoice_id === inv.id && x.student_id === studentId,
  );
  const any = (data.payment_sessions ?? []).some((r) => r.invoice_id === inv.id);
  if (inv.status === 'paid' && !any)
    return {
      sessions: sum(items, 'quantity'),
      amount: items.reduce(
        (n, x) => n + (Number(x.total_sen) || Number(x.quantity) * Number(x.unit_price_sen)),
        0,
      ),
    };
  const rows = (data.payment_sessions ?? []).filter(
    (r) => r.invoice_id === inv.id && r.student_id === studentId && verified(data, r.payment_id),
  );
  return { sessions: sum(rows), amount: sum(rows, 'amount_sen') };
}
const monthInvoices = (data: Dataset, studentId: unknown, month: string) =>
  (data.invoices ?? []).filter(
    (i) =>
      i.period === month &&
      !['void', 'draft'].includes(String(i.status)) &&
      (data.invoice_items ?? []).some((x) => x.invoice_id === i.id && x.student_id === studentId),
  );
// Baki (sen) seorang anak dalam invois bulan itu.
export function childOwed(data: Dataset, studentId: unknown, month: string) {
  return monthInvoices(data, studentId, month).reduce((n, inv) => {
    const value = (data.invoice_items ?? [])
      .filter((x) => x.invoice_id === inv.id && x.student_id === studentId)
      .reduce(
        (v, x) => v + (Number(x.total_sen) || Number(x.quantity) * Number(x.unit_price_sen)),
        0,
      );
    return n + Math.max(0, value - childInvoicePaid(data, inv, studentId).amount);
  }, 0);
}

export type SessionPay = { recorded: number; paid: number; unpaid: number; credit: number };
// Kotak "sesi dibayar" seorang murid bagi sebulan.
export function sessionPayStats(data: Dataset, studentId: unknown, month: string): SessionPay {
  const recorded = sessionsHeld(data, studentId, month);
  let paid = monthInvoices(data, studentId, month).reduce(
    (n, inv) => n + childInvoicePaid(data, inv, studentId).sessions,
    0,
  );
  paid += sum(
    (data.session_credit_uses ?? []).filter(
      (u) => u.student_id === studentId && u.period === month,
    ),
  );
  paid = Math.min(paid, recorded);
  return {
    recorded,
    paid,
    unpaid: Math.max(0, recorded - paid),
    credit: Math.max(0, creditBalance(data, studentId)),
  };
}

// Sesi direkod (dicaj) seorang murid bagi sebulan.
export function sessionsHeld(data: Dataset, studentId: unknown, month: string) {
  const done = new Map(
    (data.class_sessions ?? [])
      .filter((s) => s.status === 'completed' && klDay(String(s.starts_at)).slice(0, 7) === month)
      .map((s) => [s.id, s] as [unknown, Row]),
  );
  return (data.attendance ?? []).filter(
    (a) =>
      a.student_id === studentId &&
      done.has(a.session_id) &&
      CHARGEABLE_ATTENDANCE.includes(String(a.status)),
  ).length;
}
// Sesi dibayar bagi sebulan: sesi dalam bayaran invois bulan itu + kredit yang dibeli bulan itu.
export function sessionsPaid(data: Dataset, studentId: unknown, month: string) {
  return (
    monthInvoices(data, studentId, month).reduce(
      (n, inv) => n + childInvoicePaid(data, inv, studentId).sessions,
      0,
    ) +
    sum(
      (data.session_credits ?? []).filter((c) => c.student_id === studentId && c.period === month),
    )
  );
}
// Sesi ganti (migrasi 52): sudah dibayar bulan lepas tetapi belum dilaksanakan, dibawa ke bulan ini.
// Bermula November 2026 (demo boleh menetapkan organizations.quota_carry_from).
export const CARRY_FROM = '2026-11';
const prevOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};
export function studentCarry(data: Dataset, studentId: unknown, month: string): number {
  const from = String(data.organizations?.[0]?.quota_carry_from || CARRY_FROM);
  const prev = prevOf(month);
  if (prev < from) return 0;
  return Math.max(
    0,
    studentCarry(data, studentId, prev) +
      sessionsPaid(data, studentId, prev) -
      sessionsHeld(data, studentId, prev),
  );
}
// Kelas utama murid: pendaftaran aktif terawal.
export function primaryClass(data: Dataset, studentId: unknown) {
  return (data.enrollments ?? [])
    .filter((e) => e.student_id === studentId && e.status === 'active')
    .sort(
      (a, b) =>
        String(a.starts_on).localeCompare(String(b.starts_on)) ||
        String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
    )[0]?.class_id;
}
// Harga sesi kelas (kadar khas kelas, jika tidak kadar program + tempoh jadual).
export function classFee(data: Dataset, classId: unknown, day: string) {
  const override = classRateOverride(data, classId, day).fee_sen;
  if (override != null) return override;
  const cls = (data.classes ?? []).find((c) => c.id === classId);
  const code = (data.programs ?? []).find((p) => p.id === cls?.program_id)?.code;
  const minutes = Number(
    (data.class_schedules ?? []).find((r) => r.class_id === classId)?.duration_minutes || 30,
  );
  const stored = data.program_fee_rates ?? [];
  const rates = (stored.length
    ? stored
    : feeReference.map(([program_code, duration_minutes, amount_sen]) => ({
        id: `${program_code}-${duration_minutes}`,
        program_code,
        duration_minutes,
        amount_sen,
        effective_from: '2000-01-01',
      }))) as unknown as Rate[];
  try {
    return Number(findRate(rates, String(code), minutes, day).amount_sen);
  } catch {
    return null;
  }
}

// Demo: invois sesi penjaga (semua jika `guardians` kosong) — sama seperti session_invoice_for.
export function demoSessionInvoices(
  next: Dataset,
  period: string,
  id: string,
  guardians?: unknown[],
) {
  const rows = feeRows(next, period).filter(
    (f) => f.guardianId && f.rate_sen !== null && (!guardians || guardians.includes(f.guardianId)),
  );
  next.session_credit_uses ||= [];
  for (const gid of new Set(rows.map((f) => f.guardianId!))) {
    const base = `sessions:${period}:${gid}`;
    const mine = next.invoices.filter(
      (i) =>
        i.status !== 'void' &&
        (i.idempotency_key === base || String(i.idempotency_key).startsWith(`${base}:`)),
    );
    // Bayaran yang ditolak/dibalikkan tidak mengunci invois.
    const paidSome = (i: Row) =>
      (next.payment_allocations || []).some(
        (a) =>
          a.invoice_id === i.id &&
          !['rejected', 'reversed'].includes(
            String(next.payments.find((p) => p.id === a.payment_id)?.status),
          ),
      );
    const open = mine
      .filter((i) => ['issued', 'draft', 'overdue'].includes(String(i.status)) && !paidSome(i))
      .slice(-1)[0];
    // Sesi yang sudah dibilkan dikira mengikut murid (sama seperti migrasi 48), bukan teks/harga.
    const billed = new Map<unknown, number>();
    for (const x of next.invoice_items)
      if (x.invoice_id !== open?.id && mine.some((i) => i.id === x.invoice_id))
        billed.set(x.student_id, (billed.get(x.student_id) ?? 0) + Number(x.quantity));
    // Kredit sesi menampung sesi yang belum dibilkan (dikira semula setiap kali).
    const mineRows = rows.filter((f) => f.guardianId === gid);
    next.session_credit_uses = next.session_credit_uses.filter(
      (u) => !(u.guardian_id === gid && u.period === period),
    );
    for (const sid of new Set(mineRows.map((f) => f.studentId))) {
      const count = mineRows.filter((f) => f.studentId === sid).reduce((n, f) => n + f.sessions, 0);
      const remaining = count - (billed.get(sid) ?? 0);
      const used = Math.max(0, Math.min(remaining, creditBalance(next, sid, period, period)));
      if (used > 0) {
        next.session_credit_uses.push({
          id: `${id}-use-${sid}`,
          guardian_id: gid,
          student_id: sid,
          period,
          sessions: used,
        });
        billed.set(sid, (billed.get(sid) ?? 0) + used);
      }
    }
    const rest = mineRows
      .map((f) => {
        const skip = Math.min(billed.get(f.studentId) ?? 0, f.sessions);
        billed.set(f.studentId, (billed.get(f.studentId) ?? 0) - skip);
        return { f, quantity: f.sessions - skip };
      })
      .filter((x) => x.quantity > 0);
    if (!rest.length) {
      if (open) open.status = 'void';
      continue;
    }
    let key = base;
    for (let k = 2; next.invoices.some((i) => i.idempotency_key === key); k++) key = `${base}:${k}`;
    const invId = open?.id || `${id}-${gid}`;
    next.invoice_items = next.invoice_items.filter((x) => x.invoice_id !== invId);
    rest.forEach(({ f, quantity }, k) =>
      next.invoice_items.push({
        id: `${invId}-${k}`,
        invoice_id: invId,
        student_id: f.studentId,
        description: `${f.student} · ${f.program} (${f.minutes} minit)`,
        quantity,
        unit_price_sen: f.rate_sen,
        discount_sen: 0,
      }),
    );
    const total = rest.reduce((n, x) => n + x.quantity * Number(x.f.rate_sen), 0);
    if (open) open.total_sen = total;
    else
      next.invoices.push({
        id: invId,
        number: `DEMO-${next.invoices.length + 1}`,
        guardian_id: gid,
        total_sen: total,
        period: period,
        due_on: `${period}-28`,
        status: 'issued',
        idempotency_key: key,
      });
  }
}

// Demo: record_family_payment — satu amaun keluarga (null = baki penuh): baki invois tertua dahulu,
// lebihan menjadi kredit sesi bergilir antara anak.
export function demoFamilyPayment(next: Dataset, payload: Record<string, unknown>, id: string) {
  const period = String(payload.billing_period);
  const gid = payload.guardian;
  demoSessionInvoices(next, period, `${id}-inv`, [gid]);
  const kids = (next.student_guardians ?? [])
    .filter((l) => l.guardian_id === gid && l.is_billing_contact)
    .map((l) => next.students.find((x) => x.id === l.student_id))
    .filter((x): x is Row => !!x && x.status !== 'archived')
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  const due = next.invoices
    .filter(
      (i) =>
        i.guardian_id === gid &&
        i.period === period &&
        !['void', 'draft'].includes(String(i.status)),
    )
    .flatMap((inv) =>
      kids
        .map((k) => {
          const items = next.invoice_items.filter(
            (x) => x.invoice_id === inv.id && x.student_id === k.id,
          );
          const value = items.reduce(
            (v, x) => v + (Number(x.total_sen) || Number(x.quantity) * Number(x.unit_price_sen)),
            0,
          );
          return {
            inv,
            sid: k.id,
            qty: sum(items, 'quantity'),
            value,
            ...childInvoicePaid(next, inv, k.id),
          };
        })
        .filter((x) => x.qty > 0),
    );
  const owed = due.reduce((n, x) => n + Math.max(0, x.value - x.amount), 0);
  let a = payload.amount_sen == null ? owed : Number(payload.amount_sen);
  if (!(a > 0))
    throw new Error(
      'Tiada baki untuk dibayar bulan ini. Masukkan amaun jika ibu bapa membayar lebih awal.',
    );
  const total = a;
  const pid = `${id}-pay`;
  next.payment_sessions ||= [];
  next.session_credits ||= [];
  const rows: Row[] = [];
  const allocs = new Map<unknown, number>();
  for (const x of due) {
    if (a <= 0) break;
    const take = Math.min(a, Math.max(0, x.value - x.amount));
    if (take <= 0) continue;
    const got = Math.min(x.qty, Math.floor(((x.amount + take) * x.qty) / x.value)) - x.sessions;
    rows.push({
      id: `${pid}-${String(x.inv.id)}-${String(x.sid)}`,
      payment_id: pid,
      invoice_id: x.inv.id,
      student_id: x.sid,
      sessions: Math.max(0, got),
      amount_sen: take,
    });
    allocs.set(x.inv.id, (allocs.get(x.inv.id) ?? 0) + take);
    a -= take;
  }
  const credits = new Map<unknown, { n: number; fee: number }>();
  if (a > 0) {
    const fees = kids
      .map((k) => ({ sid: k.id, fee: classFee(next, primaryClass(next, k.id), `${period}-01`) }))
      .filter((x): x is { sid: string; fee: number } => !!x.fee && x.fee > 0);
    if (!fees.length) throw new Error('Tiada harga sesi untuk menyimpan kredit');
    for (let progress = true; progress && a > 0;) {
      progress = false;
      for (const f of fees)
        if (a >= f.fee) {
          const c = credits.get(f.sid) ?? { n: 0, fee: f.fee };
          c.n += 1;
          credits.set(f.sid, c);
          a -= f.fee;
          progress = true;
        }
    }
    if (a > 0)
      throw new Error(
        `Lebihan RM ${(a / 100).toFixed(2)} tidak cukup untuk satu sesi (harga sesi RM ${(Math.min(...fees.map((f) => f.fee)) / 100).toFixed(2)}). Semak amaun.`,
      );
  }
  next.payments.push({
    id: pid,
    guardian_id: gid,
    paid_on: payload.paid_on,
    method: 'bank_transfer',
    amount_sen: total,
    reference: null,
    status: 'verified',
  });
  next.payment_sessions.push(...rows);
  for (const [sid, c] of credits)
    next.session_credits.push({
      id: `${pid}-credit-${String(sid)}`,
      guardian_id: gid,
      student_id: sid,
      period,
      sessions: c.n,
      unit_price_sen: c.fee,
      payment_id: pid,
      class_id: primaryClass(next, sid),
    });
  for (const [invId, amount] of allocs) {
    const inv = next.invoices.find((x) => x.id === invId)!;
    const left = invoiceBalance(inv, next.payments, next.payment_allocations).outstanding;
    const take = Math.min(amount, Math.max(0, left));
    if (take > 0)
      next.payment_allocations.push({
        id: `${pid}-alloc-${String(invId)}`,
        payment_id: pid,
        invoice_id: invId,
        amount_sen: take,
      });
    const paid = invoiceBalance(inv, next.payments, next.payment_allocations).paid;
    inv.status = paid >= Number(inv.total_sen) ? 'paid' : paid > 0 ? 'partially_paid' : inv.status;
  }
  next.receipts.push({
    id: `${pid}-receipt`,
    payment_id: pid,
    number: `DEMO-RCT-${next.receipts.length + 1}`,
    details: { amount_sen: total },
    status: 'valid',
  });
}
