import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
