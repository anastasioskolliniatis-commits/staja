/**
 * useSplunkSearch.js — run a one-shot Splunk search from the browser.
 *
 * Auth: reads X-Splunk-Form-Key from $C.FORM_KEY (injected by SplunkWeb),
 * with a cookie regex fallback that matches splunkweb_csrf_token_* regardless
 * of port number.
 */

const SEARCH_BASE =
  '/en-US/splunkd/__raw/servicesNS/nobody/batch_monitor/search/jobs';

const POLL_INTERVAL_MS = 1000;
const TIMEOUT_MS       = 60_000;
const VALID_STATUSES   = new Set(['ok', 'warning', 'critical']);

function getCsrfToken() {
  if (window.$C?.FORM_KEY) return window.$C.FORM_KEY;
  const m = document.cookie.match(/splunkweb_csrf_token_\d+=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function mkHeaders(extra = {}) {
  return {
    'X-Requested-With': 'XMLHttpRequest',
    'X-Splunk-Form-Key': getCsrfToken(),
    ...extra,
  };
}

export async function runSearch(spl, { count = 10_000, timeoutMs = TIMEOUT_MS } = {}) {
  const searchStr = spl.trimStart().startsWith('|') ? spl : `search ${spl}`;

  // 1 — Submit job
  const submitResp = await fetch(SEARCH_BASE, {
    method:      'POST',
    headers:     mkHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    credentials: 'include',
    body: new URLSearchParams({
      search:              searchStr,
      output_mode:         'json',
      exec_mode:           'normal',
      'dispatch.max_time': String(Math.ceil(timeoutMs / 1000)),
    }),
  });

  if (!submitResp.ok) {
    const txt = await submitResp.text();
    throw new Error(`Search submit failed (HTTP ${submitResp.status}): ${txt.slice(0, 200)}`);
  }

  const { sid } = await submitResp.json();
  if (!sid) throw new Error('Splunk returned no search job ID');

  // 2 — Poll until DONE / FAILED / timeout
  const jobUrl  = `${SEARCH_BASE}/${sid}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);

    const pollResp = await fetch(`${jobUrl}?output_mode=json`, {
      headers:     mkHeaders(),
      credentials: 'include',
    });
    if (!pollResp.ok) throw new Error(`Poll failed (HTTP ${pollResp.status})`);

    const pollData = await pollResp.json();
    const content  = pollData?.entry?.[0]?.content ?? {};
    const state    = content.dispatchState ?? '';

    if (state === 'DONE') break;
    if (state === 'FAILED') {
      const msgs = (content.messages ?? []).map(m => m.text).join('; ');
      throw new Error(`Search job failed: ${msgs || '(no detail)'}`);
    }
  }

  if (Date.now() >= deadline) {
    fetch(`${jobUrl}/control`, {
      method:      'POST',
      headers:     mkHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
      credentials: 'include',
      body:        'action=cancel',
    }).catch(() => {});
    throw new Error(`Search timed out after ${timeoutMs / 1000}s`);
  }

  // 3 — Fetch results
  const resResp = await fetch(
    `${jobUrl}/results?output_mode=json&count=${count}`,
    { headers: mkHeaders(), credentials: 'include' }
  );
  if (!resResp.ok) throw new Error(`Results fetch failed (HTTP ${resResp.status})`);

  const resData = await resResp.json();
  return resData?.results ?? [];
}

export function aggregateStatus(rows, statusField = 'service_status') {
  const SEVERITY = { ok: 0, warning: 1, critical: 2 };
  let worst = null;
  let worstSev = -1;

  for (const row of rows) {
    const raw = String(row[statusField] ?? '').trim().toLowerCase();
    if (!VALID_STATUSES.has(raw)) continue;
    const sev = SEVERITY[raw] ?? 0;
    if (sev > worstSev) { worst = raw; worstSev = sev; }
  }

  return worst ?? 'no_data';
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
