'use client';
import { useMemo, useState } from 'react';
import { Download, FileText, MessageCircle, Receipt, RefreshCw, Send } from 'lucide-react';
import { Dataset, fileName, formatMoney, monthLabel } from '@/lib/core';
import { apiFetch, downloadBlob } from '@/lib/transport';
import { Family, familyBundles, familyMessage, invoiceDetails, whatsappUrl } from '@/lib/delivery';
import { StudentSnapshot } from '@/lib/student-reports';

type Props = {
  data: Dataset;
  month: string;
  demo: boolean;
  onData: (data: Dataset) => void;
  // Jana draf laporan semua murid + invois ikut sesi bagi bulan ini (satu butang).
  onGenerate?: () => void;
  busy?: boolean;
};

// Kongsi fail terus ke aplikasi WhatsApp hanya di telefon/tablet. Di komputer, kongsi pelayar membuka
// halaman web WhatsApp yang tidak boleh membawa lampiran — jadi muat turun + buka WhatsApp.
const canShareFiles = () => {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      window.matchMedia('(pointer: coarse)').matches &&
      navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })
    );
  } catch {
    return false;
  }
};

// Admin: satu pakej setiap penjaga (laporan semua anak + invois) dihantar sekali melalui WhatsApp.
export function GuardianDelivery({ data, month, demo, onData, onGenerate, busy: saving }: Props) {
  const families = useMemo(() => familyBundles(data, month), [data, month]);
  // Satu PDF gabungan setiap keluarga: laporan semua anak diikuti invois.
  const [files, setFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState(''),
    [message, setMessage] = useState('');
  const shareable = useMemo(canShareFiles, []);

  async function prepare(f: Family) {
    const gid = String(f.guardian.id);
    setBusy(gid);
    setMessage('');
    try {
      const { reportPdf, financialPdf, mergePdfs } = await import('@/lib/student-reports');
      const parts: Uint8Array[] = [];
      for (const r of f.reports.filter((x) => x.status === 'approved'))
        parts.push(await reportPdf(r.snapshot as StudentSnapshot, true, demo));
      if (f.invoice)
        parts.push(await financialPdf(f.invoice, 'invoice', demo, invoiceDetails(data, f.invoice)));
      const name = fileName(['Laporan & Invois', f.guardian.full_name, monthLabel(month)], 'pdf');
      const merged = await mergePdfs(parts, name.replace(/\.pdf$/, ''));
      setFiles((x) => ({ ...x, [gid]: new File([merged], name, { type: 'application/pdf' }) }));
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

  const download = (f: Family) => {
    const file = files[String(f.guardian.id)];
    if (file) downloadBlob(file, file.name);
  };
  // Telefon: kongsi PDF terus ke WhatsApp (dipanggil terus daripada klik supaya dibenarkan pelayar).
  function share(f: Family) {
    const file = files[String(f.guardian.id)];
    if (!file) return;
    navigator
      .share({ files: [file], text: familyMessage(f, month, data), title: file.name })
      .then(() => markSent(f))
      .then(() => setMessage(`Dihantar kepada ${String(f.guardian.full_name)}.`))
      .catch((e: unknown) => {
        if ((e as Error)?.name !== 'AbortError')
          setMessage('Perkongsian gagal. Muat turun PDF dan lampirkan dalam WhatsApp.');
      });
  }
  // Komputer: buka sembang WhatsApp penjaga dengan mesej siap ditulis; lampirkan PDF yang dimuat turun.
  function openChat(f: Family) {
    window.open(whatsappUrl(f.guardian.phone, familyMessage(f, month, data)), '_blank', 'noopener');
    setMessage(
      `WhatsApp ${String(f.guardian.full_name)} dibuka. Lampirkan PDF yang dimuat turun, kemudian tekan "Tandakan dihantar".`,
    );
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
        {onGenerate && (
          <button className="primary" disabled={saving} onClick={onGenerate}>
            <RefreshCw size={16} />
            {saving ? 'Menjana…' : 'Jana laporan + invois'}
          </button>
        )}
      </div>
      <ol className="delivery-steps">
        <li>
          <strong>Jana laporan + invois</strong> — draf laporan setiap murid dan invois ikut sesi
          yang dijalankan.
        </li>
        <li>
          <strong>Semak & luluskan laporan</strong> di bahagian atas (ikut tutor).
        </li>
        <li>
          <strong>Hantar</strong> — laporan semua anak + invois sekali gus kepada setiap penjaga.
        </li>
      </ol>
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
                      {busy === gid ? 'Menyediakan…' : 'Sediakan PDF (laporan + invois)'}
                    </button>
                  ) : (
                    <>
                      <button className="primary" onClick={() => download(f)}>
                        <Download size={16} />
                        Muat turun PDF (laporan + invois)
                      </button>
                      {shareable ? (
                        <button onClick={() => share(f)}>
                          <Send size={16} />
                          Kongsi ke WhatsApp
                        </button>
                      ) : (
                        f.guardian.phone && (
                          <button onClick={() => openChat(f)}>
                            <MessageCircle size={16} />
                            Buka WhatsApp
                          </button>
                        )
                      )}
                    </>
                  )}
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
                </div>
              </article>
            );
          })}
      </div>
      <p className="footnote">
        Satu PDF setiap keluarga: laporan semua anak diikuti invois. Di komputer: muat turun PDF,
        tekan Buka WhatsApp (mesej siap ditulis), lampirkan PDF, kemudian Tandakan dihantar. Di
        telefon: Kongsi ke WhatsApp dan pilih penjaga.
      </p>
    </section>
  );
}
