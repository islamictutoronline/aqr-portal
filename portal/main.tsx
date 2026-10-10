import { useEffect, useState, FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../src/components/app';
import { Dataset } from '../src/lib/core';
import { demoData } from '../src/lib/demo';
import { loadData } from '../src/lib/data';
import { installTransport } from '../src/lib/transport';
import { db, configured, getContext, staticTransport } from './client';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/noto-naskh-arabic/400.css';
import '../src/app/globals.css';
installTransport(staticTransport);
// Data rekaan hanya untuk pembangunan dan ujian automatik; binaan terbitan tidak membukanya.
const demoAllowed = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1';
type Loaded = { ctx: Awaited<ReturnType<typeof getContext>>; data: Dataset };
function Root() {
  const [loaded, setLoaded] = useState<Loaded | null>(null),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(''),
    [email, setEmail] = useState(''),
    [token, setToken] = useState(''),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [trusted, setTrusted] = useState(localStorage.getItem('aqr.trusted') === 'yes'),
    [register, setRegister] = useState(false),
    [usePassword, setUsePassword] = useState(false),
    [password, setPassword] = useState(''),
    [signed, setSigned] = useState(false);
  const demo = demoAllowed && new URLSearchParams(location.search).get('demo') === '1';
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!configured || demo) {
        setLoading(false);
        return;
      }
      try {
        // Pautan e-mel/admin berbentuk ?token_hash=…&type=email disahkan sekali, kemudian dibuang dari URL.
        const params = new URLSearchParams(location.search);
        const tokenHash = params.get('token_hash');
        const type = params.get('type');
        if (tokenHash && (type === 'email' || type === 'magiclink')) {
          history.replaceState(null, '', location.pathname + location.hash);
          const { error } = await db.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw new Error('Pautan log masuk tidak sah atau telah tamat tempoh.');
        }
        const {
          data: { session },
        } = await db.auth.getSession();
        if (!alive) return;
        setSigned(Boolean(session));
        if (!session) {
          setLoaded(null);
          return;
        }
        const ctx = await getContext();
        const data = await loadData(ctx);
        if (alive) {
          setLoaded({ ctx, data });
          setMessage('');
        }
      } catch (e) {
        if (alive) {
          setLoaded(null);
          setMessage(e instanceof Error ? e.message : 'Akses gagal');
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setLoaded(null);
        setSigned(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')
        setTimeout(() => void load(), 0);
    });
    const focus = () => void load();
    window.addEventListener('focus', focus);
    return () => {
      alive = false;
      subscription.unsubscribe();
      window.removeEventListener('focus', focus);
    };
  }, [demo]);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      localStorage.setItem('aqr.trusted', trusted ? 'yes' : 'no');
      if (usePassword) {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw new Error('E-mel atau kata laluan salah.');
        return;
      }
      const { error } = await db.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: register,
          emailRedirectTo: location.origin + location.pathname,
        },
      });
      if (error)
        throw new Error('Pengesahan tidak dapat dihantar. Semak e-mel atau hubungi admin.');
      setSent(true);
      setMessage('Semak e-mel untuk pautan atau kod pengesahan.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await db.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (error) setMessage('Kod tidak sah atau telah tamat tempoh.');
  }
  if (demo)
    return (
      <App
        initial={demoData()}
        demo
        path={location.hash.slice(2) || 'dashboard'}
        role="owner"
        name="Pentadbir contoh"
      />
    );
  if (loading)
    return (
      <main className="auth-shell">
        <p>Memeriksa sesi selamat…</p>
      </main>
    );
  if (loaded)
    return (
      <App
        key={loaded.ctx.org + loaded.ctx.role}
        initial={loaded.data}
        demo={false}
        path={location.hash.slice(2) || (loaded.ctx.role === 'guardian' ? 'parent' : 'dashboard')}
        {...loaded.ctx}
      />
    );
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">AKADEMI AL-QURAN AR-RIYADH</p>
        <h1>Selamat kembali ke AQR</h1>
        <p>Laporan anak anda, di mana sahaja. Admin turut berkongsi laporan melalui WhatsApp.</p>
        {!configured ? (
          <p role="status">
            Portal belum dikonfigurasi. Pentadbir perlu menyediakan sambungan Supabase.
          </p>
        ) : signed ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              const r = await db.rpc('request_tutor', {
                academy_slug: f.get('academy'),
                applicant_name: f.get('name'),
              });
              setMessage(
                r.error
                  ? 'Permohonan gagal. Semak kod akademi.'
                  : 'Permohonan direkod. Akses tutor menunggu kelulusan admin.',
              );
              setBusy(false);
            }}
          >
            <h2>Pendaftaran tutor</h2>
            <p>Ibu bapa: hubungi admin untuk pautan anak. Tutor: mohon akses di bawah.</p>
            <label>
              Nama penuh
              <input name="name" required minLength={2} maxLength={120} />
            </label>
            <input type="hidden" name="academy" value="aqr" />
            <button className="primary" disabled={busy}>
              Hantar permohonan tutor
            </button>
            <button type="button" onClick={() => void db.auth.signOut({ scope: 'local' })}>
              Log keluar
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={login}>
              <label>
                E-mel berdaftar
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={trusted}
                  onChange={(e) => setTrusted(e.target.checked)}
                />
                Kekalkan sesi pada peranti dipercayai ini
              </label>
              {usePassword && (
                <label>
                  Kata laluan
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={usePassword}
                  onChange={(e) => {
                    setUsePassword(e.target.checked);
                    if (e.target.checked) setRegister(false);
                  }}
                />
                Log masuk dengan kata laluan (pentadbir)
              </label>
              {!usePassword && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={register}
                    onChange={(e) => setRegister(e.target.checked)}
                  />
                  Saya tutor baharu — daftar akaun
                </label>
              )}
              <button className="primary" disabled={busy}>
                {usePassword
                  ? 'Log masuk'
                  : register
                    ? 'Daftar dengan e-mel'
                    : 'Hantar kod log masuk'}
              </button>
            </form>
            {sent && (
              <form onSubmit={verify}>
                <label>
                  Kod e-mel (jika diberikan)
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                  />
                </label>
                <button disabled={busy}>Sahkan kod</button>
              </form>
            )}
          </>
        )}
        {message && <p role="status">{message}</p>}
        {demoAllowed && <a href="?demo=1">Lihat demo rekaan</a>}
        <p className="footnote">
          Log masuk dengan kod e-mel, atau kata laluan bagi pentadbir. Hanya akaun berizin boleh
          melihat data. Log keluar selepas menggunakan peranti berkongsi.
        </p>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Root />);
