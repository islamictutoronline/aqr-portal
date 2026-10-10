# Panduan menyambung projek AQR

Baca [konteks serahan agen](docs/AGENT_HANDOFF.md) dan [status pelaksanaan](docs/PROGRESS.md) sebelum menyambung kerja. Rujuk `README.md`, `docs/ARCHITECTURE.md` dan `docs/ASSUMPTIONS.md` untuk persediaan serta keputusan projek.

**Keperluan terkini:** [docs/REQUIREMENTS_FINAL.md](docs/REQUIREMENTS_FINAL.md) mengatasi spesifikasi lama yang bercanggah. Parent Portal wajib kekal dan baca sahaja. Hosting utama ialah GitHub Pages + Supabase. PDF contoh hanya rujukan ciri/susun atur; jangan import data peribadinya. Panduan binaan statik ada dalam [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md).

Sambung kod sedia ada; jangan bina semula dari kosong. Semak arahan pengguna terkini dan keadaan fail sebenar kerana serahan mungkin sudah lama. Kekalkan sumber peribadi di luar fixture/repo awam, jangan reset data, dan bezakan bukti ujian setempat daripada integrasi cloud yang belum diuji. Kemas kini fail serahan serta kemajuan selepas perubahan penting atau sebelum berhenti.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
