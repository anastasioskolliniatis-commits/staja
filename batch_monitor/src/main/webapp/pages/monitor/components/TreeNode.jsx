import { useState } from 'react';

const STATUS_COLOR = {
  ok:       '#00aa44',
  warning:  '#cc7700',
  critical: '#cc0000',
  error:    '#9900cc',
  no_data:  '#445566',
  stale:    '#334455',
  unknown:  '#444444',
};

const S = {
  row: (selected, depth) => ({
    display: 'flex',
    alignItems: 'center',
    padding: `2px 4px 2px ${8 + depth * 14}px`,
    cursor: 'pointer',
    userSelect: 'none',
    background: selected ? '#1e4a8c' : 'transparent',
    color: selected ? '#ffffff' : '#d4d4d4',
    borderLeft: selected ? '2px solid #5599ff' : '2px solid transparent',
  }),
  toggle: {
    width: '14px',
    fontSize: '9px',
    color: '#888',
    flexShrink: 0,
    textAlign: 'center',
  },
  dot: (status) => ({
    width: '10px',
    height: '10px',
    borderRadius: '2px',
    background: STATUS_COLOR[status] || STATUS_COLOR.unknown,
    flexShrink: 0,
    marginRight: '5px',
  }),
  label: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

export default function TreeNode({ node, depth, selectedId, onSelect }) {
  const hasChildren = node.children && node.children.length > 0;
  const isQuery = node.type === 'query';
  const isSelected = node.id === selectedId;

  // Groups default to expanded if depth <= 2
  const [expanded, setExpanded] = useState(depth <= 2);

  const handleClick = () => {
    // Always notify parent — groups show children summary, leaves show SPL results
    onSelect(node);
    // Auto-expand group when selected (but don't collapse — use triangle for that)
    if (hasChildren && !expanded) {
      setExpanded(true);
    }
  };

  return (
    <div>
      <div
        style={S.row(isSelected, depth)}
        onClick={handleClick}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#3a3a3a'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
        title={node.label}
      >
        {/* Expand / collapse triangle — separate click so it doesn't also select */}
        <span
          style={S.toggle}
          onClick={e => { e.stopPropagation(); if (hasChildren) setExpanded(x => !x); }}
        >
          {hasChildren ? (expanded ? '▼' : '▶') : ''}
        </span>

        {/* Status indicator */}
        <span style={S.dot(node.status)} />

        {/* Label */}
        <span style={S.label}>{node.label}</span>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
