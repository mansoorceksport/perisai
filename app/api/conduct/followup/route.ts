import { NextRequest, NextResponse } from 'next/server';
import { generateContentWithFallback } from '@/lib/gemini';
import { guardModelRoute } from '@/lib/api-guard';
import conductRulesData from '@/data/conduct-rules.json';
import { Language } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    const violations = Array.isArray(body?.violations) ? body.violations : [];
    const lang = (body?.lang === 'en' ? 'en' : 'id') as Language;

    // Verify identity and meter before spending any Gemini quota.
    const guard = await guardModelRoute(req, 'conduct:followup', lang);
    if (!guard.ok) return guard.denied;

    if (!question) {
      return NextResponse.json(
        { error: lang === 'en' ? 'Question cannot be empty.' : 'Pertanyaan tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const rulesContext = conductRulesData.collection_rules
      .map((r) => `- [${r.rule_id}] ${r.title_id}: ${r.description_id} (Dasar: ${r.source})`)
      .join('\n');

    const violationsSummary = violations
      .map((v: any) => `- ${v.title} (${v.citation}): "${v.matched_phrase}"`)
      .join('\n');

    const systemInstruction = `You are a consumer protection legal compliance specialist for Indonesian online lending (pinjol).
A borrower who may currently be experiencing intense pressure and distress is asking you a question about their situation.

GROUNDING RULES:
1. Ground your answer strictly in Indonesian regulatory frameworks (OJK, POJK 22/2023, SEOJK 19/SEOJK.06/2025, UU Perlindungan Data Pribadi No. 27/2022).
2. CITATION DISCIPLINE (absolute): cite ONLY provisions that appear verbatim in the "Rules Reference" or "Case Violations Context" sections of the user message. Never invent, infer, complete, or renumber an article (Pasal), chapter (Bab/Romawi), paragraph (ayat), or circular number. If you cannot support a point with a supplied citation, state the right or step in plain language and cite nothing — an omitted citation is acceptable, a fabricated one is not.
3. Scope: Answer only about legal rights, evidence preservation, communication boundaries, and official reporting steps.
4. REFUSE generic speculative investment or financial advice (e.g. telling them to borrow elsewhere to pay debt).
5. NEVER blame the borrower, never moralize about borrowing, and maintain an empathetic, reassuring, professional tone.
6. Emphasize that threatening harm, accessing unauthorized contacts, or contacting non-borrowers is illegal under Indonesian law.
7. Always mention official contacts: OJK 157 (or WhatsApp 081-157-157-157) and Satgas PASTI (satgaspasti@ojk.go.id).

Language: ${lang === 'en' ? 'English' : 'Indonesian'}.`;

    const prompt = `Case Violations Context:
${violationsSummary || 'No specific violations noted yet.'}

Rules Reference:
${rulesContext}

User Inquiry:
"${question}"

Provide a concise, practical, 2-3 paragraph answer guiding the borrower on safe next steps, evidence preservation, and official recourse.`;

    const { text } = await generateContentWithFallback({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      systemInstruction,
    });

    return NextResponse.json({ answer: text }, { headers: guard.headers });
  } catch (err: any) {
    console.error('Followup error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to generate answer.' },
      { status: 500 }
    );
  }
}
