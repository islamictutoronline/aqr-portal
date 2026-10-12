'use client';
import { apiFetch, isStatic } from '@/lib/transport';
import { Dataset, Role, integerSen, formatMoney } from '@/lib/core';
import type { Dialog } from './app';
type Props = {
  data: Dataset;
  role: Role;
  section: string;
  month: string;
  demo: boolean;
  open: (dialog: Dialog) => void;
  mutate: (operation: string, payload: Record<string, unknown>) => Promise<boolean>;
};
function ToolsBody({ data, role, section, month, demo, open, mutate }: Props) {
  const academic = ['owner', 'admin'].includes(role),
    finance = ['owner', 'admin'].includes(role);
  const options = (table: string, field: string): [string, string][] =>
    (data[table] || [])
      .filter((r) => table !== 'staff_profiles' || r.role === 'tutor')
      .map((r) => [r.id, String(r[field])]);
  if (section === 'calendar' && academic)
    return (
      <section className="card">
        <h2>Penjana sesi & pengecualian</h2>
        <p className="footnote">
          Penjana berasaskan jadual mingguan dan tugasan tutor pada tarikh berkenaan. Retry tidak
          menggandakan sesi. Pembatalan mengekalkan sejarah.
        </p>
        <div className="button-row">
          <button
            disabled={demo}
            onClick={() =>
              open({
                title: 'Jana sesi daripada jadual mingguan',
                operation: 'generate_schedule',
                fields: [
                  {
                    name: 'schedule',
                    label: 'Jadual',
                    options: (data.class_schedules || []).map((r) => [
                      r.id,
                      `${data.classes.find((c) => c.id === r.class_id)?.name} · ${r.start_time}`,
                    ]),
                  },
                  {
                    name: 'tutor',
                    label: 'Tutor ditugaskan',
                    options: options('staff_profiles', 'display_name'),
                  },
                  { name: 'date_from', label: 'Dari tarikh', type: 'date' },
                  { name: 'date_to', label: 'Hingga (maksimum 62 hari)', type: 'date' },
                ],
              })
            }
          >
            Jana sesi mingguan
          </button>
          <button
            disabled={demo}
            onClick={() =>
              open({
                title: 'Batalkan sesi',
                operation: 'change_session',
                fields: [
                  {
                    name: 'sid',
                    label: 'Sesi',
                    options: data.class_sessions
                      .filter(
                        (s) => !['verified', 'approved', 'paid'].includes(String(s.review_status)),
                      )
                      .map((s) => [
                        s.id,
                        `${s.starts_at} · ${data.classes.find((c) => c.id === s.class_id)?.name}`,
                      ]),
                  },
                  { name: 'reason', label: 'Sebab pembatalan' },
                ],
                transform: (v) => ({ ...v, new_status: 'cancelled' }),
              })
            }
          >
            Batalkan sesi
          </button>
          <button
            disabled={demo}
            onClick={() =>
              open({
                title: 'Jadual semula sesi',
                operation: 'change_session',
                fields: [
                  {
                    name: 'sid',
                    label: 'Sesi',
                    options: data.class_sessions
                      .filter(
                        (s) => !['verified', 'approved', 'paid'].includes(String(s.review_status)),
                      )
                      .map((s) => [s.id, String(s.starts_at)]),
                  },
                  { name: 'new_start', label: 'Masa baharu (MYT)', type: 'datetime-local' },
                  { name: 'reason', label: 'Sebab jadual semula' },
                ],
                transform: (v) => ({
                  ...v,
                  new_status: 'rescheduled',
                  new_start: new Date(`${v.new_start}:00+08:00`).toISOString(),
                }),
              })
            }
          >
            Jadual semula
          </button>
        </div>
      </section>
    );
  if (section === 'classes' && academic)
    return (
      <section className="card">
        <h2>Program & pilihan penilaian</h2>
        <p className="footnote">
          Pilihan ditetapkan pentadbir. Label digunakan dalam ulasan deterministik pada server.
        </p>
        <div className="button-row">
          <button
            onClick={() =>
              open({
                title: 'Program baharu',
                operation: 'program',
                fields: [
                  { name: 'subject_id', label: 'Subjek', options: options('subjects', 'name') },
                  { name: 'code', label: 'Kod (HURUF_BESAR)' },
                  { name: 'name', label: 'Nama program' },
                ],
              })
            }
          >
            Tambah program
          </button>
          <button
            onClick={() =>
              open({
                title: 'Pilihan penilaian baharu',
                operation: 'assessment_option',
                fields: [
                  { name: 'subject_id', label: 'Subjek', options: options('subjects', 'name') },
                  {
                    name: 'group_code',
                    label: 'Kumpulan',
                    options: [
                      ['skill', 'Kemahiran'],
                      ['participation', 'Penglibatan'],
                      ['focus', 'Fokus'],
                      ['home_practice', 'Latihan rumah'],
                    ],
                  },
                  { name: 'code', label: 'Kod (huruf_kecil)' },
                  { name: 'label', label: 'Frasa ulasan' },
                ],
                transform: (v) => ({ ...v, rubric_version: '1' }),
              })
            }
          >
            Tambah pilihan tap
          </button>
        </div>
      </section>
    );
  if (section === 'finance' && finance)
    return (
      <section className="card">
        <h2>Penetapan yuran & invois bulanan</h2>
        <p className="footnote">
          Penjana hanya menggunakan pelan bulanan yang ditetapkan admin. Pelan per sesi / pakej
          menggunakan invois eksplisit.
        </p>
        <div className="button-row">
          <button
            onClick={() =>
              open({
                title: 'Tetapkan pelan yuran',
                operation: 'fee_assignment',
                fields: [
                  {
                    name: 'enrollment_id',
                    label: 'Pendaftaran',
                    options: (data.enrollments || []).map((e) => [
                      e.id,
                      `${data.students.find((s) => s.id === e.student_id)?.full_name} · ${data.classes.find((c) => c.id === e.class_id)?.name}`,
                    ]),
                  },
                  {
                    name: 'fee_plan_id',
                    label: 'Pelan yuran',
                    options: options('fee_plans', 'name'),
                  },
                  { name: 'effective_from', label: 'Tarikh mula', type: 'date' },
                  { name: 'override_sen', label: 'Amaun override MYR (pilihan)', optional: true },
                ],
                transform: (v) => ({
                  enrollment_id: v.enrollment_id,
                  fee_plan_id: v.fee_plan_id,
                  effective_from: v.effective_from,
                  ...(v.override_sen ? { override_sen: integerSen(v.override_sen) } : {}),
                }),
              })
            }
          >
            Tetapkan yuran murid
          </button>
          <button
            disabled={demo}
            onClick={() => mutate('generate_invoices', { billing_period: month })}
          >
            Jana invois {month}
          </button>
          <button
            onClick={() =>
              open({
                title: 'Tolak bayaran menunggu semakan',
                operation: 'reject',
                fields: [
                  {
                    name: 'pid',
                    label: 'Bayaran',
                    options: data.payments
                      .filter((p) => p.status === 'pending_verification')
                      .map((p) => [
                        p.id,
                        `${p.reference || p.id} · ${formatMoney(Number(p.amount_sen))}`,
                      ]),
                  },
                  { name: 'reason', label: 'Sebab (minimum 5 aksara)' },
                ],
              })
            }
          >
            Tolak bukti tidak sah
          </button>
        </div>
      </section>
    );
  if (section === 'allowance' && finance)
    return (
      <section className="card">
        <h2>Lejar pelarasan elaun</h2>
        <p className="footnote">
          Pelarasan mengekalkan snapshot asal. Penyedia dan pelulus mesti berlainan. Catat rujukan
          bank selepas bayaran / kutipan pelarasan sebenar, tanpa mengubah bayaran asal.
        </p>
        <button
          onClick={() =>
            open({
              title: 'Cadangkan pelarasan elaun',
              operation: 'adjustment',
              fields: [
                {
                  name: 'entry',
                  label: 'Entri elaun',
                  options: data.tutor_allowance_entries
                    .filter((e) => ['approved', 'paid'].includes(String(e.status)))
                    .map((e) => [e.id, `${e.session_id} · ${formatMoney(Number(e.amount_sen))}`]),
                },
                { name: 'amount', label: 'Amaun MYR (+ / -)' },
                { name: 'reason', label: 'Sebab pelarasan' },
              ],
              transform: (v) => ({
                ...v,
                amount:
                  (v.amount.startsWith('-') ? -1 : 1) * integerSen(v.amount.replace(/^[+-]/, '')),
              }),
            })
          }
        >
          Cadangkan pelarasan
        </button>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Amaun</th>
                <th>Sebab</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {(data.tutor_adjustments || []).map((a) => (
                <tr key={a.id}>
                  <td>{formatMoney(Number(a.amount_sen))}</td>
                  <td>{String(a.reason)}</td>
                  <td>{a.checker_id ? 'Diluluskan' : 'Menunggu pelulus'}</td>
                  <td>
                    {Boolean(a.checker_id) && !a.paid_at && (
                      <button
                        disabled={demo}
                        onClick={() =>
                          open({
                            title: 'Catat bayaran pelarasan sebenar',
                            operation: 'pay_adjustment',
                            fields: [{ name: 'payment_ref', label: 'Rujukan bank' }],
                            transform: (v) => ({ ...v, adjustment: a.id }),
                          })
                        }
                      >
                        Catat pembayaran
                      </button>
                    )}
                    {Boolean(a.paid_at) && <span>Dibayar · {String(a.payment_reference)}</span>}
                    {!a.checker_id && (
                      <button
                        disabled={demo}
                        onClick={() =>
                          mutate('adjustment', {
                            entry: a.entry_id,
                            amount: 0,
                            reason: String(a.reason),
                            adjustment: a.id,
                          })
                        }
                      >
                        Luluskan pelarasan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  if (section === 'settings')
    return (
      <section className="card">
        <h2>Logo & notis privasi</h2>
        <p className="footnote">
          Logo rasmi dimuat naik oleh pemilik. Data digunakan untuk pengurusan kelas, kemajuan
          pembelajaran dan bil keluarga. Penjaga boleh meminta pembetulan atau semakan tempoh
          penyimpanan daripada admin.
        </p>
        {/* Muat naik logo memerlukan fungsi pelayan; tiada dalam binaan statik (Pages). */}
        {role === 'owner' && !isStatic() && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await apiFetch('/api/logo', {
                method: 'POST',
                body: new FormData(e.currentTarget),
              });
              if (r.ok) window.location.reload();
            }}
          >
            <label>
              Logo rasmi JPG / PNG (maksimum 2 MB)
              <input
                name="file"
                type="file"
                accept="image/jpeg,image/png"
                required
                disabled={demo}
              />
            </label>
            <button disabled={demo} type="submit">
              Muat naik logo
            </button>
          </form>
        )}
      </section>
    );
  if (section === 'reports' && academic && (data.private_import_rows || []).length)
    return (
      <section className="card">
        <h2>Semakan import peribadi</h2>
        <p className="footnote">
          Import tidak masuk ke demo. Pemetaan tidak mengesahkan sesi atau menghasilkan elaun.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tarikh</th>
                <th>Program</th>
                <th>Status</th>
                <th>Pemetaan</th>
              </tr>
            </thead>
            <tbody>
              {data.private_import_rows.map((r) => (
                <tr key={r.id}>
                  <td>{String(r.reported_date)}</td>
                  <td>{String(r.program_code)}</td>
                  <td>{String(r.status)}</td>
                  <td>
                    <button
                      onClick={() =>
                        open({
                          title: 'Petakan catatan sumber kepada rekod sah',
                          operation: 'map_import',
                          fields: [
                            {
                              name: 'student',
                              label: 'Murid disahkan',
                              options: options('students', 'full_name'),
                            },
                            {
                              name: 'session',
                              label: 'Sesi sebenar',
                              options: data.class_sessions
                                .filter(
                                  (s) =>
                                    String(s.starts_at).slice(0, 10) === String(r.reported_date),
                                )
                                .map((s) => [
                                  s.id,
                                  `${s.starts_at} · ${data.classes.find((c) => c.id === s.class_id)?.name}`,
                                ]),
                            },
                          ],
                          transform: (v) => ({ ...v, import_row: r.id }),
                        })
                      }
                    >
                      Semak pemetaan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  return null;
}
// Alat jarang guna dilipat supaya skrin utama kekal ringkas; Tetapan ialah kandungan utama halamannya.
export function AdditionalTools(props: Props) {
  const body = ToolsBody(props);
  if (!body || props.section === 'settings') return body;
  return (
    <details className="more-tools">
      <summary>Lagi pilihan</summary>
      {body}
    </details>
  );
}
