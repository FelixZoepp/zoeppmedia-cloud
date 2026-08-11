export type UserRole = 'admin' | 'employee' | 'agency_owner' | 'agency_member';

export type Agency = {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
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
};

export type User = {
  id: string;
  agency_id: string;
  email: string;
  name: string;
  role: UserRole;
  last_login: string | null;
  created_at: string;
};

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
  created_at: string;
  updated_at: string;
};

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
