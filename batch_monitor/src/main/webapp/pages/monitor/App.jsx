import { useState, useEffect, useCallback } from 'react';
import { TREE } from './mockData';
import StateTree       from './components/StateTree';
import MetricsPanel    from './components/MetricsPanel';
import AppTabs         from './components/AppTabs';
import ServicesStateTab from './components/ServicesStateTab';
import ConfigTab       from './components/ConfigTab';
import { useCurrentUser } from './hooks/useCurrentUser';
import { kvGetAll }    from './hooks/useSplunkKV';

const RESULTS_REFRESH_MS = 60_000;

export default function App() {
  const { isAdmin } = useCurrentUser();

  // Top-level navigation
  const [appTab, setAppTab] = useState('monitor'); // 'monitor' | 'services' | 'config'

  // Monitor panel state
  const [selected,   setSelected]   = useState(null);
  const [openTabs,   setOpenTabs]   = useState([]);
  const [activeTab,  setActiveTab]  = useState(null);

  // Shared bm_results — fetched once, refreshed every 60s
  // Used by ServicesStateTab; will also drive tree status colors once live data is wired
  const [results,      setResults]      = useState([]);
  const [resultsError, setResultsError] = useState(null);

  const fetchResults = useCallback(() => {
    kvGetAll('bm_results')
      .then(data => { setResults(data); setResultsError(null); })
      .catch(e   => setResultsError(e.message));
  }, []);

  useEffect(() => {
    fetchResults();
    const timer = setInterval(fetchResults, RESULTS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchResults]);

  // Monitor tab handlers
  const handleSelect = (node) => {
    setSelected(node);
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

  const activeNode = openTabs.find(t => t.id === activeTab) ?? null;

  return (
    <div style={{
      display:    'flex',
      flexDirection: 'column',
      height:     'calc(100vh - 60px)',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      fontSize:   '12px',
      background: '#1e1e1e',
      overflow:   'hidden',
    }}>
      {/* ── Top nav ── */}
      <AppTabs active={appTab} onSelect={setAppTab} isAdmin={isAdmin} />

      {/* ── Monitor: State Tree + Metrics Panel ── */}
      {appTab === 'monitor' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{
            width: '260px', minWidth: '200px', flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            borderRight: '1px solid #3a3a5a',
          }}>
            <StateTree
              tree={TREE}
              selectedId={selected?.id}
              onSelect={handleSelect}
            />
          </div>
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
      )}

      {/* ── Services State: flat grid ── */}
      {appTab === 'services' && (
        <ServicesStateTab
          results={results}
          error={resultsError}
          onRefresh={fetchResults}
        />
      )}

      {/* ── Config: admin only ── */}
      {appTab === 'config' && isAdmin && (
        <ConfigTab />
      )}

      {/* Safety: non-admin lands on config tab (shouldn't happen — AppTabs hides it) */}
      {appTab === 'config' && !isAdmin && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '13px' }}>
          Access restricted to administrators.
        </div>
      )}
    </div>
  );
}
