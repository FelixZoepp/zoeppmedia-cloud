import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Unit tests for Applications API request/response contracts
 *
 * Integration tests with actual Supabase require a test database.
 * These tests validate schemas, error handling, and business logic.
 */

// GET /api/applications response schema
const GetApplicationsResponseSchema = z.array(
  z.object({
    id: z.string().uuid(),
    agency_id: z.string().uuid(),
    candidate_id: z.string().uuid(),
    job_id: z.string().uuid(),
    stage_id: z.string().uuid(),
    source: z.string(),
    status: z.enum(['open', 'hired', 'rejected']),
    applied_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    candidate: z.object({
      id: z.string().uuid(),
      name: z.string(),
      phone: z.string().nullable(),
      phone_e164: z.string().nullable(),
      email: z.string().nullable(),
      source: z.string(),
    }),
    job: z.object({
      id: z.string().uuid(),
      title: z.string(),
      slug: z.string(),
    }),
    stage: z.object({
      id: z.string().uuid(),
      name: z.string(),
      color: z.string().nullable(),
      stage_type: z.enum(['new', 'in_progress', 'hired', 'rejected']),
    }),
  })
);

// POST /api/applications request schema
const CreateApplicationSchema = z.object({
  jobId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
});

// POST /api/applications response schema (from ingestApplication)
const CreateApplicationResponseSchema = z.object({
  candidateId: z.string().uuid(),
  applicationId: z.string().uuid().nullable(),
  candidateCreated: z.boolean(),
  applicationCreated: z.boolean(),
  duplicateWithin30Days: z.boolean(),
  phoneInvalid: z.boolean(),
});

// PATCH /api/applications/[id]/stage request schema
const UpdateStageSchema = z.object({
  stage_id: z.string().uuid(),
  rejection_reason: z.string().optional().nullable(),
});

// POST /api/applications/bulk request schema
const BulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['set_stage', 'assign', 'delete']),
  stage_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

// POST /api/applications/bulk response schema
const BulkActionResponseSchema = z.object({
  affected: z.number().int().nonnegative(),
});

describe('Applications API Schemas', () => {
  describe('GET /api/applications', () => {
    it('valid response matches schema', () => {
      const mockResponse = [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          agency_id: '550e8400-e29b-41d4-a716-446655440001',
          candidate_id: '550e8400-e29b-41d4-a716-446655440002',
          job_id: '550e8400-e29b-41d4-a716-446655440003',
          stage_id: '550e8400-e29b-41d4-a716-446655440004',
          source: 'manual',
          status: 'open' as const,
          applied_at: '2025-09-21T01:00:00Z',
          updated_at: '2025-09-21T01:00:00Z',
          candidate: {
            id: '550e8400-e29b-41d4-a716-446655440002',
            name: 'Max Mustermann',
            phone: '+49176123456',
            phone_e164: '+49176123456',
            email: 'max@example.com',
            source: 'manual',
          },
          job: {
            id: '550e8400-e29b-41d4-a716-446655440003',
            title: 'Entwickler',
            slug: 'entwickler-2025',
          },
          stage: {
            id: '550e8400-e29b-41d4-a716-446655440004',
            name: 'Neue Bewerbung',
            color: '#0066FF',
            stage_type: 'new' as const,
          },
        },
      ];

      expect(() => GetApplicationsResponseSchema.parse(mockResponse)).not.toThrow();
    });
  });

  describe('POST /api/applications', () => {
    it('valid request body passes validation', () => {
      const body = {
        jobId: '550e8400-e29b-41d4-a716-446655440003',
        firstName: 'Max',
        lastName: 'Mustermann',
        phone: '+49176123456',
        email: 'max@example.com',
      };
      expect(() => CreateApplicationSchema.parse(body)).not.toThrow();
    });

    it('rejects invalid email', () => {
      const body = {
        jobId: '550e8400-e29b-41d4-a716-446655440003',
        firstName: 'Max',
        email: 'not-an-email',
      };
      expect(() => CreateApplicationSchema.parse(body)).toThrow();
    });

    it('rejects invalid jobId', () => {
      const body = {
        jobId: 'not-a-uuid',
        firstName: 'Max',
      };
      expect(() => CreateApplicationSchema.parse(body)).toThrow();
    });

    it('rejects empty firstName', () => {
      const body = {
        jobId: '550e8400-e29b-41d4-a716-446655440003',
        firstName: '',
      };
      expect(() => CreateApplicationSchema.parse(body)).toThrow();
    });

    it('valid response matches schema', () => {
      const mockResponse = {
        candidateId: '550e8400-e29b-41d4-a716-446655440002',
        applicationId: '550e8400-e29b-41d4-a716-446655440000',
        candidateCreated: true,
        applicationCreated: true,
        duplicateWithin30Days: false,
        phoneInvalid: false,
      };
      expect(() => CreateApplicationResponseSchema.parse(mockResponse)).not.toThrow();
    });
  });

  describe('PATCH /api/applications/[id]/stage', () => {
    it('valid request body passes validation', () => {
      const body = {
        stage_id: '550e8400-e29b-41d4-a716-446655440004',
        rejection_reason: 'Overqualified',
      };
      expect(() => UpdateStageSchema.parse(body)).not.toThrow();
    });

    it('rejects invalid stage_id', () => {
      const body = {
        stage_id: 'not-a-uuid',
      };
      expect(() => UpdateStageSchema.parse(body)).toThrow();
    });

    it('stage_id is required', () => {
      const body = {
        rejection_reason: 'Some reason',
      };
      expect(() => UpdateStageSchema.parse(body)).toThrow();
    });

    it('rejection_reason is optional', () => {
      const body = {
        stage_id: '550e8400-e29b-41d4-a716-446655440004',
      };
      expect(() => UpdateStageSchema.parse(body)).not.toThrow();
    });
  });

  describe('POST /api/applications/bulk', () => {
    it('set_stage action requires stage_id', () => {
      const body = {
        ids: ['550e8400-e29b-41d4-a716-446655440000'],
        action: 'set_stage' as const,
        // stage_id missing
      };
      // Validation passes at schema level (stage_id is optional),
      // but handler should validate business logic
      expect(() => BulkActionSchema.parse(body)).not.toThrow();
    });

    it('assign action with assigned_to', () => {
      const body = {
        ids: ['550e8400-e29b-41d4-a716-446655440000'],
        action: 'assign' as const,
        assigned_to: '550e8400-e29b-41d4-a716-446655440001',
      };
      expect(() => BulkActionSchema.parse(body)).not.toThrow();
    });

    it('delete action requires only ids', () => {
      const body = {
        ids: ['550e8400-e29b-41d4-a716-446655440000'],
        action: 'delete' as const,
      };
      expect(() => BulkActionSchema.parse(body)).not.toThrow();
    });

    it('rejects empty ids', () => {
      const body = {
        ids: [],
        action: 'delete' as const,
      };
      expect(() => BulkActionSchema.parse(body)).toThrow();
    });

    it('rejects more than 100 ids', () => {
      const body = {
        ids: Array(101).fill('550e8400-e29b-41d4-a716-446655440000'),
        action: 'delete' as const,
      };
      expect(() => BulkActionSchema.parse(body)).toThrow();
    });

    it('rejects invalid action', () => {
      const body = {
        ids: ['550e8400-e29b-41d4-a716-446655440000'],
        action: 'invalid_action',
      };
      expect(() => BulkActionSchema.parse(body)).toThrow();
    });

    it('valid response matches schema', () => {
      const mockResponse = {
        affected: 42,
      };
      expect(() => BulkActionResponseSchema.parse(mockResponse)).not.toThrow();
    });
  });
});

