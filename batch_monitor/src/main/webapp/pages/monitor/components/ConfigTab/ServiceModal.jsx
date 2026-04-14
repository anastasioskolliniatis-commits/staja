/**
 * ServiceModal — add or edit a service definition.
 *
 * Fields:
 *   service_name        — unique key, cannot change after creation
 *   service_description — display label
 *   service_spl         — full SPL; must return service_status per row
 *   status_field        — field name driving status (default: service_status)
 *   display_fields      — ordered list of fields to show in right panel drill-down
 *
 * display_fields is stored as a JSON array string in KV store.
 * The UI shows a simple ordered list with add/remove/reorder.
 */

import { useState } from 'react';

export default function ServiceModal({ initial, onSave, onClose }) {
  const isNew = !initial?.service_name;

  // Parse display_fields from stored JSON string or array
  const parseFields = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
  };

  const [form, setForm] = useState({
    service_name:        initial?.service_name        ?? '',
    service_description: initial?.service_description ?? '',
    service_spl:         initial?.service_spl         ?? '',
    status_field:        initial?.status_field         ?? 'service_status',
    display_fields:      parseFields(initial?.display_fields),
  });
  const [newField, setNewField] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  const set = (field) => (e) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const addField = () => {
    const f = newField.trim();
    if (!f || form.display_fields.includes(f)) return;
    setForm(f2 => ({ ...f2, display_fields: [...f2.display_fields, f] }));
    setNewField('');
  };

  const removeField = (idx) =>
    setForm(f => ({ ...f, display_fields: f.display_fields.filter((_, i) => i !== idx) }));

  const moveField = (idx, dir) => {
    const arr  = [...form.display_fields];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setForm(f => ({ ...f, display_fields: arr }));
  };

  const handleSave = async () => {
    if (!form.service_name.trim()) { setError('Service name is required.'); return; }
    if (!form.service_spl.trim())  { setError('SPL query is required.');    return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...form,
        service_name:   form.service_name.trim(),
        status_field:   form.status_field.trim() || 'service_status',
        display_fields: JSON.stringify(form.display_fields),
      });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: '#ddd', fontSize: '14px', margin: 0 }}>
            {isNew ? 'Add Service' : `Edit: ${initial.service_name}`}
          </h3>
          <button onClick={onClose} style={closeBtn}>&#215;</button>
        </div>

        {/* service_name */}
        <Label>Service Name</Label>
        <input
          value={form.service_name}
          onChange={set('service_name')}
          disabled={!isNew}
          placeholder="e.g. clearing_errors"
          style={{ ...input, opacity: isNew ? 1 : 0.55, cursor: isNew ? 'text' : 'not-allowed' }}
        />
        <Hint>Unique identifier — cannot be changed after creation.</Hint>

        {/* service_description */}
        <Label>Description</Label>
        <input
          value={form.service_description}
          onChange={set('service_description')}
          placeholder="e.g. Clearing batch error check"
          style={input}
        />

        {/* service_spl */}
        <Label>SPL Query</Label>
        <Hint>
          Must return a <Code>service_status</Code> field per row
          (<Code>ok</Code> / <Code>warning</Code> / <Code>critical</Code>).
          Use <Code>$node_id$</Code> as optional node substitution token.
          Collector takes the worst status across all rows.
        </Hint>
        <textarea
          value={form.service_spl}
          onChange={set('service_spl')}
          rows={7}
          spellCheck={false}
          placeholder={
            'index=batch_sql\n' +
            '| eval service_status=case(error_count>0,"critical",lag_min>30,"warning",true(),"ok")\n' +
            '| table job_name, scheduled_start, lag_min, error_count, service_status'
          }
          style={{ ...input, fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.7', resize: 'vertical' }}
        />
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => window.open(
              `/en-US/app/batch_monitor/search?q=${encodeURIComponent(form.service_spl)}`,
              '_blank'
            )}
            disabled={!form.service_spl.trim()}
            style={{ ...btnSm, marginTop: '6px' }}
          >
            Test in Search &#8599;
          </button>
        </div>

        {/* status_field */}
        <Label>Status Field</Label>
        <Hint>Field name used to determine status. Default: <Code>service_status</Code></Hint>
        <input
          value={form.status_field}
          onChange={set('status_field')}
          placeholder="service_status"
          style={{ ...input, width: '220px', marginBottom: '20px' }}
        />

        {/* display_fields */}
        <Label>Display Fields (drill-down columns)</Label>
        <Hint>
          Fields shown as columns in the right panel when a node is clicked.
          Order matters — first field is leftmost column.
        </Hint>

        <div style={{ marginBottom: '10px' }}>
          {form.display_fields.length === 0 && (
            <div style={{ color: '#555', fontSize: '11px', marginBottom: '8px' }}>
              No fields defined — all SPL result fields will be shown.
            </div>
          )}
          {form.display_fields.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span style={{ color: '#7fc3ff', fontFamily: 'monospace', fontSize: '12px', flex: 1 }}>{f}</span>
              <button onClick={() => moveField(i, -1)} disabled={i === 0} style={arrowBtn}>&#8593;</button>
              <button onClick={() => moveField(i, +1)} disabled={i === form.display_fields.length - 1} style={arrowBtn}>&#8595;</button>
              <button onClick={() => removeField(i)} style={{ ...arrowBtn, color: '#cc6666' }}>&#215;</button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <input
              value={newField}
              onChange={e => setNewField(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addField()}
              placeholder="field_name"
              style={{ ...input, width: '180px', padding: '5px 8px' }}
            />
            <button onClick={addField} style={btnSm}>+ Add Field</button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: '#3a1212', border: '1px solid #5a2222', borderRadius: '3px', padding: '8px 12px', color: '#ff9999', fontSize: '11px', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
          <button onClick={onClose} style={{ ...btnSm, padding: '8px 20px' }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '8px 22px', fontSize: '12px', background: saving ? '#1a2a3a' : '#2a4a7a', border: '1px solid #4477aa', borderRadius: '3px', color: '#ddd', cursor: saving ? 'wait' : 'pointer' }}
          >
            {saving ? 'Saving\u2026' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const Label = ({ children }) => (
  <div style={{ color: '#9999bb', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '5px' }}>
    {children}
  </div>
);

const Hint = ({ children }) => (
  <div style={{ color: '#555577', fontSize: '11px', lineHeight: '1.5', marginBottom: '8px' }}>
    {children}
  </div>
);

const Code = ({ children }) => (
  <code style={{ background: '#1a1a2a', border: '1px solid #3a3a5a', padding: '1px 5px', borderRadius: '3px', color: '#7fc3ff', fontFamily: 'monospace', fontSize: '10px' }}>
    {children}
  </code>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.75)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
};

const modal = {
  background: '#1e1e2e',
  border: '1px solid #3a3a5a',
  borderRadius: '6px',
  padding: '24px 28px',
  width: '640px',
  maxWidth: '92vw',
  maxHeight: '90vh',
  overflowY: 'auto',
};

const closeBtn = {
  background: 'none', border: 'none',
  color: '#666', fontSize: '20px',
  cursor: 'pointer', lineHeight: 1,
  padding: '0 4px',
};

const input = {
  display: 'block',
  width: '100%',
  background: '#12121e',
  border: '1px solid #3a3a5a',
  borderRadius: '3px',
  padding: '7px 10px',
  color: '#e0e0e0',
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: '14px',
};

const btnSm = {
  padding: '5px 12px',
  fontSize: '11px',
  background: '#252535',
  border: '1px solid #3a3a5a',
  borderRadius: '3px',
  color: '#aaa',
  cursor: 'pointer',
};

const arrowBtn = {
  background: 'none',
  border: '1px solid #3a3a5a',
  borderRadius: '3px',
  color: '#888',
  cursor: 'pointer',
  padding: '1px 6px',
  fontSize: '12px',
};
