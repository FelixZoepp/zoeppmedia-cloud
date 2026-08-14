export type UserRole = 'admin' | 'employee' | 'agency_owner' | 'agency_member';

export type Agency = {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  has_video_shoot: boolean;
  reels_per_month: number;
  created_at: string;
};

export type InviteToken = {
  id: string;
  agency_id: string;
  token: string;
  email: string;
  expires_at: string;
  redeemed: boolean;
  created_at: string;
  email_sent_at: string | null;
};

export type User = {
  id: string;
  agency_id: string;
  email: string;
  name: string;
  role: UserRole;
  position: string | null;
  avatar_url: string | null;
  calendly_link: string | null;
  phone: string | null;
  last_login: string | null;
  created_at: string;
};

export interface EmployeeInvite {
  id: string;
  email: string;
  name: string;
  position: string | null;
  token: string;
  expires_at: string;
  redeemed: boolean;
  created_by: string | null;
  created_at: string;
}

export type PipelineStage = {
  id: string;
  name: string;
  sort_order: number;
  color: string;
};

export type Candidate = {
  id: string;
  agency_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: 'meta' | 'indeed' | 'manual';
  meta_campaign: string | null;
  meta_adset: string | null;
  meta_form: string | null;
  current_stage_id: string;
  created_at: string;
  // Indeed / resume fields
  resume_url: string | null;
  location: string | null;
  experience_summary: string | null;
  last_employer: string | null;
  indeed_job_title: string | null;
};

export type CandidateStage = {
  id: string;
  candidate_id: string;
  stage_id: string;
  changed_by: string | null;
  changed_at: string;
};

export type Note = {
  id: string;
  candidate_id: string;
  user_id: string;
  text: string;
  created_at: string;
};

export type TeamMember = {
  id: string;
  user_id: string;
  name: string;
  position: string | null;
  created_at: string;
};

export type EmployeeAssignment = {
  id: string;
  employee_id: string;
  agency_id: string;
  created_at: string;
};

// Phase 2: Onboarding + Fulfillment

export type FulfillmentStatus = 'pending' | 'in_progress' | 'review' | 'done' | 'skipped';

export type OnboardingSubmission = {
  id: string;
  agency_id: string;
  status: 'pending' | 'in_progress' | 'completed';
  company_name: string | null;
  industry: string | null;
  region: string | null;
  employee_count: string | null;
  website_url: string | null;
  hiring_target: number | null;
  hiring_timeframe: string | null;
  experience_required: string | null;
  compensation_model: string | null;
  logo_url: string | null;
  primary_color: string | null;
  team_photos: string[];
  usps: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  preferred_contact_time: string | null;
  meta_access_steps: Record<string, unknown>;
  has_video_shoot: boolean;
  reels_per_month: number;
  created_at: string;
  updated_at: string;
  // D2D-specific fields
  job_title: string | null;
  regions: string[] | null;
  radius_km: number | null;
  product: 'pv' | 'glasfaser' | 'strom_gas' | 'telko' | 'versicherung' | null;
  task_type: 'leads_only' | 'contract_close' | null;
  compensation: 'pure_commission' | 'commission_guarantee' | 'fixed_commission' | null;
  commission_per_unit: string | null;
  monthly_earning_from: number | null;
  monthly_earning_to: number | null;
  employment_type: 'self_employed' | 'employed' | null;
  career_levels: string[] | null;
  company_car_from: string | null;
  training_type: 'one_on_one' | 'video_course' | 'mentor' | 'learning_by_doing' | null;
  client_nameable: boolean;
  client_name: string | null;
  extras: string[] | null;
  experience_needed: boolean;
  drivers_license_needed: boolean;
  start_date: string | null;
  career_page_url: string | null;
  tone: 'du' | 'sie';
};

export type RecurringTaskKey = 'indeed_restart' | 'creatives_test' | 'reels_create' | 'video_shoot_plan';
export type RecurringTrigger = 'schedule' | 'problem' | 'manual';

export interface RecurringFulfillmentTask {
  id: string;
  agency_id: string;
  task_key: RecurringTaskKey;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'skipped';
  due_date: string | null;
  assigned_to: string | null;
  triggered_by: RecurringTrigger | null;
  problem_id: string | null;
  completed_at: string | null;
  created_at: string;
}

