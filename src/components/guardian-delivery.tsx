'use client';
import { useMemo, useState } from 'react';
import { Download, FileText, MessageCircle, RefreshCw, Search, Send } from 'lucide-react';
import { Dataset, fileName, formatMoney, monthLabel } from '@/lib/core';
import { apiFetch, downloadBlob } from '@/lib/transport';
import {
  Family,
  familiesByTutor,
  familyBundles,
  familyMatches,
  familyMessage,
  invoiceDetails,
  whatsappUrl,
} from '@/lib/delivery';
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
    [message, setMessage] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState<'all' | 'ready' | 'missing' | 'sent'>('all');
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

  const stateOf = (f: Family) => (f.sent ? 'sent' : f.missing.length ? 'missing' : 'ready');
  const counts = {
    all: families.length,
    ready: families.filter((f) => stateOf(f) === 'ready').length,
    missing: families.filter((f) => stateOf(f) === 'missing').length,
    sent: families.filter((f) => stateOf(f) === 'sent').length,
  };
  const visibleFamilies = families.filter(
    (f) => familyMatches(f, query) && (filter === 'all' || stateOf(f) === filter),
  );
  const groups = familiesByTutor(data, visibleFamilies);
  const searching = !!query.trim() || filter !== 'all';
  const statusTag = {
    ready: ['ready', 'Sedia dihantar'],
    missing: ['neutral', 'Belum lengkap'],
    sent: ['success', 'Dihantar'],
  } as const;

  // Satu baris ringkas setiap keluarga: penjaga, tag dokumen, status dan tindakan.
  const familyRow = (f: Family) => {
    const gid = String(f.guardian.id);
    const prepared = files[gid];
    const complete = !f.missing.length;
    const [tone, label] = statusTag[stateOf(f)];
    return (
      <div className={`family-row is-${stateOf(f)}`} key={gid}>
        <div className="family-who">
          <strong>{String(f.guardian.full_name)}</strong>
          {f.guardian.phone ? (
            <a
              className="wa-link"
              href={whatsappUrl(f.guardian.phone, familyMessage(f, month, data))}
              target="_blank"
              rel="noreferrer"
              title="Buka WhatsApp dengan mesej siap ditulis"
            >
              <MessageCircle size={14} aria-hidden="true" />
              {String(f.guardian.phone)}
            </a>
          ) : (
            <span className="tag warn">Tiada no. WhatsApp</span>
          )}
        </div>
        <div className="family-tags">
          {f.children.map((c) => {
            const r = f.reports.find((x) => x.student_id === c.id);
            const [cls, txt] = !r
              ? ['muted', 'Tiada laporan']
              : r.status === 'approved'
                ? ['ok', 'Diluluskan']
                : ['warn', 'Draf'];
            return (
              <span key={String(c.id)} className={`tag ${cls}`}>
                <FileText size={12} aria-hidden="true" />
                {String(c.full_name)} · {txt}
              </span>
            );
          })}
          <span className={`tag ${f.invoice ? 'ok' : 'muted'}`}>
            {f.invoice
              ? `Invois ${String(f.invoice.number)} · ${formatMoney(Number(f.invoice.total_sen))}`
              : 'Invois belum dijana'}
          </span>
        </div>
        <span className={`badge ${tone}`}>{label}</span>
        <div className="family-actions">
          {!prepared ? (
            <button
              className="primary"
              disabled={!complete || !!busy}
              title={complete ? '' : f.missing.join(' · ')}
              onClick={() => void prepare(f)}
            >
              <FileText size={15} />
              {busy === gid ? 'Menyediakan…' : 'Sediakan PDF'}
            </button>
          ) : (
            <>
              <button className="primary" onClick={() => download(f)}>
                <Download size={15} />
                Muat turun PDF
              </button>
              {shareable ? (
                <button onClick={() => share(f)}>
                  <Send size={15} />
                  Kongsi
                </button>
              ) : (
                f.guardian.phone && (
                  <button onClick={() => openChat(f)}>
                    <MessageCircle size={15} />
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
                .then(() => setMessage(`Ditanda dihantar: ${String(f.guardian.full_name)}.`))
                .catch((e: Error) => setMessage(e.message))
            }
          >
            {f.sent ? 'Dihantar ✓' : 'Tandakan dihantar'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="card family-delivery">
      <div className="card-heading">
        <div>
          <p className="eyebrow">HANTAR KEPADA PENJAGA</p>
          <h2>Laporan + invois sekeluarga</h2>
          <p>
            {monthLabel(month)} · satu PDF setiap keluarga (laporan semua anak + invois).
            Adik-beradik digabung.
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
          <strong>Hantar</strong> — buka tutor, kemudian sediakan PDF dan hantar kepada penjaga.
        </li>
      </ol>
      <div className="delivery-tools">
        <label className="delivery-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Cari murid, ibu bapa atau no. telefon"
            placeholder="Cari murid, ibu bapa atau no. telefon…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="filter-tags" role="tablist" aria-label="Tapis status">
          {(
            [
              ['all', 'Semua'],
              ['ready', 'Sedia dihantar'],
              ['missing', 'Belum lengkap'],
              ['sent', 'Dihantar'],
            ] as const
          ).map(([key, text]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? 'active' : ''}
              onClick={() => setFilter(key)}
            >
              {text} <span>{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>
      {message && <p role="status">{message}</p>}
      {!families.length && (
        <p className="muted">Belum ada penjaga bil. Tutor mengisi penjaga semasa daftar murid.</p>
      )}
      {families.length > 0 && !visibleFamilies.length && (
        <p className="muted">Tiada keluarga sepadan dengan carian atau tapisan.</p>
      )}
      <div className="tutor-groups">
        {groups.map((g) => {
          const st = (k: string) => g.families.filter((f) => stateOf(f) === k).length;
          return (
            <details
              className="tutor-group delivery-group"
              key={`${g.id}-${searching ? 'open' : 'closed'}`}
              open={searching}
            >
              <summary>
                <span className="tutor-group-name">{g.name}</span>
                <span className="tutor-group-meta">
                  <span className="tag">{g.families.length} keluarga</span>
                  {st('ready') > 0 && <span className="tag ok">{st('ready')} sedia</span>}
                  {st('missing') > 0 && (
                    <span className="tag warn">{st('missing')} belum lengkap</span>
                  )}
                  {st('sent') > 0 && <span className="tag sent">{st('sent')} dihantar</span>}
                </span>
              </summary>
              <div className="family-rows">{g.families.map(familyRow)}</div>
            </details>
          );
        })}
      </div>
      <p className="footnote">
        Di komputer: Sediakan PDF → Muat turun PDF → Buka WhatsApp (mesej siap ditulis) → lampirkan
        PDF → Tandakan dihantar. Di telefon: Sediakan PDF → Kongsi → pilih WhatsApp dan penjaga.
        Letak tetikus pada butang kelabu untuk melihat apa yang belum lengkap.
      </p>
    </section>
  );
}
