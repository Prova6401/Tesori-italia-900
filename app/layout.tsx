import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "Tesori Italia '900s",
  description: "Catalogo prodotti Tesori Italia '900s, veloce e ricercabile da CSV.",
  generator: 'v0.app',
icons: {
  icon: [{ url: 'https://raw.githubusercontent.com/Prova6401/Tesori-italia-900/main/public/logo.jpg', type: 'image/jpeg' }],
  apple: 'https://raw.githubusercontent.com/Prova6401/Tesori-italia-900/main/public/logo.jpg',
 },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#151517' },
  ],
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className="bg-background">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
