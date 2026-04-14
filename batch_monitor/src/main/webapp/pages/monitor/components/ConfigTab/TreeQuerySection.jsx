/**
 * TreeQuerySection
 *
 * Admin enters the SPL that defines the node hierarchy.
 * Required output fields: node_id, parent_node_id, node_label
 * Leaf nodes (those with services mapped) identified by node_id presence in bm_mappings.
 *
 * "Test in Search" opens SPL in Splunk's native search in a new tab.
 * "Save" writes to bm_tree_config KV under key "config".
 */

import { useState, useEffect } from 'react';
import { kvGetAll, kvUpsert } from '../../hooks/useSplunkKV';

const FIELD_TAG = (name) => (
  <code style={{
    background: '#1a1a2a',
    border: '1px solid #3a3a5a',
    padding: '1px 6px',
    borderRadius: '3px',
    color: '#7fc3ff',
    fontFamily: 'monospace',
    fontSize: '11px',
    margin: '0 2px',
  }}>
    {name}
  </code>
);

export default function TreeQuerySection() {
  const [spl,     setSpl]     = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [status,  setStatus]  = useState(null); // { type: 'ok'|'error', text }

  useEffect(() => {
    kvGetAll('bm_tree_config')
      .then(docs => { if (docs.length > 0) setSpl(docs[0].tree_spl || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!spl.trim()) {
      setStatus({ type: 'error', text: 'Query cannot be empty.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await kvUpsert('bm_tree_config', 'config', { tree_spl: spl.trim() });
      setStatus({ type: 'ok', text: 'Saved. Collector will use this query on next run.' });
    } catch (e) {
      setStatus({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = () => {
    const q = encodeURIComponent(spl.trim());
    window.open(`/en-US/app/batch_monitor/search?q=${q}`, '_blank');
  };

  return (
    <div style={{ maxWidth: '820px' }}>
      <h3 style={styles.heading}>Tree Definition Query</h3>

      <p style={styles.hint}>
        SPL that defines the monitoring hierarchy. Must return:
        {FIELD_TAG('node_id')}
        {FIELD_TAG('parent_node_id')}
        {FIELD_TAG('node_label')}
        &mdash; one row per node. Group nodes have no services mapped to them; leaf nodes do.
      </p>

      <p style={{ ...styles.hint, marginTop: '4px' }}>
        The optional token {FIELD_TAG('$node_id$')} in service SPLs will be substituted
        with the leaf node&apos;s <code style={{ color: '#7fc3ff' }}>node_id</code> at collection time.
      </p>

      {loading ? (
        <div style={styles.muted}>Loading&hellip;</div>
      ) : (
        <>
          <textarea
            value={spl}
            onChange={e => { setSpl(e.target.value); setStatus(null); }}
            rows={12}
            spellCheck={false}
            placeholder={
              '| inputlookup batch_nodes\n' +
              '| table node_id, parent_node_id, node_label'
            }
            style={styles.textarea}
          />

          {status && (
            <div style={{
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '3px',
              fontSize: '11px',
              background: status.type === 'ok' ? '#1a3a1a' : '#3a1212',
              color:      status.type === 'ok' ? '#88dd88' : '#ff9999',
              border: `1px solid ${status.type === 'ok' ? '#2a5a2a' : '#5a2222'}`,
            }}>
              {status.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
            <button
              onClick={handleTest}
              disabled={!spl.trim()}
              style={styles.btnSecondary(!!spl.trim())}
            >
              Test in Search &#8599;
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !spl.trim()}
              style={styles.btnPrimary(!saving && !!spl.trim())}
            >
              {saving ? 'Saving\u2026' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  heading: {
    color: '#ddd',
    fontSize: '13px',
    fontWeight: '600',
    margin: '0 0 8px 0',
  },
  hint: {
    color: '#777',
    fontSize: '11px',
    lineHeight: '1.6',
    margin: '0 0 14px 0',
  },
  muted: { color: '#555', fontSize: '12px' },
  textarea: {
    display: 'block',
    width: '100%',
    background: '#181828',
    color: '#e0e0e0',
    border: '1px solid #3a3a5a',
    borderRadius: '4px',
    padding: '10px 12px',
    fontFamily: '"Consolas", "Courier New", monospace',
    fontSize: '12px',
    lineHeight: '1.7',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
  },
  btnSecondary: (enabled) => ({
    padding: '7px 16px',
    fontSize: '12px',
    background: '#252535',
    border: '1px solid #3a3a5a',
    borderRadius: '3px',
    color: enabled ? '#ccc' : '#555',
    cursor: enabled ? 'pointer' : 'not-allowed',
  }),
  btnPrimary: (enabled) => ({
    padding: '7px 20px',
    fontSize: '12px',
    background: enabled ? '#2a4a7a' : '#1a2a3a',
    border: `1px solid ${enabled ? '#4477aa' : '#2a3a4a'}`,
    borderRadius: '3px',
    color: enabled ? '#ddd' : '#555',
    cursor: enabled ? 'pointer' : 'not-allowed',
  }),
};
