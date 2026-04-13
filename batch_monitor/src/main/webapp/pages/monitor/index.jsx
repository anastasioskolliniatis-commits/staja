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
