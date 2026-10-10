'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading">
      <h1>Rekod tidak dapat dimuatkan</h1>
      <p>Semak sambungan atau konfigurasi pangkalan data.</p>
      <button onClick={reset}>Cuba semula</button>
    </main>
  );
}
