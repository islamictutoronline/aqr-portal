'use client';
import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, ArrowRight } from 'lucide-react';
export default function Login() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const email = new FormData(event.currentTarget).get('email');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await r.json();
      setMessage(data.message || data.error);
    } catch {
      setMessage('Sambungan tidak tersedia. Cuba lagi.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <div className="login-panel">
        <BookOpen size={36} />
        <p className="eyebrow">AKADEMI AL-QURAN AR-RIYADH</p>
        <h1>
          Ilmu dipantau.
          <br />
          Potensi dibimbing.
        </h1>
        <p>Selamat datang ke AQR, ruang untuk tutor, pentadbir dan ibu bapa bergerak bersama.</p>
        <div className="arabic" lang="ar" dir="rtl">
          رَبِّ زِدْنِي عِلْمًا
        </div>
      </div>
      <section className="login-form">
        <span className="brand">
          AQR<span className="gold">.</span>
        </span>
        <h2>Buka ruang anda</h2>
        <p>
          Sahkan e-mel pada peranti ini sekali. Sesi selamat dikekalkan sehingga tamat tempoh atau
          dibatalkan.
        </p>
        <form onSubmit={send}>
          <label>
            E-mel yang telah dijemput
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              placeholder="nama@contoh.com"
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Memproses…' : 'Hantar pautan pengesahan'}
            <ArrowRight size={18} />
          </button>
        </form>
        {message && <p role="status">{message}</p>}
        <Link href="/demo" className="text-link">
          Lihat demo dengan data rekaan →
        </Link>
        <small>Akses perlu diberikan oleh pentadbir. Tiada pendaftaran awam.</small>
      </section>
    </main>
  );
}
