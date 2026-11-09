// Nedtelling på Oversikt: avtaler og listepunkter som er merket «Vis nedtelling», og hvor lenge det er igjen.
// Ren logikk uten React.
import type { Hendelse, KalenderKategoriDef, Liste, Punkt } from '../data/modell';
import { STANDARD_KALENDERKATEGORIER, erForbi, kalenderPoster, leggTilDager, minutter, type KalenderPost } from './kalender';
import { dagerMellom, erFerdig } from './lister';

export interface Nedtelling {
  nokkel: string;
  tittel: string;
  dato: string;
  /** «HH:MM» – mangler = hele dagen */
  fra?: string;
  /** Plass i fargepaletten (--k0 … --k7), -1 = nøytral */
  farge: number;
  kilde: 'avtale' | 'punkt';
  post?: KalenderPost;
  liste?: Liste;
  punkt?: Punkt;
}

type Naa = { dato: string; minutt: number };

/** Avtaler leter så langt fram (en årlig avtale skal også finnes) */
const HORISONT = 400;

/**
 * Alt som er merket med nedtelling og ikke er over, det nærmeste først. En serie telles ned til neste gang
 * (en endret dag i serien kan slå nedtellingen av eller på for den dagen). Avlyste avtaler og ferdige punkter er ikke med.
 */
export function nedtellinger(hendelser: Hendelse[], lister: Liste[], punkter: Punkt[], naa: Naa,
  kategorier: KalenderKategoriDef[] = STANDARD_KALENDERKATEGORIER): Nedtelling[] {
  // Bare seriene/avtalene som har (eller har en dag med) nedtelling – resten trengs ikke
  const merket = new Set(hendelser.filter((h) => h.nedtelling).map((h) => h.serieId ?? h.id));
  const aktuelle = hendelser.filter((h) => merket.has(h.id) || (!!h.serieId && merket.has(h.serieId)));
  const sett = new Set<string>();
  const ut: Nedtelling[] = [];
  const poster = aktuelle.length
    ? kalenderPoster(aktuelle, [], [], leggTilDager(naa.dato, -60), leggTilDager(naa.dato, HORISONT), { anledninger: false, frister: false }, kategorier)
    : [];
  for (const p of poster.sort((a, b) => a.dato.localeCompare(b.dato) || (a.fra ?? '').localeCompare(b.fra ?? ''))) {
    const f = p.forekomst;
    if (!f?.hendelse.nedtelling || p.avlyst || erForbi(p, naa) || sett.has(f.serie.id)) continue;
    sett.add(f.serie.id);
    ut.push({ nokkel: p.nokkel, tittel: p.tittel, dato: p.dato, fra: p.fra, farge: p.farge, kilde: 'avtale', post: p });
  }

  const listeMap = new Map(lister.filter((l) => !l.mal).map((l) => [l.id, l]));
  for (const punkt of punkter) {
    const liste = listeMap.get(punkt.listeId);
    if (!liste || !punkt.nedtelling || !punkt.dato || punkt.dato < naa.dato || erFerdig(liste.type, punkt.status)) continue;
    ut.push({ nokkel: `punkt:${punkt.id}`, tittel: punkt.tekst, dato: punkt.dato, farge: -1, kilde: 'punkt', liste, punkt });
  }
  return ut.sort((a, b) => a.dato.localeCompare(b.dato) || (a.fra ?? '').localeCompare(b.fra ?? ''));
}

export interface Tid {
  /** Delene som vises store: [{ tall: '12', enhet: 'dager' }] eller [{ tall: '5', enhet: 't' }, { tall: '12', enhet: 'min' }] */
  deler: { tall: string; enhet: string }[];
  /** Hele teksten, til skjermlesere og små rader: «12 dager», «5 timer og 12 minutter», «I dag» */
  tekst: string;
  /** Under ett døgn igjen (vises med minutter og oppdateres hvert minutt) */
  snart: boolean;
}

const flertall = (n: number, en: string, flere: string) => `${n} ${n === 1 ? en : flere}`;

/**
 * Hvor lenge det er igjen. Med klokkeslett: dager, så «1 dag 5 t» det siste døgnet før det, så timer og minutter.
 * Uten klokkeslett (hele dagen): «I morgen», «I dag» eller antall dager.
 */
export function tidIgjen(dato: string, fra: string | undefined, naa: Naa): Tid {
  const dager = dagerMellom(naa.dato, dato);
  if (!fra) {
    if (dager <= 0) return { deler: [{ tall: 'I dag', enhet: '' }], tekst: 'I dag', snart: true };
    if (dager === 1) return { deler: [{ tall: 'I morgen', enhet: '' }], tekst: 'I morgen', snart: false };
    return { deler: [{ tall: String(dager), enhet: 'dager' }], tekst: `${dager} dager`, snart: false };
  }
  const igjen = dager * 1440 + minutter(fra) - naa.minutt;
  if (igjen <= 0) return { deler: [{ tall: 'Nå', enhet: '' }], tekst: 'Nå', snart: true };
  const t = Math.floor(igjen / 60);
  const m = igjen % 60;
  if (igjen < 60) return { deler: [{ tall: String(m), enhet: 'min' }], tekst: flertall(m, 'minutt', 'minutter'), snart: true };
  if (igjen < 1440) {
    return { deler: [{ tall: String(t), enhet: 't' }, { tall: String(m), enhet: 'min' }], tekst: `${flertall(t, 'time', 'timer')} og ${flertall(m, 'minutt', 'minutter')}`, snart: true };
  }
  if (igjen < 2 * 1440) {
    const timer = t - 24;
    return { deler: [{ tall: '1', enhet: 'dag' }, { tall: String(timer), enhet: 't' }], tekst: `1 dag og ${flertall(timer, 'time', 'timer')}`, snart: false };
  }
  return { deler: [{ tall: String(dager), enhet: 'dager' }], tekst: `${dager} dager`, snart: false };
}
