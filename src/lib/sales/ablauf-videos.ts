/** Videos „So läuft das Gespräch ab“ (Supabase-Storage, öffentlich) – für Videoseite und Terminseite */
export const VIDEO_BASIS = 'https://qfzqoxeocyuqfreihiok.supabase.co/storage/v1/object/public/videos';

export const ABLAUF_VIDEO: Record<'setting' | 'beratung', { datei: string; titel: string }> = {
  setting: { datei: 'erstgespraech.mp4', titel: 'So läuft dein Erstgespräch ab' },
  beratung: { datei: 'strategiegespraech.mp4', titel: 'So läuft dein Strategiegespräch ab' },
};

export const ablaufVideoUrl = (art: 'setting' | 'beratung') => `${VIDEO_BASIS}/${ABLAUF_VIDEO[art].datei}`;
