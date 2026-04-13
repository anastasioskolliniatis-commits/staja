import TreeNode from './TreeNode';

export default function StateTree({ tree, selectedId, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#2b2b2b' }}>
      {/* Header */}
      <div style={{
        background: '#1e1e1e',
        color: '#ffffff',
        padding: '6px 10px',
        fontSize: '11px',
        fontWeight: 'bold',
        letterSpacing: '0.5px',
        borderBottom: '1px solid #444',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <span style={{ color: '#5599ff' }}>◈</span> State Tree
      </div>

      {/* Scrollable tree body */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' }}>
        <TreeNode
          node={tree}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
