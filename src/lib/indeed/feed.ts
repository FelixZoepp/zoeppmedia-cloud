export interface FeedJob {
  id: string;
  title: string;
  slug: string;
  /** Ortsname — entspricht der DB-Spalte `location` auf der jobs-Tabelle. */
  city: string | null;
  description: string | null;
  indeed_mode: 'apply' | 'redirect';
  created_at: string;
  external_ref: string | null;
}

/** Umschließt einen Wert mit CDATA und escapt innere "]]>"-Sequenzen. */
export function cdata(value: string): string {
  return `<![CDATA[${value.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** Baut den Indeed-XML-Feed für einen Mandanten (Spec §5 Modus A + B). */
export function buildIndeedFeed(params: {
  agencyName: string;
  agencySlug: string;
  baseUrl: string;
  jobs: FeedJob[];
}): string {
  const { agencyName, agencySlug, baseUrl, jobs } = params;

  const jobsXml = jobs.map((job) => {
    const applyUrl = `${baseUrl}/apply/${agencySlug}/${job.slug}?src=indeed`;
    let applyData = '';

    if (job.indeed_mode === 'apply') {
      const qs = [
        `indeed-apply-jobId=${encodeURIComponent(job.id)}`,
        `indeed-apply-jobTitle=${encodeURIComponent(job.title)}`,
        `indeed-apply-jobCompanyName=${encodeURIComponent(agencyName)}`,
        `indeed-apply-jobUrl=${encodeURIComponent(applyUrl)}`,
        `indeed-apply-postUrl=${encodeURIComponent(`${baseUrl}/api/webhooks/indeed/apply`)}`,
        `indeed-apply-questions=${encodeURIComponent(`${baseUrl}/api/indeed/questions/${job.id}.json`)}`,
      ].join('&');
      applyData = `\n    <indeed-apply-data>${cdata(qs)}</indeed-apply-data>`;
    }

    return `  <job>
    <title>${cdata(job.title)}</title>
    <date>${cdata(new Date(job.created_at).toUTCString())}</date>
    <referencenumber>${cdata(job.external_ref || job.id)}</referencenumber>
    <url>${cdata(applyUrl)}</url>
    <company>${cdata(agencyName)}</company>
    <city>${cdata(job.city || '')}</city>
    <country>${cdata('DE')}</country>
    <description>${cdata(job.description || job.title)}</description>${applyData}
  </job>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>${cdata(agencyName)}</publisher>
  <publisherurl>${cdata(baseUrl)}</publisherurl>
${jobsXml}
</source>`;
}
