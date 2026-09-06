import { NextRequest, NextResponse } from 'next/server';
import { generateContentWithFallback } from '@/lib/gemini';
import { guardModelRoute } from '@/lib/api-guard';
import { Language } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const lenderName = typeof body?.lender_name === 'string' ? body.lender_name.trim() : 'Penyelenggara Pinjaman Online Terkait';
    const lenderStatus = typeof body?.lender_status === 'string' ? body.lender_status : 'TIDAK TERDAFTAR / BLOKIR';
    const violations = Array.isArray(body?.violations) ? body.violations : [];
    const evidenceText = typeof body?.evidence_text === 'string' ? body.evidence_text.trim() : '';
    const remedy = typeof body?.remedy === 'string' ? body.remedy.trim() : 'Penghentian penagihan melawan hukum, penghapusan denda liar, dan penindakan tegas sesuai aturan OJK';
    const lang = (body?.lang === 'en' ? 'en' : 'id') as Language;

    // Verify identity and meter before spending any Gemini quota.
    const guard = await guardModelRoute(req, 'complaint:draft', lang);
    if (!guard.ok) return guard.denied;

    const todayStr = new Date().toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const isIllegal = lenderStatus.toUpperCase().includes('BLOKIR') || lenderStatus.toUpperCase().includes('ILEGAL');
    const recipientAgency = isIllegal
      ? 'Sekretariat Satgas Pemberantasan Aktivitas Keuangan Ilegal (Satgas PASTI) — Otoritas Jasa Keuangan'
      : 'Direktorat Pelayanan Konsumen — Otoritas Jasa Keuangan (OJK 157)';

    const violationsList = violations
      .map((v: any, i: number) => `${i + 1}. ${v.title} (${v.citation})\n   Bukti temuan: "${v.matched_phrase || v.explanation}"`)
      .join('\n');

    let draftLetter = '';

    try {
      const systemInstruction = `You are a legal drafter helping an Indonesian citizen prepare an official complaint to Indonesian authorities (OJK / Satgas PASTI).
Draft a formal, legally structured, respectful complaint letter in Indonesian.
Include clear placeholders [NAMA PELAPOR], [NOMOR TELEPON/WHATSAPP], [NOMOR KTP] so the user can easily review or personalize it.
CITATION DISCIPLINE (absolute):
Cite ONLY the statutory provisions supplied under "Pelanggaran Ditemukan" in the user message, and reproduce each one verbatim as given.
Never invent, infer, complete, renumber, or "correct" an article (Pasal), chapter (Bab/Romawi), paragraph (ayat), or circular number, and never add a provision that was not supplied to you.
If a point has no supplied citation, describe the conduct plainly and cite nothing. An omitted citation is acceptable; a fabricated one is not — this letter is filed with a regulator.
Keep the tone polite, firm, and factual.`;

      const prompt = `Data for Complaint:
Tanggal: ${todayStr}
Penerima: ${recipientAgency}
Nama Terlapor: ${lenderName}
Status Terlapor: ${lenderStatus}
Pelanggaran Ditemukan:
${violationsList || '- Penagihan intimidatif dan indikasi pelanggaran batas operasional.'}
Kutipan Bukti Pesan:
"${evidenceText.slice(0, 500) || '[Terlampir tangkapan layar chat/SMS]'}"
Tuntutan Pelapor:
${remedy}

Generate the full formal complaint letter now.`;

      const { text } = await generateContentWithFallback({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        systemInstruction,
      });

      draftLetter = text;
    } catch (aiErr) {
      console.warn('Gemini complaint drafting fallback to standard legal template:', aiErr);
      
      draftLetter = `Jakarta, ${todayStr}

Hal: Pengaduan Dugaan Pelanggaran Penyelenggaraan dan Penagihan Pinjaman Online
Lampiran: Bukti tangkapan layar (screenshot) dan data transaksi

Kepada Yth.
${recipientAgency}
Gedung Soemitro Djojohadikusumo, Kompleks Perkantoran OJK
Jl. Lapangan Banteng Timur 2-4, Jakarta Pusat 10710

Dengan hormat,

Saya yang bertanda tangan di bawah ini:
Nama Lengkap      : [NAMA LENGKAP KONSUMEN]
Nomor KTP/NIK     : [NOMOR KTP]
Nomor Telepon/WA  : [NOMOR TELEPON AKTIF]
Alamat Email      : [ALAMAT EMAIL KONSUMEN]

Dengan ini mengajukan pengaduan resmi terhadap:
Nama Platform/PT  : ${lenderName}
Status Legalitas  : ${lenderStatus}

Adapun kronologi dan bentuk pelanggaran yang dialami adalah sebagai berikut:
${violationsList || '1. Penagihan menggunakan cara intimidatif dan tidak sesuai ketentuan etika.'}

Bukti Kutipan Pesan Penagihan:
"${evidenceText.slice(0, 300) || '[Terlampir pada berkas screenshot]'}"

Berdasarkan ketentuan Pasal 62 ayat (2) POJK No. 22/2023 serta SEOJK No. 19/SEOJK.06/2025, tindakan penagihan dengan ancaman, intimidasi, kekerasan, atau kontak pihak ketiga di luar peminjam adalah perbuatan yang dilarang keras.

Tuntutan / Permohonan:
1. Menindaklanjuti laporan ini dan memanggil/menindak platform yang bersangkutan.
2. ${remedy}
3. Menjamin perlindungan data pribadi pelapor dari penyebaran tanpa hak.

Demikian surat pengaduan ini saya sampaikan dengan sebenar-benarnya untuk dapat ditindaklanjuti sebagaimana mestinya. Atas perhatian dan perlindungan yang diberikan, saya ucapkan terima kasih.

Hormat saya,


[Tanda Tangan & Nama Lengkap Pelapor]`;
    }

    const submissionChannels = [
      {
        name: 'Satgas PASTI (Satgas Waspada Investasi & Pinjol Ilegal)',
        contact: 'satgaspasti@ojk.go.id',
        method: 'Email dengan subjek: [Laporan Pinjol] - ' + lenderName,
      },
      {
        name: 'Kontak OJK 157 (Konsumen OJK)',
        contact: 'konsumen@ojk.go.id',
        method: 'Email resmi pengaduan konsumen jasa keuangan',
      },
      {
        name: 'WhatsApp Resmi OJK 157',
        contact: '081-157-157-157',
        method: 'Kirim chat format pengaduan & lampirkan bukti',
      },
    ];

    return NextResponse.json({
      recipient_agency: recipientAgency,
      lender_name: lenderName,
      lender_status: lenderStatus,
      violations,
      remedy_requested: remedy,
      draft_text: draftLetter,
      submission_channels: submissionChannels,
    }, { headers: guard.headers });
  } catch (err: any) {
    console.error('Complaint draft error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to generate complaint draft.' },
      { status: 500 }
    );
  }
}
