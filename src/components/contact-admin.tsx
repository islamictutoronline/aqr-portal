import { Dataset } from '@/lib/core';
export function ContactAdmin({ data }: { data: Dataset }) {
  const phone = String(data.organizations[0]?.phone || '');
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return null;
  return (
    <section className="card">
      <h2>Berhubung dengan akademi</h2>
      <p className="footnote">
        Hubungi admin jika anda mempunyai pertanyaan atau mahu membetulkan rekod anak.
      </p>
      <a
        className="button"
        target="_blank"
        rel="noopener noreferrer"
        href={`https://wa.me/${phone.slice(1)}?text=${encodeURIComponent('Assalamualaikum, saya ingin bertanya tentang pembelajaran anak saya di AQR.')}`}
      >
        Hubungi Admin
      </a>
    </section>
  );
}
