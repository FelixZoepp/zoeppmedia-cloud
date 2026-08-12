import OpenAI from 'openai';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }
  return _openai;
}

export async function transcribeAudio(audioBuffer: Buffer, fileName: string): Promise<string> {
  const openai = getOpenAI();

  // Create a File object from the buffer
  const uint8 = new Uint8Array(audioBuffer);
  const file = new File([uint8], fileName, {
    type: getMimeType(fileName),
  });

  const response = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'de',
    response_format: 'text',
  });

  return response as unknown as string;
}

function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    m4a: 'audio/m4a',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  };
  return mimeMap[ext || ''] || 'audio/mpeg';
}
