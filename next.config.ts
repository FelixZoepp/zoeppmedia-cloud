import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sicherheits-Header. Öffentliche Seiten (Bewerbung, Buchung, Termin, Gespräch, Karriereseite /k, Video)
  // dürfen weiter eingebettet werden, z. B. auf Karriereseiten der Kunden – alles andere nicht (Clickjacking).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/:path((?!apply|book|termin|gespraech|k/|video/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  // Alte Aufgaben-Systeme → neues Ablauf-System (Meine Aufgaben / Deine Aufgaben)
  async redirects() {
    return [
      { source: '/heute', destination: '/meine-todos', permanent: false },
      { source: '/meine-aufgaben', destination: '/meine-todos', permanent: false },
      { source: '/meine-aufgaben-portal', destination: '/meine-todos', permanent: false },
      { source: '/admin/freigaben', destination: '/meine-todos', permanent: false },
      { source: '/status', destination: '/deine-aufgaben', permanent: false },
      { source: '/clients/:id/sop', destination: '/clients/:id/ablauf', permanent: false },
      { source: '/clients/:id/fulfillment', destination: '/clients/:id/ablauf', permanent: false },
    ];
  },
};

export default nextConfig;
