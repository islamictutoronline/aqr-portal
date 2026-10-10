'use client';
import { useState } from 'react';
import { Dataset, Row } from '@/lib/core';
export function Milestone({
  data,
  session,
  mutate,
  demo,
}: {
  data: Dataset;
  session: Row;
  demo: boolean;
  mutate: (operation: string, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [unit, setUnit] = useState(''),
    [student, setStudent] = useState(''),
    [score, setScore] = useState<number | null>(null);
  const cls = data.classes.find((c) => c.id === session.class_id),
    units = data.curriculum_units.filter((u) => u.program_id === cls?.program_id);
  const students = data.students.filter((s) =>
    data.attendance.some(
      (a) =>
        a.session_id === session.id &&
        a.student_id === s.id &&
        ['present', 'late', 'makeup'].includes(String(a.status)),
    ),
  );
  return (
    <section className="card">
      <h2>Pencapaian unit kurikulum</h2>
      <p className="footnote">
        Pilih murid yang telah direkod hadir dan unit yang benar-benar dinilai. Penguasaan disimpan
        bersama bukti sesi, tanpa peratusan anggaran.
      </p>
      <div className="invite-form">
        <label>
          Murid
          <select value={student} onChange={(e) => setStudent(e.target.value)}>
            <option value="">Pilih murid</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {String(s.full_name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">Pilih unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {String(u.name)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="chips">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            aria-pressed={score === n}
            className={score === n ? 'selected' : ''}
            onClick={() => setScore(n)}
          >
            Tahap {n}
          </button>
        ))}
      </div>
      <button
        disabled={
          demo ||
          !student ||
          !unit ||
          !score ||
          ['verified', 'approved', 'paid'].includes(String(session.review_status))
        }
        onClick={() =>
          mutate('milestone', {
            sid: session.id,
            student,
            unit,
            score,
            notes: '',
            homework: '',
            publish: true,
          })
        }
      >
        Terbit pencapaian unit
      </button>
      {demo && (
        <p className="footnote">Penyimpanan bukti unit memerlukan pangkalan data sebenar.</p>
      )}
    </section>
  );
}
export function PublishedMilestones({ data, student }: { data: Dataset; student: string }) {
  const rows = data.student_skill_levels.filter((s) => s.student_id === student);
  return (
    <section className="card">
      <h2>Penguasaan mengikut unit</h2>
      <p className="footnote">Berdasarkan penilaian unit yang telah diterbitkan.</p>
      {!rows.length ? (
        <p className="footnote">
          Belum cukup data penilaian unit. Tiada peratusan kemajuan direka.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Penguasaan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {String(
                      data.curriculum_units.find((u) => u.id === r.curriculum_unit_id)?.name ||
                        'Unit',
                    )}
                  </td>
                  <td>Tahap {Number(r.mastery)} / 5</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
