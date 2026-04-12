import { createRoot } from 'react-dom/client';
import { SplunkThemeProvider } from '@splunk/themes';
import App from './App';

function mount() {
  const container = document.getElementById('root');
  if (!container) return;
  createRoot(container).render(
    <SplunkThemeProvider family="enterprise" colorScheme="dark">
      <App />
    </SplunkThemeProvider>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
