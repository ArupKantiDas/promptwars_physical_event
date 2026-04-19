import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'GateFlow — Smart Venue Entry',
    template: '%s | GateFlow',
  },
  description:
    'AI-powered gate assignment and real-time wait estimation for large-scale sporting events. Get to your seat faster.',
  keywords: ['venue', 'gate', 'check-in', 'queue', 'stadium', 'AI'],
  robots: { index: false, follow: false }, // Private attendee app
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
