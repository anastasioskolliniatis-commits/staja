/**
 * useSplunkKV.js — KV Store REST helpers for Batch Monitor
 *
 * Auth: reads X-Splunk-Form-Key from $C.FORM_KEY (injected by SplunkWeb),
 * with a cookie regex fallback that matches splunkweb_csrf_token_* regardless
 * of port number. This avoids all CSRF validation failures.
 */

const KV_BASE =
  '/en-US/splunkd/__raw/servicesNS/nobody/batch_monitor/storage/collections/data';

function getCsrfToken() {
  // Primary: $C is the Splunk global config object — FORM_KEY is the CSRF token
  if (window.$C?.FORM_KEY) return window.$C.FORM_KEY;
  // Fallback: scan cookies by pattern (works regardless of port number)
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

// ── Public API ────────────────────────────────────────────────────────────────

export async function kvGetAll(collection) {
  const resp = await fetch(
    `${KV_BASE}/${collection}?output_mode=json&limit=10000`,
    { headers: mkHeaders(), credentials: 'include' }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`KV read failed [${collection}] HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

export async function kvGetOne(collection, key) {
  const resp = await fetch(
    `${KV_BASE}/${collection}/${encodeURIComponent(key)}?output_mode=json`,
    { headers: mkHeaders(), credentials: 'include' }
  );
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`KV get failed [${collection}/${key}] HTTP ${resp.status}`);
  return resp.json();
}

export async function kvUpsert(collection, key, doc) {
  const resp = await fetch(
    `${KV_BASE}/${collection}/${encodeURIComponent(key)}?output_mode=json`,
    {
      method:      'POST',
      headers:     mkHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body:        JSON.stringify({ ...doc, _key: key }),
    }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`KV upsert failed [${collection}/${key}] HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

export async function kvDelete(collection, key) {
  const resp = await fetch(
    `${KV_BASE}/${collection}/${encodeURIComponent(key)}?output_mode=json`,
    {
      method:      'DELETE',
      headers:     mkHeaders(),
      credentials: 'include',
    }
  );
  if (!resp.ok) throw new Error(`KV delete failed [${collection}/${key}] HTTP ${resp.status}`);
}
