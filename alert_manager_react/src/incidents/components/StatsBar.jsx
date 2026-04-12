const CARDS = [
  { key: 'total',       label: 'Total',       color: '#ffffff' },
  { key: 'new',         label: 'New',         color: '#aaaaaa' },
  { key: 'assigned',    label: 'Assigned',    color: '#6fb3f0' },
  { key: 'in_progress', label: 'In Progress', color: '#6ff06f' },
  { key: 'on_hold',     label: 'On Hold',     color: '#f0c040' },
  { key: 'resolved',    label: 'Resolved',    color: '#555555' },
];

export default function StatsBar({ stats }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
      {CARDS.map(({ key, label, color }) => (
        <div key={key} style={{
          background: '#1c1c2e',
          border: '1px solid #2e2e45',
          borderRadius: '4px',
          padding: '10px 18px',
          textAlign: 'center',
          minWidth: '88px',
          flex: '1',
        }}>
          <div style={{ fontSize: '26px', fontWeight: 700, color, lineHeight: 1.1 }}>
            {stats[key] ?? 0}
          </div>
          <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: '2px' }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
