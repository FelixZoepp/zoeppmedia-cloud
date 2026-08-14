import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();

  // Get all employees
  const { data: employees } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('role', 'employee');

  if (!employees || employees.length === 0) {
    return NextResponse.json([]);
  }

  const employeeIds = employees.map((e: { id: string }) => e.id);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
  startOfWeek.setHours(0, 0, 0, 0);

  // Get activity_log entries for all employees (last 30 days to capture week/today)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const { data: activityRows } = await supabase
    .from('activity_log')
    .select('user_id, action_type, created_at')
    .in('user_id', employeeIds)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  // Also get fulfillment tasks completed by employees (via agency assignments)
  // We track "task done" via activity_log action_type = 'task_completed'
  // Group by employee
  const statsByEmployee: Record<string, {
    lastActive: string | null;
    tasksToday: number;
    tasksWeek: number;
  }> = {};

  for (const emp of employees) {
    statsByEmployee[emp.id] = { lastActive: null, tasksToday: 0, tasksWeek: 0 };
  }

  for (const row of activityRows ?? []) {
    const uid = row.user_id;
    if (!statsByEmployee[uid]) continue;

    const createdAt = new Date(row.created_at);

    // Track last active
    if (!statsByEmployee[uid].lastActive || row.created_at > statsByEmployee[uid].lastActive!) {
      statsByEmployee[uid].lastActive = row.created_at;
    }

    // Count task_completed actions
    if (row.action_type === 'task_completed') {
      if (createdAt >= startOfToday) {
        statsByEmployee[uid].tasksToday++;
      }
      if (createdAt >= startOfWeek) {
        statsByEmployee[uid].tasksWeek++;
      }
    }
  }

  const result = employees.map((emp: { id: string; name: string; email: string }) => ({
    id: emp.id,
    name: emp.name,
    email: emp.email,
    lastActive: statsByEmployee[emp.id]?.lastActive ?? null,
    tasksToday: statsByEmployee[emp.id]?.tasksToday ?? 0,
    tasksWeek: statsByEmployee[emp.id]?.tasksWeek ?? 0,
  }));

  return NextResponse.json(result);
}
