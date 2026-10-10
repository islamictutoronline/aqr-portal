'use client';
import { useState, useMemo, useEffect } from 'react';
import { apiFetch, navigatePath, loginPath, isStatic, downloadBlob } from '@/lib/transport';
import { MonthlyReports, TutorApplications } from './monthly-reports';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarDays,
  Wallet,
  ChartNoAxesCombined,
  Settings,
  GraduationCap,
  HeartHandshake,
  ArrowUpRight,
  Plus,
  Search,
  ChevronRight,
  Check,
  X,
  Menu,
  LogOut,
  Download,
  FileText,
  ShieldCheck,
  CircleAlert,
  Clock,
  Send,
  Layers,
} from 'lucide-react';
import {
  Dataset,
  Row,
  Role,
  roleLabels,
  ORGANIZATION,
  formatMoney,
  dateLabel,
  timeLabel,
  invoiceBalance,
  monthBounds,
  skillOptions,
  participationOptions,
  focusOptions,
  practiceOptions,
  generateComment,
  Assessment,
  REPORTS,
  ReportCode,
  allowedReport,
  integerSen,
  findRate,
  Rate,
  statusLabels,
} from '@/lib/core';
import { buildReport } from '@/lib/reporting';
import { scopeDemo } from '@/lib/demo';
import { AdditionalTools } from './tools';
import { ContactAdmin } from './contact-admin';
import { GoogleStatus } from './google-status';
import { Milestone, PublishedMilestones } from './milestone';
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: [string, string][];
  optional?: boolean;
  value?: string;
};
export type Dialog = {
  title: string;
  operation: string;
  fields: Field[];
  transform?: (values: Record<string, string>) => Record<string, unknown>;
  extra?: React.ReactNode;
};
const weekDays: [string, string][] = [
  ['1', 'Isnin'],
  ['2', 'Selasa'],
  ['3', 'Rabu'],
  ['4', 'Khamis'],
  ['5', 'Jumaat'],
  ['6', 'Sabtu'],
  ['0', 'Ahad'],
];
// Slot mingguan: bilangan sesi seminggu menentukan berapa pasangan hari + jam dipaparkan.
function WeeklySlots() {
  const [count, setCount] = useState(1);
  return (
    <>
      <label>
        Sesi seminggu
        <select name="per_week" value={count} onChange={(e) => setCount(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} sesi
            </option>
          ))}
        </select>
      </label>
      {Array.from({ length: count }, (_, i) => (
        <div className="slot-row" key={i}>
          <label>
            Sesi {i + 1}: hari
            <select name={`day_${i + 1}`} required defaultValue="">
              <option value="" disabled>
                Pilih…
              </option>
              {weekDays.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Jam
            <input name={`time_${i + 1}`} type="time" required />
          </label>
        </div>
      ))}
    </>
  );
}
const nav = [
  ['dashboard', 'Utama', LayoutDashboard],
  ['students', 'Murid', Users],
  ['guardians', 'Penjaga', HeartHandshake],
  ['tutors', 'Tutor', GraduationCap],
  ['classes', 'Program', BookOpen],
  ['calendar', 'Sesi & kehadiran', CalendarDays],
  ['finance', 'Yuran', Wallet],
  ['allowance', 'Elaun tutor', Layers],
  ['reports', 'Laporan', ChartNoAxesCombined],
  ['parent', 'Anak saya', HeartHandshake],
  ['settings', 'Tetapan', Settings],
] as const;
// Menu ringkas: halaman berkaitan dikumpulkan; laluan asal kekal sebagai tab dalam kumpulan.
const menu = [
  ['dashboard', 'Utama', LayoutDashboard, ['dashboard']],
  ['parent', 'Anak saya', HeartHandshake, ['parent']],
  // Pentadbir bermula dari tutor; tutor sendiri hanya nampak "Murid".
  ['tutors', 'Tutor', GraduationCap, ['tutors', 'students', 'guardians']],
  ['calendar', 'Sesi & kehadiran', CalendarDays, ['calendar']],
  ['reports', 'Laporan', ChartNoAxesCombined, ['reports']],
  ['finance', 'Kewangan', Wallet, ['finance', 'allowance']],
  ['settings', 'Tetapan', Settings, ['classes', 'settings']],
] as const;
function Badge({ value }: { value: unknown }) {
  const s = String(value);
  return (
    <span
      className={`badge ${['active', 'present', 'completed', 'verified', 'approved', 'paid', 'published'].includes(s) ? 'success' : ['overdue', 'absent', 'rejected', 'reversed'].includes(s) ? 'danger' : 'neutral'}`}
    >
      {statusLabels[s] ?? s}
    </span>
  );
}
function Empty({
  text = 'Belum ada rekod. Tambah rekod pertama untuk bermula.',
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <BookOpen size={28} />
      <p>{text}</p>
    </div>
  );
}
function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return rows.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}
function Card({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function App({
  initial,
  demo,
  path,
  role: initialRole,
  name,
  staffId,
  guardianId,
}: {
  initial: Dataset;
  demo: boolean;
  path: string;
  role: Role;
  name: string;
  staffId?: string;
  guardianId?: string;
}) {
  const [data, setData] = useState(initial);
  const [page, setPage] = useState(path);
  useEffect(() => {
    setData(initial);
  }, [initial]);
  useEffect(() => {
    if (!isStatic()) return;
    const changed = () => {
      const next = window.location.hash.slice(2) || 'dashboard';
      setPage(next);
      setDrawer(false);
      if (next.startsWith('sessions/')) setSelectedSession(next.split('/')[1]);
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const [role, setRole] = useState<Role>(initialRole);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(
    demo
      ? '2026-10'
      : new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kuala_Lumpur',
          year: 'numeric',
          month: '2-digit',
        }).format(new Date()),
  );
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [selectedSession, setSelectedSession] = useState(
    path.startsWith('sessions/') ? path.split('/')[1] : '',
  );
  const [child, setChild] = useState('');
  // Jadual mingguan dilanjutkan sehingga hujung bulan hadapan; idempoten, jadi selamat setiap muat.
  useEffect(() => {
    if (demo || !['owner', 'admin', 'tutor'].includes(initialRole)) return;
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch('/api/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'extend_schedule', payload: {} }),
        });
        const result = await r.json();
        if (!r.ok || !alive || !Number(result.id)) return;
        const refresh = await apiFetch('/api/data', { cache: 'no-store' });
        if (refresh.ok && alive) setData(await refresh.json());
      } catch {
        // Lanjutan jadual ialah bantuan; kegagalan tidak menghalang penggunaan lain.
      }
    })();
    return () => {
      alive = false;
    };
  }, [demo, initialRole]);
  const [reportCode, setReportCode] = useState<ReportCode>('monthly_teaching');
  const academic = ['owner', 'admin'].includes(role);
  const finance = ['owner', 'admin'].includes(role);
  const activeGuardian = guardianId || 'guardian-0';
  const activeTutor = staffId || 'tutor-0';
  // Demo role previews are scoped locally and never drive server permissions.
  const visible = useMemo(
    () => (demo ? scopeDemo(data, role, activeGuardian, activeTutor) : data),
    [data, demo, role, activeGuardian, activeTutor],
  );
  const all = (table: string) => visible[table] || [];
  const lookup = (table: string, id: unknown, field = 'full_name') =>
    String(all(table).find((r) => r.id === id)?.[field] ?? '—');
  const options = (table: string, field = 'full_name'): [string, string][] =>
    all(table)
      .filter((r) => table !== 'staff_profiles' || r.role === 'tutor')
      .map((r) => [r.id, String(r[field])]);
  const go = (p: string) => {
    setPage(p);
    setDrawer(false);
    setSearch('');
    setNotice('');
    if (p.startsWith('sessions/')) setSelectedSession(p.split('/')[1]);
    navigatePath(p, demo);
  };
  const navigation = nav.filter(
    ([p]) =>
      p === 'dashboard' ||
      p === 'settings' ||
      (academic &&
        ['students', 'guardians', 'tutors', 'classes', 'calendar', 'reports'].includes(p)) ||
      (finance && ['finance', 'allowance', 'reports'].includes(p)) ||
      (role === 'tutor' && ['students', 'calendar', 'allowance', 'reports'].includes(p)) ||
      (role === 'guardian' && ['parent', 'reports'].includes(p)) ||
      (demo && role === 'owner' && p === 'parent'),
  );
  const section = page.split('/')[0];
  const allowed = navigation.map((n) => n[0] as string);
  const groups = menu
    .map(([id, label, Icon, members]) => {
      const visibleMembers = (members as readonly string[]).filter((m) => allowed.includes(m));
      // Kumpulan berahli tunggal mengambil nama dan ikon halaman itu sendiri.
      const single =
        visibleMembers.length === 1 ? nav.find((n) => n[0] === visibleMembers[0]) : undefined;
      return {
        id,
        label: single ? single[1] : label,
        Icon: single ? single[2] : Icon,
        members: visibleMembers,
      };
    })
    .filter((g) => g.members.length);
  const group = groups.find((g) => g.members.includes(section));
  const title =
    nav.find((n) => n[0] === section)?.[1] ??
    (section === 'sessions' ? 'Rekod sesi' : 'Halaman tidak ditemui');
  const allowedPage =
    navigation.some((n) => n[0] === section) ||
    (section === 'sessions' && (academic || role === 'tutor'));
  const matches = (row: Row) =>
    !search ||
    Object.values(row).some(
      (v) => typeof v === 'string' && v.toLowerCase().includes(search.toLowerCase()),
    );
  async function mutate(operation: string, payload: Record<string, unknown>) {
    setBusy(true);
    setNotice('');
    try {
      if (demo) {
        const next = structuredClone(data);
        const id = `demo-${crypto.randomUUID()}`;
        const table: Record<string, string> = {
          student: 'students',
          guardian: 'guardians',
          link: 'student_guardians',
          class: 'classes',
          enrollment: 'enrollments',
          assignment: 'class_tutors',
          schedule: 'class_schedules',
          program: 'programs',
          unit: 'curriculum_units',
          fee_plan: 'fee_plans',
          fee_assignment: 'fee_assignments',
          assessment_option: 'assessment_options',
        };
        if (table[operation])
          next[table[operation]].push({ id, ...payload, status: 'active', active: true });
        else if (operation === 'tutor_enrol') {
          const studentId = `${id}-student`;
          const program = next.programs.find((x) => x.id === payload.program_id)!;
          next.students.push({ id: studentId, full_name: payload.student_name, status: 'active' });
          next.classes.push({
            id,
            program_id: program.id,
            name: `${payload.student_name} · ${program.name}`,
            mode: 'one_to_one',
            delivery: 'online',
            max_capacity: 1,
            active: true,
          });
          const today = new Date().toISOString().slice(0, 10);
          next.class_tutors.push({
            id: `${id}-tutor`,
            class_id: id,
            staff_id: activeTutor,
            starts_on: today,
          });
          next.enrollments.push({
            id: `${id}-enrollment`,
            student_id: studentId,
            class_id: id,
            status: 'active',
            starts_on: today,
          });
          // Demo: jana empat minggu sesi daripada slot mingguan.
          for (const slot of payload.slots as { day: number; time: string }[])
            for (let d = 0; d < 28; d++) {
              const day = new Date(Date.now() + d * 86400000);
              if (day.getDay() !== slot.day) continue;
              const start = new Date(`${day.toISOString().slice(0, 10)}T${slot.time}:00+08:00`);
              next.class_sessions.push({
                id: `${id}-${slot.day}-${d}`,
                class_id: id,
                tutor_id: activeTutor,
                starts_at: start.toISOString(),
                ends_at: new Date(start.getTime() + Number(payload.minutes) * 60000).toISOString(),
                status: 'scheduled',
                review_status: 'reported',
              });
            }
        } else if (operation === 'remove_student') {
          const sid = payload.student_id;
          next.enrollments
            .filter((e) => e.student_id === sid && e.status === 'active')
            .forEach((e) => {
              e.status = 'withdrawn';
              next.class_sessions
                .filter(
                  (x) =>
                    x.class_id === e.class_id &&
                    x.status === 'scheduled' &&
                    new Date(String(x.starts_at)) > new Date(),
                )
                .forEach((x) => (x.status = 'cancelled'));
            });
          next.students.find((x) => x.id === sid)!.status = 'archived';
        } else if (operation === 'tutor_add_student' || operation === 'add_program') {
          const studentId =
            operation === 'add_program' ? String(payload.student_id) : `${id}-student`;
          if (operation === 'tutor_add_student')
            next.students.push({
              id: studentId,
              full_name: payload.student_name,
              status: 'active',
            });
          const student = next.students.find((x) => x.id === studentId)!;
          const program = next.programs.find((x) => x.id === payload.program_id)!;
          next.classes.push({
            id,
            program_id: program.id,
            name: `${student.full_name} · ${program.name}`,
            mode: 'one_to_one',
            delivery: 'online',
            max_capacity: 1,
            active: true,
          });
          next.class_tutors.push({
            id: `${id}-tutor`,
            class_id: id,
            staff_id: payload.tutor_id || activeTutor,
            starts_on: new Date().toISOString().slice(0, 10),
          });
          next.enrollments.push({
            id: `${id}-enrollment`,
            student_id: studentId,
            class_id: id,
            status: 'active',
            starts_on: new Date().toISOString().slice(0, 10),
          });
        } else if (operation === 'tutor_class') {
          next.classes.push({
            id,
            program_id: payload.program_id,
            name: payload.class_name,
            mode: payload.class_mode,
            delivery: payload.class_delivery,
            max_capacity: payload.capacity,
            venue: payload.class_venue,
            active: true,
          });
          next.class_tutors.push({
            id: `${id}-tutor`,
            class_id: id,
            staff_id: activeTutor,
            starts_on: new Date().toISOString().slice(0, 10),
          });
        } else if (operation === 'tutor_student') {
          next.students.push({ id, full_name: payload.student_name, status: 'active' });
          next.enrollments.push({
            id: `${id}-enrollment`,
            student_id: id,
            class_id: payload.cid,
            status: 'active',
            starts_on: new Date().toISOString().slice(0, 10),
          });
        } else if (operation === 'assessment') {
          const sess = next.class_sessions.find((s) => s.id === payload.sid)!;
          const cls = next.classes.find((c) => c.id === sess.class_id)!;
          const program = next.programs.find((p) => p.id === cls.program_id)!;
          const subject = next.subjects.find((s) => s.id === program.subject_id)!;
          const comment = generateComment(
            String(subject.slug),
            String(payload.attendance_status),
            payload.selected as Assessment,
            next.assessment_options.filter((o) => o.subject_id === subject.id),
          );
          next.attendance = next.attendance.filter(
            (a) => !(a.session_id === payload.sid && a.student_id === payload.student),
          );
          next.attendance.push({
            id,
            session_id: payload.sid,
            student_id: payload.student,
            status: payload.attendance_status,
          });
          if (payload.publish)
            next.generated_parent_comments
              .filter(
                (c) =>
                  c.session_id === payload.sid &&
                  c.student_id === payload.student &&
                  c.status === 'published',
              )
              .forEach((c) => {
                c.status = 'retracted';
              });
          next.generated_parent_comments.push({
            id,
            session_id: payload.sid,
            student_id: payload.student,
            selections: payload.selected,
            text: comment,
            status: payload.publish ? 'published' : 'draft',
            template_version: '1',
            created_at: sess.starts_at,
          });
          sess.status = 'completed';
        } else if (operation === 'session')
          next.class_sessions.push({
            id,
            class_id: payload.cid,
            tutor_id: payload.tid,
            starts_at: payload.start_time,
            ends_at: new Date(
              new Date(String(payload.start_time)).getTime() + Number(payload.minutes) * 60000,
            ).toISOString(),
            topic: payload.lesson_topic,
            status: 'scheduled',
            review_status: 'reported',
          });
        else if (operation === 'rate') {
          next.tutor_allowance_rates
            .filter(
              (r) =>
                r.program_code === payload.program &&
                r.duration_minutes === payload.minutes &&
                !r.effective_to,
            )
            .forEach((r) => {
              if (String(r.effective_from) >= String(payload.effective))
                throw new Error('Tarikh kadar baharu mesti selepas versi sedia ada');
              r.effective_to = new Date(new Date(String(payload.effective)).getTime() - 86400000)
                .toISOString()
                .slice(0, 10);
            });
          next.tutor_allowance_rates.push({
            id,
            program_code: payload.program,
            duration_minutes: payload.minutes,
            amount_sen: payload.amount,
            effective_from: payload.effective,
            source: payload.provenance,
          });
        } else if (operation === 'review') {
          const s = next.class_sessions.find((s) => s.id === payload.sid)!;
          if (s.status !== 'completed') throw new Error('Sesi belum selesai');
          if (payload.approve) {
            if (s.review_status !== 'verified' || s.verified_by === 'demo-owner')
              throw new Error('Penyemak dan pelulus mesti berlainan');
            s.review_status = 'approved';
            s.approved_by = 'demo-owner';
            const e = next.tutor_allowance_entries.find((e) => e.session_id === s.id)!;
            e.status = 'approved';
            e.approved_by = 'demo-owner';
          } else {
            const cls = next.classes.find((c) => c.id === s.class_id)!;
            const program = next.programs.find((p) => p.id === cls.program_id)!;
            const rate = findRate(
              next.tutor_allowance_rates as unknown as Rate[],
              String(program.code),
              (new Date(String(s.ends_at)).getTime() - new Date(String(s.starts_at)).getTime()) /
                60000,
              String(s.starts_at).slice(0, 10),
            );
            s.review_status = 'verified';
            s.verified_by = 'demo-finance';
            next.tutor_allowance_entries.push({
              id,
              session_id: s.id,
              tutor_id: s.tutor_id,
              rate_snapshot_sen: rate.amount_sen,
              amount_sen: rate.amount_sen,
              status: 'verified',
              verified_by: 'demo-finance',
            });
          }
        } else if (operation === 'invoice') {
          const items = payload.items as Record<string, unknown>[];
          const total = items.reduce(
            (n, i) =>
              n + Number(i.quantity) * Number(i.unit_price_sen) - Number(i.discount_sen || 0),
            0,
          );
          next.invoices.push({
            id,
            number: `DEMO-${next.invoices.length + 1}`,
            guardian_id: payload.guardian,
            total_sen: total,
            period: payload.billing_period,
            due_on: payload.due,
            status: 'issued',
          });
          items.forEach((i, k) =>
            next.invoice_items.push({ id: `${id}-${k}`, ...i, invoice_id: id }),
          );
        } else if (operation === 'payment')
          next.payments.push({
            id,
            guardian_id: payload.guardian,
            amount_sen: payload.amount,
            paid_on: `${month}-10`,
            status: 'pending_verification',
            method: payload.payment_method,
            reference: payload.payment_ref,
          });
        else if (operation === 'verify') {
          const p = next.payments.find((p) => p.id === payload.pid)!;
          const i = next.invoices.find((i) => i.id === payload.inv)!;
          const balance = invoiceBalance(i, next.payments, next.payment_allocations);
          if (
            p.guardian_id !== i.guardian_id ||
            Number(payload.allocation) > Number(p.amount_sen) ||
            Number(payload.allocation) > balance.outstanding ||
            p.status !== 'pending_verification'
          )
            throw new Error('Amaun, penjaga atau status tidak sah');
          p.status = 'verified';
          next.payment_allocations.push({
            id,
            payment_id: p.id,
            invoice_id: i.id,
            amount_sen: payload.allocation,
          });
          i.status = Number(payload.allocation) === balance.outstanding ? 'paid' : 'partially_paid';
        } else if (operation === 'reverse') {
          const p = next.payments.find((p) => p.id === payload.pid)!;
          p.status = 'reversed';
          p.reversal_reason = payload.reason;
        } else if (operation === 'reject') {
          const p = next.payments.find((p) => p.id === payload.pid)!;
          if (p.status !== 'pending_verification') throw new Error('Bayaran bukan dalam semakan');
          p.status = 'rejected';
        } else if (operation === 'adjustment') {
          next.tutor_adjustments.push({
            id,
            entry_id: payload.entry,
            amount_sen: payload.amount,
            reason: payload.reason,
            maker_id: 'demo-finance',
          });
        } else if (operation === 'archive')
          next.students.find((s) => s.id === payload.id)!.status = 'archived';
        else if (operation === 'settings') Object.assign(next.organizations[0], payload);
        else if (operation === 'payout') {
          if (payload.action === 'create') {
            if (next.tutor_payout_batches.some((b) => b.period === payload.billing_period))
              throw new Error('Kelompok bulan ini sudah wujud');
            const entries = next.tutor_allowance_entries.filter(
              (e) =>
                e.status === 'approved' &&
                !e.batch_id &&
                next.class_sessions.some(
                  (s) =>
                    s.id === e.session_id &&
                    String(s.starts_at).startsWith(String(payload.billing_period)),
                ),
            );
            if (!entries.length) throw new Error('Tiada sesi diluluskan');
            next.tutor_payout_batches.push({
              id,
              period: payload.billing_period,
              status: 'review',
              total_sen: entries.reduce((n, e) => n + Number(e.amount_sen), 0),
            });
            entries.forEach((e) => (e.batch_id = id));
          } else {
            const b = next.tutor_payout_batches.find((b) => b.id === payload.batch)!;
            b.status = payload.action === 'approve' ? 'approved' : 'paid';
            if (payload.action === 'pay') {
              b.reference = payload.payment_ref;
              next.tutor_allowance_entries
                .filter((e) => e.batch_id === b.id)
                .forEach((e) => (e.status = 'paid'));
            }
          }
        } else throw new Error('Tindakan ini memerlukan sambungan sebenar');
        setData(next);
        setNotice('Demo: perubahan disimpan dalam memori tab sahaja.');
      } else {
        const r = await apiFetch('/api/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation, payload }),
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        const refresh = await apiFetch('/api/data', { cache: 'no-store' });
        if (!refresh.ok) throw new Error('Disimpan tetapi muat semula gagal');
        setData(await refresh.json());
        setNotice('Rekod berjaya disimpan dalam pangkalan data.');
      }
      setDialog(null);
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Permintaan gagal');
      return false;
    } finally {
      setBusy(false);
    }
  }
  // Tutor mendaftar murid bersama jadual mingguan; sesi dijana terus ke Sesi & kehadiran.
  const createStudent = () =>
    setDialog({
      title: 'Daftar murid',
      operation: 'tutor_enrol',
      fields: [
        { name: 'student_name', label: 'Nama penuh' },
        { name: 'program_id', label: 'Program', options: options('programs', 'name') },
        {
          name: 'minutes',
          label: 'Minit setiap sesi',
          options: [
            ['30', '30 minit'],
            ['20', '20 minit'],
          ],
        },
        { name: 'end_date', label: 'Sehingga tarikh', type: 'date', value: '2027-12-31' },
      ],
      extra: <WeeklySlots />,
      transform: (v) => ({
        student_name: v.student_name,
        program_id: v.program_id,
        minutes: Number(v.minutes),
        end_date: v.end_date,
        slots: Array.from({ length: Number(v.per_week) }, (_, i) => ({
          day: Number(v[`day_${i + 1}`]),
          time: v[`time_${i + 1}`],
        })),
      }),
    });
  const removeStudent = (studentId: unknown, studentName: unknown) =>
    setDialog({
      title: `Padam murid · ${String(studentName)}`,
      operation: 'remove_student',
      fields: [],
      transform: () => ({ student_id: studentId }),
    });
  const addProgram = (studentId: string) =>
    setDialog({
      title: 'Tambah program',
      operation: 'add_program',
      fields: [
        { name: 'program_id', label: 'Program', options: options('programs', 'name') },
        ...(academic
          ? [
              {
                name: 'tutor_id',
                label: 'Tutor',
                options: options('staff_profiles', 'display_name'),
              },
            ]
          : []),
      ],
      transform: (v) => ({ ...v, student_id: studentId }),
    });
  // Program aktif murid dan tutornya (kelas individu disembunyikan daripada pengguna).
  const programsOf = (studentId: unknown) =>
    all('enrollments')
      .filter((e) => e.student_id === studentId && e.status === 'active')
      .map((e) => {
        const c = all('classes').find((x) => x.id === e.class_id);
        const t = all('class_tutors').find((x) => x.class_id === e.class_id && !x.ends_on);
        const program = lookup('programs', c?.program_id, 'name');
        const tutorName = t ? lookup('staff_profiles', t.staff_id, 'display_name') : '';
        return {
          id: String(e.id),
          program,
          tutor: tutorName === '—' ? '' : tutorName,
          status: e.status,
        };
      });
  const createGuardian = () =>
    setDialog({
      title: 'Tambah penjaga',
      operation: 'guardian',
      fields: [
        { name: 'full_name', label: 'Nama penuh' },
        { name: 'email', label: 'E-mel', type: 'email', optional: true },
        { name: 'phone', label: 'WhatsApp (+60…)', type: 'tel', optional: true },
      ],
    });
  // Setiap kelas individu bernama "Murid · Program", jadi pilihan ini ialah senarai murid.
  const createSession = () =>
    setDialog({
      title: 'Jadualkan sesi',
      operation: 'session',
      fields: [
        { name: 'cid', label: 'Murid', options: options('classes', 'name') },
        ...(role === 'tutor'
          ? []
          : [{ name: 'tid', label: 'Tutor', options: options('staff_profiles', 'display_name') }]),
        { name: 'start_time', label: 'Tarikh dan masa (MYT)', type: 'datetime-local' },
        {
          name: 'minutes',
          label: 'Tempoh',
          options: [
            ['30', '30 minit'],
            ['20', '20 minit'],
          ],
        },
        { name: 'lesson_topic', label: 'Topik', optional: true },
      ],
      transform: (v) => ({
        ...v,
        ...(role === 'tutor' ? { tid: activeTutor } : {}),
        lesson_topic: v.lesson_topic || '',
        start_time: new Date(`${v.start_time}:00+08:00`).toISOString(),
        minutes: Number(v.minutes),
      }),
    });
  const invoiceForm = () =>
    setDialog({
      title: 'Invois baharu · kadar ditetapkan admin',
      operation: 'invoice',
      fields: [
        { name: 'guardian', label: 'Penjaga bil', options: options('guardians') },
        { name: 'student_id', label: 'Murid', options: options('students') },
        { name: 'description', label: 'Perihal' },
        { name: 'amount', label: 'Amaun MYR', type: 'text' },
        { name: 'due', label: 'Tarikh akhir', type: 'date' },
        { name: 'billing_period', label: 'Bulan', type: 'month', value: month },
      ],
      transform: (v) => ({
        guardian: v.guardian,
        due: v.due,
        billing_period: v.billing_period,
        idem: crypto.randomUUID(),
        items: [
          {
            student_id: v.student_id,
            description: v.description,
            quantity: 1,
            unit_price_sen: integerSen(v.amount),
            discount_sen: 0,
          },
        ],
      }),
    });
  const paymentForm = () =>
    setDialog({
      title: 'Rekod bayaran untuk semakan',
      operation: 'payment',
      fields: [
        { name: 'guardian', label: 'Penjaga', options: options('guardians') },
        { name: 'amount', label: 'Amaun MYR' },
        {
          name: 'payment_method',
          label: 'Kaedah',
          options: [
            ['bank_transfer', 'Pindahan bank'],
            ['duitnow_qr', 'DuitNow QR'],
            ['cash', 'Tunai'],
            ['other', 'Lain-lain'],
          ],
        },
        { name: 'payment_ref', label: 'Rujukan', optional: true },
      ],
      transform: (v) => ({ ...v, amount: integerSen(v.amount), idem: crypto.randomUUID() }),
    });
  const rateForm = () =>
    setDialog({
      title: 'Versi kadar elaun baharu',
      operation: 'rate',
      fields: [
        {
          name: 'program',
          label: 'Program',
          options: all('programs').map((p) => [String(p.code), String(p.name)]),
        },
        { name: 'minutes', label: 'Tempoh minit', type: 'number', value: '30' },
        { name: 'amount', label: 'Kadar MYR' },
        { name: 'effective', label: 'Berkuat kuasa', type: 'date' },
        { name: 'provenance', label: 'Sumber / sebab' },
      ],
      transform: (v) => ({ ...v, minutes: Number(v.minutes), amount: integerSen(v.amount) }),
    });
  const currentSession = all('class_sessions').find((s) => s.id === selectedSession);
  const report = useMemo(() => {
    const code = allowedReport(role, reportCode)
      ? reportCode
      : (Object.keys(REPORTS) as ReportCode[]).find((c) => allowedReport(role, c))!;
    return buildReport(visible, code, month, role, name, demo);
  }, [visible, reportCode, month, role, name, demo]);
  async function exportReport(format: string) {
    if (format === 'xlsx' || format === 'csv') {
      setBusy(true);
      try {
        if (format === 'xlsx') {
          const { toXlsx } = await import('@/lib/workbook');
          downloadBlob(
            new Blob([new Uint8Array(await toXlsx(report))]),
            `AQR_${report.code}_${month}.xlsx`,
          );
        } else {
          const { toCsv } = await import('@/lib/reporting');
          downloadBlob(
            new Blob([toCsv(report)], { type: 'text/csv;charset=utf-8' }),
            `AQR_${report.code}_${month}.csv`,
          );
        }
      } catch {
        setNotice('Eksport gagal.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (format === 'pdf') {
      window.print();
      return;
    }
    setBusy(true);
    try {
      const url = `/api/export?format=${format}&code=${report.code}&month=${month}${demo ? `&demo=1&role=${role}` : ''}`;
      const r = await apiFetch(url, { method: format === 'sheets' ? 'POST' : 'GET' });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error || 'Eksport gagal');
      }
      if (format === 'sheets') {
        const j = await r.json();
        window.open(j.url, '_blank', 'noopener,noreferrer');
        setNotice('Spreadsheet berjaya dicipta dalam akaun Google anda.');
      } else {
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `AQR_${report.code}_${month}.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Eksport gagal');
    } finally {
      setBusy(false);
    }
  }
  const monthlySessions = all('class_sessions').filter((s) =>
    dateLabel(String(s.starts_at)).endsWith(`${month.slice(5)}/${month.slice(0, 4)}`),
  );
  const invoices = all('invoices').filter(
    (i) => i.period === month && !['draft', 'void'].includes(String(i.status)),
  );
  const invoiceTotals = invoices.reduce(
    (n, i) => {
      const b = invoiceBalance(i, all('payments'), all('payment_allocations'));
      return {
        invoiced: n.invoiced + b.invoiced,
        paid: n.paid + b.paid,
        outstanding: n.outstanding + b.outstanding,
      };
    },
    { invoiced: 0, paid: 0, outstanding: 0 },
  );
  const metrics =
    role === 'guardian'
      ? [
          ['Anak berdaftar', all('students').length, 'Dalam portal keluarga'],
          [
            'Ulasan diterbitkan',
            all('generated_parent_comments').filter((c) => c.status === 'published').length,
            'Rekod daripada tutor',
          ],
          ['Baki yuran', formatMoney(invoiceTotals.outstanding), 'Daripada invois sebenar'],
        ]
      : [
          [
            'Murid aktif',
            all('students').filter((s) => s.status === 'active').length,
            'Murid berdaftar',
          ],
          [
            'Program aktif',
            all('enrollments').filter((e) => e.status === 'active').length,
            'Murid × program',
          ],
          [
            'Sesi dilaksana',
            monthlySessions.filter((s) => s.status === 'completed').length,
            'Bulan yang dipilih',
          ],
          [
            'Kehadiran',
            all('attendance').filter(
              (a) =>
                ['present', 'late', 'makeup'].includes(String(a.status)) &&
                monthlySessions.some((s) => s.id === a.session_id),
            ).length,
            'Rekod hadir bulan ini',
          ],
        ];
  function dashboard() {
    return (
      <>
        <div className="welcome">
          <div>
            <h1>
              Assalamualaikum,{' '}
              {role === 'guardian' ? 'ibu bapa' : role === 'tutor' ? 'tutor' : 'pentadbir'}
              <span className="gold">.</span>
            </h1>
          </div>
        </div>
        <div className="metrics">
          {metrics.map(([label, value, hint], i) => (
            <div className="metric" key={String(label)}>
              <div className="metric-top">
                <span>{label}</span>
                {
                  [
                    <Users key="u" />,
                    <BookOpen key="b" />,
                    <CalendarDays key="c" />,
                    <ShieldCheck key="s" />,
                  ][i]
                }
              </div>
              <strong>{value}</strong>
              <small>{hint}</small>
            </div>
          ))}
        </div>
        <div className="dashboard-grid">
          <Card
            title="Sesi pembelajaran"
            subtitle="Jadual dan tindakan tutor"
            action={
              <button
                className="text-link"
                onClick={() => go(role === 'guardian' ? 'parent' : 'calendar')}
              >
                Lihat semua <ArrowUpRight size={16} />
              </button>
            }
          >
            <div className="session-list">
              {monthlySessions.slice(-5).map((s) => (
                <div className="session-item" key={s.id}>
                  <div className="time-tile">
                    <strong>{timeLabel(String(s.starts_at))}</strong>
                    <small>{dateLabel(String(s.starts_at)).slice(0, 5)}</small>
                  </div>
                  <div className="grow">
                    <strong>{lookup('classes', s.class_id, 'name')}</strong>
                    <p>
                      {lookup('staff_profiles', s.tutor_id, 'display_name')} ·{' '}
                      {all('enrollments').filter((e) => e.class_id === s.class_id).length} murid
                    </p>
                  </div>
                  <Badge value={s.status} />
                  {role !== 'guardian' && (
                    <button
                      className="icon-button"
                      aria-label="Buka sesi"
                      onClick={() => go(`sessions/${s.id}`)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </div>
              ))}
              {!monthlySessions.length && <Empty text="Tiada sesi bagi bulan ini." />}
            </div>
          </Card>
          <Card title="Perlu perhatian" subtitle="Utamakan tindakan hari ini">
            <div className="attention">
              <Clock />
              <div>
                <strong>
                  {monthlySessions.filter((s) => s.review_status === 'reported').length} sesi belum
                  disemak
                </strong>
                <p>Rekod dilaporkan menunggu pengesahan.</p>
              </div>
            </div>
            {finance && (
              <div className="attention">
                <Wallet />
                <div>
                  <strong>{formatMoney(invoiceTotals.outstanding)} baki belum bayar</strong>
                  <p>Bayaran belum disahkan tidak dikira.</p>
                </div>
              </div>
            )}
            <div className="attention">
              <FileText />
              <div>
                <strong>
                  {all('generated_parent_comments').filter((c) => c.status === 'draft').length}{' '}
                  ulasan draf
                </strong>
                <p>Hanya ulasan diterbitkan dapat dilihat ibu bapa.</p>
              </div>
            </div>
            <button
              className="secondary wide"
              onClick={() =>
                go(role === 'guardian' ? 'parent' : finance ? 'allowance' : 'calendar')
              }
            >
              Buka ruang kerja <ArrowUpRight size={16} />
            </button>
          </Card>
        </div>
        <div className="dashboard-grid">
          <Card title="Aktiviti pembelajaran" subtitle="Sesi dilaksana mengikut program bulan ini">
            <div className="bar-chart">
              {all('programs').map((p) => {
                const classes = all('classes')
                  .filter((c) => c.program_id === p.id)
                  .map((c) => c.id);
                const count = monthlySessions.filter(
                  (s) => classes.includes(String(s.class_id)) && s.status === 'completed',
                ).length;
                return (
                  <div key={p.id}>
                    <span>{String(p.name)}</span>
                    <div className="bar-track">
                      <div
                        style={{
                          width: `${Math.min(100, (count / Math.max(1, monthlySessions.length)) * 100)}%`,
                        }}
                      />
                    </div>
                    <strong>{count}</strong>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="Rekod terkini" subtitle="Ulasan individu yang telah diterbitkan">
            {all('generated_parent_comments')
              .filter((c) => c.status === 'published')
              .slice(-2)
              .map((c) => (
                <div className="comment-mini" key={c.id}>
                  <span className="avatar">{lookup('students', c.student_id).slice(0, 1)}</span>
                  <div>
                    <strong>{lookup('students', c.student_id)}</strong>
                    <p>{String(c.text)}</p>
                  </div>
                </div>
              ))}
            {!all('generated_parent_comments').some((c) => c.status === 'published') && (
              <Empty text="Belum ada ulasan diterbitkan." />
            )}
          </Card>
        </div>
      </>
    );
  }
  function studentsScreen() {
    const id = page.split('/')[1];
    const student = all('students').find((s) => s.id === id);
    return student ? (
      <>
        <div className="profile-hero">
          <span className="avatar large">{String(student.full_name).slice(0, 1)}</span>
          <div>
            <h1>{String(student.full_name)}</h1>
            <Badge value={student.status} />
          </div>
          {academic && (
            <button
              className="secondary"
              onClick={() =>
                setDialog({
                  title: 'Arkib murid · sejarah kekal',
                  operation: 'archive',
                  fields: [],
                  transform: () => ({ id: student.id }),
                })
              }
            >
              Arkib murid
            </button>
          )}
        </div>
        <Card title="Program & penjaga">
          {programsOf(id).map((p) => (
            <p key={p.id}>
              <strong>{p.program}</strong>
              {p.tutor && ` · Tutor: ${p.tutor}`} · <Badge value={p.status} />
            </p>
          ))}
          {(academic || role === 'tutor') && (
            <div className="button-row">
              <button onClick={() => addProgram(id)}>Tambah program</button>
              {academic && (
                <button
                  onClick={() =>
                    setDialog({
                      title: 'Pautkan penjaga',
                      operation: 'link',
                      fields: [
                        { name: 'guardian_id', label: 'Penjaga', options: options('guardians') },
                        {
                          name: 'relation',
                          label: 'Hubungan',
                          options: [
                            ['ibu', 'Ibu'],
                            ['bapa', 'Bapa'],
                            ['penjaga', 'Penjaga'],
                          ],
                        },
                      ],
                      transform: (v) => ({
                        ...v,
                        student_id: id,
                        portal_allowed: true,
                        is_billing_contact: true,
                      }),
                    })
                  }
                >
                  Pautkan penjaga
                </button>
              )}
            </div>
          )}
        </Card>
        <Card title="Ulasan pembelajaran">
          {all('generated_parent_comments')
            .filter((c) => c.student_id === id)
            .map((c) => (
              <div className="progress-comment" key={c.id}>
                <Badge value={c.status} />
                <p>{String(c.text)}</p>
              </div>
            ))}
        </Card>
      </>
    ) : (
      <Card
        title="Direktori murid"
        subtitle="Maklumat minimum, pemantauan secara individu"
        action={
          role === 'tutor' && (
            <button className="primary" onClick={createStudent}>
              <Plus size={16} />
              Daftar murid
            </button>
          )
        }
      >
        <Table
          headers={['Murid', 'Program', 'Status', '']}
          rows={all('students')
            .filter(matches)
            .filter((s) => role !== 'tutor' || s.status === 'active')
            .map((s) => [
              <div key="name" className="person">
                <span className="avatar">{String(s.full_name).slice(0, 1)}</span>
                <strong>{String(s.full_name)}</strong>
              </div>,
              programsOf(s.id)
                .map((p) => p.program)
                .join(', ') || 'Belum berdaftar',
              <Badge key="status" value={s.status} />,
              <div key="open" className="button-row">
                <button className="text-link" onClick={() => go(`students/${s.id}`)}>
                  Lihat profil <ChevronRight size={16} />
                </button>
                {role === 'tutor' && (
                  <button
                    className="text-link danger"
                    onClick={() => removeStudent(s.id, s.full_name)}
                  >
                    Padam
                  </button>
                )}
              </div>,
            ])}
        />
      </Card>
    );
  }
  function guardiansScreen() {
    return (
      <Card
        title="Penjaga & keluarga"
        subtitle="Pautkan murid dahulu, kemudian jemput akses OTP e-mel"
        action={
          <button className="primary" onClick={createGuardian}>
            <Plus size={16} />
            Tambah penjaga
          </button>
        }
      >
        <Table
          headers={['Penjaga', 'E-mel', 'Anak', 'Akses portal']}
          rows={all('guardians')
            .filter(matches)
            .map((g) => [
              String(g.full_name),
              String(g.email || 'Tiada e-mel'),
              all('student_guardians')
                .filter((sg) => sg.guardian_id === g.id)
                .map((sg) => lookup('students', sg.student_id))
                .join(', '),
              <button
                key="invite"
                disabled={!g.email || !['owner'].includes(role) || busy}
                onClick={() => invite(String(g.email), 'guardian', g.id)}
              >
                Jemput OTP
              </button>,
            ])}
        />
        <p className="footnote">
          Penjaga tanpa e-mel: jemputan WhatsApp belum tersedia. Tiada pautan awam kepada rekod
          anak.
        </p>
      </Card>
    );
  }
  async function invite(email: string, inviteRole: string, guardian?: string) {
    if (demo) {
      setNotice('Demo tidak menghantar e-mel. Jemputan memerlukan Supabase Auth sebenar.');
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: inviteRole, guardianId: guardian }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setNotice('Jemputan dihantar melalui Supabase Auth.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Jemputan gagal');
    } finally {
      setBusy(false);
    }
  }
  function classesScreen() {
    return (
      <>
        <Card
          title="Kurikulum"
          subtitle="Kemajuan dikira daripada bukti pencapaian unit"
          action={
            academic && (
              <button
                onClick={() =>
                  setDialog({
                    title: 'Tambah unit kurikulum',
                    operation: 'unit',
                    fields: [
                      {
                        name: 'program_id',
                        label: 'Program',
                        options: options('programs', 'name'),
                      },
                      { name: 'code', label: 'Kod' },
                      { name: 'name', label: 'Nama unit' },
                      { name: 'outcome', label: 'Hasil pembelajaran', optional: true },
                      { name: 'sort_order', label: 'Susunan', type: 'number', value: '0' },
                    ],
                    transform: (v) => ({ ...v, sort_order: Number(v.sort_order) }),
                  })
                }
              >
                <Plus size={16} />
                Tambah unit
              </button>
            )
          }
        >
          <Table
            headers={['Program', 'Unit', 'Hasil pembelajaran']}
            rows={all('curriculum_units').map((u) => [
              lookup('programs', u.program_id, 'name'),
              String(u.name),
              String(u.outcome || 'Belum ditetapkan'),
            ])}
          />
          <p className="footnote">
            Penguasaan keseluruhan: belum cukup data tanpa bukti penilaian unit. Tiada peratusan
            anggaran.
          </p>
        </Card>
      </>
    );
  }
  function calendarScreen() {
    return (
      <>
        <Card
          title="Jadual & sesi"
          subtitle="Semua masa dalam Asia/Kuala_Lumpur"
          action={
            (academic || role === 'tutor') && (
              <button className="primary" onClick={createSession}>
                <Plus size={16} />
                Jadualkan sesi
              </button>
            )
          }
        >
          <Table
            headers={['Tarikh / masa', 'Murid · Program', 'Tutor', 'Status', 'Semakan', '']}
            rows={monthlySessions.filter(matches).map((s) => [
              <div key="date">
                <strong>{dateLabel(String(s.starts_at))}</strong>
                <small>{timeLabel(String(s.starts_at))}</small>
              </div>,
              lookup('classes', s.class_id, 'name'),
              lookup('staff_profiles', s.tutor_id, 'display_name'),
              <Badge key="status" value={s.status} />,
              <Badge key="review" value={s.review_status} />,
              <button key="open" onClick={() => go(`sessions/${s.id}`)}>
                Rekod sesi <ChevronRight size={16} />
              </button>,
            ])}
          />
        </Card>
        <Card
          title="Jadual mingguan"
          action={
            academic && (
              <button
                onClick={() =>
                  setDialog({
                    title: 'Tambah jadual mingguan',
                    operation: 'schedule',
                    fields: [
                      { name: 'class_id', label: 'Kelas', options: options('classes', 'name') },
                      {
                        name: 'day_of_week',
                        label: 'Hari',
                        options: [
                          'Ahad',
                          'Isnin',
                          'Selasa',
                          'Rabu',
                          'Khamis',
                          'Jumaat',
                          'Sabtu',
                        ].map((d, i) => [String(i), d]),
                      },
                      { name: 'start_time', label: 'Masa', type: 'time' },
                      { name: 'duration_minutes', label: 'Minit', type: 'number', value: '30' },
                      { name: 'effective_from', label: 'Berkuat kuasa', type: 'date' },
                    ],
                    transform: (v) => ({
                      ...v,
                      day_of_week: Number(v.day_of_week),
                      duration_minutes: Number(v.duration_minutes),
                    }),
                  })
                }
              >
                Tambah jadual
              </button>
            )
          }
        >
          <Table
            headers={['Kelas', 'Hari', 'Masa', 'Tempoh']}
            rows={all('class_schedules').map((s) => [
              lookup('classes', s.class_id, 'name'),
              ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'][
                Number(s.day_of_week)
              ],
              String(s.start_time),
              `${s.duration_minutes} minit`,
            ])}
          />
          <p className="footnote">
            Sesi sebenar dijadualkan secara eksplisit; jadual mingguan tidak mengesahkan
            pelaksanaan.
          </p>
        </Card>
      </>
    );
  }
  function financeScreen() {
    return (
      <>
        {demo && (
          <div className="inline-note">
            Amaun yuran di bawah ialah contoh pengiraan. Kadar yuran rasmi AQR belum dibekalkan.
          </div>
        )}
        <div className="metrics">
          {[
            ['Jumlah dibilkan', invoiceTotals.invoiced],
            ['Bayaran diperuntukkan', invoiceTotals.paid],
            ['Baki belum bayar', invoiceTotals.outstanding],
          ].map(([l, v]) => (
            <div className="metric" key={String(l)}>
              <span>{l}</span>
              <strong>{formatMoney(Number(v))}</strong>
              <small>Invois aktif · {month}</small>
            </div>
          ))}
        </div>
        <Card
          title="Invois & baki"
          action={
            <button className="primary" onClick={invoiceForm}>
              <Plus size={16} />
              Cipta invois
            </button>
          }
        >
          <Table
            headers={['Invois', 'Penjaga', 'Jumlah', 'Bayaran', 'Baki', 'Status', '']}
            rows={all('invoices')
              .filter(matches)
              .map((i) => {
                const b = invoiceBalance(i, all('payments'), all('payment_allocations'));
                return [
                  String(i.number),
                  lookup('guardians', i.guardian_id),
                  formatMoney(b.invoiced),
                  formatMoney(b.paid),
                  formatMoney(b.outstanding),
                  <Badge key="s" value={i.status} />,
                  <a
                    key="print"
                    className="text-link"
                    target="_blank"
                    rel="noreferrer"
                    href={`/api/document?type=invoice&id=${i.id}${demo ? '&demo=1' : ''}`}
                    onClick={(e) => {
                      if (isStatic()) {
                        e.preventDefault();
                        void import('@/lib/student-reports')
                          .then(async ({ financialPdf }) =>
                            downloadBlob(
                              new Blob([await financialPdf(i, 'invoice', demo)], {
                                type: 'application/pdf',
                              }),
                              `AQR_invoice_${i.id}.pdf`,
                            ),
                          )
                          .catch(() => setNotice('Dokumen gagal dijana.'));
                      }
                    }}
                  >
                    Cetak / PDF
                  </a>,
                ];
              })}
          />
        </Card>
        <Card title="Bukti bayaran (admin)">
          {all('payments')
            .filter((p) => p.status === 'pending_verification')
            .map((p) => (
              <label className="file-label" key={p.id}>
                {String(p.reference || p.id)} · Pilih JPG / PNG / PDF
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  disabled={demo || busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadProof(p.id, file);
                  }}
                />
              </label>
            ))}
        </Card>
        <Card
          title="Bayaran & pengesahan"
          subtitle="Bukti yang dihantar tidak dikira sebagai kutipan disahkan"
          action={
            <button onClick={paymentForm}>
              <Plus size={16} />
              Rekod bayaran
            </button>
          }
        >
          <Table
            headers={['Penjaga', 'Amaun', 'Kaedah', 'Status', 'Tindakan']}
            rows={all('payments')
              .filter(matches)
              .map((p) => [
                lookup('guardians', p.guardian_id),
                formatMoney(Number(p.amount_sen)),
                String(p.method),
                <Badge key="s" value={p.status} />,
                p.status === 'pending_verification' ? (
                  <button
                    key="v"
                    onClick={() =>
                      setDialog({
                        title: 'Sahkan dan peruntukkan bayaran',
                        operation: 'verify',
                        fields: [
                          {
                            name: 'inv',
                            label: 'Invois',
                            options: all('invoices')
                              .filter(
                                (i) =>
                                  i.guardian_id === p.guardian_id &&
                                  !['draft', 'void', 'paid'].includes(String(i.status)),
                              )
                              .map((i) => [i.id, String(i.number)]),
                          },
                          { name: 'allocation', label: 'Amaun peruntukan MYR' },
                        ],
                        transform: (v) => ({
                          pid: p.id,
                          inv: v.inv,
                          allocation: integerSen(v.allocation),
                        }),
                      })
                    }
                  >
                    Semak bayaran
                  </button>
                ) : p.status === 'verified' ? (
                  <button
                    key="r"
                    onClick={() =>
                      setDialog({
                        title: 'Balikkan bayaran · sejarah kekal',
                        operation: 'reverse',
                        fields: [{ name: 'reason', label: 'Sebab pembalikan (min. 5 aksara)' }],
                        transform: (v) => ({ ...v, pid: p.id }),
                      })
                    }
                  >
                    Pembalikan
                  </button>
                ) : (
                  '—'
                ),
              ])}
          />
        </Card>
        <Card
          title="Pelan yuran"
          subtitle="Ditetapkan pentadbir; berasingan daripada kadar elaun tutor"
          action={
            <button
              onClick={() =>
                setDialog({
                  title: 'Pelan yuran baharu',
                  operation: 'fee_plan',
                  fields: [
                    { name: 'name', label: 'Nama pelan' },
                    {
                      name: 'basis',
                      label: 'Asas',
                      options: [
                        ['monthly', 'Bulanan'],
                        ['per_session', 'Setiap sesi'],
                        ['package', 'Pakej'],
                      ],
                    },
                    { name: 'amount_sen', label: 'Amaun MYR' },
                    {
                      name: 'due_day',
                      label: 'Hari akhir bayaran (1–28)',
                      type: 'number',
                      value: '7',
                    },
                  ],
                  transform: (v) => ({
                    ...v,
                    amount_sen: integerSen(v.amount_sen),
                    due_day: Number(v.due_day),
                  }),
                })
              }
            >
              Tambah pelan
            </button>
          }
        >
          <Table
            headers={['Pelan', 'Asas', 'Amaun']}
            rows={all('fee_plans').map((p) => [
              String(p.name),
              String(p.basis),
              formatMoney(Number(p.amount_sen)),
            ])}
          />
        </Card>
        <Card title="Resit disahkan">
          <Table
            headers={['Resit', 'Status', '']}
            rows={all('receipts').map((r) => [
              String(r.number),
              <Badge key="s" value={r.status} />,
              <a
                key="p"
                className="text-link"
                target="_blank"
                rel="noreferrer"
                href={`/api/document?type=receipt&id=${r.id}${demo ? '&demo=1' : ''}`}
                onClick={(e) => {
                  if (isStatic()) {
                    e.preventDefault();
                    void import('@/lib/student-reports')
                      .then(async ({ financialPdf }) =>
                        downloadBlob(
                          new Blob([await financialPdf(r, 'receipt', demo)], {
                            type: 'application/pdf',
                          }),
                          `AQR_receipt_${r.id}.pdf`,
                        ),
                      )
                      .catch(() => setNotice('Dokumen gagal dijana.'));
                  }
                }}
              >
                Cetak / PDF
              </a>,
            ])}
          />
        </Card>
      </>
    );
  }
  function allowanceScreen() {
    const entries = all('tutor_allowance_entries').filter((e) =>
      monthlySessions.some((s) => s.id === e.session_id),
    );
    return (
      <>
        <div className="inline-note">
          <ShieldCheck size={18} />
          Elaun dibayar mengikut sesi kelas sebenar yang disahkan dan diluluskan. Kuota tidak layak
          dibayar.
        </div>
        <div className="metrics">
          {['reported', 'verified', 'approved', 'paid'].map((status) => (
            <div className="metric" key={status}>
              <span>{statusLabels[status]}</span>
              <strong>
                {status === 'reported'
                  ? monthlySessions.filter((s) => s.review_status === status).length
                  : formatMoney(
                      entries
                        .filter((e) => e.status === status)
                        .reduce((n, e) => n + Number(e.amount_sen), 0),
                    )}
              </strong>
              <small>
                {status === 'reported' ? 'Sesi menunggu semakan' : 'Snapshot kadar sejarah'}
              </small>
            </div>
          ))}
        </div>
        <Card
          title="Semakan sesi"
          action={
            finance && (
              <button onClick={() => mutate('payout', { billing_period: month, action: 'create' })}>
                Sediakan kelompok bulanan
              </button>
            )
          }
        >
          <Table
            headers={['Tarikh', 'Kelas', 'Tutor', 'Semakan', 'Snapshot', 'Tindakan']}
            rows={monthlySessions.map((s) => [
              dateLabel(String(s.starts_at)),
              lookup('classes', s.class_id, 'name'),
              lookup('staff_profiles', s.tutor_id, 'display_name'),
              <Badge key="s" value={s.review_status} />,
              formatMoney(
                Number(entries.find((e) => e.session_id === s.id)?.rate_snapshot_sen || 0),
              ),
              finance &&
              s.status === 'completed' &&
              ['reported', 'needs_review', 'verified'].includes(String(s.review_status)) ? (
                <button
                  key="review"
                  disabled={busy}
                  onClick={() =>
                    mutate('review', { sid: s.id, approve: s.review_status === 'verified' })
                  }
                >
                  {s.review_status === 'verified' ? 'Luluskan' : 'Sahkan sesi'}
                </button>
              ) : (
                '—'
              ),
            ])}
          />
        </Card>
        <Card
          title="Kadar elaun berversi"
          subtitle="Sumber: 04_KADAR_ELAUN_TUTOR_AQR.csv; tarikh efektif mesti disahkan admin"
          action={
            finance && (
              <button className="primary" onClick={rateForm}>
                <Plus size={16} />
                Versi kadar
              </button>
            )
          }
        >
          <Table
            headers={['Program', 'Tempoh', 'Kadar', 'Mula', 'Tamat', 'Sumber']}
            rows={all('tutor_allowance_rates').map((r) => [
              String(r.program_code),
              `${r.duration_minutes} min`,
              formatMoney(Number(r.amount_sen)),
              String(r.effective_from),
              String(r.effective_to || 'Semasa'),
              String(r.source),
            ])}
          />
        </Card>
        {finance && (
          <Card
            title="Kelompok pembayaran"
            subtitle="Maker-checker: penyedia dan pelulus mesti berlainan"
          >
            <Table
              headers={['Bulan', 'Jumlah', 'Status', 'Tindakan']}
              rows={all('tutor_payout_batches').map((b) => [
                String(b.period),
                formatMoney(Number(b.total_sen)),
                <Badge key="s" value={b.status} />,
                b.status === 'review' ? (
                  <button
                    key="approve"
                    onClick={() =>
                      mutate('payout', { billing_period: b.period, action: 'approve', batch: b.id })
                    }
                  >
                    Luluskan kelompok
                  </button>
                ) : b.status === 'approved' ? (
                  <button
                    key="pay"
                    onClick={() =>
                      setDialog({
                        title: 'Catat pembayaran sebenar',
                        operation: 'payout',
                        fields: [{ name: 'payment_ref', label: 'Rujukan transaksi bank' }],
                        transform: (v) => ({
                          ...v,
                          billing_period: b.period,
                          action: 'pay',
                          batch: b.id,
                        }),
                      })
                    }
                  >
                    Catat pembayaran
                  </button>
                ) : (
                  '—'
                ),
              ])}
            />
          </Card>
        )}
      </>
    );
  }
  function reportsScreen() {
    return (
      <>
        <Card
          title="Laporan berizin"
          subtitle="Pratonton, Excel, CSV dan Sheets menggunakan set rekod dan penapis yang sama"
        >
          <div className="report-toolbar">
            <label>
              Jenis laporan
              <select
                value={report.code}
                onChange={(e) => setReportCode(e.target.value as ReportCode)}
              >
                {Object.entries(REPORTS)
                  .filter(([code]) => allowedReport(role, code as ReportCode))
                  .map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <div className="button-row">
              <button disabled={busy} onClick={() => exportReport('xlsx')}>
                <Download size={16} />
                Excel .xlsx
              </button>
              <button disabled={busy} onClick={() => exportReport('csv')}>
                CSV
              </button>
              <button onClick={() => exportReport('pdf')}>Cetak / PDF</button>
              <button
                disabled={busy || demo || !['owner', 'admin'].includes(role)}
                onClick={() => exportReport('sheets')}
              >
                Google Sheets
              </button>
            </div>
          </div>
          <div className="report-meta">
            <strong>{report.title}</strong>
            <span>
              {month} · {report.rows.length} baris · {demo ? 'Demo rekaan' : 'Data berizin'}
            </span>
          </div>
          <Table
            headers={report.headers.map((h) => h.replace('(sen)', '(RM)'))}
            rows={report.rows.map((row) =>
              row.map((v, i) =>
                report.headers[i].includes('(sen)') && typeof v === 'number' ? formatMoney(v) : v,
              ),
            )}
          />
        </Card>
        <Card title="Sejarah eksport">
          <Table
            headers={['Laporan', 'Masa', 'Baris', 'Status']}
            rows={all('export_jobs').map((j) => [
              String(j.report_type),
              dateLabel(String(j.created_at)),
              Number(j.row_count || 0),
              <Badge key="s" value={j.status} />,
            ])}
          />
        </Card>
        <p className="footnote">
          PDF melalui dialog cetak pelayar. Google Sheets memerlukan sambungan OAuth dalam Tetapan;
          demo tidak membuat eksport cloud.
        </p>
      </>
    );
  }
  function parentScreen() {
    const children =
      role === 'guardian'
        ? all('students')
        : all('students').filter((s) =>
            all('student_guardians').some(
              (g) => g.student_id === s.id && g.guardian_id === activeGuardian && g.portal_allowed,
            ),
          );
    const selected = children.find((s) => s.id === child) || children[0];
    if (!selected) return <Empty text="Tiada anak dipautkan kepada penjaga ini." />;
    const comments = all('generated_parent_comments').filter(
      (c) => c.student_id === selected.id && c.status === 'published',
    );
    const relatedInvoices = all('invoices').filter(
      (i) => i.guardian_id === activeGuardian && !['draft', 'void'].includes(String(i.status)),
    );
    return (
      <>
        <div className="parent-welcome">
          <HeartHandshake size={32} />
          <div>
            <p className="eyebrow">RUANG KELUARGA</p>
            <h1>Perjalanan ilmu anak anda</h1>
            <p>Ikuti kehadiran dan ulasan yang diterbitkan oleh tutor.</p>
          </div>
        </div>
        <div className="child-selector">
          {children.map((s) => (
            <button
              className={s.id === selected.id ? 'selected' : ''}
              key={s.id}
              onClick={() => setChild(s.id)}
            >
              <span className="avatar">{String(s.full_name).slice(0, 1)}</span>
              {String(s.full_name)}
              {s.id === selected.id && <Check size={16} />}
            </button>
          ))}
        </div>
        <Card
          title={`Pembelajaran ${selected.full_name}`}
          subtitle={`${comments.length} ulasan diterbitkan · Rekod penilaian belum mencukupi untuk perbandingan.`}
        >
          {comments.map((c) => (
            <article className="progress-comment" key={c.id}>
              <div>
                <Badge value="published" />
                <span className="muted">Versi {String(c.template_version)}</span>
              </div>
              <p>{String(c.text)}</p>
            </article>
          ))}
          {!comments.length && <Empty text="Tutor belum menerbitkan ulasan untuk anak ini." />}
        </Card>
        <Card title="Kehadiran anak">
          <Table
            headers={['Tarikh', 'Kelas', 'Kehadiran']}
            rows={all('attendance')
              .filter((a) => a.student_id === selected.id)
              .map((a) => {
                const s = all('class_sessions').find((s) => s.id === a.session_id);
                return [
                  s ? dateLabel(String(s.starts_at)) : '—',
                  lookup('classes', s?.class_id, 'name'),
                  <Badge key="s" value={a.status} />,
                ];
              })}
          />
        </Card>
        <MonthlyReports
          data={visible}
          role={role}
          month={month}
          demo={demo}
          studentId={selected.id}
          onData={setData}
        />
        <Card title="Invois keluarga">
          <Table
            headers={['Invois', 'Jumlah', 'Baki', 'Status']}
            rows={relatedInvoices.map((i) => [
              String(i.number),
              formatMoney(Number(i.total_sen)),
              formatMoney(
                invoiceBalance(i, all('payments'), all('payment_allocations')).outstanding,
              ),
              <Badge key="status" value={i.status} />,
            ])}
          />
          <p className="footnote">
            Rekod bayaran untuk rujukan sahaja. Hubungi admin untuk sebarang pembetulan.
          </p>
        </Card>
        <Card title="Rekod bayaran yuran">
          <Table
            headers={['Tarikh', 'Rujukan', 'Amaun', 'Status']}
            rows={all('payments')
              .filter((p) => p.guardian_id === activeGuardian)
              .map((p) => [
                String(p.paid_on),
                String(p.reference || '—'),
                formatMoney(Number(p.amount_sen)),
                <Badge key="status" value={p.status} />,
              ])}
          />
        </Card>
      </>
    );
  }
  async function uploadProof(paymentId: string, file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set('paymentId', paymentId);
      form.set('file', file);
      const r = await apiFetch('/api/upload', { method: 'POST', body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setNotice('Bukti berjaya dimuat naik untuk semakan.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Muat naik gagal');
    } finally {
      setBusy(false);
    }
  }
  function settingsScreen() {
    return (
      <>
        <Card title="Akademi & keselamatan" subtitle="Akademi Al-Quran Ar-Riyadh (AQR)">
          <dl className="settings-list">
            <div>
              <dt>Mod operasi</dt>
              <dd>
                {demo ? 'Demo fiksyen · tiada penyimpanan cloud' : 'Supabase · autentikasi dan RLS'}
              </dd>
            </div>
            <div>
              <dt>Zon masa / mata wang</dt>
              <dd>Asia/Kuala_Lumpur · MYR</dd>
            </div>
            <div>
              <dt>Akses ibu bapa</dt>
              <dd>OTP e-mel · anak yang dipautkan sahaja</dd>
            </div>
            <div>
              <dt>Privasi</dt>
              <dd>
                Tarikh lahir pilihan. NRIC dan maklumat perubatan tidak diperlukan. Arkib
                mengekalkan sejarah.
              </dd>
            </div>
          </dl>
          {role === 'owner' && (
            <button
              onClick={() =>
                setDialog({
                  title: 'Maklumat akademi',
                  operation: 'settings',
                  fields: [
                    { name: 'phone', label: 'Telefon (+60…)', optional: true },
                    { name: 'address', label: 'Alamat', optional: true },
                  ],
                  transform: (v) => ({
                    name: ORGANIZATION,
                    phone: v.phone || null,
                    address: v.address || null,
                  }),
                })
              }
            >
              Kemaskini maklumat akademi
            </button>
          )}
        </Card>
        <Card
          title="Google Sheets"
          subtitle="OAuth sebenar; token disulitkan dan disimpan pada server"
        >
          <GoogleStatus demo={demo} />
          {isStatic() && (
            <p>
              Integrasi OAuth legasi kekal pada binaan server. Eksport XLSX tersedia terus pada
              Pages.
            </p>
          )}
          <p>
            Sambungkan akaun Google untuk mencipta spreadsheet peribadi. Eksport Excel sentiasa
            tersedia.
          </p>
          <div className="button-row">
            <a
              className={`button ${demo ? 'disabled' : ''}`}
              href={demo || isStatic() ? undefined : '/api/google/connect'}
              aria-disabled={demo || isStatic()}
            >
              Hubungkan akaun Google
            </a>
            <button
              disabled={demo || busy}
              onClick={async () => {
                const r = await apiFetch('/api/google/disconnect', { method: 'POST' });
                setNotice(
                  r.ok ? 'Sambungan Google dibatalkan.' : 'Sambungan tidak dapat dibatalkan.',
                );
              }}
            >
              Putuskan sambungan
            </button>
          </div>
          <p className="footnote">
            Google Client ID, Secret dan kunci penyulitan perlu dikonfigurasi. Tiada kejayaan sync
            disimulasikan.
          </p>
        </Card>
        <Card title="Peranti ini">
          <p>Log keluar membatalkan sesi pada peranti ini. Sahkan semula untuk membuka sistem.</p>
          <button
            disabled={demo}
            onClick={async () => {
              const r = await apiFetch('/api/logout', { method: 'POST' });
              if (r.ok) window.location.href = loginPath();
              else setNotice('Log keluar gagal.');
            }}
          >
            <LogOut size={16} />
            Log keluar daripada peranti ini
          </button>
        </Card>
      </>
    );
  }
  // Paparan pentadbir berpusatkan tutor: senarai tutor, kemudian profil dengan murid dan sesi.
  function tutorsScreen() {
    const { start, end } = monthBounds(month);
    const inMonth = (s: Row) => {
      const t = new Date(String(s.starts_at));
      return t >= new Date(start) && t < new Date(end);
    };
    const classesOf = (tid: unknown) =>
      all('class_tutors')
        .filter((c) => c.staff_id === tid && !c.ends_on)
        .map((c) => c.class_id);
    const studentsOf = (tid: unknown) =>
      all('enrollments').filter(
        (e) => e.status === 'active' && classesOf(tid).includes(e.class_id),
      );
    const sessionsOf = (tid: unknown) =>
      all('class_sessions')
        .filter((s) => s.tutor_id === tid && inMonth(s))
        .sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at)));
    const done = (ss: Row[]) => ss.filter((s) => s.status === 'completed').length;
    const pending = (ss: Row[]) =>
      ss.filter((s) => s.status === 'completed' && s.review_status === 'reported').length;
    const tutors = all('staff_profiles').filter((t) => t.role === 'tutor');
    const tutorId = page.split('/')[1];
    const tutor = tutors.find((t) => t.id === tutorId);
    if (tutor) {
      const ss = sessionsOf(tutor.id);
      const enrol = studentsOf(tutor.id);
      const allowance = all('tutor_allowance_entries')
        .filter(
          (e) =>
            ss.some((s) => s.id === e.session_id) &&
            ['approved', 'paid'].includes(String(e.status)),
        )
        .reduce((n, e) => n + Number(e.amount_sen), 0);
      return (
        <>
          <div className="profile-hero">
            <span className="avatar large">{String(tutor.display_name).slice(0, 1)}</span>
            <div>
              <h1>{String(tutor.display_name)}</h1>
              <Badge value={tutor.active ? 'active' : 'archived'} />
            </div>
            <button className="secondary" onClick={() => go('tutors')}>
              Semua tutor
            </button>
          </div>
          <div className="metrics">
            {[
              ['Murid', new Set(enrol.map((e) => e.student_id)).size, 'Murid aktif'],
              ['Sesi dijadualkan', ss.length, `Bulan ${month}`],
              ['Sesi selesai', done(ss), 'Telah dilaksanakan'],
              ['Belum disemak', pending(ss), 'Menunggu semakan admin'],
              ['Elaun diluluskan', formatMoney(allowance), 'Sesi diluluskan bulan ini'],
            ].map(([label, value, hint]) => (
              <div className="metric" key={String(label)}>
                <div className="metric-top">
                  <span>{label}</span>
                </div>
                <strong>{value}</strong>
                <small>{hint}</small>
              </div>
            ))}
          </div>
          <Card title="Murid" subtitle="Murid dan program yang diajar oleh tutor ini">
            <Table
              headers={['Murid', 'Program', 'Sesi selesai bulan ini', '']}
              rows={enrol.map((e) => {
                const c = all('classes').find((x) => x.id === e.class_id);
                return [
                  <strong key="n">{lookup('students', e.student_id)}</strong>,
                  lookup('programs', c?.program_id, 'name'),
                  done(ss.filter((s) => s.class_id === e.class_id)),
                  <button
                    key="o"
                    className="text-link"
                    onClick={() => go(`students/${e.student_id}`)}
                  >
                    Lihat murid <ChevronRight size={16} />
                  </button>,
                ];
              })}
            />
          </Card>
          <Card title="Sesi bulan ini" subtitle="Kelas yang dijadualkan dan dilaksanakan">
            <Table
              headers={['Tarikh', 'Masa', 'Murid · Program', 'Tempoh', 'Status', 'Semakan', '']}
              rows={ss.map((s) => [
                dateLabel(String(s.starts_at)),
                timeLabel(String(s.starts_at)),
                lookup('classes', s.class_id, 'name'),
                `${(new Date(String(s.ends_at)).getTime() - new Date(String(s.starts_at)).getTime()) / 60000} min`,
                <Badge key="s" value={s.status} />,
                <Badge key="r" value={s.review_status} />,
                <button key="o" className="text-link" onClick={() => go(`sessions/${s.id}`)}>
                  Buka sesi <ChevronRight size={16} />
                </button>,
              ])}
            />
          </Card>
        </>
      );
    }
    return (
      <Card title="Senarai tutor" subtitle={`Ringkasan bulan ${month}. Klik tutor untuk butiran.`}>
        <Table
          headers={['Tutor', 'Murid', 'Sesi selesai', 'Belum disemak', 'Status', '']}
          rows={tutors.filter(matches).map((t) => {
            const ss = sessionsOf(t.id);
            return [
              <strong key="n">{String(t.display_name)}</strong>,
              new Set(studentsOf(t.id).map((e) => e.student_id)).size,
              `${done(ss)} / ${ss.length}`,
              pending(ss),
              <Badge key="s" value={t.active ? 'active' : 'archived'} />,
              <button key="o" className="text-link" onClick={() => go(`tutors/${t.id}`)}>
                Lihat <ChevronRight size={16} />
              </button>,
            ];
          })}
        />
        {role === 'owner' && (
          <form
            className="invite-form"
            onSubmit={(e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget);
              invite(String(v.get('email')), String(v.get('role')));
            }}
          >
            <label>
              E-mel kakitangan
              <input name="email" type="email" required />
            </label>
            <label>
              Peranan
              <select name="role">
                <option value="tutor">Tutor</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button disabled={busy} type="submit">
              <Send size={16} />
              Jemput kakitangan
            </button>
          </form>
        )}
      </Card>
    );
  }
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Langkau ke kandungan
      </a>
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="sidebar-brand">
          {all('organizations')[0]?.logo_url ? (
            <img
              className="academy-logo"
              src={String(all('organizations')[0].logo_url)}
              alt="Logo rasmi akademi"
            />
          ) : (
            <span className="brand">
              AQR<span className="gold">.</span>
            </span>
          )}
          <span>
            AKADEMI AL-QURAN
            <br />
            AR-RIYADH
          </span>
          <button
            className="mobile-only icon-button"
            aria-label="Tutup menu"
            onClick={() => setDrawer(false)}
          >
            <X />
          </button>
        </div>
        <nav aria-label="Navigasi utama">
          {groups.map(({ id, label, Icon, members }) => (
            <button
              key={id}
              className={group?.id === id ? 'active' : ''}
              onClick={() => go(members[0])}
            >
              <Icon size={19} />
              <span>{label}</span>
              {group?.id === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="account">
            <span className="avatar">{name.slice(0, 1)}</span>
            <div>
              <strong>{demo ? 'Pengguna demo' : name}</strong>
              <small>{roleLabels[role]}</small>
            </div>
            <ShieldCheck size={18} />
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-only icon-button"
              aria-label="Buka menu"
              onClick={() => setDrawer(true)}
            >
              <Menu />
            </button>
            <span>AQR</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-controls">
            {demo && (
              <label className="role-select">
                <span className="sr-only">Pratonton peranan demo</span>
                <select
                  value={role}
                  onChange={(e) => {
                    const nextRole = e.target.value as Role;
                    setRole(nextRole);
                    go(nextRole === 'guardian' ? 'parent' : 'dashboard');
                  }}
                >
                  {Object.entries(roleLabels).map(([r, l]) => (
                    <option key={r} value={r}>
                      {l} · demo
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <CircleAlert size={16} />
            <span>
              <strong>MOD DEMO</strong> · Data rekaan. Perubahan dalam memori tab sahaja; muat
              semula akan menetapkan semula.
            </span>
            <a href={loginPath()}>
              Akses sebenar <ArrowUpRight size={14} />
            </a>
          </div>
        )}
        <main id="main" className="content">
          <div className="page-tools">
            <div>
              <h2>{group && group.members.length > 1 ? group.label : title}</h2>
              {group && group.members.length > 1 && (
                <div className="subtabs" role="tablist" aria-label={group.label}>
                  {group.members.map((m) => (
                    <button
                      key={m}
                      role="tab"
                      aria-selected={section === m}
                      className={section === m ? 'active' : ''}
                      onClick={() => go(m)}
                    >
                      {nav.find((n) => n[0] === m)?.[1]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="filters">
              <label className="search">
                <Search size={16} />
                <input
                  aria-label="Cari rekod"
                  placeholder="Cari rekod…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label className="month-filter">
                <CalendarDays size={16} />
                <input
                  aria-label="Bulan laporan"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value || '2026-10')}
                />
              </label>
            </div>
          </div>
          {notice && (
            <div className="notice" role="status">
              <CircleAlert size={18} />
              <span>{notice}</span>
              <button aria-label="Tutup makluman" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {!allowedPage ? (
            <Empty text="Halaman ini tidak tersedia bagi peranan anda." />
          ) : section === 'dashboard' ? (
            dashboard()
          ) : section === 'students' ? (
            studentsScreen()
          ) : section === 'guardians' ? (
            guardiansScreen()
          ) : section === 'tutors' ? (
            <>
              {!page.split('/')[1] && (
                <TutorApplications data={visible} onData={setData} demo={demo} />
              )}
              {tutorsScreen()}
            </>
          ) : section === 'classes' ? (
            classesScreen()
          ) : section === 'calendar' ? (
            calendarScreen()
          ) : section === 'finance' ? (
            financeScreen()
          ) : section === 'allowance' ? (
            allowanceScreen()
          ) : section === 'reports' ? (
            <>
              {academic && (
                <MonthlyReports
                  data={visible}
                  role={role}
                  month={month}
                  demo={demo}
                  onData={setData}
                />
              )}{' '}
              {reportsScreen()}
            </>
          ) : section === 'parent' ? (
            parentScreen()
          ) : section === 'settings' ? (
            settingsScreen()
          ) : section === 'sessions' && currentSession ? (
            <SessionEditor
              key={currentSession.id}
              session={currentSession}
              data={visible}
              busy={busy}
              mutate={mutate}
            />
          ) : (
            <Empty text="Sesi tidak ditemui atau akses tidak dibenarkan." />
          )}
          {section === 'parent' && <ContactAdmin data={visible} />}{' '}
          {section === 'parent' && (
            <PublishedMilestones data={visible} student={child || all('students')[0]?.id || ''} />
          )}{' '}
          {section === 'sessions' && currentSession && (
            <Milestone data={visible} session={currentSession} mutate={mutate} demo={demo} />
          )}
          <AdditionalTools
            data={visible}
            role={role}
            section={section}
            month={month}
            demo={demo}
            open={setDialog}
            mutate={mutate}
          />
          <footer>
            {ORGANIZATION}
            <span>{demo ? 'Demo · semua identiti rekaan' : 'Rekod peribadi · akses berizin'}</span>
          </footer>
        </main>
      </div>
      {dialog && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialog(null);
          }}
        >
          <section
            className="modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setDialog(null);
              if (event.key === 'Tab') {
                const targets = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]',
                  ),
                );
                const first = targets[0],
                  last = targets[targets.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <div className="card-heading">
              <h2 id="dialog-title">{dialog.title}</h2>
              <button aria-label="Tutup borang" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const values = Object.fromEntries(
                  new FormData(e.currentTarget).entries(),
                ) as Record<string, string>;
                try {
                  const payload = dialog.transform
                    ? dialog.transform(values)
                    : Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
                  mutate(dialog.operation, payload);
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : 'Input tidak sah');
                }
              }}
            >
              {dialog.fields.map((f) => (
                <label key={f.name}>
                  {f.label}
                  {f.optional && <small> (pilihan)</small>}
                  {f.options ? (
                    <select
                      autoFocus={dialog.fields[0] === f}
                      name={f.name}
                      required={!f.optional}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Pilih…
                      </option>
                      {f.options.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      autoFocus={dialog.fields[0] === f}
                      name={f.name}
                      type={f.type || 'text'}
                      required={!f.optional}
                      defaultValue={f.value}
                      min={f.type === 'number' ? 0 : undefined}
                    />
                  )}
                </label>
              ))}
              {dialog.extra}
              {!dialog.fields.length && (
                <p>
                  {dialog.operation === 'remove_student'
                    ? 'Murid dikeluarkan dan sesi akan datang dibatalkan. Rekod kehadiran dan elaun yang lepas dikekalkan.'
                    : 'Sahkan tindakan ini. Rekod sejarah tidak dipadam.'}
                </p>
              )}
              <button className="primary wide" type="submit" disabled={busy}>
                {busy ? 'Menyimpan…' : demo ? 'Simpan dalam demo' : 'Simpan rekod'}
                <Check size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function SessionEditor({
  session,
  data,
  busy,
  mutate,
}: {
  session: Row;
  data: Dataset;
  busy: boolean;
  mutate: (operation: string, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const students = data.students.filter((s) =>
    data.enrollments.some((e) => e.class_id === session.class_id && e.student_id === s.id),
  );
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [attendance, setAttendance] = useState('');
  const [assessment, setAssessment] = useState<Partial<Assessment>>({});
  const cls = data.classes.find((c) => c.id === session.class_id);
  const program = data.programs.find((p) => p.id === cls?.program_id);
  const subject = data.subjects.find((s) => s.id === program?.subject_id);
  const subjectSlug = String(subject?.slug || 'mengaji');
  const locked = ['verified', 'approved', 'paid'].includes(String(session.review_status));
  let preview = 'Pilih kehadiran dan penilaian untuk melihat ulasan.';
  let valid = false;
  try {
    if (attendance) {
      const input = ['absent', 'excused'].includes(attendance)
        ? { mastery: 'not_assessed' as const }
        : (assessment as Assessment);
      preview = generateComment(
        subjectSlug,
        attendance,
        input,
        data.assessment_options.filter((o) => o.subject_id === subject?.id),
      );
      valid = true;
    }
  } catch {
    /* Explicit choices required. */
  }
  const pick = (field: keyof Assessment, value: unknown) =>
    setAssessment((a) => ({ ...a, [field]: value }));
  const optionList = (
    field: keyof Assessment,
    fallback: readonly (readonly [string, string])[],
  ) => {
    const groupCode = field === 'practice' ? 'home_practice' : field;
    const configured = data.assessment_options
      .filter(
        (o) =>
          o.subject_id === subject?.id &&
          o.group_code === groupCode &&
          o.active &&
          o.rubric_version === '1',
      )
      .map((o) => [String(o.code), String(o.label)] as [string, string]);
    return configured.length ? configured : fallback;
  };
  const group = (
    title: string,
    field: keyof Assessment,
    fallback: readonly (readonly [string, string])[],
  ) => (
    <fieldset>
      <legend>{title}</legend>
      <div className="chips">
        {optionList(field, fallback).map(([v, label]) => (
          <button
            type="button"
            key={v}
            disabled={locked}
            aria-pressed={assessment[field] === v}
            className={assessment[field] === v ? 'selected' : ''}
            onClick={() => pick(field, v)}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
  async function save(publish: boolean) {
    const success = await mutate('assessment', {
      sid: session.id,
      student: studentId,
      attendance_status: attendance,
      selected: ['absent', 'excused'].includes(attendance)
        ? { mastery: 'not_assessed' }
        : assessment,
      publish,
    });
    if (success) {
      const next = students[students.findIndex((s) => s.id === studentId) + 1];
      if (next) {
        setStudentId(next.id);
        setAttendance('');
        setAssessment({});
      }
    }
  }
  return (
    <>
      <Card
        title={String(cls?.name || 'Sesi')}
        subtitle={`${dateLabel(String(session.starts_at))} · ${timeLabel(String(session.starts_at))} · ${students.length} murid`}
      >
        <div className="student-tabs">
          {students.map((s) => (
            <button
              key={s.id}
              className={s.id === studentId ? 'selected' : ''}
              onClick={() => {
                setStudentId(s.id);
                setAttendance('');
                setAssessment({});
              }}
            >
              {String(s.full_name)}
              {data.attendance.some(
                (a) => a.session_id === session.id && a.student_id === s.id,
              ) && <Check size={14} />}
            </button>
          ))}
        </div>
        {locked && (
          <div className="inline-note">
            Sesi telah disahkan. Rekod dikunci untuk menjaga sejarah elaun.
          </div>
        )}
        {!students.length ? (
          <Empty text="Tiada murid berdaftar pada kelas ini." />
        ) : (
          <div className="assessment-grid">
            <div>
              <fieldset>
                <legend>1. Kehadiran</legend>
                <div className="chips">
                  {['present', 'late', 'absent', 'excused', 'makeup'].map((a) => (
                    <button
                      key={a}
                      disabled={locked}
                      aria-pressed={attendance === a}
                      className={attendance === a ? 'selected' : ''}
                      onClick={() => {
                        setAttendance(a);
                        setAssessment({});
                      }}
                    >
                      {statusLabels[a]}
                    </button>
                  ))}
                </div>
              </fieldset>
              {!['absent', 'excused'].includes(attendance) && (
                <>
                  {group('2. Kemahiran dinilai', 'skill', skillOptions[subjectSlug])}
                  <fieldset>
                    <legend>3. Penguasaan · tiada penilaian dipilih awal</legend>
                    <div className="chips mastery">
                      {['Bimbingan', 'Asas', 'Memuaskan', 'Baik', 'Sangat baik'].map((l, i) => (
                        <button
                          key={l}
                          disabled={locked}
                          aria-pressed={assessment.mastery === i + 1}
                          className={assessment.mastery === i + 1 ? 'selected' : ''}
                          onClick={() => pick('mastery', i + 1)}
                        >
                          <strong>{i + 1}</strong>
                          {l}
                        </button>
                      ))}
                      <button
                        disabled={locked}
                        className={assessment.mastery === 'not_assessed' ? 'selected' : ''}
                        onClick={() => pick('mastery', 'not_assessed')}
                      >
                        Belum dapat dinilai
                      </button>
                    </div>
                  </fieldset>
                  {assessment.mastery !== 'not_assessed' && (
                    <>
                      {group('4. Penglibatan', 'participation', participationOptions)}
                      {group('5. Fokus latihan', 'focus', focusOptions)}
                      {group('Latihan rumah (pilihan)', 'practice', practiceOptions)}
                    </>
                  )}
                </>
              )}
            </div>
            <aside className="preview-comment">
              <p className="eyebrow">PRATONTON ULASAN IBU BAPA</p>
              <BookOpen size={28} />
              <p>{preview}</p>
              <small>Template v1 · berdasarkan pilihan sebenar sahaja</small>
              <div className="button-row">
                <button disabled={!valid || locked || busy} onClick={() => save(false)}>
                  Simpan draf
                </button>
                <button
                  className="primary"
                  disabled={!valid || locked || busy}
                  onClick={() => save(true)}
                >
                  <Send size={16} />
                  Terbit kepada ibu bapa
                </button>
              </div>
              <small>
                Draf hanya dapat dilihat tutor dan pentadbir. Penerbitan ialah tindakan nyata.
              </small>
            </aside>
          </div>
        )}
      </Card>
    </>
  );
}
