import { GoogleGenAI } from '@google/genai';

// Ordered model candidate list for resilient fallback (Directive 6)
export const MODEL_CANDIDATES = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-pro-preview',
];

let genAIInstance: GoogleGenAI | null = null;

/**
 * Two backends, chosen by environment.
 *
 * Enterprise (Vertex AI) is preferred in deployment: the runtime service
 * account authenticates through Application Default Credentials, so there is
 * no API key to store, rotate, leak or expire. Cloud Run supplies the
 * credentials; nothing secret enters the image, the repo or Secret Manager.
 *
 * The Gemini API key path remains for local development, where ADC is usually
 * not configured.
 *
 * `GOOGLE_GENAI_USE_ENTERPRISE` is the name @google/genai 2.x reads, and it
 * takes precedence over the older `GOOGLE_GENAI_USE_VERTEXAI`; both are
 * accepted here so either spelling works. Project and location come from
 * `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`, which the SDK reads
 * itself — passing an apiKey alongside them is rejected by the SDK, so the two
 * constructions must stay separate.
 */
function envFlag(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  return /^(true|1|yes)$/i.test(raw.trim());
}

export function usesEnterpriseBackend(): boolean {
  return (
    envFlag('GOOGLE_GENAI_USE_ENTERPRISE') ?? envFlag('GOOGLE_GENAI_USE_VERTEXAI') ?? false
  );
}

export function getGenAI(): GoogleGenAI {
  if (genAIInstance) return genAIInstance;

  if (usesEnterpriseBackend()) {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      throw new Error(
        'GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_ENTERPRISE is set. Configure it in your deployment settings.'
      );
    }
    // No apiKey: credentials come from ADC (the Cloud Run service account).
    genAIInstance = new GoogleGenAI({});
    return genAIInstance;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'No Gemini backend configured. Set GOOGLE_GENAI_USE_ENTERPRISE=true with GOOGLE_CLOUD_PROJECT for Vertex AI, or GEMINI_API_KEY for the Gemini API.'
    );
  }
  genAIInstance = new GoogleGenAI({ apiKey });
  return genAIInstance;
}

export interface FallbackGenerateOptions {
  contents: string | Array<Record<string, unknown>>;
  systemInstruction?: string;
  responseMimeType?: string;
}

export async function generateContentWithFallback(
  options: FallbackGenerateOptions
): Promise<{ text: string; modelUsed: string }> {
  const ai = getGenAI();
  let lastError: unknown = null;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: options.contents as any,
        config: {
          systemInstruction: options.systemInstruction,
          responseMimeType: options.responseMimeType,
        },
      });

      const responseText = response.text;
      if (responseText) {
        return {
          text: responseText,
          modelUsed: modelName,
        };
      }
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code || err?.response?.status;
      const message = String(err?.message || '');
      
      // Advance to the next candidate model on 503, 429, 404, 500 or network timeouts
      const isRecoverable =
        status === 503 ||
        status === 429 ||
        status === 404 ||
        status === 500 ||
        message.includes('503') ||
        message.includes('429') ||
        message.includes('quota') ||
        message.includes('ResourceExhausted');

      console.warn(
        `Model ${modelName} encountered error (status: ${status}). Recoverable: ${isRecoverable}. Advancing if possible. Error:`,
        message
      );

      if (!isRecoverable && !message.includes('not found') && !message.includes('overloaded')) {
        // If it's a fatal validation or syntax error, still try the next model once before giving up
      }
    }
  }

  throw new Error(
    `All Gemini model candidates failed. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
