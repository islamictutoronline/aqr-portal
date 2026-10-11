import { describe, it, expect } from 'vitest';
import {
  passwordProblem,
  joinPhone,
  splitPhone,
  findRate,
  eligibleAllowance,
  integerSen,
  invoiceBalance,
  rateReference,
  monthBounds,
  generateComment,
  skillOptions,
  safeCell,
  comparableTrend,
  allowedReport,
} from '../../src/lib/core';
import { historicalSummary, parseCsv } from '../../src/lib/historical';
const rates = rateReference.map((r) => ({
  program_code: r[0],
  duration_minutes: r[2],
  amount_sen: r[3],
  effective_from: '2026-01-01',
}));
describe('Integer-sen finance and immutable rate eligibility', () => {
  it.each([
    ['IQRA', 20, 700],
    ['IQRA', 30, 900],
    ['FARDHU_AIN_KAFA', 30, 1000],
    ['BAHASA_ARAB', 30, 1300],
  ])('looks up %s %i minutes', (code, minutes, sen) =>
    expect(findRate(rates, code, minutes, '2026-09-10').amount_sen).toBe(sen),
  );
  it('rejects missing and overlapping rates', () => {
    expect(() => findRate(rates, 'PRA_TAHFIZ', 20, '2026-09-10')).toThrow();
    expect(() => findRate([...rates, rates[0]], 'IQRA', 20, '2026-09-10')).toThrow('bertindih');
  });
  it('uses effective dates and keeps approved snapshot stable', () => {
    const versions = [
      {
        program_code: 'IQRA',
        duration_minutes: 20,
        amount_sen: 700,
        effective_from: '2026-01-01',
        effective_to: '2026-09-30',
      },
      { program_code: 'IQRA', duration_minutes: 20, amount_sen: 800, effective_from: '2026-10-01' },
    ];
    expect(findRate(versions, 'IQRA', 20, '2026-09-10').amount_sen).toBe(700);
    expect(findRate(versions, 'IQRA', 20, '2026-10-10').amount_sen).toBe(800);
  });
  it('requires completion and separate verifier/checker', () => {
    const base = {
      status: 'completed',
      review_status: 'approved',
      verified_by: 'finance',
      approved_by: 'owner',
      rate_snapshot_sen: 700,
    };
    expect(eligibleAllowance(base)).toBe(700);
    for (const patch of [
      { status: 'cancelled' },
      { review_status: 'reported' },
      { verified_by: null },
      { approved_by: null },
      { approved_by: 'finance' },
    ])
      expect(eligibleAllowance({ ...base, ...patch })).toBe(0);
  });
  it('RM150 less RM100 verified is RM50; pending/reversed ignored', () => {
    const invoice = { id: 'invoice', total_sen: 15000 };
    const allocations = [
      { id: 'a', invoice_id: 'invoice', payment_id: 'p', amount_sen: 10000 },
      { id: 'b', invoice_id: 'invoice', payment_id: 'q', amount_sen: 5000 },
    ];
    expect(
      invoiceBalance(
        invoice,
        [
          { id: 'p', status: 'verified' },
          { id: 'q', status: 'pending_verification' },
        ],
        allocations,
      ),
    ).toEqual({ invoiced: 15000, paid: 10000, outstanding: 5000 });
    expect(
      invoiceBalance(invoice, [{ id: 'p', status: 'reversed' }], allocations).outstanding,
    ).toBe(15000);
  });
  it('parses decimals without floating point rounding', () => {
    expect(integerSen('0.29')).toBe(29);
    expect(integerSen('150')).toBe(15000);
    expect(() => integerSen('2.555')).toThrow();
    expect(() => integerSen('-1')).toThrow();
  });
  it('reconciles anonymized September 72 records / 92 planned / RM562 indicative / RM0 payable', () => {
    const groups: [string, number, number][] = [
      ['IQRA', 20, 16],
      ['KELANCARAN_AQ', 20, 24],
      ['KELANCARAN_AQ', 30, 7],
      ['TAHSIN_AQ', 20, 5],
      ['TAHSIN_AQ', 30, 4],
      ['PRA_TAHFIZ', 30, 12],
      ['FARDHU_AIN_KAFA', 30, 4],
    ];
    const rows = groups.flatMap(([program_code, minutes, count], g) =>
      Array.from({ length: count }, (_, i) => ({
        date: '2026-09-10',
        student_name_reported: `Anonymous ${g}-${i}`,
        program_code,
        duration_minutes: String(minutes),
      })),
    );
    const r = historicalSummary(rows, rates, 92);
    expect(r).toMatchObject({
      reported: 72,
      planned: 92,
      missing: 20,
      indicative_sen: 56200,
      payable_sen: 0,
      needsReview: 72,
    });
  });
  it('preserves distinct same-day teaching notes without automatic dedupe', () => {
    const text =
      'date,student_name_reported,program_code,duration_minutes,note\n2026-09-10,Anonymous,IQRA,20,"First, note"\n2026-09-10,Anonymous,IQRA,20,Second';
    const rows = parseCsv(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].note).toBe('First, note');
    expect(historicalSummary(rows, rates, 2).ambiguousGroups).toBe(1);
  });
  it('respects midnight Malaysia month boundaries', () => {
    expect(monthBounds('2026-10')).toEqual({
      start: '2026-09-30T16:00:00.000Z',
      end: '2026-10-31T16:00:00.000Z',
    });
    expect(() => monthBounds('2026-13')).toThrow();
  });
});
describe('Tap-only comments and report permissions', () => {
  for (const subject of Object.keys(skillOptions))
    it.each([1, 2, 3, 4, 5])(`${subject} rating %i is factual and deterministic`, (mastery) => {
      const input = {
        skill: skillOptions[subject][0][0],
        mastery,
        participation: 'aktif',
        focus: 'sebutan',
      };
      const comment = generateComment(subject, 'present', input);
      expect(comment).toContain(skillOptions[subject][0][1]);
      expect(comment).not.toMatch(/meningkat|lemah|surah|halaman/);
      expect(comment).toBe(generateComment(subject, 'present', input));
    });
  it('absent/not assessed never fabricated or scored 1', () => {
    expect(generateComment('mengaji', 'absent', { mastery: 'not_assessed' })).toBe(
      'Tiada penilaian pembelajaran untuk sesi ini.',
    );
    expect(generateComment('mengaji', 'present', { mastery: 'not_assessed' })).toBe(
      'Tiada penilaian pembelajaran untuk sesi ini.',
    );
    expect(() => generateComment('mengaji', 'present', { mastery: 3 })).toThrow();
  });
  it('trend needs same skill, rubric and published valid scores', () => {
    expect(
      comparableTrend([{ skill: 'bacaan', rubric_version: '1', mastery: 3, published: true }]),
    ).toContain('belum mencukupi');
    expect(
      comparableTrend([
        { skill: 'bacaan', rubric_version: '1', mastery: 3, published: true },
        { skill: 'tajwid', rubric_version: '1', mastery: 5, published: true },
      ]),
    ).toContain('belum mencukupi');
  });
  it.each(['=HYPERLINK("bad")', '+CMD', '-1+1', '@SUM(A1)', ' \t=1'])(
    'escapes %s as inert text',
    (value) => expect(safeCell(value)).toBe(`'${value}`),
  );
  it('preserves Arabic and ordinary Malay', () =>
    expect(safeCell('رَبِّ زِدْنِي عِلْمًا')).toBe('رَبِّ زِدْنِي عِلْمًا'));
  it('rejects guardian payroll and academic private finance', () => {
    expect(allowedReport('guardian', 'tutor_payout')).toBe(false);
    expect(allowedReport('admin', 'student_fees')).toBe(true);
    expect(allowedReport('tutor', 'cash_collection')).toBe(false);
  });
  it('uses admin-configured tap options without free-form generated claims', () => {
    const options = [
      { id: 's', group_code: 'skill', code: 'tasmi', label: "tasmi'", active: true },
      {
        id: 'p',
        group_code: 'participation',
        code: 'bersedia',
        label: 'bersedia mencuba',
        active: true,
      },
      { id: 'f', group_code: 'focus', code: 'sambungan', label: 'sambungan ayat', active: true },
    ];
    expect(
      generateComment(
        'mengaji',
        'present',
        { skill: 'tasmi', mastery: 3, participation: 'bersedia', focus: 'sambungan' },
        options,
      ),
    ).toContain("dalam tasmi'");
  });
});
it('rejects weak admin passwords and accepts strong ones', () => {
  expect(passwordProblem('admin')).toMatch(/10 aksara/);
  expect(passwordProblem('adminadmin')).toMatch(/huruf dan nombor/);
  expect(passwordProblem('password123')).toMatch(/mudah diteka/);
  expect(passwordProblem('admin12345')).toMatch(/mudah diteka/);
  expect(passwordProblem('Ustazah-Riyadh-2026')).toBeNull();
});

