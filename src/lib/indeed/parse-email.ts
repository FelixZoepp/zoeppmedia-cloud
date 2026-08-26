export interface ParsedEmail {
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
}

export function parseIndeedEmail(body: string, subject: string): ParsedEmail {
  const text = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Name from subject: "Neue Bewerbung: [Titel] — [Name]" or "New application: [Title] — [Name]"
  let candidateName: string | null = null;
  const subjectMatch = subject.match(/[—–-]\s*(.+)$/);
  if (subjectMatch) {
    candidateName = subjectMatch[1].trim();
  }
  // Fallback: first line of body often contains the name
  if (!candidateName) {
    const nameMatch = text.match(/^(.+?)\s+hat sich/);
    if (nameMatch) candidateName = nameMatch[1].trim();
  }

  // Email: find email addresses, prefer non-indeed ones
  const emails = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/g) || [];
  const realEmail = emails.find(e => !e.includes('indeed.com')) || emails[0] || null;

  // Phone: German phone patterns
  const phoneMatch = text.match(/(?:\+49|0)\s*\d[\d\s/.-]{6,14}\d/);
  const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, ' ').trim() : null;

  // Job title from subject
  let jobTitle: string | null = null;
  const titleMatch = subject.match(/(?:Bewerbung|application)[:\s]+(.+?)\s*[—–-]/i);
  if (titleMatch) jobTitle = titleMatch[1].trim();

  return { candidateName, email: realEmail, phone, jobTitle };
}

export function extractAgencyIdFromAddress(to: string): string | null {
  // bewerber+abc123@zoepp-gruppe.de → abc123
  const match = to.match(/bewerber\+([^@]+)@/i);
  return match ? match[1] : null;
}
