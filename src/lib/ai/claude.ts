import Anthropic from '@anthropic-ai/sdk';
import { buildTemplateContext, GENERATOR_RULES } from './templates';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

export type ContentType = 'ad_copy' | 'phone_script' | 'video_script' | 'funnel_text' | 'job_posting' | 'creative_brief' | 'vg_leitfaden' | 'follow_up' | 'absage';

export interface OnboardingContext {
  company_name: string | null;
  industry: string | null;
  region: string | null;
  employee_count: string | null;
  hiring_target: number | null;
  hiring_timeframe: string | null;
  experience_required: string | null;
  compensation_model: string | null;
  usps: string | null;
  primary_color: string | null;
  // D2D-specific fields
  job_title: string | null;
  regions: string[] | null;
  radius_km: number | null;
  product: string | null;
  task_type: string | null;
  compensation: string | null;
  commission_per_unit: string | null;
  monthly_earning_from: number | null;
  monthly_earning_to: number | null;
  employment_type: string | null;
  career_levels: string[] | null;
  company_car_from: string | null;
  training_type: string | null;
  client_nameable: boolean;
  client_name: string | null;
  extras: string[] | null;
  experience_needed: boolean;
  drivers_license_needed: boolean;
  start_date: string | null;
  career_page_url: string | null;
  tone: string | null;
  contact_name: string | null;
  contact_phone?: string | null;
}

/**
 * Build a system prompt for content generation using the template database.
 *
 * The template system provides:
 * - GENERATOR_RULES: Hard rules that apply to ALL generated content
 * - Angle-specific templates for ad copy (3 angles, 10 total variants)
 * - Filled templates for phone scripts, funnels, VG guides, etc.
 * - Branch-specific context when available
 */
export function buildSystemPrompt(type: ContentType, ctx: OnboardingContext): string {
  const preamble = `Du bist ein Experte für D2D-Recruiting-Content. Du generierst professionelle, conversion-optimierte Inhalte für Vertriebs-Recruiting im Door-to-Door-Bereich.

${GENERATOR_RULES}

`;

  const templateContext = buildTemplateContext(type, ctx);

  return preamble + templateContext;
}

export async function generateContent(
  type: ContentType,
  context: OnboardingContext,
  previousVersion?: string,
  feedback?: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(type, context);

  let userMessage = `Generiere den Content jetzt.`;
  if (previousVersion && feedback) {
    userMessage = `Hier ist die vorherige Version:\n\n${previousVersion}\n\nFeedback: ${feedback}\n\nBitte überarbeite den Content basierend auf dem Feedback.`;
  }

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text || '';
}

export async function chatWithClaude(
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt: string
): Promise<string> {
  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text || '';
}
