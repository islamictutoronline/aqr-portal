'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  apiFetch,
  navigatePath,
  loginPath,
  isStatic,
  downloadBlob,
  assetUrl,
} from '@/lib/transport';
import { GuardianDelivery } from './guardian-delivery';
import { whatsappUrl } from '@/lib/delivery';
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
  Pencil,
  MessageCircle,
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
  passwordProblem,
  normalizePhone,
  countryCodes,
  joinPhone,
  splitPhone,
  feeReference,
  fileName,
  monthLabel,
} from '@/lib/core';
import { buildReport, allowanceRows, feeRows } from '@/lib/reporting';
import { buildPayslip, payslipPdf, payslipsZip, payslipFileName } from '@/lib/payslip';
import { loadBrandBytes } from '@/lib/brand';
import { demoSnapshot } from '@/lib/student-reports';
import { TutorClassReports } from './tutor-reports';
import {
  Reading,
  hasReading,
  readingKind,
  readingLabel,
  readingProblem,
  surahs,
} from '@/lib/quran';
import { scopeDemo } from '@/lib/demo';
import { AdditionalTools } from './tools';
import { ContactAdmin } from './contact-admin';
import { GoogleStatus } from './google-status';
import { PublishedMilestones } from './milestone';
type Field = {
  name: string;
  label: string;
  type?: string;
  pattern?: string;
  placeholder?: string;
  options?: [string, string][];
  optional?: boolean;
  value?: string;
  choices?: GuardianChoice[];
};
export type Dialog = {
  title: string;
  operation: string;
  fields: Field[];
  transform?: (values: Record<string, string>) => Record<string, unknown>;
  extra?: React.ReactNode;
  after?: (payload: Record<string, unknown>) => void;
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
// No. WhatsApp: kod negara + nombor ditaip bebas; pratonton menunjukkan nombor yang akan disimpan.
function PhoneField({
  label,
  initial,
  onPreview,
}: {
  label: string;
  initial?: string;
  onPreview?: (phone: string | null) => void;
}) {
  const [start] = useState(() => (initial ? splitPhone(initial) : ['+60', '']));
  const [code, setCode] = useState(start[0]);
  const [num, setNum] = useState(start[1]);
  let preview: string | null = null;
  let problem = '';
  try {
    preview = joinPhone(code, num);
  } catch (e) {
    problem = e instanceof Error ? e.message : 'No. tidak sah';
  }
  useEffect(() => onPreview?.(preview), [preview, onPreview]);
  return (
    <div className="phone-field">
      <label>
        Kod negara
        <select name="guardian_cc" value={code} onChange={(e) => setCode(e.target.value)}>
          {countryCodes.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        {label}
        <input
          name="guardian_phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="cth. 0123456789"
          value={num}
          onChange={(e) => setNum(e.target.value)}
        />
      </label>
      <p className={`phone-preview ${problem ? 'bad' : preview ? 'good' : ''}`} aria-live="polite">
        {problem ? (
          problem
        ) : preview ? (
          <>
            Akan disimpan: <strong>{preview}</strong> ·{' '}
            <a href={`https://wa.me/${preview.slice(1)}`} target="_blank" rel="noreferrer">
              Uji di WhatsApp
            </a>
          </>
        ) : (
          'Taip bebas: 012…, 6012…, +6012… — sengkang dan jarak dibuang automatik.'
        )}
      </p>
    </div>
  );
}
export type GuardianChoice = { id: string; name: string; phone: string; children: string[] };
// Penjaga semasa daftar murid: pilih penjaga sedia ada (adik-beradik) atau isi penjaga baharu.
// No. WhatsApp yang sama dengan penjaga sedia ada digabung sebagai adik-beradik (satu invois).
function GuardianField({
  choices,
  initialId,
  tutorView = false,
}: {
  choices: GuardianChoice[];
  initialId?: string;
  // Tutor: laporan tutor kekal berasingan; penggabungan laporan + invois dibuat oleh admin.
  tutorView?: boolean;
}) {
  const [pick, setPick] = useState(initialId || '');
  const [typed, setTyped] = useState<string | null>(null);
  const chosen = choices.find((c) => c.id === pick);
  const match = !chosen && typed ? choices.find((c) => c.phone === typed) : undefined;
  const siblings = (chosen || match)?.children.join(', ');
  return (
    <div className="guardian-field">
      {choices.length > 0 && (
        <label>
          Penjaga
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Penjaga baharu</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · anak: {c.children.join(', ')}
              </option>
            ))}
          </select>
        </label>
      )}
      <label key={`name-${pick}`}>
        Nama penjaga <small>(pilihan)</small>
        <input
          name="guardian_name"
          defaultValue={chosen?.name ?? ''}
          placeholder="Kosongkan → Ibu/Bapa (nama murid)"
        />
      </label>
      <PhoneField
        key={`phone-${pick}`}
        label="No. WhatsApp penjaga"
        initial={chosen?.phone}
        onPreview={setTyped}
      />
      {siblings &&
        (tutorView ? (
          <p className="sibling-note" role="status">
            Adik-beradik: penjaga yang sama. Laporan anda kekal berasingan untuk setiap murid; admin
            menggabungkan laporan + invois untuk penjaga.{' '}
            <small>
              Anak lain penjaga ini: <strong>{siblings}</strong>
            </small>
          </p>
        ) : (
          <p className="sibling-note" role="status">
            Adik-beradik: murid ini akan digabung dengan <strong>{siblings}</strong> di bawah
            penjaga yang sama — satu invois dan satu penghantaran laporan.
          </p>
        ))}
    </div>
  );
}
// Jadual fleksibel: slot mingguan menjadi masa pilihan sahaja; tutor merekod setiap kelas sendiri.
function FlexibleField({ initial = false }: { initial?: boolean }) {
  return (
    <div className="flexible-field">
      <label className="check-label">
        <input type="checkbox" name="flexible" defaultChecked={initial} />
        Jadual fleksibel
      </label>
      <p className="schedule-note">
        Masa kelas tetap diisi sebagai masa pilihan; sesi tidak dijana automatik — rekod setiap
        kelas dengan Tambah rekod sesi pada tarikh sebenar.
      </p>
    </div>
  );
}
function WeeklySlots({ initial = [] }: { initial?: { day: number; time: string }[] }) {
  const [count, setCount] = useState(Math.max(1, initial.length));
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
            <select
              name={`day_${i + 1}`}
              required
              defaultValue={initial[i] ? String(initial[i].day) : ''}
            >
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
            <input
              name={`time_${i + 1}`}
              type="time"
              required
              defaultValue={initial[i]?.time ?? ''}
            />
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
      <table className="responsive">
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
                <td key={j} data-label={headers[j]}>
                  {v}
                </td>
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
// Satu lajur dalam paparan dua lajur Kewangan (Belum / Sudah bayar), dengan bilangan dan jumlah.
function PayColumn({
  title,
  summary,
  tone,
  children,
}: {
  title: string;
  summary: string;
  tone: 'due' | 'done';
  children: React.ReactNode;
}) {
  return (
    <section className={`pay-column ${tone}`} aria-label={title}>
      <header>
        <h3>{title}</h3>
        <span>{summary}</span>
      </header>
      {children}
    </section>
  );
}
function Card({
  title,
  subtitle,
  children,
  action,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
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
  passwordSet = false,
}: {
  initial: Dataset;
  demo: boolean;
  path: string;
  role: Role;
  name: string;
  staffId?: string;
  guardianId?: string;
  passwordSet?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [hasPassword, setHasPassword] = useState(passwordSet);
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
  const [dialog, setDialogState] = useState<Dialog | null>(null);
  // Borang baharu bermula tanpa mesej lama.
  const setDialog = (d: Dialog | null) => {
    if (d) setNotice('');
    setDialogState(d);
  };
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const changed = () => {
      setMobileNavigation(media.matches);
      setDrawer(false);
    };
    changed();
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (!drawer || !mobileNavigation) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () =>
      Array.from(sidebarRef.current?.querySelectorAll<HTMLButtonElement>('button') || []);
    controls()[0]?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawer(false);
      } else if (event.key === 'Tab') {
        const items = controls();
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('keydown', close);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [drawer, mobileNavigation]);
  const [selectedSession, setSelectedSession] = useState(
    path.startsWith('sessions/') ? path.split('/')[1] : '',
  );
  const [child, setChild] = useState('');
  const [sessionTab, setSessionTab] = useState('today');
  const [reviewClass, setReviewClass] = useState('');
  const [allowanceTab, setAllowanceTab] = useState('all');
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [payDate, setPayDate] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()),
  );
  // Selepas sesi dicipta atau dijadual semula, buka sesi baharu itu sebaik data dimuat semula.
  const [pendingMove, setPendingMove] = useState<{ cid: unknown; start: string } | null>(null);
  useEffect(() => {
    if (!pendingMove) return;
    const target = (data.class_sessions || []).find(
      (s) =>
        s.class_id === pendingMove.cid &&
        !['cancelled', 'rescheduled'].includes(String(s.status)) &&
        new Date(String(s.starts_at)).getTime() === new Date(pendingMove.start).getTime(),
    );
    if (target) {
      setPendingMove(null);
      setSelectedSession(target.id);
      setPage(`sessions/${target.id}`);
      navigatePath(`sessions/${target.id}`, demo);
    }
  }, [data, pendingMove, demo]);
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
        else if (operation === 'generate_session_invoices')
          demoInvoices(next, String(payload.billing_period), id);
        else if (operation === 'month_package') {
          const period = String(payload.billing_period);
          next.monthly_student_reports ||= [];
          for (const st of next.students.filter((x) => x.status !== 'archived')) {
            const old = next.monthly_student_reports.find(
              (r) => r.student_id === st.id && r.period === period,
            );
            if (old?.status === 'approved') continue;
            const row = {
              id: old?.id || `demo-report-${st.id}-${period}`,
              student_id: st.id,
              period,
              status: 'draft',
              snapshot: demoSnapshot(next, st, period),
            };
            if (old) Object.assign(old, row);
            else next.monthly_student_reports.push(row);
          }
          demoInvoices(next, period, id);
        } else if (operation === 'save_payment_details') {
          next.tutor_payment_details = [
            ...(next.tutor_payment_details || []).filter((x) => x.staff_id !== payload.staff_id),
            { id, ...payload },
          ];
        } else if (operation === 'remove_tutor') {
          const sid = payload.staff_id;
          next.staff_profiles.find((x) => x.id === sid)!.active = false;
          const today = new Date().toISOString().slice(0, 10);
          next.class_tutors
            .filter((t) => t.staff_id === sid && !t.ends_on)
            .forEach((t) => (t.ends_on = today));
          next.class_sessions
            .filter(
              (x) =>
                x.tutor_id === sid &&
                x.status === 'scheduled' &&
                new Date(String(x.starts_at)) > new Date(),
            )
            .forEach((x) => (x.status = 'cancelled'));
        } else if (operation === 'move_session') {
          const sess = next.class_sessions.find((x) => x.id === payload.sid)!;
          const length =
            new Date(String(sess.ends_at)).getTime() - new Date(String(sess.starts_at)).getTime();
          const start = new Date(String(payload.new_start));
          sess.starts_at = start.toISOString();
          sess.ends_at = new Date(start.getTime() + length).toISOString();
        } else if (operation === 'void_session') {
          const sess = next.class_sessions.find((x) => x.id === payload.sid)!;
          const local = new Date(new Date(String(sess.starts_at)).getTime() + 8 * 3600000);
          const slot = next.class_schedules.some(
            (r) =>
              r.class_id === sess.class_id &&
              Number(r.day_of_week) === local.getUTCDay() &&
              String(r.start_time).slice(0, 5) === local.toISOString().slice(11, 16),
          );
          sess.status = slot ? 'scheduled' : 'cancelled';
          next.attendance = next.attendance.filter((a) => a.session_id !== payload.sid);
          next.generated_parent_comments
            .filter((c) => c.session_id === payload.sid)
            .forEach((c) => (c.status = 'retracted'));
        } else if (operation === 'change_session') {
          const old = next.class_sessions.find((x) => x.id === payload.sid)!;
          old.status = payload.new_status;
          if (payload.new_status === 'rescheduled') {
            const start = new Date(String(payload.new_start));
            const minutes =
              (new Date(String(old.ends_at)).getTime() -
                new Date(String(old.starts_at)).getTime()) /
              60000;
            next.class_sessions.push({
              ...old,
              id,
              status: 'scheduled',
              starts_at: start.toISOString(),
              ends_at: new Date(start.getTime() + minutes * 60000).toISOString(),
            });
          }
        } else if (operation === 'tutor_enrol') {
          const studentId = `${id}-student`;
          const program = next.programs.find((x) => x.id === payload.program_id)!;
          // Admin mendaftar bagi pihak tutor yang dipilih; tutor mendaftar untuk diri sendiri.
          const tutorId = payload.tutor_id || activeTutor;
          if (academic && !payload.tutor_id) throw new Error('Pilih tutor');
          next.students.push({ id: studentId, full_name: payload.student_name, status: 'active' });
          next.classes.push({
            id,
            program_id: program.id,
            name: `${payload.student_name} · ${program.name}`,
            mode: 'one_to_one',
            delivery: 'online',
            max_capacity: 1,
            active: true,
            flexible: !!payload.flexible,
          });
          const today = new Date().toISOString().slice(0, 10);
          next.class_tutors.push({
            id: `${id}-tutor`,
            class_id: id,
            staff_id: tutorId,
            starts_on: today,
          });
          next.enrollments.push({
            id: `${id}-enrollment`,
            student_id: studentId,
            class_id: id,
            status: 'active',
            starts_on: today,
          });
          (payload.slots as { day: number; time: string }[]).forEach((slot, k) =>
            next.class_schedules.push({
              id: `${id}-rule-${k}`,
              class_id: id,
              day_of_week: slot.day,
              start_time: `${slot.time}:00`,
              duration_minutes: payload.minutes,
              effective_from: payload.start_date || today,
              effective_to: payload.end_date,
            }),
          );
          // Demo: jana empat minggu sesi daripada slot mingguan (kecuali jadual fleksibel).
          for (const slot of payload.flexible
            ? []
            : (payload.slots as { day: number; time: string }[]))
            for (let d = 0; d < 42; d++) {
              const day = new Date(Date.parse(String(payload.start_date || today)) + d * 86400000);
              if (day.getDay() !== slot.day) continue;
              const start = new Date(`${day.toISOString().slice(0, 10)}T${slot.time}:00+08:00`);
              next.class_sessions.push({
                id: `${id}-${slot.day}-${d}`,
                class_id: id,
                tutor_id: tutorId,
                starts_at: start.toISOString(),
                ends_at: new Date(start.getTime() + Number(payload.minutes) * 60000).toISOString(),
                status: 'scheduled',
                review_status: 'reported',
              });
            }
          demoGuardian(next, studentId, payload.guardian_name, payload.guardian_phone);
        } else if (operation === 'save_guardian') {
          demoGuardian(next, payload.student_id, payload.guardian_name, payload.guardian_phone);
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
          const sel = payload.selected as Assessment;
          const attended = ['present', 'late', 'makeup'].includes(
            String(payload.attendance_status),
          );
          if (attended && sel.reading && hasReading(sel.reading)) {
            const problem = readingProblem(sel.reading);
            if (problem) throw new Error(problem);
          }
          next.attendance.push({
            id,
            session_id: payload.sid,
            student_id: payload.student,
            status: payload.attendance_status,
            reading: attended && hasReading(sel.reading) ? sel.reading : null,
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
        } else if (operation === 'save_tutor_remark') {
          const text = String(payload.remark || '').trim();
          next.monthly_tutor_remarks = (next.monthly_tutor_remarks || []).filter(
            (r) => !(r.student_id === payload.student_id && r.period === payload.period),
          );
          if (text)
            next.monthly_tutor_remarks.push({
              id,
              student_id: payload.student_id,
              period: payload.period,
              remark: text,
              updated_at: new Date().toISOString(),
            });
        } else if (operation === 'update_student') {
          const st = next.students.find((x) => x.id === payload.student_id)!;
          const old = String(st.full_name);
          st.full_name = payload.full_name;
          const mine = next.enrollments
            .filter((e) => e.student_id === st.id)
            .map((e) => e.class_id);
          next.classes
            .filter((c) => mine.includes(c.id) && String(c.name).startsWith(`${old} · `))
            .forEach(
              (c) => (c.name = `${String(payload.full_name)}${String(c.name).slice(old.length)}`),
            );
        } else if (operation === 'update_schedule') {
          const cid = payload.cid;
          const eff = String(payload.effective_from);
          const hhmm = (iso: string) => {
            const d = new Date(Date.parse(iso) + 8 * 3600000);
            return {
              dow: d.getUTCDay(),
              time: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
            };
          };
          const oldRules = next.class_schedules.filter(
            (r) => r.class_id === cid && (!r.effective_to || String(r.effective_to) >= eff),
          );
          // Buang slot berjadual lama yang belum direkod; sesi direkod dan tambahan kekal.
          next.class_sessions = next.class_sessions.filter((x) => {
            if (x.class_id !== cid || x.status !== 'scheduled') return true;
            if (klDate(String(x.starts_at)) < eff) return true;
            if (next.attendance.some((a) => a.session_id === x.id)) return true;
            const at = hhmm(String(x.starts_at));
            return !oldRules.some(
              (r) =>
                Number(r.day_of_week) === at.dow && String(r.start_time).slice(0, 5) === at.time,
            );
          });
          const dayBefore = new Date(Date.parse(`${eff}T00:00:00Z`) - 86400000)
            .toISOString()
            .slice(0, 10);
          next.class_schedules = next.class_schedules.filter(
            (r) => !(r.class_id === cid && String(r.effective_from) >= eff),
          );
          next.class_schedules
            .filter((r) => r.class_id === cid && (!r.effective_to || String(r.effective_to) >= eff))
            .forEach((r) => (r.effective_to = dayBefore));
          const tutorId =
            next.class_tutors.find((t) => t.class_id === cid && !t.ends_on)?.staff_id ||
            activeTutor;
          const cls = next.classes.find((c) => c.id === cid);
          if (cls && payload.flexible !== null && payload.flexible !== undefined)
            cls.flexible = !!payload.flexible;
          (payload.slots as { day: number; time: string }[]).forEach((slot, k) => {
            next.class_schedules.push({
              id: `${id}-rule-${k}`,
              class_id: cid,
              day_of_week: slot.day,
              start_time: `${slot.time}:00`,
              duration_minutes: payload.minutes,
              effective_from: eff,
              effective_to: payload.end_date,
            });
            // Jadual fleksibel: slot disimpan sebagai masa pilihan sahaja; tiada sesi dijana.
            for (let d = 0; d < (cls?.flexible ? 0 : 42); d++) {
              const day = new Date(Date.parse(`${eff}T00:00:00Z`) + d * 86400000);
              const iso = day.toISOString().slice(0, 10);
              if (day.getUTCDay() !== slot.day || iso > String(payload.end_date)) continue;
              const start = new Date(`${iso}T${slot.time}:00+08:00`);
              if (
                next.class_sessions.some(
                  (x) => x.class_id === cid && Date.parse(String(x.starts_at)) === start.getTime(),
                )
              )
                continue;
              next.class_sessions.push({
                id: `${id}-${slot.day}-${d}`,
                class_id: cid,
                tutor_id: tutorId,
                starts_at: start.toISOString(),
                ends_at: new Date(start.getTime() + Number(payload.minutes) * 60000).toISOString(),
                status: 'scheduled',
                review_status: 'reported',
              });
            }
          });
        } else if (operation === 'transfer_class') {
          // Tamatkan tugasan tutor lama, tambah tugasan baharu, pindah sesi berjadual belum direkod.
          const cid = payload.cid;
          const eff = String(payload.effective_from);
          const dayBefore = new Date(Date.parse(`${eff}T00:00:00Z`) - 86400000)
            .toISOString()
            .slice(0, 10);
          next.class_tutors
            .filter((t) => t.class_id === cid && !t.ends_on)
            .forEach((t) => (t.ends_on = dayBefore));
          next.class_tutors.push({
            id: `${id}-tutor`,
            class_id: cid,
            staff_id: payload.new_tutor,
            starts_on: eff,
          });
          next.class_sessions
            .filter(
              (x) =>
                x.class_id === cid &&
                x.status === 'scheduled' &&
                klDate(String(x.starts_at)) >= eff &&
                !next.attendance.some((a) => a.session_id === x.id),
            )
            .forEach((x) => (x.tutor_id = payload.new_tutor));
        } else if (operation === 'class_rates') {
          (next.class_rate_overrides ||= []).push({
            id,
            class_id: payload.cid,
            fee_sen: payload.fee_sen ?? null,
            allowance_sen: payload.allowance_sen ?? null,
            effective_from: payload.effective_from,
            created_at: new Date().toISOString(),
          });
        } else if (operation === 'tutor_rate') {
          (next.tutor_rate_overrides ||= []).push({
            id,
            staff_id: payload.staff_id,
            adjustment_sen: payload.adjustment_sen,
            effective_from: payload.effective_from,
            created_at: new Date().toISOString(),
          });
        } else if (operation === 'reopen_report') {
          const r = (next.monthly_student_reports || []).find((x) => x.id === payload.report);
          if (!r || r.status !== 'approved')
            throw new Error('Laporan ini bukan laporan diluluskan');
          r.status = 'draft';
          r.approved_at = null;
        } else if (operation === 'invoice_paid') {
          const inv = next.invoices.find((x) => x.id === payload.inv)!;
          const due = invoiceBalance(inv, next.payments, next.payment_allocations).outstanding;
          if (due <= 0) throw new Error('Invois ini sudah dibayar sepenuhnya');
          const pid = `${id}-pay`;
          next.payments.push({
            id: pid,
            guardian_id: inv.guardian_id,
            paid_on: payload.paid_on,
            method: payload.payment_method,
            amount_sen: due,
            reference: payload.payment_ref || null,
            status: 'verified',
          });
          next.payment_allocations.push({
            id: `${id}-alloc`,
            payment_id: pid,
            invoice_id: inv.id,
            amount_sen: due,
          });
          next.receipts.push({
            id: `${id}-receipt`,
            payment_id: pid,
            number: `DEMO-RCT-${next.receipts.length + 1}`,
            details: { amount_sen: due, reference: payload.payment_ref || null },
            status: 'valid',
          });
          inv.status = 'paid';
        } else if (operation === 'tutor_paid') {
          (next.tutor_month_payments ||= []).push({
            id,
            staff_id: payload.staff_id,
            period: payload.period,
            amount_sen: payload.amount_sen,
            sessions: payload.sessions,
            paid_on: payload.paid_on,
            reference: payload.payment_ref || null,
            status: 'paid',
            created_at: new Date().toISOString(),
          });
        } else if (operation === 'void_tutor_paid') {
          const pay = next.tutor_month_payments.find((x) => x.id === payload.pid)!;
          pay.status = 'void';
          pay.void_reason = payload.reason;
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
      if (operation === 'void_session' && payload.sid === selectedSession) go('calendar');
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Permintaan gagal');
      return false;
    } finally {
      setBusy(false);
    }
  }
  // Admin: jana laporan + invois sekali gus bagi murid dipilih (satu keluarga atau satu tutor).
  // Laporan diluluskan dibuka semula, disediakan semula daripada rekod terkini dan diluluskan;
  // kemudian invois ikut sesi dijana. Dibenarkan walaupun kehadiran belum lengkap.
  // Pulangkan data terkini supaya PDF gabungan dibina daripada rekod baharu.
  async function generateFamilies(studentIds: string[]): Promise<Dataset | null> {
    setBusy(true);
    setNotice('');
    try {
      if (demo) {
        const next = structuredClone(data);
        next.monthly_student_reports ||= [];
        for (const sid of studentIds) {
          const st = next.students.find((x) => x.id === sid);
          if (!st) continue;
          const old = next.monthly_student_reports.find(
            (r) => r.student_id === sid && r.period === month,
          );
          const row = {
            id: old?.id || `demo-report-${sid}-${month}`,
            student_id: sid,
            period: month,
            status: 'approved',
            approved_at: new Date().toISOString(),
            snapshot: demoSnapshot(next, st, month),
          };
          if (old) Object.assign(old, row);
          else next.monthly_student_reports.push(row);
        }
        demoInvoices(next, month, `demo-${crypto.randomUUID()}`);
        setData(next);
        setNotice('Demo: laporan diluluskan dan invois dijana dalam memori tab sahaja.');
        return next;
      }
      const save = async (operation: string, payload: Record<string, unknown>) => {
        const r = await apiFetch('/api/mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation, payload }),
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        return result as { id: unknown };
      };
      let latest: Dataset | null = null;
      try {
        for (const sid of studentIds) {
          const old = (data.monthly_student_reports || []).find(
            (r) => r.student_id === sid && r.period === month,
          );
          if (old?.status === 'approved') await save('reopen_report', { report: old.id });
          const prepared = await save('prepare_report', { student: sid, report_month: month });
          await save('approve_report', { report: prepared.id || old?.id });
        }
        await save('generate_session_invoices', { billing_period: month });
      } finally {
        const refresh = await apiFetch('/api/data', { cache: 'no-store' });
        // Muat semula walaupun satu langkah gagal, supaya paparan sepadan dengan pangkalan data.
        if (refresh.ok) {
          latest = (await refresh.json()) as Dataset;
          setData(latest);
        }
      }
      setNotice('Laporan diluluskan dan invois dijana.');
      return latest;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Penjanaan gagal');
      return null;
    } finally {
      setBusy(false);
    }
  }
  // Demo: tiru generate_session_invoices (yuran ikut sesi; satu invois setiap penjaga bil).
  function demoInvoices(next: Dataset, period: string, id: string) {
    const rows = feeRows(next, period).filter((f) => f.guardianId && f.rate_sen !== null);
    for (const gid of new Set(rows.map((f) => f.guardianId!))) {
      const mine = rows.filter((f) => f.guardianId === gid);
      const key = `sessions:${period}:${gid}`;
      const existing = next.invoices.find((i) => i.idempotency_key === key);
      const invId = existing?.id || `${id}-${gid}`;
      next.invoice_items = next.invoice_items.filter((x) => x.invoice_id !== invId);
      mine.forEach((f, k) =>
        next.invoice_items.push({
          id: `${invId}-${k}`,
          invoice_id: invId,
          student_id: f.studentId,
          description: `${f.student} · ${f.program} (${f.minutes} minit)`,
          quantity: f.sessions,
          unit_price_sen: f.rate_sen,
          discount_sen: 0,
        }),
      );
      const total = mine.reduce((n, f) => n + f.total_sen, 0);
      if (existing) existing.total_sen = total;
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
  // Demo: tiru private.save_student_guardian (nama lalai, no. sama = penjaga sama, penjaga bil).
  function demoGuardian(next: Dataset, studentId: unknown, rawName: unknown, rawPhone: unknown) {
    const student = next.students.find((x) => x.id === studentId);
    const typed = String(rawName || '').trim();
    const name = typed || `Ibu/Bapa ${String(student?.full_name ?? '')}`;
    const phone = normalizePhone(String(rawPhone || ''));
    let g = phone ? next.guardians.find((x) => x.phone === phone && x.active !== false) : undefined;
    if (g) {
      if (typed && String(g.full_name).startsWith('Ibu/Bapa ')) g.full_name = name;
    } else {
      const link = next.student_guardians.find(
        (l) => l.student_id === studentId && l.is_billing_contact,
      );
      const current = link ? next.guardians.find((x) => x.id === link.guardian_id) : undefined;
      const shared =
        current && next.student_guardians.filter((l) => l.guardian_id === current.id).length > 1;
      if (current && !shared) {
        Object.assign(current, { full_name: name, phone });
        g = current;
      } else {
        g = { id: `guardian-${Date.now()}`, full_name: name, phone, email: null, active: true };
        next.guardians.push(g);
      }
    }
    const gid = g.id;
    next.student_guardians.forEach((l) => {
      if (l.student_id === studentId) l.is_billing_contact = l.guardian_id === gid;
    });
    if (!next.student_guardians.some((l) => l.student_id === studentId && l.guardian_id === gid))
      next.student_guardians.push({
        id: `link-${Date.now()}`,
        student_id: studentId,
        guardian_id: gid,
        portal_allowed: true,
        is_billing_contact: true,
      });
  }
  // Penjaga bil murid (untuk invois dan hubungan WhatsApp).
  const guardianOf = (studentId: unknown) => {
    const link = all('student_guardians').find(
      (l) => l.student_id === studentId && l.is_billing_contact,
    );
    return link ? all('guardians').find((g) => g.id === link.guardian_id) : undefined;
  };
  const editGuardian = (studentId: unknown, studentName: unknown) => {
    const g = guardianOf(studentId);
    setDialog({
      title: `Penjaga · ${String(studentName)}`,
      operation: 'save_guardian',
      fields: [
        {
          name: 'guardian_name',
          label: 'Nama penjaga',
          optional: true,
          placeholder: `Ibu/Bapa ${String(studentName)}`,
          value: g ? String(g.full_name) : '',
        },
        {
          name: 'guardian_phone',
          label: 'No. WhatsApp penjaga',
          type: 'whatsapp',
          value: g?.phone ? String(g.phone) : '',
        },
      ],
      transform: (v) => ({
        student_id: studentId,
        guardian_name: v.guardian_name || '',
        guardian_phone: joinPhone(v.guardian_cc, v.guardian_phone) ?? '',
      }),
    });
  };
  // Tutor mendaftar murid bersama jadual mingguan; sesi dijana terus ke Sesi & kehadiran.
  // Rumusan tutor (ayat sendiri) bagi laporan bulanan seorang murid.
  const editRemark = (student: Row) => {
    const current = all('monthly_tutor_remarks').find(
      (r) => r.student_id === student.id && r.period === month,
    );
    setDialog({
      title: `Rumusan tutor · ${String(student.full_name)} · ${monthLabel(month)}`,
      operation: 'save_tutor_remark',
      fields: [
        {
          name: 'remark',
          label: 'Rumusan untuk laporan bulanan (ayat sendiri)',
          type: 'textarea',
          optional: true,
          placeholder:
            'Contoh: Alhamdulillah, bacaan semakin lancar. Fokus bulan depan ialah tajwid mad.',
          value: current ? String(current.remark) : '',
        },
      ],
      transform: (v) => ({ student_id: student.id, period: month, remark: v.remark || '' }),
    });
  };
  const editStudent = (student: Row) =>
    setDialog({
      title: 'Kemaskini murid',
      operation: 'update_student',
      fields: [{ name: 'full_name', label: 'Nama penuh murid', value: String(student.full_name) }],
      transform: (v) => ({ student_id: student.id, full_name: v.full_name }),
    });
  // Ubah hari/jam/minit kelas mulai tarikh dipilih; sesi yang sudah direkod tidak berubah.
  const editSchedule = (classId: unknown, program: string) => {
    const today = klDate(new Date().toISOString());
    const rules = all('class_schedules')
      .filter((r) => r.class_id === classId && (!r.effective_to || String(r.effective_to) >= today))
      .sort(
        (a, b) =>
          ((Number(a.day_of_week) + 6) % 7) - ((Number(b.day_of_week) + 6) % 7) ||
          String(a.start_time).localeCompare(String(b.start_time)),
      );
    const initial = rules.map((r) => ({
      day: Number(r.day_of_week),
      time: String(r.start_time).slice(0, 5),
    }));
    const flexible = !!all('classes').find((c) => c.id === classId)?.flexible;
    setDialog({
      title: `Ubah jadual · ${program}`,
      operation: 'update_schedule',
      fields: [
        {
          name: 'minutes',
          label: 'Minit setiap sesi',
          options: [
            ['30', '30 minit'],
            ['20', '20 minit'],
          ],
          value: String(rules[0]?.duration_minutes || 30),
        },
        { name: 'effective_from', label: 'Jadual baharu mulai', type: 'date', value: today },
        {
          name: 'end_date',
          label: 'Sehingga tarikh',
          type: 'date',
          value: String(rules[0]?.effective_to || '2027-12-31'),
        },
      ],
      extra: (
        <>
          <WeeklySlots initial={initial} />
          <FlexibleField initial={flexible} />
          <p className="schedule-note">
            Sesi yang sudah direkod dan sesi tambahan tidak berubah. Sesi akan datang yang belum
            direkod dijana semula mengikut jadual baharu.
          </p>
        </>
      ),
      transform: (v) => ({
        cid: classId,
        minutes: Number(v.minutes),
        effective_from: v.effective_from,
        end_date: v.end_date,
        flexible: v.flexible === 'on',
        slots: Array.from({ length: Number(v.per_week) }, (_, i) => ({
          day: Number(v[`day_${i + 1}`]),
          time: v[`time_${i + 1}`],
        })),
      }),
    });
  };
  // Penjaga sedia ada (yang mempunyai anak aktif) untuk dipilih semasa daftar adik-beradik.
  const guardianChoices = (): GuardianChoice[] =>
    all('guardians')
      .filter((g) => g.phone && g.active !== false)
      .map((g) => ({
        id: String(g.id),
        name: String(g.full_name),
        phone: String(g.phone),
        children: all('student_guardians')
          .filter((l) => l.guardian_id === g.id && l.is_billing_contact)
          .map((l) => all('students').find((x) => x.id === l.student_id && x.status !== 'archived'))
          .filter(Boolean)
          .map((x) => String(x!.full_name)),
      }))
      .filter((c) => c.children.length)
      .sort((a, b) => a.name.localeCompare(b.name));
  // Tutor aktif (untuk admin mendaftar murid atau memindah kelas bagi pihak tutor).
  const activeTutors = (): [string, string][] =>
    all('staff_profiles')
      .filter((t) => t.role === 'tutor' && t.active !== false)
      .map((t) => [String(t.id), String(t.display_name)]);
  // Admin juga boleh mendaftar murid bagi pihak tutor (tutor wajib dipilih).
  const createStudent = (guardianId?: string) =>
    setDialog({
      title: guardianId ? 'Daftar adik-beradik' : 'Daftar murid',
      operation: 'tutor_enrol',
      fields: [
        { name: 'student_name', label: 'Nama penuh' },
        ...(academic ? [{ name: 'tutor_id', label: 'Tutor', options: activeTutors() }] : []),
        {
          name: 'guardian',
          label: 'Penjaga',
          type: 'guardian',
          choices: guardianChoices(),
          value: guardianId,
        },
        { name: 'program_id', label: 'Program', options: options('programs', 'name') },
        {
          name: 'minutes',
          label: 'Minit setiap sesi',
          options: [
            ['30', '30 minit'],
            ['20', '20 minit'],
          ],
        },
        {
          name: 'start_date',
          label: 'Mula tarikh',
          type: 'date',
          value: `${klDate(new Date().toISOString()).slice(0, 8)}01`,
        },
        { name: 'end_date', label: 'Sehingga tarikh', type: 'date', value: '2027-12-31' },
      ],
      extra: (
        <>
          <WeeklySlots />
          <FlexibleField />
        </>
      ),
      transform: (v) => ({
        student_name: v.student_name,
        program_id: v.program_id,
        minutes: Number(v.minutes),
        end_date: v.end_date,
        start_date: v.start_date,
        guardian_name: v.guardian_name || '',
        guardian_phone: joinPhone(v.guardian_cc, v.guardian_phone) ?? '',
        tutor_id: academic ? v.tutor_id : null,
        flexible: v.flexible === 'on',
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
  // Kadar khas kelas yang berkuat kuasa hari ini (terkini dengan tarikh mula <= hari ini).
  const latestRate = (rows: Row[]) => {
    const today = klDate(new Date().toISOString());
    return rows
      .filter((r) => String(r.effective_from) <= today)
      .sort(
        (a, b) =>
          String(b.effective_from).localeCompare(String(a.effective_from)) ||
          String(b.created_at || '').localeCompare(String(a.created_at || '')),
      )[0];
  };
  const classRates = (cid: unknown) =>
    latestRate(all('class_rate_overrides').filter((r) => r.class_id === cid)) as
      { fee_sen?: number | null; allowance_sen?: number | null } | undefined;
  const tutorRate = (tid: unknown) =>
    latestRate(all('tutor_rate_overrides').filter((r) => r.staff_id === tid));
  // Admin: pindah kelas kepada tutor lain mulai tarikh dipilih.
  const transferClass = (classId: unknown, program: string, currentTutor: string) =>
    setDialog({
      title: `Pindah tutor · ${program}`,
      operation: 'transfer_class',
      fields: [
        {
          name: 'new_tutor',
          label: 'Tutor baharu',
          options: activeTutors().filter(([id]) => id !== currentTutor),
        },
        {
          name: 'effective_from',
          label: 'Berkuat kuasa mulai',
          type: 'date',
          value: klDate(new Date().toISOString()),
        },
      ],
      extra: (
        <p className="schedule-note">
          Sesi yang sudah direkod kekal pada tutor asal. Sesi berjadual yang belum direkod mulai
          tarikh ini dipindah kepada tutor baharu.
        </p>
      ),
      transform: (v) => ({
        cid: classId,
        new_tutor: v.new_tutor,
        effective_from: v.effective_from,
      }),
    });
  // Ringgit pilihan → sen (kosong = kadar standard).
  const optionalSen = (value: string) => (value.trim() ? integerSen(value.trim()) : null);
  // Admin: yuran dan elaun khas setiap sesi bagi satu kelas.
  const classRateForm = (classId: unknown, program: string) => {
    const current = classRates(classId);
    const ringgit = (sen: unknown) =>
      sen === null || sen === undefined ? '' : (Number(sen) / 100).toFixed(2);
    setDialog({
      title: `Kadar khas · ${program}`,
      operation: 'class_rates',
      fields: [
        {
          name: 'fee',
          label: 'Yuran setiap sesi (RM)',
          optional: true,
          placeholder: 'Kosongkan → kadar standard',
          value: ringgit(current?.fee_sen),
        },
        {
          name: 'allowance',
          label: 'Elaun tutor setiap sesi (RM)',
          optional: true,
          placeholder: 'Kosongkan → kadar standard',
          value: ringgit(current?.allowance_sen),
        },
        {
          name: 'effective_from',
          label: 'Berkuat kuasa mulai',
          type: 'date',
          value: klDate(new Date().toISOString()),
        },
      ],
      transform: (v) => ({
        cid: classId,
        fee_sen: optionalSen(v.fee || ''),
        allowance_sen: optionalSen(v.allowance || ''),
        effective_from: v.effective_from,
      }),
    });
  };
  // Admin: tambahan/potongan elaun setiap sesi bagi seorang tutor (nilai negatif = potongan).
  const tutorRateForm = (tid: string) => {
    const current = tutorRate(tid);
    setDialog({
      title: `Elaun khas tutor · ${lookup('staff_profiles', tid, 'display_name')}`,
      operation: 'tutor_rate',
      fields: [
        {
          name: 'adjustment',
          label: 'Tambahan/potongan setiap sesi (RM, boleh negatif)',
          pattern: '-?\\d+(\\.\\d{1,2})?',
          placeholder: 'cth. 2.00 atau -1.50',
          value: current ? (Number(current.adjustment_sen) / 100).toFixed(2) : '',
        },
        {
          name: 'effective_from',
          label: 'Berkuat kuasa mulai',
          type: 'date',
          value: klDate(new Date().toISOString()),
        },
      ],
      transform: (v) => {
        const raw = v.adjustment.trim();
        const sign = raw.startsWith('-') ? -1 : 1;
        return {
          staff_id: tid,
          adjustment_sen: sign * integerSen(raw.replace(/^[-+]/, '')),
          effective_from: v.effective_from,
        };
      },
    });
  };
  // Program aktif murid dan tutornya (kelas individu disembunyikan daripada pengguna).
  const programsOf = (studentId: unknown) =>
    all('enrollments')
      .filter((e) => e.student_id === studentId && e.status === 'active')
      .map((e) => {
        const c = all('classes').find((x) => x.id === e.class_id);
        const t = all('class_tutors').find((x) => x.class_id === e.class_id && !x.ends_on);
        const program = lookup('programs', c?.program_id, 'name');
        const tutorName = t ? lookup('staff_profiles', t.staff_id, 'display_name') : '';
        // Jadual mingguan aktif: hari, jam, minit setiap sesi dan tarikh tamat.
        const dayNames = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
        const rules = all('class_schedules')
          .filter(
            (r) =>
              r.class_id === e.class_id &&
              // Tarikh KL (bukan UTC): selepas tengah malam KL jadual lama tamat semalam.
              (!r.effective_to || String(r.effective_to) >= klDate(new Date().toISOString())),
          )
          .sort(
            (a, b) =>
              ((Number(a.day_of_week) + 6) % 7) - ((Number(b.day_of_week) + 6) % 7) ||
              String(a.start_time).localeCompare(String(b.start_time)),
          );
        const rates = classRates(e.class_id);
        return {
          id: String(e.id),
          classId: e.class_id,
          program,
          tutor: tutorName === '—' ? '' : tutorName,
          tutorId: t ? String(t.staff_id) : '',
          // Lajur `flexible` dibaca secara defensif (mungkin belum ada dalam data lama).
          flexible: !!c?.flexible,
          feeSen: rates?.fee_sen ?? null,
          allowanceSen: rates?.allowance_sen ?? null,
          status: e.status,
          slots: rules.map(
            (r) => `${dayNames[Number(r.day_of_week)]} ${String(r.start_time).slice(0, 5)}`,
          ),
          minutes: rules[0] ? Number(rules[0].duration_minutes) : null,
          until: rules[0]?.effective_to ? dateLabel(String(rules[0].effective_to)) : '',
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
            new Blob([new Uint8Array(await toXlsx(report, (await loadBrandBytes()).aqr))]),
            fileName(['AQR', report.title, monthLabel(month)], 'xlsx'),
          );
        } else {
          const { toCsv } = await import('@/lib/reporting');
          downloadBlob(
            new Blob([toCsv(report)], { type: 'text/csv;charset=utf-8' }),
            fileName(['AQR', report.title, monthLabel(month)], 'csv'),
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
        a.download = fileName(['AQR', report.title, monthLabel(month)], format);
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Eksport gagal');
    } finally {
      setBusy(false);
    }
  }
  const klDate = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(iso));
  // Sesi paling sesuai untuk direkod: hari ini, kemudian sesi lepas belum direkod, kemudian seterusnya.
  const bestSession = (cid: unknown) => {
    const now = Date.now();
    const today = klDate(new Date().toISOString());
    const list = all('class_sessions')
      .filter((s) => s.class_id === cid && !['cancelled', 'rescheduled'].includes(String(s.status)))
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
    const todays = list.filter((s) => klDate(String(s.starts_at)) === today);
    // Keutamaan: sesi hari ini yang belum direkod, sesi lepas yang belum direkod (terkini dahulu),
    // sesi hari ini yang sudah direkod, kemudian sesi seterusnya.
    return (
      todays.find((s) => s.status !== 'completed') ||
      [...list]
        .reverse()
        .find((s) => s.status === 'scheduled' && new Date(String(s.starts_at)).getTime() < now) ||
      todays[0] ||
      list.find((s) => new Date(String(s.starts_at)).getTime() >= now)
    );
  };
  const openStudentSession = async (cid: unknown) => {
    const found = bestSession(cid);
    if (found) return go(`sessions/${found.id}`);
    // Jadual fleksibel: tiada sesi dijana — tutor memilih tarikh sebenar kelas.
    if (all('classes').find((c) => c.id === cid)?.flexible) return addSessionFor(cid);
    const start = new Date(Math.floor(Date.now() / 300000) * 300000).toISOString();
    const minutes = Number(
      all('class_schedules').find((r) => r.class_id === cid)?.duration_minutes || 30,
    );
    if (
      await mutate('session', {
        cid,
        tid: activeTutor,
        start_time: start,
        minutes,
        lesson_topic: '',
      })
    )
      setPendingMove({ cid, start });
  };
  // Ringkasan sesi bagi satu murid (kelas individu): selesai dan berbaki bulan dipilih.
  const classCounts = (cid: unknown) => {
    const inMonth = monthlySessions.filter(
      (s) => s.class_id === cid && !['cancelled', 'rescheduled'].includes(String(s.status)),
    );
    return {
      done: inMonth.filter((s) => s.status === 'completed').length,
      left: inMonth.filter((s) => s.status !== 'completed').length,
    };
  };
  // Tambah rekod sesi terus dari skrin rekod: tarikh lalai hari ini, boleh backdated. Jam diisi
  // daripada masa pilihan kelas (slot hari ini jika ada, jika tidak slot pertama), atau jam sekarang.
  const addSessionFor = (cid: unknown) => {
    const now = new Date();
    const date = klDate(now.toISOString());
    const rules = all('class_schedules').filter(
      (r) => r.class_id === cid && (!r.effective_to || String(r.effective_to) >= date),
    );
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const preferred = rules.find((r) => Number(r.day_of_week) === weekday) || rules[0];
    const time = preferred
      ? String(preferred.start_time).slice(0, 5)
      : new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kuala_Lumpur',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(now);
    const minutes = String(
      preferred?.duration_minutes ||
        all('class_schedules').find((r) => r.class_id === cid)?.duration_minutes ||
        30,
    );
    setDialog({
      title: 'Tambah rekod sesi',
      operation: 'session',
      fields: [
        { name: 'date', label: 'Tarikh kelas', type: 'date', value: date },
        { name: 'time', label: 'Jam', type: 'time', value: time },
        {
          name: 'minutes',
          label: 'Tempoh',
          value: minutes,
          options: [
            ['30', '30 minit'],
            ['20', '20 minit'],
          ],
        },
      ],
      transform: (v) => ({
        cid,
        tid: activeTutor,
        start_time: new Date(`${v.date}T${v.time}:00+08:00`).toISOString(),
        minutes: Number(v.minutes),
        lesson_topic: '',
      }),
      after: (payload) => setPendingMove({ cid, start: String(payload.start_time) }),
    });
  };
  function sessionHistory(current: Row) {
    const counts = classCounts(current.class_id);
    const done = all('class_sessions')
      .filter((s) => s.class_id === current.class_id && s.status === 'completed')
      .sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)));
    const markOf = (sid: unknown) =>
      statusLabels[String(all('attendance').find((a) => a.session_id === sid)?.status)] || '—';
    const pending = all('class_sessions')
      .filter(
        (s) =>
          s.class_id === current.class_id &&
          s.id !== current.id &&
          s.status === 'scheduled' &&
          new Date(String(s.starts_at)).getTime() <= Date.now(),
      )
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
    return (
      <>
        {pending.length > 0 && (
          <Card
            title="Belum direkod"
            subtitle="Kelas yang masanya sudah berlalu. Tekan Rekod untuk mengisi kehadiran."
          >
            <Table
              headers={['Tarikh', 'Masa', '']}
              rows={pending.map((s) => [
                dateLabel(String(s.starts_at)),
                timeLabel(String(s.starts_at)),
                <button key="r" className="primary" onClick={() => go(`sessions/${s.id}`)}>
                  Rekod
                </button>,
              ])}
            />
          </Card>
        )}
        <Card
          title="Kelas telah dilaksanakan"
          subtitle={
            all('classes').find((c) => c.id === current.class_id)?.flexible
              ? `Bulan ${month}: ${counts.done} kelas direkod · jadual fleksibel`
              : `Bulan ${month}: ${counts.done} selesai · ${counts.left} sesi berbaki`
          }
        >
          <Table
            headers={['Tarikh', 'Masa', 'Kehadiran', '']}
            rows={done.map((s) => [
              dateLabel(String(s.starts_at)),
              timeLabel(String(s.starts_at)),
              markOf(s.id),
              <div key="a" className="button-row">
                <button className="text-link" onClick={() => go(`sessions/${s.id}`)}>
                  Edit
                </button>
                {!['verified', 'approved', 'paid'].includes(String(s.review_status)) && (
                  <button
                    className="text-link danger"
                    onClick={() =>
                      setDialog({
                        title: `Padam kelas ${dateLabel(String(s.starts_at))}`,
                        operation: 'void_session',
                        fields: [],
                        transform: () => ({ sid: s.id }),
                      })
                    }
                  >
                    Padam
                  </button>
                )}
              </div>,
            ])}
          />
        </Card>
      </>
    );
  }
  // Alih sesi di tempatnya: kehadiran kekal dan halaman kekal pada sesi yang sama.
  const rescheduleSession = async (session: Row, start: string) => {
    await mutate('move_session', { sid: session.id, new_start: start });
  };
  const allowances = useMemo(() => allowanceRows(visible, month), [visible, month]);
  const allowanceOf = (tid: unknown) =>
    allowances.filter((r) => r.tutorId === tid).reduce((n, r) => n + r.payable_sen, 0);
  const metricCards = (items: [string, React.ReactNode, string][]) => (
    <div className="metrics">
      {items.map(([label, value, hint]) => (
        <div className="metric" key={label}>
          <div className="metric-top">
            <span>{label}</span>
          </div>
          <strong>{value}</strong>
          <small>{hint}</small>
        </div>
      ))}
    </div>
  );
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
          ...(academic
            ? [
                [
                  'Tutor aktif',
                  all('staff_profiles').filter((t) => t.role === 'tutor' && t.active !== false)
                    .length,
                  'Tutor yang boleh log masuk',
                ],
              ]
            : []),
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
          <img
            className="welcome-watermark"
            src={assetUrl('brand/aqr-emblem.png')}
            alt=""
            aria-hidden="true"
          />
          <div className="welcome-text">
            <p className="welcome-kicker">Akademi Al-Quran Ar-Riyadh</p>
            <h1>
              Assalamualaikum,{' '}
              {role === 'guardian' ? 'ibu bapa' : role === 'tutor' ? 'tutor' : 'pentadbir'}
              <span className="gold">.</span>
            </h1>
            <p className="welcome-date">
              {new Intl.DateTimeFormat('ms-MY', {
                timeZone: 'Asia/Kuala_Lumpur',
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }).format(new Date())}
            </p>
            <span className="partner-chip">
              <img src={assetUrl('brand/ito-logo.png')} alt="" />
              Bersama Islamic Tutor Online
            </span>
          </div>
          <img
            className="welcome-mark"
            src={assetUrl('brand/aqr-mark.png')}
            alt="Logo Akademi Quran Ar-Riyadh"
          />
        </div>
        {role === 'tutor' && !hasPassword && passwordCard(true)}
        <div className="metrics">
          {metrics.map(([label, value, hint]) => (
            <div className="metric" key={String(label)}>
              <div className="metric-top">
                <span>{label}</span>
                {
                  {
                    'Tutor aktif': <GraduationCap key="g" />,
                    'Murid aktif': <Users key="u" />,
                    'Anak berdaftar': <Users key="u" />,
                    'Program aktif': <BookOpen key="b" />,
                    'Sesi dilaksana': <CalendarDays key="c" />,
                    Kehadiran: <ShieldCheck key="s" />,
                  }[String(label)]
                }
              </div>
              <strong>{value}</strong>
              <small>{hint}</small>
            </div>
          ))}
        </div>
        {/* Pentadbir dan tutor tidak perlu senarai sesi di Utama (tutor ada Sesi & kehadiran); ibu bapa masih melihatnya. */}
        <div className={academic || role === 'tutor' ? 'dashboard-grid single' : 'dashboard-grid'}>
          {!academic && role !== 'tutor' && (
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
          )}
          <Card
            title="Perlu perhatian"
            subtitle="Utamakan tindakan hari ini"
            className={academic ? 'attention-card' : ''}
            action={
              <button
                className="text-link"
                onClick={() =>
                  go(role === 'guardian' ? 'parent' : finance ? 'allowance' : 'calendar')
                }
              >
                Buka ruang kerja <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            }
          >
            <div className="attention-items">
              <div className="attention">
                <Clock />
                <div>
                  <strong>
                    {formatMoney(allowances.reduce((n, r) => n + r.payable_sen, 0))} elaun tutor
                  </strong>
                  <p>Dikira automatik daripada sesi yang direkod bulan ini.</p>
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
            </div>
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
          <div className="profile-id">
            <h1>{String(student.full_name)}</h1>
            <div className="profile-meta">
              <Badge value={student.status} />
              <span>
                {programsOf(id).length} program
                {student.registration_date
                  ? ` · Daftar ${dateLabel(String(student.registration_date))}`
                  : ''}
              </span>
            </div>
          </div>
          <div className="profile-actions">
            {(academic || role === 'tutor') && (
              <button className="secondary" onClick={() => editStudent(student)}>
                <Pencil size={15} />
                Kemaskini murid
              </button>
            )}
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
        </div>
        <Card
          title="Program & jadual kelas"
          subtitle="Kelas individu yang sedang berjalan"
          action={
            (academic || role === 'tutor') && (
              <button onClick={() => addProgram(id)}>
                <Plus size={15} />
                Tambah program
              </button>
            )
          }
        >
          <div className="program-list">
            {programsOf(id).map((p) => {
              const counts = classCounts(p.classId);
              const total = counts.done + counts.left;
              return (
                <article key={p.id} className="program-detail">
                  <header className="program-head">
                    <div>
                      <h3>{p.program}</h3>
                      <div className="program-tags">
                        {p.tutor && (
                          <span className="tutor-chip">
                            <GraduationCap size={14} aria-hidden="true" />
                            {p.tutor}
                          </span>
                        )}
                        {p.flexible && <span className="tag warn">Jadual fleksibel</span>}
                        {p.feeSen !== null && (
                          <span className="tag ok">Yuran khas {formatMoney(Number(p.feeSen))}</span>
                        )}
                        {p.allowanceSen !== null && (
                          <span className="tag ok">
                            Elaun khas {formatMoney(Number(p.allowanceSen))}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge value={p.status} />
                  </header>
                  <dl className="program-stats">
                    <div className="wide">
                      <dt>{p.flexible ? 'Masa pilihan' : 'Hari & jam'}</dt>
                      <dd className="slot-chips">
                        {p.slots.length
                          ? p.slots.map((slot) => (
                              <span key={slot} className="slot-chip">
                                {slot}
                              </span>
                            ))
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Seminggu</dt>
                      <dd>{p.slots.length ? `${p.slots.length} sesi` : '—'}</dd>
                    </div>
                    <div>
                      <dt>Tempoh sesi</dt>
                      <dd>{p.minutes ? `${p.minutes} minit` : '—'}</dd>
                    </div>
                    <div>
                      <dt>Sehingga</dt>
                      <dd>{p.until || '—'}</dd>
                    </div>
                  </dl>
                  <footer className="program-foot">
                    <div className="month-progress">
                      {p.flexible ? (
                        <span>
                          {monthLabel(month)} · <strong>{counts.done} kelas direkod</strong>
                        </span>
                      ) : (
                        <>
                          <span>
                            {monthLabel(month)} · <strong>{counts.done} selesai</strong> ·{' '}
                            {counts.left} berbaki
                          </span>
                          <span className="progress-track" aria-hidden="true">
                            <i style={{ width: `${total ? (counts.done / total) * 100 : 0}%` }} />
                          </span>
                        </>
                      )}
                    </div>
                    <div className="button-row compact">
                      {(academic || role === 'tutor') && p.status === 'active' && (
                        <button
                          className="schedule-button"
                          onClick={() => editSchedule(p.classId, p.program)}
                        >
                          <CalendarDays size={15} />
                          Ubah jadual
                        </button>
                      )}
                      {academic && p.status === 'active' && (
                        <button
                          className="schedule-button"
                          onClick={() => transferClass(p.classId, p.program, p.tutorId)}
                        >
                          <GraduationCap size={15} />
                          Pindah tutor
                        </button>
                      )}
                      {academic && p.status === 'active' && (
                        <button
                          className="schedule-button"
                          onClick={() => classRateForm(p.classId, p.program)}
                        >
                          <Wallet size={15} />
                          Kadar khas
                        </button>
                      )}
                    </div>
                  </footer>
                </article>
              );
            })}
            {!programsOf(id).length && <Empty text="Belum berdaftar dalam mana-mana program." />}
          </div>
        </Card>
        <Card title="Penjaga" subtitle="Untuk invois, laporan dan WhatsApp">
          {(() => {
            const g = guardianOf(id);
            return (
              <div className="guardian-line">
                <div className="guardian-id">
                  <span className="avatar">{g ? String(g.full_name).slice(0, 1) : '?'}</span>
                  <div>
                    <strong>{g ? String(g.full_name) : 'Belum diisi'}</strong>
                    {g?.phone ? (
                      <a
                        className="wa-link"
                        href={whatsappUrl(g.phone)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle size={14} aria-hidden="true" />
                        {String(g.phone)}
                      </a>
                    ) : (
                      <span className="muted">Tiada no. WhatsApp — invois tidak dapat dijana</span>
                    )}
                  </div>
                </div>
                <div className="button-row compact">
                  {(academic || role === 'tutor') && (
                    <button onClick={() => editGuardian(id, student.full_name)}>
                      <Pencil size={15} />
                      {g ? 'Kemaskini penjaga' : 'Isi penjaga'}
                    </button>
                  )}
                  {(role === 'tutor' || academic) && !!g?.phone && (
                    <button onClick={() => createStudent(String(g.id))}>
                      <Plus size={15} />
                      Daftar adik-beradik
                    </button>
                  )}
                  {academic && (
                    <button
                      onClick={() =>
                        setDialog({
                          title: 'Pautkan penjaga',
                          operation: 'link',
                          fields: [
                            {
                              name: 'guardian_id',
                              label: 'Penjaga',
                              options: options('guardians'),
                            },
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
              </div>
            );
          })()}
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

        action={
          (role === 'tutor' || academic) && (
            <button className="primary" onClick={() => createStudent()}>
              <Plus size={16} />
              Daftar murid
            </button>
          )
        }
      >
        <Table
          headers={['Murid', 'Program', 'Penjaga', 'Status', '']}
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
              (() => {
                const g = guardianOf(s.id);
                return g ? (
                  <span key="guardian" className="guardian-cell">
                    {String(g.full_name)}
                    {g.phone ? (
                      <a
                        className="wa-link"
                        href={whatsappUrl(g.phone)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {String(g.phone)}
                      </a>
                    ) : null}
                  </span>
                ) : (
                  <button
                    key="guardian"
                    className="text-link"
                    onClick={() => editGuardian(s.id, s.full_name)}
                  >
                    Isi penjaga
                  </button>
                );
              })(),
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
        subtitle="Ibu bapa yang boleh melihat rekod anak"
        action={
          <button className="primary" onClick={createGuardian}>
            <Plus size={16} />
            Tambah penjaga
          </button>
        }
      >
        <Table
          headers={['Penjaga', 'WhatsApp', 'Anak', ...(isStatic() ? [] : ['Akses portal'])]}
          rows={all('guardians')
            .filter(matches)
            .map((g) => [
              <span key="name" className="guardian-cell">
                {String(g.full_name)}
                {g.email ? <small>{String(g.email)}</small> : null}
              </span>,
              g.phone ? (
                <a
                  key="wa"
                  className="wa-link"
                  href={whatsappUrl(g.phone)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {String(g.phone)}
                </a>
              ) : (
                'Tiada'
              ),
              all('student_guardians')
                .filter((sg) => sg.guardian_id === g.id)
                .map((sg) => lookup('students', sg.student_id))
                .join(', '),
              // Jemputan e-mel memerlukan fungsi pelayan; tiada dalam binaan statik (Pages).
              ...(isStatic()
                ? []
                : [
                    <button
                      key="invite"
                      disabled={!g.email || !['owner'].includes(role) || busy}
                      onClick={() => invite(String(g.email), 'guardian', g.id)}
                    >
                      Jemput OTP
                    </button>,
                  ]),
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
          subtitle="Pencapaian murid mengikut unit"
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
    if (role === 'tutor') {
      const mine = all('class_tutors')
        .filter((t) => t.staff_id === activeTutor && !t.ends_on)
        .map((t) => t.class_id);
      const rows = all('enrollments').filter(
        (e) => e.status === 'active' && mine.includes(e.class_id),
      );
      return (
        <Card title="Rekod kehadiran" subtitle="Tekan nama murid untuk merekod kelas">
          <div className="student-picker">
            {rows.filter(matches).map((e) => {
              const c = all('classes').find((x) => x.id === e.class_id);
              return (
                <button key={e.id} onClick={() => void openStudentSession(e.class_id)}>
                  <span className="avatar">{lookup('students', e.student_id).slice(0, 1)}</span>
                  <span>
                    <strong>{lookup('students', e.student_id)}</strong>
                    <small>
                      {lookup('programs', c?.program_id, 'name')} ·{' '}
                      {c?.flexible
                        ? `Jadual fleksibel · ${classCounts(e.class_id).done} kelas direkod`
                        : `Selesai ${classCounts(e.class_id).done} · Berbaki ${classCounts(e.class_id).left}`}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              );
            })}
          </div>
          {!rows.length && <Empty text="Belum ada murid. Daftar murid di menu Murid." />}
        </Card>
      );
    }
    // Pentadbir hanya melihat ringkasan bulan dan sesi hari ini; butiran penuh di profil tutor.
    const live = monthlySessions.filter(
      (x) => !['cancelled', 'rescheduled'].includes(String(x.status)),
    );
    const nowMs = Date.now();
    const today = klDate(new Date().toISOString());
    // Sesi hari ini (tarikh KL) tidak bergantung pada bulan yang dipilih.
    const todays = all('class_sessions')
      .filter(
        (x) =>
          !['cancelled', 'rescheduled'].includes(String(x.status)) &&
          klDate(String(x.starts_at)) === today,
      )
      .sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at)));
    // Tab Hari ini hanya menyenaraikan tutor yang ada sekurang-kurangnya satu sesi hari ini.
    const todayTutors = [...new Set(todays.map((x) => String(x.tutor_id)))];
    const attendanceOf = (sid: unknown) => {
      const mark = all('attendance').find((a) => a.session_id === sid);
      return mark ? statusLabels[String(mark.status)] : '—';
    };
    return (
      <>
        {metricCards([
          ['Dijadualkan', live.length, `Bulan ${month}`],
          ['Selesai', live.filter((x) => x.status === 'completed').length, 'Telah direkod tutor'],
          [
            'Belum direkod',
            live.filter(
              (x) => x.status !== 'completed' && new Date(String(x.ends_at)).getTime() < nowMs,
            ).length,
            'Masa sesi sudah berlalu',
          ],
          ['Hari ini', todays.length, 'Sesi hari ini'],
        ])}
        {/* Tab khas setiap tutor: lihat sesi dan elaun bulan ini, tiada kelulusan satu persatu. */}
        <div className="subtabs session-tabs" role="tablist" aria-label="Pilih tutor">
          {[
            ['today', 'Hari ini'] as [string, string],
            ['students', 'Semua murid'] as [string, string],
            ...all('staff_profiles')
              .filter(
                (t) =>
                  t.role === 'tutor' &&
                  t.active !== false &&
                  (sessionTab !== 'today' || todayTutors.includes(String(t.id))),
              )
              .map((t) => [String(t.id), String(t.display_name)] as [string, string]),
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={sessionTab === id}
              className={sessionTab === id ? 'active' : ''}
              onClick={() => {
                setSessionTab(id);
                setReviewClass('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {sessionTab === 'today' ? (
          <Card
            title="Sesi hari ini"
            subtitle={
              todayTutors.length
                ? `${todayTutors.length} tutor ada sesi hari ini · pilih tab tutor untuk semua sesinya bulan ini`
                : 'Pilih Semua murid atau tab tutor untuk sesi bulan ini'
            }
          >
            {todays.length ? (
              <div className="today-tutors">
                {todayTutors
                  .map((tid) => [tid, lookup('staff_profiles', tid, 'display_name')])
                  .sort((x, y) => x[1].localeCompare(y[1]))
                  .map(([tid, name]) => {
                    const own = todays.filter((x) => x.tutor_id === tid);
                    return (
                      <section className="today-tutor" key={tid} aria-label={name}>
                        <header>
                          <h3>{name}</h3>
                          <span>{own.length} sesi</span>
                          <button
                            className="text-link"
                            onClick={() => {
                              setSessionTab(tid);
                              setReviewClass('');
                            }}
                          >
                            Sesi bulan ini <ChevronRight size={16} />
                          </button>
                        </header>
                        <Table
                          headers={['Masa', 'Murid · Program', 'Status', 'Kehadiran', '']}
                          rows={own.filter(matches).map((x) => [
                            timeLabel(String(x.starts_at)),
                            lookup('classes', x.class_id, 'name'),
                            <Badge key="s" value={x.status} />,
                            attendanceOf(x.id),
                            <button
                              key="o"
                              className="text-link"
                              onClick={() => go(`sessions/${x.id}`)}
                            >
                              Lihat <ChevronRight size={16} />
                            </button>,
                          ])}
                        />
                      </section>
                    );
                  })}
              </div>
            ) : (
              <Empty text="Tiada sesi hari ini." />
            )}
          </Card>
        ) : (
          (() => {
            // Semakan mengikut murid: satu baris setiap murid · program, semak semua sesinya sekali gus.
            const byTutor = sessionTab !== 'students';
            const scoped = live.filter((x) => !byTutor || x.tutor_id === sessionTab);
            const classIds = [...new Set(scoped.map((x) => String(x.class_id)))].sort((x, y) =>
              lookup('classes', x, 'name').localeCompare(lookup('classes', y, 'name')),
            );
            const countMarks = (ss: Row[], statuses: string[]) =>
              ss.filter((x) =>
                all('attendance').some(
                  (a) => a.session_id === x.id && statuses.includes(String(a.status)),
                ),
              ).length;
            const review = classIds.includes(reviewClass) ? reviewClass : '';
            const reviewed = scoped
              .filter((x) => x.class_id === review)
              .sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at)));
            const commentOf = (sid: unknown) =>
              String(
                all('generated_parent_comments').find(
                  (c) => c.session_id === sid && c.status !== 'retracted',
                )?.text || '—',
              );
            return (
              <>
                <Card
                  title={
                    byTutor ? lookup('staff_profiles', sessionTab, 'display_name') : 'Semua murid'
                  }
                  subtitle={`Bulan ${month} · tekan Semak untuk melihat semua kelas seorang murid`}
                  action={
                    byTutor && (
                      <button className="text-link" onClick={() => go(`tutors/${sessionTab}`)}>
                        Profil tutor <ChevronRight size={16} />
                      </button>
                    )
                  }
                >
                  <Table
                    headers={[
                      'Murid · Program',
                      ...(byTutor ? [] : ['Tutor']),
                      'Selesai',
                      'Hadir',
                      'Tidak hadir',
                      'Cuti bermaklum',
                      'Elaun',
                      '',
                    ]}
                    rows={classIds
                      .filter((cid) => matches({ id: cid, name: lookup('classes', cid, 'name') }))
                      .map((cid) => {
                        const ss = scoped.filter((x) => x.class_id === cid);
                        const done = ss.filter((x) => x.status === 'completed').length;
                        const pay = allowances
                          .filter((r) => r.session.class_id === cid)
                          .reduce((n, r) => n + r.payable_sen, 0);
                        return [
                          <strong key="n">{lookup('classes', cid, 'name')}</strong>,
                          ...(byTutor
                            ? []
                            : [lookup('staff_profiles', ss[0]?.tutor_id, 'display_name')]),
                          `${done} / ${ss.length}`,
                          countMarks(ss, ['present', 'late', 'makeup']),
                          countMarks(ss, ['absent']),
                          countMarks(ss, ['excused']),
                          formatMoney(pay),
                          <button
                            key="r"
                            className={review === cid ? 'primary' : 'secondary'}
                            onClick={() => setReviewClass(review === cid ? '' : cid)}
                          >
                            {review === cid ? 'Tutup' : 'Semak'}
                          </button>,
                        ];
                      })}
                  />
                </Card>
                {review && (
                  <Card
                    title={`Semakan: ${lookup('classes', review, 'name')}`}
                    subtitle={`Semua kelas bulan ${month} · ${reviewed.filter((x) => x.status === 'completed').length} selesai daripada ${reviewed.length}`}
                    action={
                      <button className="secondary" onClick={() => setReviewClass('')}>
                        Tutup semakan
                      </button>
                    }
                  >
                    <Table
                      headers={['Tarikh', 'Masa', 'Kehadiran', 'Ulasan tutor', 'Elaun']}
                      rows={reviewed.map((x) => {
                        const r = allowances.find((a) => a.session.id === x.id);
                        return [
                          `${dateLabel(String(x.starts_at))}`,
                          timeLabel(String(x.starts_at)),
                          x.status === 'completed' ? attendanceOf(x.id) : 'Belum direkod',
                          <span key="c" className="review-comment">
                            {commentOf(x.id)}
                          </span>,
                          r ? formatMoney(r.payable_sen) : '—',
                        ];
                      })}
                    />
                  </Card>
                )}
              </>
            );
          })()
        )}
      </>
    );
  }
  function financeScreen() {
    const fees = feeRows(visible, month);
    const unbilled = fees.filter((f) => !f.guardianId);
    const noRate = fees.filter((f) => f.rate_sen === null);
    const feeRates = all('program_fee_rates').length
      ? all('program_fee_rates')
      : feeReference.map(([program_code, duration_minutes, amount_sen]) => ({
          id: `${program_code}-${duration_minutes}`,
          program_code,
          duration_minutes,
          amount_sen,
        }));
    return (
      <>
        <Card
          title="Yuran bulan ini"
          subtitle={`Ikut sesi yang dijalankan · ${month}. Hadir, Lewat, Ganti dan Tidak hadir dicaj; Cuti bermaklum tidak.`}
          action={
            academic && (
              <button
                className="primary"
                disabled={busy || !fees.length}
                onClick={() => void mutate('generate_session_invoices', { billing_period: month })}
              >
                <FileText size={16} />
                Jana / kemas kini invois
              </button>
            )
          }
        >
          {(unbilled.length > 0 || noRate.length > 0) && (
            <div className="inline-note">
              {unbilled.length > 0 &&
                `${new Set(unbilled.map((f) => f.studentId)).size} murid tiada penjaga bil — pautkan penjaga di profil murid supaya invois dapat dijana. `}
              {noRate.length > 0 &&
                `${noRate.length} baris tiada harga sesi untuk program/tempohnya.`}
            </div>
          )}
          <Table
            headers={['Murid', 'Program', 'Sesi dicaj', 'Harga sesi', 'Jumlah', 'Penjaga bil']}
            rows={fees
              .filter((f) => matches({ id: f.studentId, name: f.student, program: f.program }))
              .map((f) => [
                <strong key="n">{f.student}</strong>,
                `${f.program} (${f.minutes} minit)`,
                f.sessions,
                f.rate_sen === null ? 'Tiada harga' : formatMoney(f.rate_sen),
                formatMoney(f.total_sen),
                f.guardianId ? lookup('guardians', f.guardianId) : 'Tiada',
              ])}
          />
          {fees.length > 0 && (
            <p className="tab-total">
              Jumlah yuran bulan ini:{' '}
              <strong>{formatMoney(fees.reduce((n, f) => n + f.total_sen, 0))}</strong>
            </p>
          )}
        </Card>
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
        <details className="more-tools">
          <summary>Kadar yuran setiap sesi</summary>
          <Card title="Kadar yuran" subtitle="Harga sesi untuk ibu bapa (Borang Pendaftaran AQR)">
            <Table
              headers={['Program', 'Tempoh', 'Harga sesi']}
              rows={feeRates.map((r) => [
                String(
                  all('programs').find((p) => p.code === r.program_code)?.name || r.program_code,
                ),
                `${r.duration_minutes} minit`,
                formatMoney(Number(r.amount_sen)),
              ])}
            />
          </Card>
        </details>
        <Card
          title="Invois & baki"
          subtitle="Cari mengikut ibu bapa, murid, tutor atau no. invois"
          action={
            <button className="primary" onClick={invoiceForm}>
              <Plus size={16} />
              Cipta invois
            </button>
          }
        >
          {(() => {
            // Murid invois: daripada item invois; jika tiada, anak-anak penjaga invois itu.
            const studentsOf = (i: Row) => {
              const ids = all('invoice_items')
                .filter((x) => x.invoice_id === i.id && x.student_id)
                .map((x) => x.student_id);
              return [
                ...new Set(
                  ids.length
                    ? ids
                    : all('student_guardians')
                        .filter((l) => l.guardian_id === i.guardian_id)
                        .map((l) => l.student_id),
                ),
              ];
            };
            // Tutor semasa murid: pendaftaran aktif + tugasan kelas tanpa tarikh tamat.
            const tutorsOf = (studentIds: unknown[]) => [
              ...new Set(
                all('enrollments')
                  .filter((e) => studentIds.includes(e.student_id) && e.status === 'active')
                  .flatMap((e) =>
                    all('class_tutors').filter((t) => t.class_id === e.class_id && !t.ends_on),
                  )
                  .map((t) => lookup('staff_profiles', t.staff_id, 'display_name')),
              ),
            ];
            const q = invoiceQuery.trim().toLowerCase();
            const items = all('invoices')
              .filter(matches)
              .map((i) => {
                const studentIds = studentsOf(i);
                const students = studentIds.map((id) => lookup('students', id));
                return {
                  i,
                  b: invoiceBalance(i, all('payments'), all('payment_allocations')),
                  students,
                  haystack: [
                    i.number,
                    lookup('guardians', i.guardian_id),
                    ...students,
                    ...tutorsOf(studentIds),
                  ]
                    .join(' ')
                    .toLowerCase(),
                };
              })
              .filter((x) => !q || x.haystack.includes(q));
            const isVoid = (i: Row) => i.status === 'void';
            const due = items.filter(
              (x) => !isVoid(x.i) && (x.i.status === 'draft' || x.b.outstanding > 0),
            );
            const done = items.filter((x) => !isVoid(x.i) && !due.includes(x));
            const voided = items.filter((x) => isVoid(x.i));
            const rowsOf = (list: typeof items) =>
              list.map(({ i, b, students }) => [
                <strong key="n">{String(i.number)}</strong>,
                <span key="g" className="guardian-cell">
                  {lookup('guardians', i.guardian_id)}
                  {students.length > 0 && <small>{students.join(', ')}</small>}
                </span>,
                <span key="j" className="guardian-cell">
                  {formatMoney(b.invoiced)}
                  {b.paid > 0 && b.outstanding > 0 && <small>Dibayar {formatMoney(b.paid)}</small>}
                </span>,
                formatMoney(b.outstanding),
                <Badge key="s" value={i.status} />,
                <div key="act" className="button-row compact">
                  {b.outstanding > 0 && !['draft', 'void'].includes(String(i.status)) && (
                    <button
                      className="pay-button"
                      disabled={busy}
                      onClick={() => markInvoicePaid(i, b.outstanding)}
                    >
                      <Check size={15} />
                      Yuran telah dibayar
                    </button>
                  )}
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
                              new Blob([await financialPdf(i, 'invoice', demo, invoiceExtra(i))], {
                                type: 'application/pdf',
                              }),
                              fileName(
                                ['Invois', i.number, lookup('guardians', i.guardian_id)],
                                'pdf',
                              ),
                            ),
                          )
                          .catch(() => setNotice('Dokumen gagal dijana.'));
                      }
                    }}
                  >
                    Cetak / PDF
                  </a>
                </div>,
              ]);
            const headers = ['Invois', 'Ibu bapa · murid', 'Jumlah', 'Baki', 'Status', ''];
            return (
              <>
                <div className="delivery-tools">
                  <label className="delivery-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Cari invois"
                      placeholder="Cari ibu bapa, murid, tutor atau no. invois…"
                      value={invoiceQuery}
                      onChange={(e) => setInvoiceQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="pay-columns">
                  <PayColumn
                    title="Belum bayar"
                    tone="due"
                    summary={`${due.length} invois · baki ${formatMoney(due.reduce((n, x) => n + x.b.outstanding, 0))}`}
                  >
                    {due.length ? (
                      <Table headers={headers} rows={rowsOf(due)} />
                    ) : (
                      <Empty text={q ? 'Tiada padanan.' : 'Tiada invois belum bayar.'} />
                    )}
                  </PayColumn>
                  <PayColumn
                    title="Sudah bayar"
                    tone="done"
                    summary={`${done.length} invois · ${formatMoney(done.reduce((n, x) => n + x.b.paid, 0))}`}
                  >
                    {done.length ? (
                      <Table headers={headers} rows={rowsOf(done)} />
                    ) : (
                      <Empty text={q ? 'Tiada padanan.' : 'Belum ada invois dibayar.'} />
                    )}
                  </PayColumn>
                </div>
                {voided.length > 0 && (
                  <details className="more-tools">
                    <summary>Invois dibatalkan ({voided.length})</summary>
                    <Table headers={headers} rows={rowsOf(voided)} />
                  </details>
                )}
              </>
            );
          })()}
        </Card>
        {/* Muat naik bukti memerlukan fungsi pelayan; binaan statik (Pages) tidak memaparkannya. */}
        {!isStatic() && (
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
        )}
        <Card
          title="Bayaran & pengesahan"
          subtitle="Bayaran dikira selepas disahkan admin"
          action={
            <button onClick={paymentForm}>
              <Plus size={16} />
              Rekod bayaran
            </button>
          }
        >
          <Table
            headers={['Tarikh', 'Penjaga', 'Amaun', 'Kaedah', 'Rujukan', 'Status', 'Tindakan']}
            rows={all('payments')
              .filter(matches)
              .map((p) => [
                p.paid_on ? dateLabel(String(p.paid_on)) : '—',
                lookup('guardians', p.guardian_id),
                formatMoney(Number(p.amount_sen)),
                paymentMethods.find(([v]) => v === p.method)?.[1] ?? String(p.method),
                String(p.reference || 'Tiada rujukan'),
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
          subtitle="Yuran ditetapkan oleh pentadbir"
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
                          new Blob([await financialPdf(r, 'receipt', demo, receiptExtra(r))], {
                            type: 'application/pdf',
                          }),
                          fileName(
                            [
                              'Resit',
                              r.number ||
                                dateLabel(String(r.created_at || new Date().toISOString())),
                            ],
                            'pdf',
                          ),
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
  // Maklumat untuk PDF invois/resit (nama penjaga, butiran, bayaran).
  const paymentMethods: [string, string][] = [
    ['bank_transfer', 'Pindahan bank'],
    ['duitnow_qr', 'DuitNow QR'],
    ['cash', 'Tunai'],
    ['other', 'Lain-lain'],
  ];
  // Satu langkah: baki invois ditanda dibayar; rujukan pilihan; resit dijana.
  const markInvoicePaid = (i: Row, due: number) =>
    setDialog({
      title: `Yuran telah dibayar · ${String(i.number)} · ${formatMoney(due)}`,
      operation: 'invoice_paid',
      fields: [
        {
          name: 'paid_on',
          label: 'Tarikh bayaran',
          type: 'date',
          value: klDate(new Date().toISOString()),
        },
        {
          name: 'payment_method',
          label: 'Kaedah',
          options: paymentMethods,
          value: 'bank_transfer',
        },
        {
          name: 'payment_ref',
          label: 'No. rujukan',
          optional: true,
          placeholder: 'Kosongkan jika tiada',
        },
      ],
      transform: (v) => ({
        inv: i.id,
        paid_on: v.paid_on,
        payment_method: v.payment_method,
        payment_ref: v.payment_ref || '',
      }),
    });
  const invoiceExtra = (i: Row) => ({
    guardian: lookup('guardians', i.guardian_id),
    items: all('invoice_items')
      .filter((x) => x.invoice_id === i.id)
      .map((x) => ({
        description: String(x.description),
        quantity: Number(x.quantity),
        unit_price_sen: Number(x.unit_price_sen),
        total_sen:
          Number(x.total_sen) ||
          Number(x.quantity) * Number(x.unit_price_sen) - Number(x.discount_sen || 0),
      })),
    paid_sen: invoiceBalance(i, all('payments'), all('payment_allocations')).paid,
    org: orgContact(),
  });
  const receiptExtra = (r: Row) => {
    const p = all('payments').find((x) => x.id === r.payment_id);
    return {
      guardian: p ? lookup('guardians', p.guardian_id) : '',
      payment: {
        paid_on: p?.paid_on ? String(p.paid_on) : undefined,
        method: p?.method ? String(p.method) : undefined,
        reference: p?.reference ? String(p.reference) : undefined,
      },
      org: orgContact(),
    };
  };
  // Payslip (penyata pendapatan) dan maklumat bank tutor.
  const orgContact = () => {
    const o = all('organizations')[0] || {};
    return { phone: o.phone ? String(o.phone) : '', address: o.address ? String(o.address) : '' };
  };
  const editPaymentDetails = (tid: string) => {
    const d: Record<string, unknown> =
      all('tutor_payment_details').find((x) => x.staff_id === tid) || {};
    setDialog({
      title: `Maklumat bayaran · ${lookup('staff_profiles', tid, 'display_name')}`,
      operation: 'save_payment_details',
      fields: [
        {
          name: 'job_title',
          label: 'Jawatan',
          value: String(d.job_title || 'Guru Online Part Time'),
        },
        { name: 'department', label: 'Jabatan', value: String(d.department || 'Al-Quran') },
        { name: 'bank_name', label: 'Nama bank', optional: true, value: String(d.bank_name || '') },
        {
          name: 'account_holder',
          label: 'Nama pemegang akaun',
          optional: true,
          value: String(d.account_holder || ''),
        },
        {
          name: 'account_number',
          label: 'No. akaun',
          optional: true,
          value: String(d.account_number || ''),
          pattern: '[0-9 \\-]{6,40}',
        },
      ],
      transform: (v) => ({
        staff_id: tid,
        job_title: v.job_title || '',
        department: v.department || '',
        bank_name: v.bank_name || '',
        account_holder: v.account_holder || '',
        account_number: v.account_number || '',
      }),
    });
  };
  // Bayaran elaun bulan dipilih (rekod 'void' kekal sebagai sejarah).
  const tutorPayments = (tid: string) =>
    all('tutor_month_payments')
      .filter((p) => p.staff_id === tid && p.period === month)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const tutorPaidSen = (tid: string) =>
    tutorPayments(tid)
      .filter((p) => p.status === 'paid')
      .reduce((n, p) => n + Number(p.amount_sen), 0);
  const lastTutorPayment = (tid: string) =>
    tutorPayments(tid)
      .filter((p) => p.status === 'paid')
      .at(-1);
  const markTutorPaid = (tid: string) => {
    const due = allowanceOf(tid) - tutorPaidSen(tid);
    setDialog({
      title: `Elaun telah dibayar · ${lookup('staff_profiles', tid, 'display_name')} · ${formatMoney(due)}`,
      operation: 'tutor_paid',
      fields: [
        {
          name: 'paid_on',
          label: 'Tarikh bayaran',
          type: 'date',
          value: klDate(new Date().toISOString()),
        },
        {
          name: 'payment_ref',
          label: 'No. rujukan bank',
          optional: true,
          placeholder: 'Kosongkan jika tiada',
        },
      ],
      transform: (v) => ({
        staff_id: tid,
        period: month,
        amount_sen: due,
        sessions: allowances.filter((r) => r.tutorId === tid && r.payable_sen > 0).length,
        paid_on: v.paid_on,
        payment_ref: v.payment_ref || '',
      }),
    });
  };
  // Status bayaran elaun: Dibayar / Baki / butang "Elaun telah dibayar".
  const tutorPayStatus = (tid: string) => {
    const due = allowanceOf(tid);
    const paid = tutorPaidSen(tid);
    const last = lastTutorPayment(tid);
    if (paid > 0 && paid >= due)
      return (
        <span key="pay" className="badge success">
          Dibayar · {dateLabel(String(last?.paid_on))}
        </span>
      );
    if (!finance)
      return (
        <span key="pay" className="badge neutral">
          {paid > 0 ? `Baki ${formatMoney(due - paid)}` : 'Belum dibayar'}
        </span>
      );
    return (
      <button
        key="pay"
        className="pay-button"
        disabled={busy || due - paid <= 0}
        onClick={() => markTutorPaid(tid)}
      >
        <Check size={15} />
        {paid > 0 ? `Bayar baki ${formatMoney(due - paid)}` : 'Elaun telah dibayar'}
      </button>
    );
  };
  // Sejarah bayaran elaun bulan ini (termasuk yang dibatalkan) sebagai rujukan.
  const tutorPaymentHistory = (tid: string) =>
    tutorPayments(tid).length ? (
      <div className="pay-history">
        <h4>Rekod bayaran elaun · {monthLabel(month)}</h4>
        <Table
          headers={['Tarikh bayar', 'Amaun', 'Sesi', 'Rujukan', 'Status', '']}
          rows={tutorPayments(tid).map((p) => [
            dateLabel(String(p.paid_on)),
            formatMoney(Number(p.amount_sen)),
            String(p.sessions ?? '—'),
            String(p.reference || 'Tiada rujukan'),
            p.status === 'void' ? (
              <span key="s" className="badge neutral" title={String(p.void_reason || '')}>
                Dibatalkan
              </span>
            ) : (
              <span key="s" className="badge success">
                Dibayar
              </span>
            ),
            finance && p.status === 'paid' ? (
              <button
                key="v"
                className="text-link danger"
                onClick={() =>
                  setDialog({
                    title: 'Batal rekod bayaran elaun · rekod kekal sebagai sejarah',
                    operation: 'void_tutor_paid',
                    fields: [{ name: 'reason', label: 'Sebab (cth. tersilap tekan)' }],
                    transform: (v) => ({ pid: p.id, reason: v.reason }),
                  })
                }
              >
                Batal
              </button>
            ) : (
              ''
            ),
          ])}
        />
      </div>
    ) : null;
  const downloadPayslip = async (tid: string) => {
    const slip = buildPayslip(visible, tid, month);
    const paidOn = lastTutorPayment(tid)?.paid_on;
    downloadBlob(
      new Blob([await payslipPdf(slip, paidOn ? String(paidOn) : payDate, orgContact())], {
        type: 'application/pdf',
      }),
      payslipFileName(slip),
    );
  };
  const payslipBar = (tid?: string) => (
    <div className="payslip-bar">
      <label>
        Tarikh bayaran
        <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
      </label>
      {tid ? (
        <button className="primary" disabled={busy} onClick={() => void downloadPayslip(tid)}>
          <FileText size={16} />
          {role === 'tutor' ? 'Muat turun payslip saya' : 'Muat turun payslip'}
        </button>
      ) : (
        <button
          className="primary"
          disabled={busy || !allowances.length}
          onClick={() =>
            void (async () => {
              const ids = [...new Set(allowances.map((r) => r.tutorId))];
              downloadBlob(
                await payslipsZip(
                  ids.map((id) => buildPayslip(visible, id, month)),
                  payDate,
                  orgContact(),
                ),
                fileName(['Payslip Semua Tutor', monthLabel(month)], 'zip'),
              );
            })()
          }
        >
          <FileText size={16} />
          Payslip semua tutor (ZIP)
        </button>
      )}
      {tid && (
        <button className="secondary" onClick={() => editPaymentDetails(tid)}>
          {role === 'tutor' ? 'Maklumat bank saya' : 'Maklumat bank tutor'}
        </button>
      )}
    </div>
  );
  function allowanceScreen() {
    const total = allowances.reduce((n, r) => n + r.payable_sen, 0);
    const missing = allowances.filter((r) => r.rate_sen === null).length;
    const tutorIds = [...new Set(allowances.map((r) => r.tutorId))];
    return (
      <>
        {metricCards([
          [
            role === 'tutor' ? 'Elaun saya' : 'Jumlah perlu dibayar',
            formatMoney(total),
            `Bulan ${month}`,
          ],
          ['Sesi dibayar', allowances.filter((r) => r.payable_sen > 0).length, 'Sesi selesai'],
          [
            'Tidak dibayar',
            allowances.filter((r) => r.payable_sen === 0).length,
            'Cuti bermaklum / tiada kadar',
          ],
        ])}
        {missing > 0 && (
          <div className="inline-note">
            {missing} sesi tiada kadar elaun untuk program dan tempohnya. Semak senarai kadar di
            bawah.
          </div>
        )}
        <Card
          title={role === 'tutor' ? 'Elaun saya' : 'Elaun tutor'}
          subtitle="Dikira automatik. Hadir, Lewat, Ganti dan Tidak hadir dibayar; Cuti bermaklum tidak dibayar."
        >
          {role === 'tutor' && payslipBar(activeTutor)}
          {role === 'tutor' && (
            <div className="tab-total pay-row">
              <span>
                Status bayaran {monthLabel(month)}:{' '}
                <strong>
                  {lastTutorPayment(activeTutor)
                    ? `${formatMoney(tutorPaidSen(activeTutor))} dibayar pada ${dateLabel(String(lastTutorPayment(activeTutor)!.paid_on))}`
                    : 'Belum dibayar'}
                </strong>
              </span>
              {tutorPayStatus(activeTutor)}
            </div>
          )}
          {role === 'tutor' && tutorPaymentHistory(activeTutor)}
          {role === 'tutor' ? (
            <Table
              headers={['Tarikh', 'Murid · Program', 'Tempoh', 'Kehadiran', 'Elaun']}
              rows={allowances.map((r) => [
                dateLabel(String(r.session.starts_at)),
                r.label,
                `${r.minutes} min`,
                r.attendance,
                r.rate_sen === null ? 'Tiada kadar' : formatMoney(r.payable_sen),
              ])}
            />
          ) : (
            <>
              {/* Tab khas setiap tutor dalam Kewangan: semak paparan sahaja, tiada kelulusan. */}
              <div className="subtabs session-tabs" role="tablist" aria-label="Pilih tutor">
                {[
                  ['all', 'Semua tutor'] as [string, string],
                  ...all('staff_profiles')
                    .filter((t) => t.role === 'tutor' && t.active !== false)
                    .map((t) => [String(t.id), String(t.display_name)] as [string, string]),
                ].map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={allowanceTab === id}
                    className={allowanceTab === id ? 'active' : ''}
                    onClick={() => setAllowanceTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {payslipBar(allowanceTab === 'all' ? undefined : allowanceTab)}
              {allowanceTab === 'all' ? (
                (() => {
                  // Dua lajur: dibayar = bayaran bulan ini > 0 dan menampung elaun penuh.
                  const isPaid = (tid: string) =>
                    tutorPaidSen(tid) > 0 && tutorPaidSen(tid) >= allowanceOf(tid);
                  const unpaid = tutorIds.filter((tid) => !isPaid(tid));
                  const paid = tutorIds.filter(isPaid);
                  const rowsOf = (ids: string[]) =>
                    ids.map((tid) => [
                      <strong key="n">{lookup('staff_profiles', tid, 'display_name')}</strong>,
                      allowances.filter((r) => r.tutorId === tid && r.payable_sen > 0).length,
                      <strong key="t">{formatMoney(allowanceOf(tid))}</strong>,
                      tutorPayStatus(tid),
                      <button key="o" className="text-link" onClick={() => setAllowanceTab(tid)}>
                        Butiran <ChevronRight size={16} />
                      </button>,
                    ]);
                  const headers = ['Tutor', 'Sesi dibayar', 'Jumlah', 'Bayaran', ''];
                  return (
                    <div className="pay-columns">
                      <PayColumn
                        title="Belum dibayar"
                        tone="due"
                        summary={`${unpaid.length} tutor · baki ${formatMoney(unpaid.reduce((n, tid) => n + Math.max(0, allowanceOf(tid) - tutorPaidSen(tid)), 0))}`}
                      >
                        {unpaid.length ? (
                          <Table headers={headers} rows={rowsOf(unpaid)} />
                        ) : (
                          <Empty text="Semua elaun bulan ini sudah dibayar." />
                        )}
                      </PayColumn>
                      <PayColumn
                        title="Sudah dibayar"
                        tone="done"
                        summary={`${paid.length} tutor · ${formatMoney(paid.reduce((n, tid) => n + tutorPaidSen(tid), 0))}`}
                      >
                        {paid.length ? (
                          <Table headers={headers} rows={rowsOf(paid)} />
                        ) : (
                          <Empty text="Belum ada elaun dibayar bulan ini." />
                        )}
                      </PayColumn>
                    </div>
                  );
                })()
              ) : (
                <>
                  <div className="tab-total pay-row">
                    <span>
                      Jumlah perlu dibayar:{' '}
                      <strong>{formatMoney(allowanceOf(allowanceTab))}</strong>
                    </span>
                    {tutorPayStatus(allowanceTab)}
                  </div>
                  {/* Elaun khas tutor: tambahan/potongan setiap sesi atas kadar standard. */}
                  <div className="pay-row tutor-rate-row">
                    <span>
                      Elaun khas tutor:{' '}
                      <strong>
                        {(() => {
                          const r = tutorRate(allowanceTab);
                          if (!r || !Number(r.adjustment_sen)) return 'Tiada (kadar standard)';
                          const sen = Number(r.adjustment_sen);
                          return `${sen > 0 ? '+' : '−'}${formatMoney(Math.abs(sen))} setiap sesi mulai ${dateLabel(String(r.effective_from))}`;
                        })()}
                      </strong>
                    </span>
                    {finance && (
                      <button onClick={() => tutorRateForm(allowanceTab)}>
                        <Pencil size={15} />
                        Elaun khas tutor
                      </button>
                    )}
                  </div>
                  {tutorPaymentHistory(allowanceTab)}
                  <Table
                    headers={['Tarikh', 'Murid · Program', 'Tempoh', 'Kehadiran', 'Elaun']}
                    rows={allowances
                      .filter((r) => r.tutorId === allowanceTab)
                      .map((r) => [
                        dateLabel(String(r.session.starts_at)),
                        r.label,
                        `${r.minutes} min`,
                        r.attendance,
                        r.rate_sen === null ? 'Tiada kadar' : formatMoney(r.payable_sen),
                      ])}
                  />
                </>
              )}
            </>
          )}
        </Card>
        <Card
          title="Kadar elaun"
          subtitle="Kadar mengikut program dan tempoh sesi"
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
            headers={['Program', 'Tempoh', 'Kadar', 'Berkuat kuasa']}
            rows={all('tutor_allowance_rates')
              .filter(
                (r) =>
                  !r.effective_to || String(r.effective_to) >= klDate(new Date().toISOString()),
              )
              .map((r) => [
                String(
                  all('programs').find((p) => p.code === r.program_code)?.name || r.program_code,
                ),
                `${r.duration_minutes} minit`,
                formatMoney(Number(r.amount_sen)),
                `Mulai ${dateLabel(String(r.effective_from))}`,
              ])}
          />
        </Card>
      </>
    );
  }
  function reportsScreen() {
    return (
      <>
        <Card title="Laporan Excel & CSV" subtitle="Pilih laporan, semak, kemudian muat turun">
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
  function passwordCard(reminder = false) {
    return (
      <Card
        title={reminder ? 'Tetapkan kata laluan anda' : 'Kata laluan log masuk'}
        subtitle={
          reminder
            ? 'Selepas ini log masuk terus dengan e-mel dan kata laluan, tanpa menunggu kod e-mel'
            : hasPassword
              ? 'Kata laluan sudah ditetapkan. Isi di bawah untuk menukarnya.'
              : 'Log masuk dengan e-mel dan kata laluan, tanpa kod e-mel'
        }
      >
        <form
          className="invite-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const v = new FormData(form);
            const password = String(v.get('password'));
            if (password !== String(v.get('confirm')))
              return setNotice('Kata laluan dan pengesahan tidak sama.');
            const problem = passwordProblem(password);
            if (problem) return setNotice(problem);
            if (demo) return setNotice('Demo: kata laluan tidak disimpan.');
            setBusy(true);
            try {
              const r = await apiFetch('/api/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
              });
              const result = await r.json();
              if (!r.ok) throw new Error(result.error);
              form.reset();
              setHasPassword(true);
              setNotice(
                'Kata laluan disimpan. Lain kali log masuk dengan e-mel dan kata laluan — tiada kod e-mel diperlukan.',
              );
            } catch (error) {
              setNotice(error instanceof Error ? error.message : 'Gagal menyimpan');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Kata laluan baharu
            <input name="password" type="password" autoComplete="new-password" required />
          </label>
          <label>
            Ulang kata laluan
            <input name="confirm" type="password" autoComplete="new-password" required />
          </label>
          <button disabled={busy} type="submit">
            Simpan kata laluan
          </button>
        </form>
        <p className="footnote">
          Sekurang-kurangnya 10 aksara dengan huruf dan nombor. Jangan gunakan kata laluan yang
          mudah diteka seperti &quot;admin&quot;.
        </p>
      </Card>
    );
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
        {role !== 'guardian' && passwordCard()}
        <Card title="Google Sheets" subtitle="Sambungan Google Sheets">
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
  // Padam tutor dengan pengesahan dua langkah: amaran + menaip nama tutor.
  const removeTutor = (tutor: Row) => {
    const name = String(tutor.display_name);
    const students = new Set(
      all('enrollments')
        .filter(
          (e) =>
            e.status === 'active' &&
            all('class_tutors').some(
              (t) => t.class_id === e.class_id && t.staff_id === tutor.id && !t.ends_on,
            ),
        )
        .map((e) => e.student_id),
    ).size;
    setDialog({
      title: `Padam tutor · ${name}`,
      operation: 'remove_tutor',
      fields: [
        {
          name: 'confirm',
          label: `Taip nama tutor untuk mengesahkan: ${name}`,
          pattern: name.replace(/[\^$.*+?()[\]{}|/]/g, '\\$&'),
          placeholder: name,
        },
      ],
      extra: (
        <div className="danger-note">
          <strong>Tindakan ini tidak boleh dibatalkan sendiri.</strong>
          <ul>
            <li>Akses tutor ke portal ditarik serta-merta.</li>
            <li>
              {students} murid tidak lagi mempunyai tutor; sesi akan datang yang belum direkod
              dibatalkan.
            </li>
            <li>Rekod kehadiran, laporan dan elaun yang lepas dikekalkan.</li>
          </ul>
        </div>
      ),
      transform: (v) => {
        if (v.confirm.trim() !== name) throw new Error('Nama tidak sepadan. Tutor tidak dipadam.');
        return { staff_id: tutor.id };
      },
      after: () => go('tutors'),
    });
  };
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
    const tutors = all('staff_profiles').filter((t) => t.role === 'tutor' && t.active !== false);
    const tutorId = page.split('/')[1];
    const tutor = tutors.find((t) => t.id === tutorId);
    if (tutor) {
      const ss = sessionsOf(tutor.id);
      const enrol = studentsOf(tutor.id);
      return (
        <>
          <div className="profile-hero">
            <span className="avatar large">{String(tutor.display_name).slice(0, 1)}</span>
            <div>
              <h1>{String(tutor.display_name)}</h1>
              <Badge value={tutor.active ? 'active' : 'archived'} />
            </div>
            <div className="button-row">
              <button className="secondary" onClick={() => go('tutors')}>
                Semua tutor
              </button>
              {academic && (
                <button className="danger-button" onClick={() => removeTutor(tutor)}>
                  Padam tutor
                </button>
              )}
            </div>
          </div>
          <div className="metrics">
            {[
              ['Murid', new Set(enrol.map((e) => e.student_id)).size, 'Murid aktif'],
              ['Sesi dijadualkan', ss.length, `Bulan ${month}`],
              ['Sesi selesai', done(ss), 'Telah dilaksanakan'],
              ['Elaun perlu dibayar', formatMoney(allowanceOf(tutor.id)), 'Dikira automatik'],
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
              headers={['Tarikh', 'Masa', 'Murid · Program', 'Tempoh', 'Status', 'Elaun', '']}
              rows={ss.map((s) => [
                dateLabel(String(s.starts_at)),
                timeLabel(String(s.starts_at)),
                lookup('classes', s.class_id, 'name'),
                `${(new Date(String(s.ends_at)).getTime() - new Date(String(s.starts_at)).getTime()) / 60000} min`,
                <Badge key="s" value={s.status} />,
                (() => {
                  const r = allowances.find((x) => x.session.id === s.id);
                  return r ? formatMoney(r.payable_sen) : '—';
                })(),
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
          headers={['Tutor', 'Murid', 'Sesi selesai', 'Elaun bulan ini', 'Status', '']}
          rows={tutors.filter(matches).map((t) => {
            const ss = sessionsOf(t.id);
            return [
              <strong key="n">{String(t.display_name)}</strong>,
              new Set(studentsOf(t.id).map((e) => e.student_id)).size,
              `${done(ss)} / ${ss.length}`,
              formatMoney(allowanceOf(t.id)),
              <Badge key="s" value={t.active ? 'active' : 'archived'} />,
              <div key="o" className="button-row">
                <button className="text-link" onClick={() => go(`tutors/${t.id}`)}>
                  Lihat <ChevronRight size={16} />
                </button>
                {academic && (
                  <button className="text-link danger" onClick={() => removeTutor(t)}>
                    Padam
                  </button>
                )}
              </div>,
            ];
          })}
        />
        {/* Jemputan kakitangan memerlukan fungsi pelayan; di Pages tutor memohon sendiri. */}
        {role === 'owner' && !isStatic() && (
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
      {drawer && (
        <button
          className="drawer-backdrop"
          aria-label="Tutup latar menu"
          onClick={() => setDrawer(false)}
          tabIndex={-1}
        />
      )}
      <aside
        ref={sidebarRef}
        id="main-navigation"
        className={`sidebar ${drawer ? 'open' : ''}`}
        inert={mobileNavigation && !drawer}
        role={mobileNavigation && drawer ? 'dialog' : undefined}
        aria-modal={mobileNavigation && drawer ? true : undefined}
        aria-label="Menu utama"
      >
        <div className="sidebar-brand">
          {all('organizations')[0]?.logo_url ? (
            <img
              className="academy-logo"
              src={String(all('organizations')[0].logo_url)}
              alt="Logo rasmi akademi"
            />
          ) : (
            <span className="sidebar-emblem" aria-hidden="true">
              <img src={assetUrl('brand/aqr-emblem.png')} alt="" />
            </span>
          )}
          <span className="sidebar-brand-copy">
            <strong>
              AQR<span className="gold">.</span>
            </strong>
            <small>Akademi Al-Quran Ar-Riyadh</small>
          </span>
          <button
            className="mobile-only icon-button"
            aria-label="Tutup menu"
            onClick={() => setDrawer(false)}
          >
            <X />
          </button>
        </div>
        <p className="nav-caption">RUANG ANDA</p>
        <nav aria-label="Navigasi utama">
          {groups.map(({ id, label, Icon, members }) => (
            <button
              key={id}
              className={group?.id === id ? 'active' : ''}
              aria-current={group?.id === id ? 'page' : undefined}
              onClick={() => go(members[0])}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
              {group?.id === id && <span className="active-dot" aria-hidden="true" />}
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
              id="menu-toggle"
              aria-label="Buka menu"
              aria-controls="main-navigation"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu />
            </button>
            <span>AQR</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-controls">
            {!demo && (
              <span className="workspace-role">
                <ShieldCheck size={16} aria-hidden="true" />
                {roleLabels[role]}
              </span>
            )}
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
              <p className="page-description">
                {section === 'dashboard'
                  ? 'Ringkasan akademi, dalam satu pandangan.'
                  : section === 'parent'
                    ? 'Ikuti kehadiran dan perkembangan anak anda.'
                    : section === 'students' || section === 'guardians' || section === 'classes'
                      ? 'Maklumat murid, penjaga dan pembelajaran.'
                      : section === 'calendar' || section === 'sessions'
                        ? 'Jadual kelas dan rekod pembelajaran.'
                        : section === 'reports'
                          ? 'Laporan dan rumusan pembelajaran bulanan.'
                          : section === 'finance' || section === 'allowance'
                            ? 'Semak rekod dan status bayaran bulan ini.'
                            : section === 'tutors'
                              ? 'Maklumat dan pengurusan tutor akademi.'
                              : 'Urus akaun dan pilihan akademi.'}
              </p>
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
                <Search size={16} aria-hidden="true" />
                <input
                  aria-label="Cari rekod"
                  placeholder="Cari rekod…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label className="month-filter">
                <CalendarDays size={16} aria-hidden="true" />
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
                <>
                  <MonthlyReports
                    data={visible}
                    role={role}
                    month={month}
                    demo={demo}
                    onData={setData}
                  />
                  <GuardianDelivery
                    data={visible}
                    month={month}
                    demo={demo}
                    onData={setData}
                    busy={busy}
                    onGenerate={() => void mutate('month_package', { billing_period: month })}
                    onGenerateFamilies={generateFamilies}
                  />
                </>
              )}
              {role === 'tutor' && (
                <TutorClassReports
                  data={visible}
                  month={month}
                  demo={demo}
                  onRemark={(st) => editRemark(st)}
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
              reschedule={rescheduleSession}
              onAdd={role === 'tutor' ? () => addSessionFor(currentSession.class_id) : undefined}
            />
          ) : (
            <Empty text="Sesi tidak ditemui atau akses tidak dibenarkan." />
          )}
          {section === 'sessions' && currentSession && sessionHistory(currentSession)}
          {section === 'parent' && <ContactAdmin data={visible} />}{' '}
          {section === 'parent' && (
            <PublishedMilestones data={visible} student={child || all('students')[0]?.id || ''} />
          )}{' '}
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
                  const after = dialog.after;
                  void mutate(dialog.operation, payload).then((ok) => {
                    if (ok) after?.(payload);
                  });
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : 'Input tidak sah');
                }
              }}
            >
              {dialog.fields.map((f) =>
                f.type === 'whatsapp' ? (
                  <PhoneField key={f.name} label={f.label} initial={f.value} />
                ) : f.type === 'guardian' ? (
                  <GuardianField
                    key={f.name}
                    choices={f.choices || []}
                    initialId={f.value}
                    tutorView={role === 'tutor'}
                  />
                ) : f.type === 'textarea' ? (
                  <label key={f.name}>
                    {f.label}
                    {f.optional && <small> (pilihan)</small>}
                    <textarea
                      autoFocus
                      name={f.name}
                      rows={6}
                      maxLength={1500}
                      required={!f.optional}
                      placeholder={f.placeholder}
                      defaultValue={f.value}
                    />
                  </label>
                ) : (
                  <label key={f.name}>
                    {f.label}
                    {f.optional && <small> (pilihan)</small>}
                    {f.options ? (
                      <select
                        autoFocus={dialog.fields[0] === f}
                        name={f.name}
                        required={!f.optional}
                        defaultValue={f.value ?? ''}
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
                        pattern={f.pattern}
                        placeholder={f.placeholder}
                        title={f.pattern ? 'Taip tepat seperti yang diminta' : undefined}
                      />
                    )}
                  </label>
                ),
              )}
              {dialog.extra}
              {!dialog.fields.length && (
                <p>
                  {dialog.operation === 'remove_student'
                    ? 'Murid dikeluarkan dan sesi akan datang dibatalkan. Rekod kehadiran dan elaun yang lepas dikekalkan.'
                    : dialog.operation === 'void_session'
                      ? 'Kelas ini dibatalkan: tidak dikira elaun dan ulasan ditarik daripada ibu bapa.'
                      : 'Sahkan tindakan ini. Rekod sejarah tidak dipadam.'}
                </p>
              )}
              {/* Ralat ditunjukkan dalam borang supaya tidak terlindung di belakang tetingkap. */}
              {notice && (
                <p role="alert" className="dialog-error">
                  {notice}
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
  reschedule,
  onAdd,
}: {
  session: Row;
  data: Dataset;
  busy: boolean;
  mutate: (operation: string, payload: Record<string, unknown>) => Promise<boolean>;
  reschedule: (session: Row, start: string) => Promise<void>;
  onAdd?: () => void;
}) {
  const startIso = String(session.starts_at);
  const initialDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(
    new Date(startIso),
  );
  const initialTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(startIso));
  const [classDate, setClassDate] = useState(initialDate);
  const [classTime, setClassTime] = useState(initialTime);
  const students = data.students.filter((s) =>
    data.enrollments.some((e) => e.class_id === session.class_id && e.student_id === s.id),
  );
  // Rekod sedia ada dimuatkan semula supaya tutor boleh membetulkan kehadiran yang tersilap.
  const savedAttendance = (sid: unknown) =>
    String(
      data.attendance.find((a) => a.session_id === session.id && a.student_id === sid)?.status ||
        '',
    );
  const savedAssessment = (sid: unknown) => {
    const latest = data.generated_parent_comments
      .filter(
        (c) => c.session_id === session.id && c.student_id === sid && c.status !== 'retracted',
      )
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    const sel = (latest?.selections || {}) as Partial<Assessment>;
    return sel.mastery === 'not_assessed' ? {} : sel;
  };
  // Bacaan sesi (Iqra'/al-Quran) yang disimpan, atau kosong.
  const savedReading = (sid: unknown): Partial<Reading> =>
    (data.attendance.find((a) => a.session_id === session.id && a.student_id === sid)
      ?.reading as Reading | null) || {};
  // Bacaan sesi terdahulu murid ini sebagai rujukan untuk menyambung.
  const previousReading = (sid: unknown) =>
    data.attendance
      .filter(
        (a) =>
          a.student_id === sid && a.session_id !== session.id && hasReading(a.reading as Reading),
      )
      .map((a) => ({
        reading: a.reading as Reading,
        at: String(data.class_sessions.find((x) => x.id === a.session_id)?.starts_at || ''),
      }))
      .filter((x) => x.at && x.at < startIso)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [reading, setReading] = useState<Partial<Reading>>(savedReading(students[0]?.id));
  const [attendance, setAttendance] = useState(savedAttendance(students[0]?.id));
  const [assessment, setAssessment] = useState<Partial<Assessment>>(
    savedAssessment(students[0]?.id),
  );
  const cls = data.classes.find((c) => c.id === session.class_id);
  const program = data.programs.find((p) => p.id === cls?.program_id);
  const subject = data.subjects.find((s) => s.id === program?.subject_id);
  const subjectSlug = String(subject?.slug || 'mengaji');
  const kind = readingKind(program?.code);
  const attendedNow = ['present', 'late', 'makeup'].includes(attendance);
  const readingInput = (): Reading | undefined =>
    kind && attendedNow && hasReading(reading) ? ({ ...reading, kind } as Reading) : undefined;
  const readingIssue = readingInput() ? readingProblem(readingInput()!) : null;
  const voided = ['cancelled', 'rescheduled'].includes(String(session.status));
  const locked = voided || ['verified', 'approved', 'paid'].includes(String(session.review_status));
  let preview = 'Pilih kehadiran dan penilaian untuk melihat ulasan.';
  let valid = false;
  // Penilaian adalah pilihan: tanpa sebarang tap, sesi disimpan sebagai "belum dinilai".
  const noAssessment =
    !assessment.mastery && !assessment.skill && !assessment.participation && !assessment.focus;
  const assessmentInput = (): Assessment => {
    const base: Assessment =
      ['absent', 'excused'].includes(attendance) || noAssessment
        ? { mastery: 'not_assessed' }
        : ({ ...assessment, reading: undefined } as Assessment);
    const r = readingInput();
    return r ? { ...base, reading: r } : base;
  };
  try {
    if (attendance) {
      const input = assessmentInput();
      preview = generateComment(
        subjectSlug,
        attendance,
        input,
        data.assessment_options.filter((o) => o.subject_id === subject?.id),
      );
      valid = !readingIssue;
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
      selected: assessmentInput(),
      publish,
    });
    if (success) {
      const next = students[students.findIndex((s) => s.id === studentId) + 1];
      if (next) {
        setStudentId(next.id);
        setAttendance(savedAttendance(next.id));
        setAssessment(savedAssessment(next.id));
        setReading(savedReading(next.id));
      }
    }
  }
  return (
    <>
      <Card
        title={String(cls?.name || 'Sesi')}
        subtitle={`${dateLabel(String(session.starts_at))} · ${timeLabel(String(session.starts_at))} · ${students.length} murid`}
        action={
          onAdd && (
            <button className="primary" onClick={onAdd}>
              <Plus size={16} />
              Tambah rekod sesi
            </button>
          )
        }
      >
        <div className="session-when">
          <label>
            Tarikh kelas
            <input
              type="date"
              value={classDate}
              disabled={locked || busy}
              onChange={(e) => setClassDate(e.target.value)}
            />
          </label>
          <label>
            Jam
            <input
              type="time"
              value={classTime}
              disabled={locked || busy}
              onChange={(e) => setClassTime(e.target.value)}
            />
          </label>
          {(classDate !== initialDate || classTime !== initialTime) && !locked && (
            <button
              className="secondary"
              disabled={busy || !classDate || !classTime}
              onClick={() =>
                void reschedule(
                  session,
                  new Date(`${classDate}T${classTime}:00+08:00`).toISOString(),
                )
              }
            >
              Simpan tarikh & jam
            </button>
          )}
        </div>
        <div className="student-tabs">
          {students.map((s) => (
            <button
              key={s.id}
              className={s.id === studentId ? 'selected' : ''}
              onClick={() => {
                setStudentId(s.id);
                setAttendance(savedAttendance(s.id));
                setAssessment(savedAssessment(s.id));
                setReading(savedReading(s.id));
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
            {voided
              ? 'Kelas ini telah dipadam atau dijadual semula, jadi tidak boleh diedit. Pilih kelas lain dari senarai di bawah.'
              : 'Sesi telah disahkan. Rekod dikunci untuk menjaga sejarah elaun.'}
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
              {kind && attendedNow && (
                <fieldset className="reading-fields">
                  <legend>Bacaan sesi ini (untuk laporan)</legend>
                  {(() => {
                    const prev = previousReading(studentId);
                    return prev ? (
                      <p className="reading-prev">
                        Sesi lepas: <strong>{readingLabel(prev.reading)}</strong>
                      </p>
                    ) : null;
                  })()}
                  <div className="reading-grid">
                    {kind === 'iqra' ? (
                      <label>
                        Jilid Iqra'
                        <select
                          disabled={locked}
                          value={reading.jilid ?? ''}
                          onChange={(e) =>
                            setReading((r) => ({
                              ...r,
                              jilid: e.target.value ? Number(e.target.value) : undefined,
                            }))
                          }
                        >
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                              Iqra' {n}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <>
                        <label className="reading-surah">
                          Surah
                          <select
                            disabled={locked}
                            value={reading.surah ?? ''}
                            onChange={(e) =>
                              setReading((r) => ({
                                ...r,
                                surah: e.target.value ? Number(e.target.value) : undefined,
                              }))
                            }
                          >
                            <option value="">—</option>
                            {surahs.map(([name, ayahs], i) => (
                              <option key={name} value={i + 1}>
                                {i + 1}. {name} ({ayahs} ayat)
                              </option>
                            ))}
                          </select>
                        </label>
                        {(['ayah_from', 'ayah_to'] as const).map((f) => (
                          <label key={f}>
                            {f === 'ayah_from' ? 'Ayat dari' : 'Ayat hingga'}
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={reading.surah ? surahs[reading.surah - 1][1] : 286}
                              disabled={locked}
                              value={reading[f] ?? ''}
                              onChange={(e) =>
                                setReading((r) => ({
                                  ...r,
                                  [f]: e.target.value ? Number(e.target.value) : undefined,
                                }))
                              }
                            />
                          </label>
                        ))}
                      </>
                    )}
                    <label>
                      Muka surat
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={kind === 'iqra' ? 60 : 604}
                        disabled={locked}
                        value={reading.page ?? ''}
                        onChange={(e) =>
                          setReading((r) => ({
                            ...r,
                            page: e.target.value ? Number(e.target.value) : undefined,
                          }))
                        }
                      />
                    </label>
                  </div>
                  {readingIssue && <p className="reading-issue">{readingIssue}</p>}
                </fieldset>
              )}
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
                <button
                  className="primary wide"
                  disabled={!valid || locked || busy}
                  onClick={() => save(true)}
                >
                  <Check size={16} />
                  {savedAttendance(studentId) ? 'Simpan perubahan' : 'Simpan kehadiran'}
                </button>
              </div>
              {!valid && (
                <small className="save-hint">
                  {!attendance
                    ? 'Pilih kehadiran dahulu.'
                    : readingIssue
                      ? `Betulkan bacaan: ${readingIssue}.`
                      : 'Lengkapkan penilaian (kemahiran, tahap, penglibatan dan fokus), atau biarkan kosong.'}
                </small>
              )}
              <small>
                {savedAttendance(studentId)
                  ? 'Kehadiran sudah direkod. Ubah pilihan di atas dan simpan untuk membetulkannya.'
                  : 'Selepas disimpan, ibu bapa boleh melihat kehadiran dan ulasan ini.'}
              </small>
            </aside>
          </div>
        )}
      </Card>
    </>
  );
}
