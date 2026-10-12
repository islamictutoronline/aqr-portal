import { it, expect } from 'vitest';
import { allowanceRows, feeRows, classRateOverride } from '../../src/lib/reporting';
import { buildPayslip } from '../../src/lib/payslip';
import { demoData, scopeDemo } from '../../src/lib/demo';
import type { Dataset, Row } from '../../src/lib/core';

// Set data kecil: satu kelas, satu tutor, dua sesi selesai (1 dan 20 Okt, waktu KL).
function base(): Dataset {
  const session = (id: string, starts: string): Row => ({
    id,
    class_id: 'c1',
    tutor_id: 't1',
    starts_at: starts,
    ends_at: new Date(new Date(starts).getTime() + 30 * 60000).toISOString(),
    status: 'completed',
  });
  return {
    programs: [{ id: 'p1', code: 'IQRA', name: 'Iqra' }],
    classes: [{ id: 'c1', program_id: 'p1', name: 'Kelas A' }],
    students: [{ id: 's1', full_name: 'Murid Satu' }],
    student_guardians: [
      { id: 'l1', student_id: 's1', guardian_id: 'g1', is_billing_contact: true },
    ],
    // 1 Okt 00:30 KL = 30 Sep 16:30 UTC: tarikh sesi mesti dikira ikut KL.
    class_sessions: [session('x1', '2026-09-30T16:30:00Z'), session('x2', '2026-10-20T02:00:00Z')],
    attendance: [
      { id: 'a1', session_id: 'x1', student_id: 's1', status: 'present' },
      { id: 'a2', session_id: 'x2', student_id: 's1', status: 'present' },
    ],
    tutor_allowance_rates: [
      {
        id: 'r1',
        program_code: 'IQRA',
        duration_minutes: 30,
        amount_sen: 1000,
        effective_from: '2026-01-01',
      },
    ],
    program_fee_rates: [
      {
        id: 'f1',
        program_code: 'IQRA',
        duration_minutes: 30,
        amount_sen: 2500,
        effective_from: '2026-01-01',
      },
    ],
    class_rate_overrides: [],
    tutor_rate_overrides: [],
  };
}
const rates = (data: Dataset) =>
  allowanceRows(data, '2026-10').map((r) => [r.session.id, r.rate_sen, r.payable_sen]);

it('uses standard rates when there are no overrides', () => {
  expect(rates(base())).toEqual([
    ['x1', 1000, 1000],
    ['x2', 1000, 1000],
  ]);
  expect(feeRows(base(), '2026-10').map((f) => [f.sessions, f.rate_sen, f.total_sen])).toEqual([
    [2, 2500, 5000],
  ]);
});

it('applies the latest effective class override per KL session date, ties by created_at', () => {
  const data = base();
  data.class_rate_overrides = [
    // Berkuat kuasa 1 Okt (KL): sesi x1 pada 1 Okt 00:30 KL terkena.
    {
      id: 'o1',
      class_id: 'c1',
      fee_sen: 3000,
      allowance_sen: 1500,
      effective_from: '2026-10-01',
      created_at: '2026-09-01T00:00:00Z',
    },
    // Seri tarikh: rekod lebih baharu menang; allowance null = kadar standard.
    {
      id: 'o2',
      class_id: 'c1',
      fee_sen: 3200,
      allowance_sen: null,
      effective_from: '2026-10-15',
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'o3',
      class_id: 'c1',
      fee_sen: 9999,
      allowance_sen: 9999,
      effective_from: '2026-10-15',
      created_at: '2026-09-01T00:00:00Z',
    },
    // Masa depan: tidak terpakai.
    {
      id: 'o4',
      class_id: 'c1',
      fee_sen: 1,
      allowance_sen: 1,
      effective_from: '2026-11-01',
      created_at: '2026-10-05T00:00:00Z',
    },
  ];
  expect(classRateOverride(data, 'c1', '2026-09-30')).toEqual({
    fee_sen: null,
    allowance_sen: null,
  });
  expect(rates(data)).toEqual([
    ['x1', 1500, 1500],
    ['x2', 1000, 1000],
  ]);
  // Kadar berbeza dalam bulan yang sama dipecahkan kepada baris berasingan.
  const fees = feeRows(data, '2026-10').map((f) => [f.sessions, f.rate_sen, f.total_sen]);
  expect(fees).toEqual(
    expect.arrayContaining([
      [1, 3000, 3000],
      [1, 3200, 3200],
    ]),
  );
  expect(fees.length).toBe(2);
});

