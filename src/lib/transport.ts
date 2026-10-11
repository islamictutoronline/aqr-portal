// The existing Next.js build uses same-origin APIs. The Pages entry installs a
// Supabase transport; both builds reuse the same UI and validated operations.
type Transport = (input: string, init?: RequestInit) => Promise<Response>;
let transport: Transport | undefined;
export function installTransport(next: Transport) {
  transport = next;
}
export const isStatic = () => Boolean(transport);
export function apiFetch(input: string, init?: RequestInit) {
  return transport ? transport(input, init) : fetch(input, init);
}
export function navigatePath(path: string, demo: boolean) {
  if (isStatic())
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${demo ? '?demo=1' : ''}#/${path}`,
    );
  else window.history.replaceState(null, '', `${demo ? '/demo' : ''}/${path}`);
}
export function loginPath() {
  return isStatic() ? window.location.pathname : '/login';
}
export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Laluan aset awam: relatif pada GitHub Pages (subfolder repo), mutlak pada binaan Next.js.
export function assetUrl(path: string) {
  return isStatic() ? path : `/${path}`;
}
