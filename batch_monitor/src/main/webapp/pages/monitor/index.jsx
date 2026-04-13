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

const el = document.getElementById('root');
if (el) {
  mount(el);
}