export type FulfillmentTask = {
  id: string;
  agency_id: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  task_type: 'perspective_funnel' | 'ad_copy' | 'script' | 'meta_campaign' | 'other' | 'phone_script' | 'video_script' | 'job_posting' | 'creative_brief' | 'meta_upload' | 'funnel_publish' | 'manual';
  status: FulfillmentStatus;
  sort_order: number;
  result_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type GeneratedContent = {
  id: string;
  agency_id: string;
  fulfillment_task_id: string | null;
  content_type: 'ad_copy' | 'script' | 'phone_script' | 'video_script' | 'funnel_text' | 'job_posting' | 'creative_brief' | 'other';
  content: string;
  version: number;
  approved: boolean;
  created_by: string | null;
  created_at: string;
};

export type PerspectiveFunnel = {
  id: string;
  agency_id: string;
  perspective_funnel_id: string | null;
  name: string;
  status: 'draft' | 'published' | 'archived';
  url: string | null;
  created_at: string;
  updated_at: string;
};

// Phase 3: Masterclass + Client Tasks

export interface MasterclassModule {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
}

export interface MasterclassLesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  video_provider: 'youtube' | 'vimeo';
  duration_minutes: number | null;
  sort_order: number;
  created_at: string;
}

export interface LessonTask {
  id: string;
  lesson_id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

export interface AgencyLessonProgress {
  id: string;
  agency_id: string;
  lesson_id: string;
  watched: boolean;
  completed_at: string | null;
}

export interface AgencyTaskProgress {
  id: string;
  agency_id: string;
  task_id: string;
  completed: boolean;
  completed_at: string | null;
}

export interface ClientTask {
  id: string;
  agency_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
}

// Phase 4: Internal Pipeline + AI Tools

export type InternalTaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface InternalTask {
  id: string;
  title: string;
  description: string | null;
  agency_id: string | null;
  assigned_to: string | null;
  status: InternalTaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  text: string;
  created_at: string;
}

export interface AIConversation {
  id: string;
  agency_id: string;
  user_id: string;
  title: string | null;
  conversation_type: 'ad_copy' | 'script' | 'funnel_text' | 'general';
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Phase 5: Reporting + Satisfaction

export interface SurveyTemplate {
  id: string;
  title: string;
  description: string | null;
  questions: { id: string; type: string; label: string }[];
  active: boolean;
  created_at: string;
}

export interface SurveyResponse {
  id: string;
  template_id: string;
  agency_id: string;
  user_id: string;
  rating: number | null;
  answers: Record<string, unknown>;
  comment: string | null;
  created_at: string;
}

export interface MetaAdReport {
  id: string;
  agency_id: string;
  report_date: string;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  cpl: number | null;
  ctr: number | null;
  fetched_at: string;
}

export interface ReportSnapshot {
  id: string;
  agency_id: string;
  period_start: string;
  period_end: string;
  data: Record<string, unknown>;
  created_at: string;
}

// Call Tracking
export type CallResult = 'termin_vereinbart' | 'kein_interesse' | 'nicht_erreicht' | 'falsche_nummer' | 'rueckruf' | 'sonstiges';
export type CallNextStep = 'erneut_anrufen' | 'termin_bestaetigen' | 'absage' | 'warten';

export interface CallLog {
  id: string;
  candidate_id: string;
  agency_id: string;
  user_id: string;
  result: CallResult;
  notes: string | null;
  next_step: CallNextStep | null;
  next_contact_date: string | null;
  duration_seconds: number | null;
  created_at: string;
}

// Indeed Email Inbound

export interface InboundEmailLog {
  id: string;
  agency_id: string | null;
  from_address: string;
  to_address: string;
  subject: string | null;
  status: 'processed' | 'failed' | 'no_agency';
  error_message: string | null;
  candidate_id: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

// Call Recordings

export type RecordingType = 'erstgespraech' | 'vorstellungsgespraech' | 'follow_up' | 'sonstiges';
export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'failed';
export type AnalysisStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface CallRecordingAnalysis {
  script_adherence_score: number; // 0-100
  conversation_quality_score: number; // 0-100
  overall_score: number; // 0-100
  strengths: string[];
  improvements: string[];
  key_moments: { timestamp: string; note: string }[];
  summary: string;
}

export interface CallRecording {
  id: string;
  candidate_id: string;
  agency_id: string;
  uploaded_by: string;
  recording_type: RecordingType;
  file_url: string;
  file_name: string;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  transcript: string | null;
  transcript_status: TranscriptStatus;
  analysis: CallRecordingAnalysis | null;
  analysis_status: AnalysisStatus;
  created_at: string;
}

// Phase 6: SOP System, Content Library, and Approval Workflow

export interface SopPhase {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  estimated_days: number;
}

export interface SopTask {
  id: string;
  phase_id: string;
  title: string;
  description: string | null;
  task_type: 'manual' | 'ai_generate' | 'approval' | 'external';
  sort_order: number;
  requires_approval: boolean;
  ai_content_type: 'ad_copy' | 'phone_script' | 'video_script' | 'funnel_text' | 'job_posting' | null;
}

export interface CustomerSop {
  id: string;
  agency_id: string;
  current_phase: number;
  started_at: string;
  completed_at: string | null;
}

export interface CustomerTask {
  id: string;
  customer_sop_id: string;
  sop_task_id: string;
  agency_id: string;
  assigned_to: string | null;
  status: 'pending' | 'in_progress' | 'waiting_approval' | 'approved' | 'changes_requested' | 'done' | 'skipped';
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentLibraryItem {
  id: string;
  agency_id: string;
  content_type: 'ad_copy' | 'phone_script' | 'video_script' | 'funnel_text' | 'job_posting' | 'creative_brief';
  title: string;
  content: string;
  variant: string | null;
  version: number;
  status: 'draft' | 'internal_review' | 'approved_internal' | 'client_review' | 'approved' | 'changes_requested' | 'deployed' | 'archived';
  feedback: string | null;
  client_feedback: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalLogEntry {
  id: string;
  agency_id: string;
  item_type: 'task' | 'content';
  item_id: string;
  action: 'submitted' | 'approved' | 'changes_requested' | 'resubmitted';
  comment: string | null;
  acted_by: string;
  created_at: string;
}

// Phase 2: KPI System

export type KpiDirection = 'lower_is_better' | 'higher_is_better';

export interface KpiDefault {
  id: string;
  kpi_key: string;
  label: string;
  default_value: number;
  unit: string;
  direction: KpiDirection;
  created_at: string;
  updated_at: string;
}

export interface AgencyKpiOverride {
  id: string;
  agency_id: string;
  kpi_key: string;
  value: number;
  set_by: string | null;
  created_at: string;
}

export type ProblemSeverity = 'warning' | 'critical';

export interface AgencyProblem {
  id: string;
  agency_id: string;
  problem_key: string;
  severity: ProblemSeverity;
  current_value: number | null;
  target_value: number | null;
  details: Record<string, unknown>;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface PlaybookEntry {
  id: string;
  problem_key: string;
  title: string;
  description: string;
  causes: string[];
  immediate_actions: string[];
  long_term_actions: string[];
  escalation_trigger: string | null;
  created_at: string;
  updated_at: string;
}

export type PlaybookTaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
export type PlaybookTaskActionType = 'immediate' | 'long_term';

export interface PlaybookTask {
  id: string;
  agency_id: string;
  problem_id: string;
  playbook_key: string;
  action_text: string;
  action_type: PlaybookTaskActionType;
  status: PlaybookTaskStatus;
  assigned_to: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SurveyScheduleItem {
  id: string;
  agency_id: string;
  trigger_key: string;
  template_id: string;
  scheduled_at: string;
  sent_at: string | null;
  completed_at: string | null;
  response_id: string | null;
  created_at: string;
}

// Template Database

export type TemplateContentType =
  | 'ad_winkel_1' | 'ad_winkel_2' | 'ad_winkel_3'
  | 'funnel' | 'phone_script' | 'vg_leitfaden' | 'follow_up'
  | 'absage_telefon' | 'absage_vg' | 'absage_schriftlich'
  | 'indeed' | 'generator_rules';

export type TemplateBranch = 'solar' | 'glasfaser' | 'strom_gas' | 'telko' | 'versicherung' | 'all';

export interface ContentTemplate {
  id: string;
  template_key: string;
  branch: TemplateBranch;
  content_type: TemplateContentType;
  title: string;
  template_text: string;
  metadata: Record<string, unknown>;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Calendly Integration

export interface CalendlyEvent {
  id: string;
  agency_id: string | null;
  candidate_id: string | null;
  calendly_event_id: string | null;
  event_type: string | null;
  event_name: string | null;
  start_time: string;
  end_time: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  invitee_phone: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  location: string | null;
  created_at: string;
}

export type BranchKey = 'solar' | 'glasfaser' | 'strom_gas' | 'telko' | 'versicherung';

// Activity Log

export type ActivityActionType =
  | 'login'
  | 'call'
  | 'stage_change'
  | 'note'
  | 'content_approval'
  | 'content_rejection'
  | 'recording_upload'
  | 'onboarding_complete'
  | 'survey_submitted'
  | 'funnel_published'
  | 'candidate_created'
  | 'invite_sent'
  | 'email_sent'
  | 'task_completed'
  | 'other';

export interface ActivityLogEntry {
  id: string;
  agency_id: string | null;
  user_id: string | null;
  candidate_id: string | null;
  action: string;
  action_type: ActivityActionType;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LoginHistoryEntry {
  id: string;
  user_id: string;
  agency_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface BranchProfile {
  id: string;
  branch: BranchKey;
  default_values: Record<string, unknown>;
  strongest_angle: string | null;
  target_audience: string | null;
  common_rejection: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}
