/**
 * Recruiting scope helpers: role-based access control and impersonation
 */

export const IMPERSONATION_COOKIE = 'zmc_impersonate_agency';

/**
 * Determines if a role has write permissions in the recruiting module.
 * Write permissions include: admin, employee, agency_owner, agency_member.
 * Read-only roles (agency_viewer) and unknown roles return false.
 */
export function canWriteRole(role: string): boolean {
  const writeRoles = new Set(['admin', 'employee', 'agency_owner', 'agency_member']);
  return writeRoles.has(role);
}
