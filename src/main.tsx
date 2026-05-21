import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker after the app mounts so it can cache
// the shell + tier1.json for offline use. Silent fail — the app
// works without a SW, just without offline support.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* registration failed — fine, just no offline cache */
  });
}
