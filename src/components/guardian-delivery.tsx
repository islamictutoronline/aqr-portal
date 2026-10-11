'use client';
import { useMemo, useState } from 'react';
import { FileText, MessageCircle, Receipt, Send } from 'lucide-react';
import { Dataset, fileName, formatMoney, monthLabel } from '@/lib/core';
import { apiFetch, downloadBlob } from '@/lib/transport';
import { Family, familyBundles, familyMessage, invoiceDetails, whatsappUrl } from '@/lib/delivery';
import { StudentSnapshot } from '@/lib/student-reports';

type Props = { data: Dataset; month: string; demo: boolean; onData: (data: Dataset) => void };

// Pelayar telefon boleh berkongsi beberapa PDF terus ke WhatsApp; desktop memuat turun fail.
const canShareFiles = () => {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })
    );
  } catch {
    return false;
  }
};

// Admin: satu pakej setiap penjaga (laporan semua anak + invois) dihantar sekali melalui WhatsApp.
export function GuardianDelivery({ data, month, demo, onData }: Props) {
  const families = useMemo(() => familyBundles(data, month), [data, month]);
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [busy, setBusy] = useState(''),
    [message, setMessage] = useState('');
  const shareable = useMemo(canShareFiles, []);

  async function prepare(f: Family) {
    const gid = String(f.guardian.id);
    setBusy(gid);
    setMessage('');
    try {
      const { reportPdf, reportFileName, financialPdf } = await import('@/lib/student-reports');
      const out: File[] = [];
      for (const r of f.reports.filter((x) => x.status === 'approved')) {
        const snapshot = r.snapshot as StudentSnapshot;
        out.push(
          new File(
            [await reportPdf(snapshot, true, demo)],
            reportFileName(snapshot.student_name, String(r.period)),
            { type: 'application/pdf' },
          ),
        );
      }
      if (f.invoice)
        out.push(
          new File(
            [await financialPdf(f.invoice, 'invoice', demo, invoiceDetails(data, f.invoice))],
            fileName(['Invois', f.invoice.number, f.guardian.full_name], 'pdf'),
            { type: 'application/pdf' },
          ),
        );
      setFiles((x) => ({ ...x, [gid]: out }));
    } catch {
      setMessage('PDF gagal disediakan. Cuba lagi.');
    } finally {
      setBusy('');
    }
  }

  async function markSent(f: Family) {
    const approved = f.reports.filter((r) => r.status === 'approved');
    if (demo) {
      const others = (data.report_deliveries || []).filter(
        (d) => !(approved.some((r) => r.id === d.report_id) && d.guardian_id === f.guardian.id),
      );
      onData({
        ...data,
        report_deliveries: [
          ...others,
          ...approved.map((r) => ({
            id: `delivery-${String(r.id)}`,
            report_id: r.id,
            guardian_id: f.guardian.id,
            status: 'sent',
            updated_at: new Date().toISOString(),
          })),
        ],
      });
      return;
    }
    for (const r of approved) {
      const res = await apiFetch('/api/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'report_delivery',
          payload: { report: r.id, guardian: f.guardian.id, delivery_status: 'sent' },
        }),
      });
      if (!res.ok) throw new Error('Status penghantaran tidak dapat disimpan');
    }
    const refresh = await apiFetch('/api/data', { cache: 'no-store' });
    if (refresh.ok) onData(await refresh.json());
  }

  // Dipanggil terus daripada klik (fail sudah siap) supaya pelayar membenarkan perkongsian.
  function send(f: Family) {
    const list = files[String(f.guardian.id)] || [];
    const text = familyMessage(f, month, data);
    if (shareable) {
      navigator
        .share({ files: list, text, title: `AQR · ${monthLabel(month)}` })
        .then(() => markSent(f))
        .then(() => setMessage(`Dihantar kepada ${String(f.guardian.full_name)}.`))
        .catch((e: unknown) => {
          if ((e as Error)?.name !== 'AbortError')
            setMessage('Perkongsian gagal. Guna "Muat turun" dan lampirkan secara manual.');
        });
    } else {
      list.forEach((file) => downloadBlob(file, file.name));
      window.open(whatsappUrl(f.guardian.phone, text), '_blank', 'noopener');
      setMessage(
        `${list.length} PDF dimuat turun. Lampirkan semuanya dalam WhatsApp yang dibuka, kemudian tekan "Tandakan dihantar".`,
      );
    }
  }

  const ready = families.filter((f) => !f.missing.length);
  const sent = families.filter((f) => f.sent);
  const order = (f: Family) => (f.sent ? 2 : f.missing.length ? 1 : 0);
  return (
    <section className="card family-delivery">
      <div className="card-heading">
        <div>
          <p className="eyebrow">HANTAR KEPADA PENJAGA</p>
          <h2>Laporan + invois sekeluarga</h2>
          <p>
            {monthLabel(month)} · {families.length} keluarga · {ready.length} sedia · {sent.length}{' '}
            dihantar. Adik-beradik digabung dalam satu penghantaran.
          </p>
        </div>
      </div>
      {message && <p role="status">{message}</p>}
      {!families.length && (
        <p className="muted">Belum ada penjaga bil. Tutor mengisi penjaga semasa daftar murid.</p>
      )}
      <div className="family-list">
        {[...families]
          .sort((a, b) => order(a) - order(b))
          .map((f) => {
            const gid = String(f.guardian.id);
            const prepared = files[gid];
            const text = familyMessage(f, month, data);
            const complete = !f.missing.length;
            return (
              <article className={`family-card${f.sent ? ' is-sent' : ''}`} key={gid}>
                <header>
                  <div>
                    <h3>{String(f.guardian.full_name)}</h3>
                    {f.guardian.phone ? (
                      <a
                        className="wa-link"
                        href={whatsappUrl(f.guardian.phone, text)}
                        target="_blank"
                        rel="noreferrer"
                        title="Buka WhatsApp dengan mesej siap ditulis"
                      >
                        <MessageCircle size={15} aria-hidden="true" />
                        {String(f.guardian.phone)}
                      </a>
                    ) : (
                      <span className="muted">Tiada no. WhatsApp</span>
                    )}
                  </div>
                  <span className={`badge ${f.sent ? 'success' : complete ? 'ready' : 'neutral'}`}>
                    {f.sent ? 'Dihantar' : complete ? 'Sedia dihantar' : 'Belum lengkap'}
                  </span>
                </header>
                <ul className="family-docs">
                  {f.children.map((c) => {
                    const r = f.reports.find((x) => x.student_id === c.id);
                    return (
                      <li key={String(c.id)}>
                        <FileText size={15} aria-hidden="true" />
                        <span>Laporan {String(c.full_name)}</span>
                        <small className={r?.status === 'approved' ? 'ok' : 'warn'}>
                          {r ? (r.status === 'approved' ? 'Diluluskan' : 'Draf') : 'Tiada'}
                        </small>
                      </li>
                    );
                  })}
                  <li>
                    <Receipt size={15} aria-hidden="true" />
                    <span>
                      {f.invoice
                        ? `Invois ${String(f.invoice.number)} · ${formatMoney(Number(f.invoice.total_sen))}`
                        : 'Invois'}
                    </span>
                    <small className={f.invoice ? 'ok' : 'warn'}>
                      {f.invoice ? 'Dijana' : 'Belum dijana'}
                    </small>
                  </li>
                </ul>
                {!complete && <p className="family-missing">{f.missing.join(' · ')}</p>}
                <div className="button-row">
                  {!prepared ? (
                    <button
                      className="primary"
                      disabled={!complete || !!busy}
                      onClick={() => void prepare(f)}
                    >
                      <FileText size={16} />
                      {busy === gid ? 'Menyediakan…' : `Sediakan ${f.children.length + 1} PDF`}
                    </button>
                  ) : (
                    <button className="primary" onClick={() => send(f)}>
                      <Send size={16} />
                      {shareable
                        ? `Kongsi ${prepared.length} PDF ke WhatsApp`
                        : `Muat turun ${prepared.length} PDF & buka WhatsApp`}
                    </button>
                  )}
                  {
                    <button
                      disabled={!complete || f.sent || !!busy}
                      onClick={() =>
                        void markSent(f)
                          .then(() =>
                            setMessage(`Ditanda dihantar: ${String(f.guardian.full_name)}.`),
                          )
                          .catch((e: Error) => setMessage(e.message))
                      }
                    >
                      {f.sent ? 'Dihantar ✓' : 'Tandakan dihantar'}
                    </button>
                  }
                </div>
              </article>
            );
          })}
      </div>
      <p className="footnote">
        Tekan no. telefon untuk terus membuka WhatsApp penjaga dengan mesej siap ditulis. Di
        telefon, butang Kongsi menghantar semua PDF sekali gus — pilih WhatsApp, kemudian pilih
        penjaga.
      </p>
    </section>
  );
}
