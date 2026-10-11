// Penghantaran bulanan ikut keluarga: seorang penjaga bil → semua anak (adik-beradik digabung),
// laporan bulanan setiap anak + invois penjaga untuk bulan itu, dihantar sekali melalui WhatsApp.
import { Dataset, Row, dateLabel, formatMoney, invoiceBalance, monthLabel } from './core';

export type Family = {
  guardian: Row;
  children: Row[];
  reports: Row[];
  invoice?: Row;
  // Sebab pakej belum lengkap (laporan belum diluluskan / invois belum dijana).
  missing: string[];
  sent: boolean;
};

export function familyBundles(data: Dataset, month: string): Family[] {
  const active = (data.students || []).filter((s) => s.status !== 'archived');
  const byGuardian = new Map<string, Row[]>();
  for (const l of data.student_guardians || []) {
    if (!l.is_billing_contact) continue;
    const child = active.find((s) => s.id === l.student_id);
    if (!child) continue;
    const list = byGuardian.get(String(l.guardian_id)) || [];
    list.push(child);
    byGuardian.set(String(l.guardian_id), list);
  }
  const families: Family[] = [];
  for (const [gid, children] of byGuardian) {
    const guardian = (data.guardians || []).find((g) => g.id === gid && g.active !== false);
    if (!guardian) continue;
    children.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
    const reports = (data.monthly_student_reports || []).filter(
      (r) => r.period === month && children.some((c) => c.id === r.student_id),
    );
    const invoice = (data.invoices || []).find(
      (i) =>
        i.guardian_id === gid &&
        i.period === month &&
        !['void', 'draft'].includes(String(i.status)),
    );
    const missing: string[] = [];
    for (const c of children) {
      const r = reports.find((x) => x.student_id === c.id);
      if (!r) missing.push(`Laporan ${c.full_name} belum disediakan`);
      else if (r.status !== 'approved') missing.push(`Laporan ${c.full_name} belum diluluskan`);
    }
    if (!invoice) missing.push('Invois bulan ini belum dijana');
    if (!guardian.phone) missing.push('Tiada no. WhatsApp penjaga');
    const approved = reports.filter((r) => r.status === 'approved');
    const sent =
      approved.length > 0 &&
      approved.every((r) =>
        (data.report_deliveries || []).some(
          (d) =>
            d.report_id === r.id &&
            d.guardian_id === gid &&
            ['sent', 'acknowledged'].includes(String(d.status)),
        ),
      );
    families.push({ guardian, children, reports, invoice, missing, sent });
  }
  return families.sort((a, b) =>
    String(a.guardian.full_name).localeCompare(String(b.guardian.full_name)),
  );
}

// Senarai nama dalam Bahasa Melayu: "A", "A dan B", "A, B dan C".
const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} dan ${names.at(-1)}`;

export function familyMessage(family: Family, month: string, data: Dataset) {
  const names = joinNames(family.children.map((c) => String(c.full_name)));
  const lines = [
    `Assalamualaikum ${String(family.guardian.full_name)},`,
    '',
    `Bersama ini kami kongsikan dokumen bulan ${monthLabel(month)}:`,
    `• Laporan pembelajaran ${names}`,
  ];
  if (family.invoice) {
    const balance = invoiceBalance(
      family.invoice,
      data.payments || [],
      data.payment_allocations || [],
    ).outstanding;
    lines.push(
      `• Invois ${String(family.invoice.number)} · baki ${formatMoney(balance)}` +
        (family.invoice.due_on
          ? ` (tarikh akhir ${dateLabel(String(family.invoice.due_on))})`
          : ''),
    );
  }
  lines.push('', 'Terima kasih kerana bersama Akademi Al-Quran Ar-Riyadh (AQR).');
  return lines.join('\n');
}

// Pautan terus ke sembang WhatsApp penjaga dengan mesej siap ditulis.
export const whatsappUrl = (phone: unknown, text = '') =>
  `https://wa.me/${String(phone).replace(/[^0-9]/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

// Butiran invois untuk PDF (sama seperti skrin Kewangan).
export function invoiceDetails(data: Dataset, invoice: Row) {
  const g = (data.guardians || []).find((x) => x.id === invoice.guardian_id);
  const o = (data.organizations || [])[0] || {};
  return {
    guardian: g ? String(g.full_name) : '',
    items: (data.invoice_items || [])
      .filter((x) => x.invoice_id === invoice.id)
      .map((x) => ({
        description: String(x.description),
        quantity: Number(x.quantity),
        unit_price_sen: Number(x.unit_price_sen),
        total_sen:
          Number(x.total_sen) ||
          Number(x.quantity) * Number(x.unit_price_sen) - Number(x.discount_sen || 0),
      })),
    paid_sen: invoiceBalance(invoice, data.payments || [], data.payment_allocations || []).paid,
    org: { phone: o.phone ? String(o.phone) : '', address: o.address ? String(o.address) : '' },
  };
}
