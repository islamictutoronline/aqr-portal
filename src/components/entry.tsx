import { redirect } from 'next/navigation';
import { App } from './app';
import { demoData } from '@/lib/demo';
import { configured } from '@/lib/server/supabase';
import { context, loadData, AccessError } from '@/lib/server/access';
export async function Entry({
  path = 'dashboard',
  demo = false,
}: {
  path?: string;
  demo?: boolean;
}) {
  if (
    demo ||
    process.env.DEMO_MODE === 'true' ||
    (!configured() && process.env.NODE_ENV !== 'production')
  )
    return <App initial={demoData()} demo path={path} role="owner" name="Pentadbir contoh" />;
  if (!configured()) redirect('/login');
  let ctx;
  try {
    ctx = await context();
  } catch (e) {
    if (e instanceof AccessError) redirect('/login');
    throw e;
  }
  return (
    <App
      initial={await loadData(ctx)}
      demo={false}
      path={path}
      role={ctx.role}
      name={ctx.name}
      staffId={ctx.staffId ?? undefined}
      guardianId={ctx.guardianId ?? undefined}
    />
  );
}
