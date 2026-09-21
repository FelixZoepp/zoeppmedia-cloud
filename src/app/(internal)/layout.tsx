import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/app-sidebar';
import { LayoutShell } from '@/components/layout-shell';
import { PushManager } from '@/components/push-manager';

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isInternal(user.role)) redirect('/dashboard');

  // --- 2FA Admin-Gate (env-gated) ---
  const supabase = await createServerClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  // Hard-gate: wenn REQUIRE_ADMIN_2FA=true und Nutzer noch auf aal1 → redirect
  if (
    process.env.REQUIRE_ADMIN_2FA === 'true' &&
    aal?.nextLevel === 'aal2' &&
    aal.currentLevel !== 'aal2'
  ) {
    redirect('/login');
  }

  // Soft-banner: kein Flag gesetzt, aber kein verified Faktor → dezenter Hinweis
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = factors?.totp?.some((f) => f.status === 'verified') ?? false;
  const showBanner =
    process.env.REQUIRE_ADMIN_2FA !== 'true' && !hasVerifiedTotp;

  return (
    <LayoutShell sidebar={<AppSidebar role={user.role} userName={user.name} />}>
      {showBanner && (
        <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>
            Aktiviere 2FA in den{' '}
            <a href="/settings" className="underline font-medium hover:text-amber-900">
              Einstellungen
            </a>{' '}
            — für Admin-Konten wird sie bald Pflicht.
          </span>
        </div>
      )}
      {children}
      <PushManager />
    </LayoutShell>
  );
}
