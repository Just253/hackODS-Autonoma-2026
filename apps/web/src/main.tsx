import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@hackods/ui/tokens.css';
import { App } from './app/App.js';
import { registrarServiceWorker } from './pwa/registro-sw.js';
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

// PWA: el shell se precachea con el build real (src/pwa/contrato-sw.ts).
// Se registra en dev y en prod: el modo avión de la demo se prueba en local,
// y "solo en PROD" era lo que dejaba el arranque offline sin cubrir.
void registrarServiceWorker(undefined, ({ versionNueva }) => {
  if (versionNueva) {
    // No se recarga sola: puede estar a mitad de un servicio.
    window.dispatchEvent(new CustomEvent('hackods:version-nueva'));
  }
});
