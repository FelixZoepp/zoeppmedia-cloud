import { redirect } from 'next/navigation';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { LayoutShell } from '@/components/layout-shell';
import { PushManager } from '@/components/push-manager';
import { DealFeier } from '@/components/deal-feier';
import { BereichTabs } from '@/components/bereich-tabs';
import { aktiveAnsicht, ANSICHTEN } from '@/lib/ansicht';
import { SopAufnahmeKnopf } from '@/components/akademie/sop-aufnahme-knopf';
import { HilfeLeiste } from '@/components/akademie/hilfe-leiste';
import { darfAufnehmen } from '@/lib/akademie/aufnahme';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isInternal(user.role)) redirect('/dashboard');

  // Unabhängige Schritte parallel (früher nacheinander – jeder Klick wartete auf alle)
  const supabase = await createServerClient();
  const [ansicht, aufnahmeErlaubt, { data: aal }] = await Promise.all([
    aktiveAnsicht(user),
    // „SOP aufnehmen“: Admins immer, Mitarbeiter nur wenn in der Akademie freigeschaltet
    darfAufnehmen(createAdminClient(), user).catch(() => false),
    // 2FA-Stufe aus der Sitzung (lokal, ohne Netzwerkaufruf); nextLevel aal2 = verifizierter Faktor vorhanden
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  // --- 2FA Admin-Gate (env-gated) ---
  // Hard-gate: wenn REQUIRE_ADMIN_2FA=true und Nutzer noch auf aal1 → redirect
  if (
    process.env.REQUIRE_ADMIN_2FA === 'true' &&
    aal?.nextLevel === 'aal2' &&
    aal.currentLevel !== 'aal2'
  ) {
    redirect('/login');
  }

  // Soft-banner: kein Flag gesetzt, aber kein verified Faktor → dezenter Hinweis
  const hasVerifiedTotp = aal?.nextLevel === 'aal2';
  const showBanner =
    process.env.REQUIRE_ADMIN_2FA !== 'true' && user.role === 'admin' && !hasVerifiedTotp;

  return (
    <LayoutShell
      user={{
        name: user.name,
        email: user.email,
        // Demo-Ansicht: Menü und Startpunkte wie der gewählte Bereich (Rechte bleiben Admin)
        role: ansicht && ansicht !== 'kunde' ? 'employee' : user.role,
        avatar_url: user.avatar_url ?? null,
        funktion: ansicht && ansicht !== 'kunde' ? ANSICHTEN[ansicht].funktion : (user.funktion ?? null),
        istAdmin: user.role === 'admin',
        vorschau: ansicht ? ANSICHTEN[ansicht].label : null,
      }}
    >
      {showBanner && (
        <div className="mb-5 w-full rounded-xl bg-amber-50 px-5 py-3 text-[13px] text-amber-800 flex items-center gap-2 shadow-[inset_0_0_0_1px_#fde68a]">
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
      {user.role === 'admin' && !ansicht && <BereichTabs />}
      {children}
      {aufnahmeErlaubt && <SopAufnahmeKnopf />}
      <HilfeLeiste />
      <PushManager />
      <DealFeier />
    </LayoutShell>
  );
}
