import type { Metadata } from 'next';
import { Inter_Tight } from 'next/font/google';
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={interTight.variable}>
      <body className={interTight.className}>{children}</body>
    </html>
  );
}
