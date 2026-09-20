// scripts/test-rls-isolation.ts — Spec Abschn. 4: "automatisierter Test, der Fremdzugriff ausschließt"
// Läuft gegen die verbundene Supabase-DB. Legt markierte Wegwerf-Daten an und räumt sie in finally auf.
// NICHT ausführen bis Migrationen 20260921000001 + 20260921000002 angewandt sind (Task 9).
//
// Usage: npx tsx scripts/test-rls-isolation.ts
// Exit 0 = bestanden, non-zero = fehlgeschlagen.

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Env loading — kein dotenv im Repo, daher manuelles KEY=VALUE-Parsing
// ---------------------------------------------------------------------------
function loadEnvLocal(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local not found — bitte im Repo-Root ausführen');
  }
  const raw = fs.readFileSync(envPath, 'utf-8');
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes if present
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Vercel-Export schreibt Werte als "wert\n" — literales \n am Ende entfernen
    val = val.replace(/\\n$/, '');
    result[key] = val;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Assert helper
// ---------------------------------------------------------------------------
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Random helpers
// ---------------------------------------------------------------------------
function randomPassword(): string {
  return crypto.randomBytes(18).toString('base64url');
}

function randomSlug(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const env = loadEnvLocal();

  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const anonKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const serviceKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error(
      'Fehlende Env-Variablen: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  // Service-Role-Client für Setup/Teardown
  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Anon-Client für die eigentlichen Login-Tests
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---------------------------------------------------------------------------
  // Tracking für Cleanup (in Reihenfolge für FK-Constraints: Kinder zuerst)
  // ---------------------------------------------------------------------------
  const created = {
    applicationAId: null as string | null,
    applicationBId: null as string | null,
    candidateAId: null as string | null,
    candidateBId: null as string | null,
    jobAId: null as string | null,
    jobBId: null as string | null,
    viewerInsertedJobId: null as string | null,
    agencyAId: null as string | null,
    agencyBId: null as string | null,
    authUserAId: null as string | null,
    authUserBId: null as string | null,
    authViewerVId: null as string | null,
  };

  const passwordA = randomPassword();
  const passwordB = randomPassword();
  const passwordV = randomPassword();

  const emailA = 'rls-test-a@zoepp-test.internal';
  const emailB = 'rls-test-b@zoepp-test.internal';
  const emailV = 'rls-test-v@zoepp-test.internal';

  try {
    console.log('=== RLS Isolation Test — Setup ===');

    // ------------------------------------------------------------------
    // 1) Service-Client: Agentur A + B anlegen
    // ------------------------------------------------------------------
    console.log('1a) Agentur A anlegen...');
    const { data: agencyA, error: errAgA } = await svc
      .from('agencies')
      .insert({
        name: 'RLS-TEST-A',
        slug: randomSlug('rls-test-a'),
        contact_name: 'RLS Test A',
        email: 'rls-test-a@zoepp-test.internal',
      })
      .select('id')
      .single();
    if (errAgA) throw new Error(`Agentur A Insert: ${errAgA.message}`);
    created.agencyAId = agencyA.id;
    console.log(`   Agentur A: ${agencyA.id}`);

    console.log('1b) Agentur B anlegen...');
    const { data: agencyB, error: errAgB } = await svc
      .from('agencies')
      .insert({
        name: 'RLS-TEST-B',
        slug: randomSlug('rls-test-b'),
        contact_name: 'RLS Test B',
        email: 'rls-test-b@zoepp-test.internal',
      })
      .select('id')
      .single();
    if (errAgB) throw new Error(`Agentur B Insert: ${errAgB.message}`);
    created.agencyBId = agencyB.id;
    console.log(`   Agentur B: ${agencyB.id}`);

    // ------------------------------------------------------------------
    // 2) Auth-User A (agency_member, Agentur A)
    // ------------------------------------------------------------------
    console.log('2a) Auth-User A erstellen...');
    const { data: authA, error: errAuthA } = await svc.auth.admin.createUser({
      email: emailA,
      password: passwordA,
      email_confirm: true,
    });
    if (errAuthA) throw new Error(`Auth User A: ${errAuthA.message}`);
    created.authUserAId = authA.user.id;

    const { error: errUsrA } = await svc.from('users').insert({
      id: authA.user.id,
      agency_id: agencyA.id,
      email: emailA,
      name: 'RLS Test User A',
      role: 'agency_member',
    });
    if (errUsrA) throw new Error(`users Insert A: ${errUsrA.message}`);
    console.log(`   User A: ${authA.user.id}`);

    // ------------------------------------------------------------------
    // 3) Auth-User B (agency_member, Agentur B)
    // ------------------------------------------------------------------
    console.log('2b) Auth-User B erstellen...');
    const { data: authB, error: errAuthB } = await svc.auth.admin.createUser({
      email: emailB,
      password: passwordB,
      email_confirm: true,
    });
    if (errAuthB) throw new Error(`Auth User B: ${errAuthB.message}`);
    created.authUserBId = authB.user.id;

    const { error: errUsrB } = await svc.from('users').insert({
      id: authB.user.id,
      agency_id: agencyB.id,
      email: emailB,
      name: 'RLS Test User B',
      role: 'agency_member',
    });
    if (errUsrB) throw new Error(`users Insert B: ${errUsrB.message}`);
    console.log(`   User B: ${authB.user.id}`);

    // ------------------------------------------------------------------
    // 4) Viewer V (agency_viewer, Agentur A)
    // ------------------------------------------------------------------
    console.log('2c) Auth-Viewer V erstellen (agency_viewer in Agentur A)...');
    const { data: authV, error: errAuthV } = await svc.auth.admin.createUser({
      email: emailV,
      password: passwordV,
      email_confirm: true,
    });
    if (errAuthV) throw new Error(`Auth Viewer V: ${errAuthV.message}`);
    created.authViewerVId = authV.user.id;

    const { error: errUsrV } = await svc.from('users').insert({
      id: authV.user.id,
      agency_id: agencyA.id,
      email: emailV,
      name: 'RLS Test Viewer V',
      role: 'agency_viewer',
    });
    if (errUsrV) throw new Error(`users Insert V: ${errUsrV.message}`);
    console.log(`   Viewer V: ${authV.user.id}`);

    // ------------------------------------------------------------------
    // 5) Job A + Job B (via Service-Client um RLS zu umgehen)
    // ------------------------------------------------------------------
    console.log('3a) Job A anlegen...');
    const { data: jobA, error: errJobA } = await svc
      .from('jobs')
      .insert({
        agency_id: agencyA.id,
        title: 'RLS Test Job A',
        slug: randomSlug('rls-job-a'),
        status: 'active',
      })
      .select('id')
      .single();
    if (errJobA) throw new Error(`Job A Insert: ${errJobA.message}`);
    created.jobAId = jobA.id;
    console.log(`   Job A: ${jobA.id}`);

    console.log('3b) Job B anlegen...');
    const { data: jobB, error: errJobB } = await svc
      .from('jobs')
      .insert({
        agency_id: agencyB.id,
        title: 'RLS Test Job B',
        slug: randomSlug('rls-job-b'),
        status: 'active',
      })
      .select('id')
      .single();
    if (errJobB) throw new Error(`Job B Insert: ${errJobB.message}`);
    created.jobBId = jobB.id;
    console.log(`   Job B: ${jobB.id}`);

    // ------------------------------------------------------------------
    // 6) Pipeline-Stage holen (global, agency_id NULL)
    // ------------------------------------------------------------------
    console.log('4) Pipeline-Stage abrufen...');
    const { data: stages, error: errStages } = await svc
      .from('pipeline_stages')
      .select('id')
      .limit(1);
    if (errStages) throw new Error(`pipeline_stages fetch: ${errStages.message}`);
    if (!stages || stages.length === 0) {
      throw new Error('Keine pipeline_stages vorhanden — bitte Seed-Daten sicherstellen');
    }
    const stageId = stages[0].id as string;
    console.log(`   Stage-ID: ${stageId}`);

    // ------------------------------------------------------------------
    // 7) Kandidat A + Kandidat B
    // ------------------------------------------------------------------
    console.log('5a) Kandidat A anlegen...');
    const { data: candA, error: errCandA } = await svc
      .from('candidates')
      .insert({
        agency_id: agencyA.id,
        name: 'RLS Kandidat A',
        source: 'manual',
        current_stage_id: stageId,
      })
      .select('id')
      .single();
    if (errCandA) throw new Error(`Kandidat A Insert: ${errCandA.message}`);
    created.candidateAId = candA.id;
    console.log(`   Kandidat A: ${candA.id}`);

    console.log('5b) Kandidat B anlegen...');
    const { data: candB, error: errCandB } = await svc
      .from('candidates')
      .insert({
        agency_id: agencyB.id,
        name: 'RLS Kandidat B',
        source: 'manual',
        current_stage_id: stageId,
      })
      .select('id')
      .single();
    if (errCandB) throw new Error(`Kandidat B Insert: ${errCandB.message}`);
    created.candidateBId = candB.id;
    console.log(`   Kandidat B: ${candB.id}`);

    // ------------------------------------------------------------------
    // 8) Application A + Application B
    // ------------------------------------------------------------------
    console.log('6a) Application A anlegen...');
    const { data: appA, error: errAppA } = await svc
      .from('applications')
      .insert({
        agency_id: agencyA.id,
        candidate_id: candA.id,
        job_id: jobA.id,
        source: 'manual',
        status: 'open',
      })
      .select('id')
      .single();
    if (errAppA) throw new Error(`Application A Insert: ${errAppA.message}`);
    created.applicationAId = appA.id;
    console.log(`   Application A: ${appA.id}`);

    console.log('6b) Application B anlegen...');
    const { data: appB, error: errAppB } = await svc
      .from('applications')
      .insert({
        agency_id: agencyB.id,
        candidate_id: candB.id,
        job_id: jobB.id,
        source: 'manual',
        status: 'open',
      })
      .select('id')
      .single();
    if (errAppB) throw new Error(`Application B Insert: ${errAppB.message}`);
    created.applicationBId = appB.id;
    console.log(`   Application B: ${appB.id}`);

    // ------------------------------------------------------------------
    // TESTS
    // ------------------------------------------------------------------
    console.log('\n=== RLS Isolation Test — Assertions ===');

    // --- Test 1: User A sieht seine eigene Application ---
    console.log('\n[Test 1] User A login + eigene Applications sehen...');
    const { error: signInAErr } = await anon.auth.signInWithPassword({
      email: emailA,
      password: passwordA,
    });
    if (signInAErr) throw new Error(`Login A fehlgeschlagen: ${signInAErr.message}`);

    const { data: appsA, error: appsAErr } = await anon
      .from('applications')
      .select('id')
      .eq('agency_id', agencyA.id);

    if (appsAErr) throw new Error(`applications select als A: ${appsAErr.message}`);
    assert(
      Array.isArray(appsA) && appsA.some((r) => r.id === appA.id),
      `User A muss seine eigene Application (${appA.id}) sehen — gefunden: ${JSON.stringify(appsA)}`
    );
    console.log(`   PASS: User A sieht ${appsA!.length} Application(s) in Agentur A`);

    // --- Test 2: User A sieht KEINE Applications von Agentur B ---
    console.log('\n[Test 2] User A darf keine Applications von Agentur B sehen...');
    const { data: appsB_asA, error: appsBErr } = await anon
      .from('applications')
      .select('id')
      .eq('agency_id', agencyB.id);

    if (appsBErr) throw new Error(`applications select B als A: ${appsBErr.message}`);
    assert(
      Array.isArray(appsB_asA) && appsB_asA.length === 0,
      `User A darf 0 Rows von Agentur B sehen — got ${appsB_asA?.length} rows: ${JSON.stringify(appsB_asA)}`
    );
    console.log('   PASS: User A sieht 0 Applications von Agentur B');

    await anon.auth.signOut();

    // --- Test 3: Viewer V (agency_viewer) darf nicht in jobs inserten ---
    console.log('\n[Test 3] Viewer V (agency_viewer) darf nicht in jobs inserten...');
    const { error: signInVErr } = await anon.auth.signInWithPassword({
      email: emailV,
      password: passwordV,
    });
    if (signInVErr) throw new Error(`Login V fehlgeschlagen: ${signInVErr.message}`);

    const { data: insertResult, error: insertErr } = await anon
      .from('jobs')
      .insert({
        agency_id: agencyA.id,
        title: 'RLS Viewer Insert Test (darf nicht klappen)',
        slug: randomSlug('rls-viewer-block'),
        status: 'draft',
      })
      .select('id')
      .single();

    // Track the inserted row if insert unexpectedly succeeds (for cleanup)
    if (insertResult && insertResult.id) {
      created.viewerInsertedJobId = insertResult.id;
    }

    assert(
      insertErr !== null,
      `Viewer-Insert in jobs muss scheitern — bekam stattdessen: ${JSON.stringify(insertResult)}`
    );
    console.log(`   PASS: Insert als agency_viewer korrekt blockiert (Fehler: ${insertErr!.message})`);

    await anon.auth.signOut();

    console.log('\n=== ALLE TESTS BESTANDEN ===');
    process.exitCode = 0;
  } catch (err) {
    console.error('\n=== TEST FEHLGESCHLAGEN ===');
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    // ------------------------------------------------------------------
    // Cleanup — bei Einzelfehlern weitermachen (continue on error)
    // ------------------------------------------------------------------
    console.log('\n=== Cleanup ===');

    const cleanup = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
        console.log(`   deleted: ${label}`);
      } catch (e) {
        console.warn(`   cleanup warn [${label}]:`, e instanceof Error ? e.message : e);
      }
    };

    // Kinder zuerst (FK-Reihenfolge)
    if (created.applicationAId) {
      await cleanup(`application A (${created.applicationAId})`, async () => {
        const { error } = await svc.from('applications').delete().eq('id', created.applicationAId!);
        if (error) throw error;
      });
    }
    if (created.applicationBId) {
      await cleanup(`application B (${created.applicationBId})`, async () => {
        const { error } = await svc.from('applications').delete().eq('id', created.applicationBId!);
        if (error) throw error;
      });
    }
    if (created.candidateAId) {
      await cleanup(`candidate A (${created.candidateAId})`, async () => {
        const { error } = await svc.from('candidates').delete().eq('id', created.candidateAId!);
        if (error) throw error;
      });
    }
    if (created.candidateBId) {
      await cleanup(`candidate B (${created.candidateBId})`, async () => {
        const { error } = await svc.from('candidates').delete().eq('id', created.candidateBId!);
        if (error) throw error;
      });
    }
    if (created.jobAId) {
      await cleanup(`job A (${created.jobAId})`, async () => {
        const { error } = await svc.from('jobs').delete().eq('id', created.jobAId!);
        if (error) throw error;
      });
    }
    if (created.jobBId) {
      await cleanup(`job B (${created.jobBId})`, async () => {
        const { error } = await svc.from('jobs').delete().eq('id', created.jobBId!);
        if (error) throw error;
      });
    }
    if (created.viewerInsertedJobId) {
      await cleanup(`viewer-inserted job (${created.viewerInsertedJobId})`, async () => {
        const { error } = await svc.from('jobs').delete().eq('id', created.viewerInsertedJobId!);
        if (error) throw error;
      });
    }
    // Users (public.users) — Agenturen cascaden nicht auf users, also manuell
    if (created.authUserAId) {
      await cleanup(`public.users A (${created.authUserAId})`, async () => {
        const { error } = await svc.from('users').delete().eq('id', created.authUserAId!);
        if (error) throw error;
      });
    }
    if (created.authUserBId) {
      await cleanup(`public.users B (${created.authUserBId})`, async () => {
        const { error } = await svc.from('users').delete().eq('id', created.authUserBId!);
        if (error) throw error;
      });
    }
    if (created.authViewerVId) {
      await cleanup(`public.users V (${created.authViewerVId})`, async () => {
        const { error } = await svc.from('users').delete().eq('id', created.authViewerVId!);
        if (error) throw error;
      });
    }
    // Agenturen
    if (created.agencyAId) {
      await cleanup(`agency A (${created.agencyAId})`, async () => {
        const { error } = await svc.from('agencies').delete().eq('id', created.agencyAId!);
        if (error) throw error;
      });
    }
    if (created.agencyBId) {
      await cleanup(`agency B (${created.agencyBId})`, async () => {
        const { error } = await svc.from('agencies').delete().eq('id', created.agencyBId!);
        if (error) throw error;
      });
    }
    // Auth-Users (nach public.users wegen FK cascade)
    if (created.authUserAId) {
      await cleanup(`auth.users A (${created.authUserAId})`, async () => {
        const { error } = await svc.auth.admin.deleteUser(created.authUserAId!);
        if (error) throw error;
      });
    }
    if (created.authUserBId) {
      await cleanup(`auth.users B (${created.authUserBId})`, async () => {
        const { error } = await svc.auth.admin.deleteUser(created.authUserBId!);
        if (error) throw error;
      });
    }
    if (created.authViewerVId) {
      await cleanup(`auth.users V (${created.authViewerVId})`, async () => {
        const { error } = await svc.auth.admin.deleteUser(created.authViewerVId!);
        if (error) throw error;
      });
    }

    console.log('=== Cleanup abgeschlossen ===');
  }
}

main().catch((err) => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});
