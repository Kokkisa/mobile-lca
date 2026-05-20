/**
 * whisper.ts — Groq Whisper transcription client.
 *
 * Groq exposes an OpenAI-compatible /audio/transcriptions endpoint, so
 * we can speak the same FormData shape. We use whisper-large-v3-turbo
 * because it's the fastest model Groq offers and quality is plenty for
 * conversational audio.
 *
 * Never throws — the live-call loop has to keep running even if one
 * chunk fails to transcribe (network blip, 429, malformed audio, etc.).
 * Errors are logged and an empty string is returned so callers can
 * decide whether to swallow or display.
 */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';

/**
 * Whisper detects format from the file extension, not the MIME type or
 * actual bytes. So even though the Blob carries a correct `type`, we
 * still have to attach a filename whose suffix matches the container —
 * otherwise the API rejects with "unsupported file type".
 */
function filenameFor(blob: Blob): string {
  const t = blob.type.toLowerCase();
  if (t.includes('webm')) return 'chunk.webm';
  if (t.includes('mp4')) return 'chunk.m4a'; // Safari's audio/mp4 ⇒ .m4a
  if (t.includes('mpeg') || t.includes('mp3')) return 'chunk.mp3';
  if (t.includes('wav')) return 'chunk.wav';
  if (t.includes('ogg')) return 'chunk.ogg';
  return 'chunk.webm';
}

export async function transcribeChunk(blob: Blob, apiKey: string): Promise<string> {
  if (!apiKey) {
    console.warn('[whisper] no api key — skipping');
    return '';
  }
  if (!blob || blob.size === 0) {
    console.warn('[whisper] empty blob — skipping');
    return '';
  }

  try {
    const form = new FormData();
    form.append('file', blob, filenameFor(blob));
    form.append('model', MODEL);
    form.append('response_format', 'json');

    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        // Do NOT set Content-Type — the browser must compute the
        // multipart boundary itself, and setting it manually breaks
        // the request.
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[whisper] HTTP ${res.status} ${res.statusText}`, errText);
      return '';
    }

    const data = (await res.json()) as { text?: string };
    return (data.text ?? '').trim();
  } catch (e) {
    console.error('[whisper] request failed:', e);
    return '';
  }
}