describe('no. WhatsApp penjaga dengan kod negara', () => {
  it('menggabungkan kod negara dengan nombor tempatan', () => {
    expect(joinPhone('+60', '012-345 6789')).toBe('+60123456789');
    expect(joinPhone('+60', '12 345 6789')).toBe('+60123456789');
    expect(joinPhone('+60', '60123456789')).toBe('+60123456789');
    expect(joinPhone('+65', '9123 4567')).toBe('+6591234567');
    expect(joinPhone('+966', '050 123 4567')).toBe('+966501234567');
    expect(joinPhone('+60', '+44 7700 900123')).toBe('+447700900123');
    expect(joinPhone('+60', '+6012-345 6789')).toBe('+60123456789');
    expect(joinPhone('+60', '+60 012 345 6789')).toBe('+60123456789');
    expect(joinPhone('+60', '6 012 345 6789')).toBe('+60123456789');
    expect(joinPhone('+60', '011-1234 5678')).toBe('+601112345678');
    expect(joinPhone('+60', '03-1234 5678')).toBe('+60312345678');
    expect(() => joinPhone('+60', '012345')).toThrow(/Malaysia tidak lengkap/);
    expect(() => joinPhone('+60', '01234567890123')).toThrow(/Malaysia tidak lengkap/);
    expect(joinPhone('+60', '')).toBeNull();
    expect(() => joinPhone('+65', '12')).toThrow(/tidak sah/);
  });
  it('memisahkan semula untuk borang kemas kini', () => {
    expect(splitPhone('+60123456789')).toEqual(['+60', '123456789']);
    expect(splitPhone('+6591234567')).toEqual(['+65', '91234567']);
    expect(splitPhone('+966501234567')).toEqual(['+966', '501234567']);
    expect(splitPhone('+6731234567')).toEqual(['+673', '1234567']);
  });
});
