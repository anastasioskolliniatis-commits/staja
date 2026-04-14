/**
 * useSplunkSearch.js — run a one-shot Splunk search from the browser.
 *
 * Uses the Splunk REST proxy (/en-US/splunkd/__raw/) so the browser session
 * cookie handles auth — no separate token management needed.
 *
 * Exported as a plain async function (not a React hook) so it can be called
 * imperatively from event handlers and other async contexts.
 */

const SEARCH_BASE =
  '/en-US/splunkd/__raw/servicesNS/nobody/batch_monitor/search/jobs';

/**
 * Get the Splunk session key from __splunkd_partials__ (injected by Mako template).
 * Using Authorization: Splunk {key} bypasses cookie auth and CSRF validation.
 */
function getSessionKey() {
  try {
    return window.__splunkd_partials__?.__rawSessionKey ?? null;
  } catch {
    return null;
  }
}

function mkHeaders(contentType = null) {
  const key = getSessionKey();
  return {
    'X-Requested-With': 'XMLHttpRequest',
    ...(key  ? { 'Authorization': `Splunk ${key}` } : {}),
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

const POLL_INTERVAL_MS  = 1000;
const TIMEOUT_MS        = 60_000;
const VALID_STATUSES    = new Set(['ok', 'warning', 'critical']);

/**
 * Run a Splunk search and return all result rows as an array of objects.
 *
 * @param {string}  spl   - The SPL string (leading pipe OK)
 * @param {object}  opts
 * @param {number}  opts.count        - Max rows to fetch (default 10000)
 * @param {number}  opts.timeoutMs    - Override timeout in ms
 * @returns {Promise<Array<object>>}  - Array of result row objects
 * @throws {Error} on search failure, timeout, or HTTP error
 */
export async function runSearch(spl, { count = 10_000, timeoutMs = TIMEOUT_MS } = {}) {
  const searchStr = spl.trimStart().startsWith('|') ? spl : `search ${spl}`;

  // 1 — Submit job
  const submitResp = await fetch(SEARCH_BASE, {
    method:      'POST',
    headers:     mkHeaders('application/x-www-form-urlencoded'),
    credentials: 'include',
    body: new URLSearchParams({
      search:                searchStr,
      output_mode:           'json',
      exec_mode:             'normal',
      'dispatch.max_time':   String(Math.ceil(timeoutMs / 1000)),
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
    // Cancel the orphaned job — best effort
    fetch(`${jobUrl}/control`, {
      method:      'POST',
      headers:     mkHeaders('application/x-www-form-urlencoded'),
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

/**
 * Determine the aggregate service_status from an array of result rows.
 * Takes the worst status across all rows (critical > warning > ok > no_data).
 *
 * @param {Array<object>} rows
 * @param {string}        statusField  - field name (default 'service_status')
 * @returns {'ok'|'warning'|'critical'|'no_data'}
 */
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

// ── Internal helpers ──────────────────────────────────────────────────────────

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
