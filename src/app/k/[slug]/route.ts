import { NextRequest, NextResponse } from 'next/server';

/** Kurzlink zur Kunden-Cloud: cloud.zoeppmedia.de/k/turhan-vertriebs-gmbh → Login im Look des Kunden */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL('/login', request.url);
  url.searchParams.set('kunde', slug);
  return NextResponse.redirect(url);
}
