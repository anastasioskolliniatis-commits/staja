/**
 * useSplunkKV.js — KV Store REST helpers for Batch Monitor
 *
 * Auth strategy: use the Splunk session key from __splunkd_partials__
 * (injected by the Mako template) as an explicit Authorization header.
 * This bypasses cookie-based auth and CSRF validation entirely —
 * CSRF only applies to cookie/session-based requests, not token auth.
 *
 * All calls target the shared nobody namespace so data is visible to all
 * authenticated users regardless of their own Splunk username context.
 */

const KV_BASE =
  '/en-US/splunkd/__raw/servicesNS/nobody/batch_monitor/storage/collections/data';

/**
 * Get the Splunk session key injected by the Mako template.
 * __splunkd_partials__ is set globally in appserver/templates/monitor.html.
 */
function getSessionKey() {
  try {
    return window.__splunkd_partials__?.__rawSessionKey ?? null;
  } catch {
    return null;
  }
}

/**
 * Build request headers. Always includes X-Requested-With.
 * Adds Authorization: Splunk {key} when session key is available.
 */
function headers(extra = {}) {
  const key = getSessionKey();
  return {
    'X-Requested-With': 'XMLHttpRequest',
    ...(key ? { 'Authorization': `Splunk ${key}` } : {}),
    ...extra,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all documents from a KV collection.
 * Returns an array of objects (may be empty).
 * Throws on HTTP error.
 */
export async function kvGetAll(collection) {
  const resp = await fetch(
    `${KV_BASE}/${collection}?output_mode=json&limit=10000`,
    { headers: headers(), credentials: 'include' }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `KV read failed [${collection}] HTTP ${resp.status}: ${text.slice(0, 200)}`
    );
  }
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch a single document by _key.
 * Returns the document object, or null if not found (404).
 * Throws on other HTTP errors.
 */
export async function kvGetOne(collection, key) {
  const resp = await fetch(
    `${KV_BASE}/${collection}/${encodeURIComponent(key)}?output_mode=json`,
    { headers: headers(), credentials: 'include' }
  );
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`KV get failed [${collection}/${key}] HTTP ${resp.status}`);
  }
  return resp.json();
}

/**
 * Insert or replace a document identified by key.
 * The _key field is set automatically from the key parameter.
 * Throws on HTTP error.
 */
export async function kvUpsert(collection, key, doc) {
  const resp = await fetch(
    `${KV_BASE}/${collection}/${encodeURIComponent(key)}?output_mode=json`,
    {
      method:      'POST',
      headers:     headers({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body:        JSON.stringify({ ...doc, _key: key }),
    }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `KV upsert failed [${collection}/${key}] HTTP ${resp.status}: ${text.slice(0, 200)}`
    );
  }
  return resp.json();
}

/**
 * Delete a document by _key.
 * Throws on HTTP error.
 */
export async function kvDelete(collection, key) {
  const resp = await fetch(
    `${KV_BASE}/${collection}/${encodeURIComponent(key)}?output_mode=json`,
    {
      method:      'DELETE',
      headers:     headers(),
      credentials: 'include',
    }
  );
  if (!resp.ok) {
    throw new Error(
      `KV delete failed [${collection}/${key}] HTTP ${resp.status}`
    );
  }
}
