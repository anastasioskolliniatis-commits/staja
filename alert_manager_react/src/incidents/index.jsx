import { createRoot } from 'react-dom/client';
import { SplunkThemeProvider } from '@splunk/themes';
import App from './App';

function mount(container) {
  createRoot(container).render(
    <SplunkThemeProvider family="enterprise" colorScheme="dark">
      <App />
    </SplunkThemeProvider>
  );
}

// Splunk renders <html> panel content AFTER the script loads via require.js,
// so #root may not exist yet. Use a MutationObserver to wait for it.
function waitAndMount() {
  const el = document.getElementById('root');
  if (el) { mount(el); return; }

  const observer = new MutationObserver(() => {
    const found = document.getElementById('root');
    if (found) { observer.disconnect(); mount(found); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitAndMount);
} else {
  waitAndMount();
}
