import { createRoot } from 'react-dom/client';
import App from './App';

function mount(container) {
  createRoot(container).render(<App />);
}

const el = document.getElementById('root');
if (el) {
  mount(el);
} else {
  document.addEventListener('DOMContentLoaded', () => {
    const found = document.getElementById('root');
    if (found) mount(found);
  });
}
