'use client';
import { apiFetch } from '@/lib/transport';
import { useEffect, useState } from 'react';
export function GoogleStatus({ demo }: { demo: boolean }) {
  const [status, setStatus] = useState('Memeriksa sambungan…');
  useEffect(() => {
    if (demo) return;
    let active = true;
    apiFetch('/api/google/status', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((j) => {
        if (active)
          setStatus(
            j.connected
              ? 'Akaun Google disambungkan'
              : j.configured
                ? 'OAuth tersedia · akaun belum disambungkan'
                : 'Kredensial Google belum dikonfigurasi',
          );
      })
      .catch(() => {
        if (active) setStatus('Status Google tidak tersedia untuk peranan ini');
      });
    return () => {
      active = false;
    };
  }, [demo]);
  return (
    <p className="inline-note" role="status">
      {demo ? 'Demo · sambungan Google tidak diaktifkan' : status}
    </p>
  );
}
