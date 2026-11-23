import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@hackods/ui/tokens.css';
import { App } from './app/App.js';
import './styles/tailwind.css';

const raiz = document.getElementById('root');

if (raiz === null) {
  throw new Error('Falta el elemento #root en index.html');
}

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA basica: el shell se precachea. La estrategia definitiva es M0/M6.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
