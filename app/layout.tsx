import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Perisai — Alat Bantu Kepatuhan & Perlindungan Pinjol',
  description: 'Perisai membantu masyarakat memeriksa izin pinjol, menghitung batas bunga resmi OJK, dan menganalisis pesan penagihan.',
  openGraph: {
    title: 'Perisai — Alat Bantu Kepatuhan & Perlindungan Pinjol',
    description: 'Perisai membantu masyarakat memeriksa izin pinjol, menghitung batas bunga resmi OJK, dan menganalisis pesan penagihan.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Perisai — Perlindungan Konsumen Pinjol',
    description: 'Pemeriksaan izin OJK, batas bunga, dan analisis pesan penagihan pinjol.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
