// Bjella: varslene i appen (tabellen varsel_innboks, skrives av Edge Function «varsler»).
// Delt av topplinjen (antall uleste) og siden Varsler (#/innboks). Hentes på nytt når appen får fokus og hvert par minutter.
import { useEffect, useSyncExternalStore } from 'react';
import type { InnboksVarsel } from './modell';
import { STANDARD_VARSLER } from './modell';
import { lager } from './lager';

export interface InnboksData {
  varsler: InnboksVarsel[];
  lastet: boolean;
  /** Mangler tabellen (varsler.sql ikke kjørt) eller nettet, vises bjella uten tall */
  feil: string | null;
}

let data: InnboksData = { varsler: [], lastet: false, feil: null };
const lyttere = new Set<() => void>();
let henter: Promise<void> | null = null;
let sjekketInnstillinger = false;

function sett(endring: Partial<InnboksData>) {
  data = { ...data, ...endring };
  lyttere.forEach((f) => f());
}

export function lastInnboks(): Promise<void> {
  if (henter) return henter;
  henter = (async () => {
    try {
      sett({ varsler: await lager.hentInnboks(), lastet: true, feil: null });
    } catch (e) {
      sett({ lastet: true, feil: e instanceof Error ? e.message : String(e) });
    } finally {
      henter = null;
    }
  })();
  return henter;
}

/**
 * Timejobben tar bare med brukere som har lagrede varselinnstillinger. Har du aldri vært innom Varsler,
 * lagres standardvalgene, så bjella virker også uten push.
 */
async function sikreInnstillinger() {
  if (sjekketInnstillinger) return;
  sjekketInnstillinger = true;
  try {
    if (!(await lager.hentVarselInnstillinger())) await lager.lagreVarselInnstillinger(structuredClone(STANDARD_VARSLER));
  } catch { /* prøver igjen neste gang appen startes */ }
}

/** Merker alt som lest (når varslene er sett). Vises som lest med en gang, lagres i bakgrunnen. */
export async function merkAltLest() {
  if (!data.varsler.some((v) => !v.lest)) return;
  sett({ varsler: data.varsler.map((v) => ({ ...v, lest: true })) });
  try { await lager.merkInnboksLest(); } catch { void lastInnboks(); }
}

function lytt(f: () => void) {
  lyttere.add(f);
  return () => { lyttere.delete(f); };
}

export function useInnboks(): InnboksData & { uleste: number } {
  const d = useSyncExternalStore(lytt, () => data);
  useEffect(() => {
    if (!data.lastet) void lastInnboks();
    void sikreInnstillinger();
    const synlig = () => { if (document.visibilityState === 'visible') void lastInnboks(); };
    document.addEventListener('visibilitychange', synlig);
    const tidtaker = setInterval(synlig, 3 * 60_000);
    return () => { document.removeEventListener('visibilitychange', synlig); clearInterval(tidtaker); };
  }, []);
  return { ...d, uleste: d.varsler.filter((v) => !v.lest).length };
}
