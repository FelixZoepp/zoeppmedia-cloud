export type Agency = {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string | null;
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
  role: 'owner' | 'admin';
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
