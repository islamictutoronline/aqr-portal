'use client';
import { useState } from 'react';
import { Dataset, Role, Row, dateLabel } from '@/lib/core';
import { apiFetch, downloadBlob } from '@/lib/transport';
import {
  StudentSnapshot,
  demoSnapshot,
  reportPdf,
  reportsZip,
  whatsappDraft,
} from '@/lib/student-reports';
type Props = {
  data: Dataset;
  role: Role;
  month: string;
  demo: boolean;
  studentId?: string;
  onData: (data: Dataset) => void;
};
export function MonthlyReports({ data, role, month, demo, studentId, onData }: Props) {
  const admin = ['owner', 'admin'].includes(role);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [preview, setPreview] = useState<Row | null>(null),
    [draft, setDraft] = useState('');
  const reports = (data.monthly_student_reports || []).filter(
    (r) =>
      r.period === month &&
      (!studentId || r.student_id === studentId) &&
      (admin || r.status === 'approved'),
  );
  async function save(operation: string, payload: Record<string, unknown>) {
    const response = await apiFetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, payload }),
    });
    const j = await response.json();
    if (!response.ok) throw new Error(j.error);
    return j;
  }
  async function refresh() {
    const r = await apiFetch('/api/data');
    if (!r.ok) throw new Error('Muat semula gagal');
    onData(await r.json());
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Operasi gagal');
    } finally {
      setBusy(false);
    }
  }
  async function prepare() {
    const targets = data.students.filter(
      (s) =>
        s.status !== 'archived' &&
        !reports.some((r) => r.student_id === s.id && r.status === 'approved'),
    );
    if (demo) {
      const next = [...(data.monthly_student_reports || [])];
      targets.forEach((s) => {
        const old = next.findIndex((r) => r.student_id === s.id && r.period === month);
        const row = {
          id: `demo-report-${s.id}-${month}`,
          student_id: s.id,
          period: month,
          status: 'draft',
          snapshot: demoSnapshot(data, s, month),
        };
        if (old >= 0) next[old] = row;
        else next.push(row);
      });
      onData({ ...data, monthly_student_reports: next });
    } else {
      try {
        for (const s of targets)
          await save('prepare_report', { student: s.id, report_month: month });
      } finally {
        await refresh();
      }
    }
    setMessage(
      `${targets.length} draf disediakan. Semak kandungan setiap laporan sebelum meluluskan.`,
    );
  }
  async function approve(r: Row) {
    if (demo)
      onData({
        ...data,
        monthly_student_reports: (data.monthly_student_reports || []).map((x) =>
          x.id === r.id ? { ...x, status: 'approved', approved_at: new Date().toISOString() } : x,
        ),
      });
    else {
      await save('approve_report', { report: r.id });
      await refresh();
    }
    setPreview(null);
    setMessage('Laporan diluluskan dan tersedia dalam portal penjaga.');
  }
  async function delivery(r: Row, g: Row, status: string) {
    if (demo) {
      const rows = (data.report_deliveries || []).filter(
        (x) => !(x.report_id === r.id && x.guardian_id === g.id),
      );
      onData({
        ...data,
        report_deliveries: [
          ...rows,
          {
            id: crypto.randomUUID(),
            report_id: r.id,
            guardian_id: g.id,
            status,
            updated_at: new Date().toISOString(),
          },
        ],
      });
    } else {
      await save('report_delivery', { report: r.id, guardian: g.id, delivery_status: status });
      await refresh();
    }
    setMessage('Status penghantaran manual disimpan.');
  }
  return (
    <section className="card monthly-reports">
      <div className="card-heading">
        <div>
          <p className="eyebrow">LAPORAN BULANAN</p>
          <h2>{admin ? 'Semakan & penghantaran laporan' : 'Laporan pembelajaran anak'}</h2>
          <p>
            {month} ·{' '}
            {admin
              ? 'Semak dahulu, luluskan, kemudian kongsi PDF.'
              : 'PDF tersedia selepas semakan admin. Portal ini baca sahaja.'}
          </p>
        </div>
      </div>
      {admin && (
        <div className="button-row">
          <button disabled={busy} onClick={() => void run(prepare)}>
            Sediakan draf bulanan
          </button>
          <button
            className="primary"
            disabled={busy || !reports.some((r) => r.status === 'approved')}
            onClick={() =>
              void run(async () => {
                downloadBlob(await reportsZip(reports, demo), `AQR_Laporan_${month}.zip`);
                setMessage('ZIP mengandungi laporan diluluskan sahaja.');
              })
            }
          >
            Muat turun ZIP bulanan
          </button>
        </div>
      )}
      {busy && <p role="status">Sedang menyediakan laporan…</p>}
      {message && <p role="status">{message}</p>}
      {!reports.length && (
        <p className="muted">
          {admin ? 'Belum ada draf untuk bulan ini.' : 'Belum ada laporan bulanan diluluskan.'}
        </p>
      )}
      <div className="report-grid">
        {reports.map((r) => {
          const snapshot = r.snapshot as StudentSnapshot;
          return (
            <article className="report-item" key={r.id}>
              <p className="eyebrow">{r.status === 'approved' ? 'DILULUSKAN' : 'DRAF'}</p>
              <h3>{snapshot.student_name}</h3>
              <p>
                {snapshot.attendance.length} rekod kehadiran · {snapshot.feedback.length} ulasan
              </p>
              <div className="button-row">
                <button disabled={busy} onClick={() => setPreview(r)}>
                  Lihat laporan
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      downloadBlob(
                        new Blob([await reportPdf(snapshot, r.status === 'approved', demo)], {
                          type: 'application/pdf',
                        }),
                        `AQR_${r.period}_${r.student_id}.pdf`,
                      ),
                    )
                  }
                >
                  {r.status === 'approved' ? 'Muat turun PDF' : 'PDF draf'}
                </button>
              </div>
              {admin &&
                r.status === 'approved' &&
                (data.student_guardians || [])
                  .filter((l) => l.student_id === r.student_id)
                  .map((l) => {
                    const g = data.guardians.find(
                      (g) => g.id === l.guardian_id && g.active !== false,
                    );
                    if (!g) return null;
                    const status =
                      (data.report_deliveries || []).find(
                        (d) => d.report_id === r.id && d.guardian_id === g.id,
                      )?.status || '';
                    return (
                      <div className="delivery-row" key={g.id}>
                        <p>{String(g.full_name)}</p>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setDraft(
                              whatsappDraft(
                                snapshot.student_name,
                                String(r.period),
                                location.origin + location.pathname.split('/demo')[0],
                              ),
                            );
                          }}
                        >
                          Sediakan mesej WhatsApp
                        </button>
                        <label>
                          Status manual
                          <select
                            aria-label={`Status penghantaran ${snapshot.student_name} kepada ${g.full_name}`}
                            disabled={busy}
                            value={String(status)}
                            onChange={(e) => void run(() => delivery(r, g, e.target.value))}
                          >
                            <option value="" disabled>
                              Belum direkod
                            </option>
                            <option value="prepared">Disediakan</option>
                            <option value="sent">Dihantar</option>
                            <option value="acknowledged">Diterima penjaga</option>
                            <option value="failed">Gagal dihantar</option>
                          </select>
                        </label>
                        {status && (
                          <small>Catatan admin; bukan pengesahan automatik WhatsApp.</small>
                        )}
                      </div>
                    );
                  })}
            </article>
          );
        })}
      </div>
      {draft && (
        <div className="message-draft">
          <h3>Mesej untuk disalin</h3>
          <textarea aria-label="Draf mesej WhatsApp" readOnly value={draft} />
          <p>Lampirkan PDF individu dalam WhatsApp, kemudian catat status secara manual.</p>
          <button
            onClick={() =>
              void run(async () => {
                await navigator.clipboard.writeText(draft);
                setMessage('Mesej disalin.');
              })
            }
          >
            Salin mesej
          </button>
          <button onClick={() => setDraft('')}>Tutup mesej</button>
        </div>
      )}
      {preview && (
        <div
          className="report-preview"
          role="dialog"
          aria-modal="true"
          aria-label="Pratonton laporan"
        >
          <div className="report-preview-body">
            <button onClick={() => setPreview(null)}>Tutup pratonton</button>
            <h2>{(preview.snapshot as StudentSnapshot).student_name}</h2>
            <p>
              {preview.period as string} ·{' '}
              {preview.status === 'approved' ? 'Diluluskan' : 'Draf untuk semakan'}
            </p>
            <h3>Kehadiran</h3>
            {(preview.snapshot as StudentSnapshot).attendance.map((a, i) => (
              <p key={i}>
                {dateLabel(a.date)} · {a.class_name} · {a.status}
              </p>
            ))}
            <h3>Ulasan Bahasa Melayu</h3>
            {(preview.snapshot as StudentSnapshot).feedback.map((f, i) => (
              <p key={i}>{f.text}</p>
            ))}
            <h3>Perkembangan individu</h3>
            {(preview.snapshot as StudentSnapshot).progress.map((p, i) => (
              <p key={i}>
                {dateLabel(p.date)} · {p.mastery}/5 · {p.notes}
              </p>
            ))}
            {admin && preview.status === 'draft' && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void run(() => approve(preview))}
              >
                Luluskan laporan ini
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function TutorApplications({
  data,
  onData,
  demo,
}: {
  data: Dataset;
  onData: (d: Dataset) => void;
  demo: boolean;
}) {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h2>Permohonan tutor</h2>
      <p>Akaun baharu tidak mendapat akses murid sebelum diluluskan.</p>
      {!(data.tutor_applications || []).some((a) => a.status === 'pending') && (
        <p className="muted">Tiada permohonan menunggu.</p>
      )}
      {(data.tutor_applications || [])
        .filter((a) => a.status === 'pending')
        .map((a) => (
          <div key={a.id}>
            <strong>{String(a.display_name)}</strong>
            {[true, false].map((accept) => (
              <button
                key={String(accept)}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (demo)
                      onData({
                        ...data,
                        tutor_applications: data.tutor_applications.map((x) =>
                          x.id === a.id ? { ...x, status: accept ? 'approved' : 'rejected' } : x,
                        ),
                      });
                    else {
                      const r = await apiFetch('/api/mutate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          operation: 'tutor_application',
                          payload: { application: a.id, accept },
                        }),
                      });
                      if (!r.ok) throw new Error('Semakan gagal');
                      const next = await apiFetch('/api/data');
                      if (!next.ok) throw new Error('Muat semula gagal');
                      onData(await next.json());
                    }
                  } catch (e) {
                    setMessage((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {accept ? 'Luluskan tutor' : 'Tolak permohonan'}
              </button>
            ))}
          </div>
        ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