it('class allowance override beats the tutor adjustment', () => {
  const data = base();
  data.tutor_rate_overrides = [
    {
      id: 'tr1',
      staff_id: 't1',
      adjustment_sen: 200,
      effective_from: '2026-01-01',
      created_at: '',
    },
  ];
  data.class_rate_overrides = [
    {
      id: 'o1',
      class_id: 'c1',
      fee_sen: null,
      allowance_sen: 1700,
      effective_from: '2026-10-10',
      created_at: '2026-10-01T00:00:00Z',
    },
  ];
  expect(rates(data)).toEqual([
    ['x1', 1200, 1200],
    ['x2', 1700, 1700],
  ]);
  // fee_sen null: yuran standard kekal.
  expect(feeRows(data, '2026-10')[0]).toMatchObject({ sessions: 2, rate_sen: 2500 });
});

it('adds the latest tutor adjustment to the standard rate with a floor of zero', () => {
  const data = base();
  data.tutor_rate_overrides = [
    {
      id: 'tr1',
      staff_id: 't1',
      adjustment_sen: 300,
      effective_from: '2026-09-01',
      created_at: '2026-09-01T00:00:00Z',
    },
    {
      id: 'tr2',
      staff_id: 't1',
      adjustment_sen: -5000,
      effective_from: '2026-10-10',
      created_at: '2026-10-01T00:00:00Z',
    },
    // Tutor lain tidak mempengaruhi t1.
    {
      id: 'tr3',
      staff_id: 't2',
      adjustment_sen: 999,
      effective_from: '2026-01-01',
      created_at: '2026-10-01T00:00:00Z',
    },
  ];
  expect(rates(data)).toEqual([
    ['x1', 1300, 1300],
    ['x2', 0, 0],
  ]);
  const slip = buildPayslip(data, 't1', '2026-10');
  expect(slip.total_sen).toBe(1300);
  expect(slip.lines.reduce((n, l) => n + l.total_sen, 0)).toBe(1300);
});

it('bills an override fee even without a standard fee rate, and pays an override allowance without a standard rate', () => {
  const data = base();
  data.program_fee_rates = [
    {
      id: 'f1',
      program_code: 'LAIN',
      duration_minutes: 30,
      amount_sen: 2500,
      effective_from: '2026-01-01',
    },
  ];
  data.tutor_allowance_rates = [];
  data.tutor_rate_overrides = [
    {
      id: 'tr1',
      staff_id: 't1',
      adjustment_sen: 500,
      effective_from: '2026-01-01',
      created_at: '',
    },
  ];
  expect(rates(data)).toEqual([
    ['x1', null, 0],
    ['x2', null, 0],
  ]);
  data.class_rate_overrides = [
    {
      id: 'o1',
      class_id: 'c1',
      fee_sen: 4000,
      allowance_sen: 1100,
      effective_from: '2026-10-01',
      created_at: '2026-10-01T00:00:00Z',
    },
  ];
  expect(feeRows(data, '2026-10')[0]).toMatchObject({
    sessions: 2,
    rate_sen: 4000,
    total_sen: 8000,
    guardianId: 'g1',
  });
  expect(rates(data)).toEqual([
    ['x1', 1100, 1100],
    ['x2', 1100, 1100],
  ]);
});

it('scopes demo overrides like RLS', () => {
  const data = demoData();
  const tutor = scopeDemo(data, 'tutor');
  const ownClass = tutor.classes[0].id;
  const otherClass = data.classes.find((c) => !tutor.classes.some((t) => t.id === c.id))?.id;
  data.class_rate_overrides = [
    { id: 'o1', class_id: ownClass, fee_sen: 1, allowance_sen: 1, effective_from: '2026-01-01' },
    { id: 'o2', class_id: otherClass, fee_sen: 1, allowance_sen: 1, effective_from: '2026-01-01' },
  ];
  data.tutor_rate_overrides = [
    { id: 't1', staff_id: 'tutor-0', adjustment_sen: 1, effective_from: '2026-01-01' },
    { id: 't2', staff_id: 'tutor-1', adjustment_sen: 1, effective_from: '2026-01-01' },
  ];
  const scoped = scopeDemo(data, 'tutor');
  expect(scoped.class_rate_overrides.map((r) => r.id)).toEqual(['o1']);
  expect(scoped.tutor_rate_overrides.map((r) => r.id)).toEqual(['t1']);
  const guardian = scopeDemo(data, 'guardian');
  expect(guardian.class_rate_overrides).toEqual([]);
  expect(guardian.tutor_rate_overrides).toEqual([]);
  expect(scopeDemo(data, 'admin').class_rate_overrides.length).toBe(2);
});
