'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { surahs } from '@/lib/quran';

// Ejaan dipermudah untuk padanan: "Al-Mulk" → "mulk", "Ali 'Imran" → "aliimran", "An-Nisa'" → "nisa".
const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^(al|an|ar|as|asy|at|az|ad|adh)[-\s]/, '')
    .replace(/[^a-z0-9]/g, '');
const index = surahs.map(([name, ayahs], i) => ({
  no: i + 1,
  name,
  ayahs,
  key: plain(name),
  full: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
}));
const labelOf = (no?: number) => (no ? `${no}. ${surahs[no - 1][0]}` : '');

// Carian surah: taip sebahagian nama atau nombor; senarai cadangan muncul semasa menaip.
export function SurahPicker({
  value,
  onChange,
  disabled,
  required,
}: {
  value?: number;
  onChange: (surah: number | undefined) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const query = text ?? '';
  const matches = useMemo(() => {
    const q = plain(query);
    const full = query.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!q && !full) return index.slice(0, 8);
    if (/^\d+$/.test(full)) return index.filter((s) => String(s.no).startsWith(full)).slice(0, 8);
    const starts = index.filter((s) => s.key.startsWith(q) || s.full.startsWith(full));
    const contains = index.filter(
      (s) => !starts.includes(s) && (s.key.includes(q) || s.full.includes(full)),
    );
    return [...starts, ...contains].slice(0, 8);
  }, [query]);
  const choose = (no: number) => {
    onChange(no);
    setText(null);
    setOpen(false);
  };
  return (
    <div className="surah-picker">
      <span aria-hidden="true">
        Surah{' '}
        {required && (
          <small className="req" title="Wajib diisi">
            *
          </small>
        )}
      </span>
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-label="Surah"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${id}-${matches[active].no}` : undefined}
        autoComplete="off"
        placeholder="Taip nama atau no. surah"
        disabled={disabled}
        value={text ?? labelOf(value)}
        onFocus={(e) => {
          setOpen(true);
          setActive(0);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          if (!e.target.value.trim()) onChange(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && matches[active]) {
            e.preventDefault();
            choose(matches[active].no);
          } else if (e.key === 'Escape') {
            setText(null);
            setOpen(false);
          }
        }}
        onBlur={() => {
          // Teks yang tepat sepadan satu surah dipilih; jika tidak, kekalkan pilihan sebelumnya.
          if (text !== null && matches.length === 1) onChange(matches[0].no);
          setText(null);
          setOpen(false);
        }}
      />
      {open && !disabled && (
        <ul className="surah-options" id={`${id}-list`} role="listbox" aria-label="Cadangan surah">
          {matches.length ? (
            matches.map((s, i) => (
              <li
                key={s.no}
                id={`${id}-${s.no}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : ''}
                // mousedown supaya pilihan berlaku sebelum input kehilangan fokus.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s.no);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <strong>{s.no}.</strong> {s.name} <small>{s.ayahs} ayat</small>
              </li>
            ))
          ) : (
            <li className="empty" aria-disabled="true">
              Tiada surah sepadan
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
