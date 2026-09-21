import { describe, it, expect } from 'vitest';
import { buildQuestions } from '@/app/api/indeed/questions/[job_id]/route';

describe('buildQuestions', () => {
  it('enthält Pflichtfragen Telefon und WhatsApp-Einwilligung', () => {
    const q = buildQuestions();
    const ids = q.questions.map((x) => x.id);
    expect(ids).toContain('phone');
    expect(ids).toContain('consent_whatsapp');
    expect(q.questions.every((x) => x.required)).toBe(true);
  });
});
