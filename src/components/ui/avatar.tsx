const AVATAR_TINTS = ['#f4c9c3', '#f3dcc0', '#e3d5cf', '#f7d3d9', '#ead7c4', '#dccfcf'];

/** Runder Kreis: Profilbild/Logo, sonst Initialen mit sanfter, aus dem Namen abgeleiteter Tönung */
export function Avatar({ name, size = 44, src }: { name: string; size?: number; src?: string | null }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Supabase-Storage-URLs, beliebige Größen
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="flex-none rounded-full bg-card object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const tint = AVATAR_TINTS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_TINTS.length];
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden="true"
      className="grid flex-none place-items-center rounded-full font-semibold tracking-[0.02em] text-ink/80"
      style={{ background: tint, width: size, height: size, fontSize: Math.round(size * 0.31) }}
    >
      {letters || '?'}
    </span>
  );
}
