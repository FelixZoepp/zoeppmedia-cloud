import { AppInstallierenClient } from './app-installieren-client';

export const metadata = { title: 'Cloud aufs Handy' };

/** Anleitung: Cloud als App aufs Handy + Benachrichtigungen bei neuen Bewerbern (für alle Rollen, liegt im Portal-Layout) */
export default async function AppInstallierenPage({ searchParams }: { searchParams: Promise<{ nach?: string }> }) {
  const { nach } = await searchParams;
  return <AppInstallierenClient nachOnboarding={nach === 'onboarding'} />;
}
