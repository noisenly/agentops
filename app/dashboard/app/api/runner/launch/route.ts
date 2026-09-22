import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy to scripts/agent-runner on the host; the token never reaches the browser.
const RUNNER_URL = process.env.AGENT_RUNNER_URL || 'http://host.docker.internal:4390';
const RUNNER_TOKEN = process.env.AGENT_RUNNER_TOKEN || '';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // CSRF guard: only same-origin fetches from the dashboard. The custom header forces a CORS
  // preflight for any cross-site caller, and the Origin must match the host serving this page.
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (request.headers.get('x-mission-control') !== 'launch' || !origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!RUNNER_TOKEN) return NextResponse.json({ error: 'AGENT_RUNNER_TOKEN not configured' }, { status: 503 });

  try {
    const res = await fetch(`${RUNNER_URL}/launch-issues`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RUNNER_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'agent-runner is not running (scripts/agent-runner)' }, { status: 502 });
  }
}
