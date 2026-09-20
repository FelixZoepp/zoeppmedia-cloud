export interface ParsedEmail {
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
}

export function parseIndeedEmail(body: string, subject: string): ParsedEmail {
  const text = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Echtes Indeed-Format: "[Wichtig] Neue Bewerbung für die Stelle als [Titel]"
  // → kein Name im Betreff, der komplette Rest ist der Stellentitel (kann Bindestriche enthalten)
  const indeedSubject = subject.match(/Neue Bewerbung f(?:ü|u)r die Stelle als\s+(.+)$/i);

  let candidateName: string | null = null;
  if (!indeedSubject) {
    // Altes Format: "Neue Bewerbung: [Titel] — [Name]"
    const subjectMatch = subject.match(/[—–-]\s*(.+)$/);
    if (subjectMatch) {
      candidateName = subjectMatch[1].trim();
    }
  }
  // Fallback: Body enthält oft "[Name] hat sich ... beworben"
  if (!candidateName) {
    const nameMatch = text.match(/([A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+){1,3})\s+hat sich/);
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
  if (indeedSubject) {
    jobTitle = indeedSubject[1].trim();
  } else {
    const titleMatch = subject.match(/(?:Bewerbung|application)[:\s]+(.+?)\s*[—–-]/i);
    if (titleMatch) jobTitle = titleMatch[1].trim();
  }

  return { candidateName, email: realEmail, phone, jobTitle };
}

export function extractAgencyIdFromAddress(to: string): string | null {
  // bewerber+abc123@zoepp-gruppe.de → abc123
  const match = to.match(/bewerber\+([^@]+)@/i);
  return match ? match[1] : null;
}
