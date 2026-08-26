import type { Metadata, Viewport } from 'next';
import { Inter_Tight } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter-tight',
});

export const metadata: Metadata = {
  title: 'Zoepp Media Cloud',
  description: 'Bewerber-Management für D2D-Agenturen',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Zoepp Cloud',
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#DC2626',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={interTight.variable}>
      <body className={interTight.className}>
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
