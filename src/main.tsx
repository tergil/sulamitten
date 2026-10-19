import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './stil/app.css';

// Service worker for push-varsler (se public/sw.js). Mellomlagrer ingenting.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e) => console.error('Service worker:', e));
  lyttEtterVarseltrykk();
}

/**
 * Trykk på et push-varsel: gå dit varselet peker (f.eks. #/lister/<id> eller #/innboks).
 * Service workeren sender beskjed når appen er åpen, og legger igjen målet i cachen ellers –
 * iPhone åpner nemlig ofte startsiden i stedet for lenken i varselet.
 */
function lyttEtterVarseltrykk() {
  const maal = new URL(`${import.meta.env.BASE_URL}varsel-maal`, location.origin).href;
  const gaa = (url: string) => {
    const hash = new URL(url, location.href).hash;
    if (hash && location.hash !== hash) location.hash = hash;
  };
  const hent = async () => {
    try {
      if (!('caches' in window)) return;
      const cache = await caches.open('sulamitten-varsel');
      const svar = await cache.match(maal);
      if (!svar) return;
      await cache.delete(maal);
      const { url, tid } = (await svar.json()) as { url: string; tid: number };
      // Gamle mål (appen ble ikke åpnet den gangen) ignoreres
      if (Date.now() - tid < 5 * 60_000) gaa(url);
    } catch { /* ignorer – appen åpnes bare på startsiden */ }
  };
  navigator.serviceWorker.addEventListener('message', (e) => {
    if ((e.data as { type?: string })?.type !== 'aapne') return;
    gaa((e.data as { url: string }).url);
    void caches?.open('sulamitten-varsel').then((c) => c.delete(maal)).catch(() => {});
  });
  navigator.serviceWorker.startMessages();
  void hent();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void hent(); });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
