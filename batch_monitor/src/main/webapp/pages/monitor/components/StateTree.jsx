import TreeNode from './TreeNode';

export default function StateTree({ tree, loading, selectedId, onSelect, onReload }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#2b2b2b' }}>

      {/* Header */}
      <div style={{
        background:    '#1e1e1e',
        color:         '#ffffff',
        padding:       '6px 10px',
        fontSize:      '11px',
        fontWeight:    'bold',
        letterSpacing: '0.5px',
        borderBottom:  '1px solid #3a3a5a',
        flexShrink:    0,
        display:       'flex',
        alignItems:    'center',
        justifyContent:'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#5599ff', fontSize: '9px', letterSpacing: '1px' }}>▶▶</span>
          <span style={{ letterSpacing: '0.6px' }}>STATE TREE</span>
        </div>
        <button
          onClick={onReload}
          disabled={loading}
          title="Reload tree"
          style={{
            background:  'none',
            border:      'none',
            color:       loading ? '#444' : '#666',
            cursor:      loading ? 'default' : 'pointer',
            fontSize:    '13px',
            padding:     '0 2px',
            lineHeight:  1,
          }}
        >
          &#x21BB;
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' }}>
        {loading && (
          <div style={{ color: '#555', fontSize: '11px', padding: '16px 12px' }}>
            Loading tree&hellip;
          </div>
        )}

        {!loading && !tree && (
          <div style={{ color: '#555', fontSize: '11px', padding: '16px 12px', lineHeight: '1.6' }}>
            Tree not configured.<br />
            Go to <strong style={{ color: '#7777cc' }}>Config &gt; Tree Query</strong> to define the hierarchy.
          </div>
        )}

        {!loading && tree && (
          <TreeNode
            node={tree}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}
