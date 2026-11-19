import { Dataset, klDay } from './core';
import { CHARGEABLE_ATTENDANCE } from './reporting';
// Sesi dikira ikut bulan (migrasi 50, sama seperti private.class_quota / quota_used dalam DB):
// kuota sesi sebulan setiap kelas; Hadir, Lewat, Ganti dan Tidak hadir dikira, Cuti bermaklum tidak.
// Sesi tambahan (class_sessions.extra) yang disahkan tutor dibenarkan melebihi kuota (cth. 5/4).
export const countsTowardQuota = (status: unknown) =>
  CHARGEABLE_ATTENDANCE.includes(String(status));

// Kuota kelas. Tanpa nilai tersimpan: 4 × slot mingguan yang masih aktif.
export function classQuota(
  data: Dataset,
  classId: unknown,
  today = klDay(new Date().toISOString()),
) {
  const cls = (data.classes ?? []).find((c) => c.id === classId);
  const stored = Number(cls?.sessions_per_month);
  if (stored > 0) return stored;
  const slots = (data.class_schedules ?? []).filter(
    (r) => r.class_id === classId && (!r.effective_to || String(r.effective_to) >= today),
  ).length;
  return 4 * Math.min(7, Math.max(1, slots));
}
// Sesi kelas dalam bulan (YYYY-MM, tarikh KL) yang sudah dikira dalam kuota, kecuali sesi `skip`.
export function quotaUsed(data: Dataset, classId: unknown, month: string, skip?: unknown) {
  const counted = new Set(
    (data.attendance ?? [])
      .filter((a) => CHARGEABLE_ATTENDANCE.includes(String(a.status)))
      .map((a) => a.session_id),
  );
  return (data.class_sessions ?? []).filter(
    (s) =>
      s.class_id === classId &&
      s.id !== skip &&
      !['cancelled', 'rescheduled'].includes(String(s.status)) &&
      klDay(String(s.starts_at)).slice(0, 7) === month &&
      counted.has(s.id),
  ).length;
}
// Mesej jika rekod kehadiran ini melebihi kuota bulan sesi; null jika dibenarkan.
export function quotaProblem(data: Dataset, sessionId: unknown, status: string) {
  if (!CHARGEABLE_ATTENDANCE.includes(status)) return null;
  const s = (data.class_sessions ?? []).find((x) => x.id === sessionId);
  if (!s || s.extra) return null;
  const month = klDay(String(s.starts_at)).slice(0, 7);
  const quota = classQuota(data, s.class_id);
  if (quotaUsed(data, s.class_id, month, s.id) < quota) return null;
  const [y, m] = month.split('-');
  return `Kuota ${quota} sesi sebulan bagi bulan ${m}/${y} sudah penuh. Tandakan Cuti bermaklum, atau rekod sebagai sesi tambahan.`;
}
export function monthClosure(data: Dataset, staffId: unknown, month: string) {
  return (data.tutor_month_closures ?? []).find(
    (k) => k.staff_id === staffId && k.period === month,
  );
}
// Butang Selesai: bulan lepas bila-bila masa; bulan semasa pada 7 hari terakhir sahaja.
export function closeOpensOn(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1) - 7 * 86400000).toISOString().slice(0, 10);
}
export function canCloseMonth(month: string, today = klDay(new Date().toISOString())) {
  return month <= today.slice(0, 7) && today >= closeOpensOn(month);
}
