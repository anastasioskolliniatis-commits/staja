import { useState } from 'react';
import { TREE } from './mockData';
import StateTree from './components/StateTree';
import MetricsPanel from './components/MetricsPanel';

export default function App() {
  const [selected, setSelected] = useState(null);   // selected query node
  const [openTabs, setOpenTabs] = useState([]);     // list of open query nodes
  const [activeTab, setActiveTab] = useState(null); // id of active tab

  const handleSelect = (node) => {
    setSelected(node);
    // Open a new tab or switch to existing
    if (!openTabs.find(t => t.id === node.id)) {
      setOpenTabs(prev => [...prev, node]);
    }
    setActiveTab(node.id);
  };

  const handleCloseTab = (id) => {
    const remaining = openTabs.filter(t => t.id !== id);
    setOpenTabs(remaining);
    if (activeTab === id) {
      setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  };

  const activeNode = openTabs.find(t => t.id === activeTab) || null;

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 60px)',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      fontSize: '12px',
      background: '#1e1e1e',
      overflow: 'hidden',
    }}>
      {/* ── Left: State Tree ── */}
      <div style={{
        width: '260px',
        minWidth: '200px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #444',
      }}>
        <StateTree
          tree={TREE}
          selectedId={selected?.id}
          onSelect={handleSelect}
        />
      </div>

      {/* ── Right: Metrics Panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <MetricsPanel
          openTabs={openTabs}
          activeTab={activeTab}
          activeNode={activeNode}
          onSelectTab={setActiveTab}
          onCloseTab={handleCloseTab}
        />
      </div>
    </div>
  );
}
