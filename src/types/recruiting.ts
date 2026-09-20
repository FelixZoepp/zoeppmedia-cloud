/**
 * Recruiting module types, mirrored from SQL schema (20260921000002_jobs_applications.sql)
 */

/**
 * Job posting with status, employment terms, and Indeed integration
 */
export interface Job {
  id: string;
  agency_id: string;
  title: string;
  slug: string;
  description: string | null;
  location: string | null;
  postal_code: string | null;
  employment_type: string | null;
  salary_range: string | null;
  contact_user_id: string | null;
  status: 'draft' | 'active' | 'paused' | 'closed';
  external_ref: string | null;
  indeed_enabled: boolean;
  indeed_mode: 'apply' | 'redirect' | 'off';
  apply_url: string | null;
  bot_config_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Application of a candidate for a job
 */
export interface Application {
  id: string;
  agency_id: string;
  candidate_id: string;
  job_id: string;
  stage_id: string | null;
  source: string;
  source_ref: string | null;
  campaign: Record<string, unknown> | null;
  status: 'open' | 'hired' | 'rejected' | 'withdrawn' | 'not_reached';
  score: number | null;
  score_label: 'A' | 'B' | 'C' | null;
  score_reasons: Record<string, unknown> | null;
  summary: string | null;
  assigned_to: string | null;
  applied_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Answer to a screening question in an application
 */
export interface ApplicationAnswer {
  id: string;
  agency_id: string;
  application_id: string;
  question_key: string;
  question_text: string | null;
  answer_raw: string | null;
  answer_normalized: Record<string, unknown> | null;
  origin: 'indeed' | 'bot' | 'form';
  created_at: string;
}

/**
 * Pipeline stage with type classification for reporting
 */
export interface PipelineStageTyped {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  agency_id: string | null;
  stage_type: 'new' | 'qualifying' | 'qualified' | 'interview' | 'offer' | 'hired' | 'rejected' | null;
}
