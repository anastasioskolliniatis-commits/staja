const APP    = 'alert_manager_react';
const locale = (location.pathname.match(/^\/([^/]+)/) || ['', 'en-US'])[1];
const KV     = `/${locale}/splunkd/__raw/servicesNS/nobody/${APP}/storage/collections/data`;
const AUTH   = `/${locale}/splunkd/__raw/services`;

// Matches the cookie name Splunk uses for CSRF in both 8.x and 9/10.x
function formKey() {
  const m = document.cookie.match(/splunkd_form_%2F=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function req(url, opts = {}) {
  const headers = {
    'X-Splunk-Form-Key': formKey(),
    'X-Requested-With': 'XMLHttpRequest',
    ...opts.headers,
  };
  return fetch(url, {
    method: opts.method || 'GET',
    headers,
    credentials: 'include',
    body: opts.body,
  }).then(r => {
    if (!r.ok) return r.text().then(t => { throw new Error(`${r.status}: ${t}`); });
    return r.json().catch(() => ({}));
  });
}

function kvGet(col, query) {
  let url = `${KV}/${col}?output_mode=json&count=-1`;
  if (query) url += `&query=${encodeURIComponent(JSON.stringify(query))}`;
  return req(url);
}

function kvPost(col, data, key) {
  const url = `${KV}/${col}${key ? `/${encodeURIComponent(key)}` : ''}?output_mode=json`;
  return req(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

function kvDel(col, key) {
  return req(`${KV}/${col}/${encodeURIComponent(key)}?output_mode=json`, { method: 'DELETE' });
}

function authGet(path) {
  return req(`${AUTH}${path}?output_mode=json&count=-1`);
}

// ── Incidents ──────────────────────────────────────────────────────────────
export const getIncidents = () => kvGet('incidents');

export const createIncident = data => kvPost('incidents', data);

export const updateIncident = (key, data) => kvPost('incidents', data, key);

export const deleteIncident = key => kvDel('incidents', key);

// ── Comments ───────────────────────────────────────────────────────────────
export const getComments = incidentId =>
  kvGet('incident_comments', { incident_id: incidentId });

export const addComment = data => kvPost('incident_comments', data);

// ── Users / Roles ──────────────────────────────────────────────────────────
export const getUsers = () => authGet('/authentication/users');

export const getRoles = () => authGet('/authorization/roles');

// ── Incident counter ───────────────────────────────────────────────────────
export async function getNextIncidentId() {
  const rows = await kvGet('incident_counter');
  let n;
  if (!rows || !rows.length) {
    n = 1;
    await kvPost('incident_counter', { _key: 'main', counter: 1 });
  } else {
    n = (parseInt(rows[0].counter, 10) || 0) + 1;
    await kvPost('incident_counter', { counter: n }, 'main');
  }
  return `INC-${String(n).padStart(3, '0')}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────
export const now = () => Math.floor(Date.now() / 1000);

export const currentUser = () => {
  try { return (window.$C && window.$C.USERNAME) || 'unknown'; } catch { return 'unknown'; }
};
