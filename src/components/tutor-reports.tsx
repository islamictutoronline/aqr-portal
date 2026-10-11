'use client';
import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Dataset, fileName, monthLabel } from '@/lib/core';
import { downloadBlob } from '@/lib/transport';
import { demoSnapshot } from '@/lib/student-reports';

// Tutor: muat turun laporan kelas yang dijalankan bagi murid sendiri (tanpa invois).
export function TutorClassReports({
  data,
  month,
  demo,
}: {
  data: Dataset;
  month: string;
  demo: boolean;
}) {
  const [busy, setBusy] = useState(''),
    [message, setMessage] = useState('');
  const students = (data.students || [])
    .filter((s) => s.status !== 'archived')
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  const snapshots = students.map((s) => demoSnapshot(data, s, month));
  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setMessage('');
    try {
      await action();
    } catch {
      setMessage('PDF gagal disediakan. Cuba lagi.');
    } finally {
      setBusy('');
    }
  }
  const withClasses = snapshots.filter((s) => s.attendance.length);
  return (
    <section className="card tutor-class-reports">
      <div className="card-heading">
        <div>
          <p className="eyebrow">LAPORAN KELAS</p>
          <h2>Laporan kelas murid saya</h2>
          <p>
            {monthLabel(month)} · kehadiran, bacaan dan ulasan setiap kelas yang dijalankan. Tanpa
            invois.
          </p>
          <p className="tutor-fee-note">Untuk jumlah yuran, ibu bapa boleh rujuk admin AQR.</p>
        </div>
        <button
          className="primary"
          disabled={!!busy || !withClasses.length}
          onClick={() =>
            void run('zip', async () => {
              const { classReportsZip } = await import('@/lib/student-reports');
              downloadBlob(
                await classReportsZip(withClasses, demo),
                fileName(['Laporan Kelas', monthLabel(month)], 'zip'),
              );
            })
          }
        >
          <Download size={16} />
          {busy === 'zip' ? 'Menyediakan…' : `Muat turun semua (${withClasses.length})`}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {!students.length && <p className="muted">Belum ada murid berdaftar.</p>}
      <ul className="class-report-list">
        {snapshots.map((snap, i) => {
          const done = snap.attendance.length;
          return (
            <li key={String(students[i].id)}>
              <FileText size={16} aria-hidden="true" />
              <span>
                <strong>{snap.student_name}</strong>
                <small>{done ? `${done} kelas direkod` : 'Tiada kelas direkod bulan ini'}</small>
              </span>
              <button
                disabled={!!busy || !done}
                onClick={() =>
                  void run(String(students[i].id), async () => {
                    const { reportPdf, classReportFileName } =
                      await import('@/lib/student-reports');
                    downloadBlob(
                      new Blob([await reportPdf(snap, 'tutor', demo)], {
                        type: 'application/pdf',
                      }),
                      classReportFileName(snap.student_name, month),
                    );
                  })
                }
              >
                {busy === String(students[i].id) ? 'Menyediakan…' : 'PDF'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
