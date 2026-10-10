import { Entry } from '@/components/entry';
export const dynamic = 'force-dynamic';
export default async function Demo({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  return <Entry demo path={path?.join('/') || 'dashboard'} />;
}
