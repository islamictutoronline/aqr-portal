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
// Kata laluan menjadi cara lalai; kod e-mel untuk kali pertama atau lupa kata laluan.
function prefersPassword() {
  try {
    return localStorage.getItem('aqr.loginMethod') !== 'code';
  } catch {
    return true;
  }
}
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
    [usePassword, setUsePassword] = useState(prefersPassword),
    [password, setPassword] = useState(''),
    [signed, setSigned] = useState(false);
  const pickMethod = (pw: boolean) => {
    setUsePassword(pw);
    setSent(false);
    setMessage('');
    try {
      localStorage.setItem('aqr.loginMethod', pw ? 'password' : 'code');
    } catch {
      // Storan pelayar disekat: pilihan tidak diingati, log masuk tetap berfungsi.
    }
  };
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
  if (demo) {
    // ?demo=1&role=tutor membuka pratonton terus sebagai tutor (demo pembangunan sahaja).
    const tutorDemo = new URLSearchParams(location.search).get('role') === 'tutor';
    return (
      <App
        initial={demoData()}
        demo
        path={location.hash.slice(2) || 'dashboard'}
        role={tutorDemo ? 'tutor' : 'owner'}
        name={tutorDemo ? 'Tutor contoh' : 'Pentadbir contoh'}
      />
    );
  }
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
        {/* Panel jenama (desktop) — gaya dua panel, identiti AQR sendiri. */}
        <aside className="auth-brand" aria-hidden="true">
          <img className="auth-mark" src="brand/aqr-mark.png" alt="" />
          <p className="auth-brand-name">AKADEMI AL-QURAN AR-RIYADH</p>
          <h2>Portal pembelajaran individu</h2>
          <ul>
            <li>Kehadiran dan ulasan setiap kelas</li>
            <li>Laporan bulanan untuk ibu bapa</li>
            <li>Elaun tutor dikira automatik</li>
          </ul>
          <span className="auth-partner">
            <img src="brand/ito-logo.png" alt="" />
            <span>
              Dengan kerjasama
              <b>Islamic Tutor Online</b>
            </span>
          </span>
        </aside>
        <div className="auth-form">
          <span className="auth-mobile-logo" aria-hidden="true">
            <img src="brand/aqr-emblem.png" alt="" />
          </span>
          <p className="eyebrow">AKADEMI AL-QURAN AR-RIYADH</p>
          <h1>Selamat kembali ke AQR</h1>
          <p className="auth-lead">Log masuk untuk melihat kelas, kehadiran dan laporan.</p>
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
                    ? 'Permohonan gagal. Cuba lagi atau hubungi admin.'
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
              {!register && (
                <div className="auth-tabs" role="tablist" aria-label="Cara log masuk">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={usePassword}
                    className={usePassword ? 'active' : ''}
                    onClick={() => pickMethod(true)}
                  >
                    Kata laluan
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!usePassword}
                    className={!usePassword ? 'active' : ''}
                    onClick={() => pickMethod(false)}
                  >
                    Kod e-mel
                  </button>
                </div>
              )}
              {register && (
                <div className="auth-note">
                  Pendaftaran tutor baharu: kami akan hantar kod pengesahan ke e-mel anda.
                </div>
              )}
              <form onSubmit={login}>
                <label>
                  E-mel
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="nama@contoh.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                {usePassword && !register && (
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
                {usePassword && !register && (
                  <p className="auth-hint">
                    Kali pertama log masuk atau lupa kata laluan?{' '}
                    <button type="button" className="auth-link" onClick={() => pickMethod(false)}>
                      Guna kod e-mel
                    </button>
                    , kemudian tetapkan kata laluan di Tetapan.
                  </p>
                )}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={trusted}
                    onChange={(e) => setTrusted(e.target.checked)}
                  />
                  Kekalkan log masuk pada peranti ini
                </label>
                <button className="primary" disabled={busy}>
                  {register
                    ? 'Daftar sebagai tutor'
                    : usePassword
                      ? 'Log masuk'
                      : 'Hantar kod log masuk'}
                </button>
              </form>
              {sent && (
                <form onSubmit={verify} className="auth-code">
                  <label>
                    Kod daripada e-mel
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      required
                    />
                  </label>
                  <button disabled={busy}>Sahkan kod</button>
                </form>
              )}
              <button
                type="button"
                className="auth-switch"
                onClick={() => {
                  // Pendaftaran sentiasa melalui kod e-mel; kembali ke log masuk memulihkan pilihan tersimpan.
                  setUsePassword(register ? prefersPassword() : false);
                  setRegister(!register);
                  setSent(false);
                }}
              >
                {register ? '← Kembali ke log masuk' : 'Tutor baharu? Daftar akaun di sini'}
              </button>
            </>
          )}
          {message && <p role="status">{message}</p>}
          {demoAllowed && (
            <a className="auth-demo" href="?demo=1">
              Lihat demo rekaan
            </a>
          )}
          <p className="footnote">
            Hanya akaun berizin boleh melihat data. Log keluar selepas menggunakan peranti
            berkongsi.
          </p>
        </div>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Root />);
