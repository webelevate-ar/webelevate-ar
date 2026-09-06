import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sistema de ventas',
  description: 'Punto de venta para autoservicio y minimercado.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0e13',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR" className={GeistSans.variable}>
      <body className="min-h-screen bg-fondo text-texto antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
