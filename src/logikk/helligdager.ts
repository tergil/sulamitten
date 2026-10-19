// Norske helligdager (røde dager) og merkedager (morsdag, kanelbollens dag …) til kalenderen.
// Regnes ut for hvert år – ingenting lagres. Tas ikke med i kalenderabonnementet (telefonen har dem fra før).
// Ren logikk – testes i scripts/test-beregning.ts.
import { andreSondag } from './gaveaar';

export interface Merkedag {
  dato: string;
  navn: string;
  /** Offentlig fridag (rød dag) */
  rod: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const DAG = 86_400_000;
const flytt = (dato: string, dager: number) => {
  const [a, m, d] = dato.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) + dager * DAG).toISOString().slice(0, 10);
};

/** 1. påskedag (gregoriansk, «anonym algoritme» / Meeus) */
export function paaskedag(aar: number): string {
  const a = aar % 19;
  const b = Math.floor(aar / 100);
  const c = aar % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maaned = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${aar}-${pad(maaned)}-${pad(dag)}`;
}

/** Alle helligdager og merkedager i året, sortert på dato */
export function merkedager(aar: number): Merkedag[] {
  const p = paaskedag(aar);
  const dato = (m: number, d: number) => `${aar}-${pad(m)}-${pad(d)}`;
  // 4. søndag i advent er siste søndag før 25. desember
  const jul = dato(12, 25);
  const ukedagJul = new Date(`${jul}T00:00:00Z`).getUTCDay(); // 0 = søndag
  const fjerdeAdvent = flytt(jul, -(ukedagJul === 0 ? 7 : ukedagJul));
  const rode: [string, string][] = [
    [dato(1, 1), 'Første nyttårsdag'],
    [flytt(p, -3), 'Skjærtorsdag'],
    [flytt(p, -2), 'Langfredag'],
    [p, 'Første påskedag'],
    [flytt(p, 1), 'Andre påskedag'],
    [dato(5, 1), 'Arbeidernes dag'],
    [dato(5, 17), 'Grunnlovsdag'],
    [flytt(p, 39), 'Kristi himmelfartsdag'],
    [flytt(p, 49), 'Første pinsedag'],
    [flytt(p, 50), 'Andre pinsedag'],
    [dato(12, 25), 'Første juledag'],
    [dato(12, 26), 'Andre juledag'],
  ];
  const andre: [string, string][] = [
    [dato(2, 6), 'Samefolkets dag'],
    [andreSondag(aar, 2), 'Morsdag'],
    [dato(2, 14), 'Valentinsdag'],
    [flytt(p, -49), 'Fastelavn'],
    [flytt(p, -7), 'Palmesøndag'],
    [flytt(p, -1), 'Påskeaften'],
    [dato(6, 23), 'Sankthansaften'],
    [dato(10, 4), 'Kanelbollens dag'],
    [dato(10, 31), 'Halloween'],
    [andreSondag(aar, 11), 'Farsdag'],
    [flytt(fjerdeAdvent, -21), 'Første søndag i advent'],
    [flytt(fjerdeAdvent, -14), 'Andre søndag i advent'],
    [flytt(fjerdeAdvent, -7), 'Tredje søndag i advent'],
    [fjerdeAdvent, 'Fjerde søndag i advent'],
    [dato(12, 13), 'Luciadagen'],
    [dato(12, 24), 'Julaften'],
    [dato(12, 31), 'Nyttårsaften'],
  ];
  return [...rode.map(([d, navn]) => ({ dato: d, navn, rod: true })), ...andre.map(([d, navn]) => ({ dato: d, navn, rod: false }))]
    .sort((a, b) => a.dato.localeCompare(b.dato) || Number(b.rod) - Number(a.rod));
}

/** Helligdager og merkedager i perioden fra–til (inklusiv) */
export function merkedagerMellom(fra: string, til: string): Merkedag[] {
  const ut: Merkedag[] = [];
  for (let aar = Number(fra.slice(0, 4)); aar <= Number(til.slice(0, 4)); aar++) {
    ut.push(...merkedager(aar).filter((m) => m.dato >= fra && m.dato <= til));
  }
  return ut;
}
