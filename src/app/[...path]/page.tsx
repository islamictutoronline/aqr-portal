import { Entry } from '@/components/entry';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return <Entry path={path.join('/')} />;
}
