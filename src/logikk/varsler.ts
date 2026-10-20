// Varsler: hva som skal varsles i dag, ut fra listene og innstillingene til én bruker.
// Kjøres av Edge Function «varsler» (supabase/kilde/varsler.ts) hver time, men ligger her så den kan testes.
// Ren logikk uten React og uten nettleser.
import type { Hendelse, Liste, Punkt, VarselInnstillinger, VarselType } from '../data/modell';
import { STANDARD_VARSLER } from '../data/modell';
import { gjentakTekst, kalenderPoster, leggTilDager, minutter, paaDato } from './kalender';
import { anledningsNavn, forekomster } from './gaveaar';
import { LISTETYPER, dagerMellom, erBrukt, erFerdig, hageIMaaned, huskelapp } from './lister';

export interface Varsel {
  type: VarselType;
  /** Nøkkelen som sendes. Er den sendt før, sendes ikke varselet igjen. */
  nokkel: string;
  /** Alle nøkler som regnes som sendt etterpå (tidligere varseltrinn som ble hoppet over) */
  nokler: string[];
  tittel: string;
  tekst: string;
  /** Relativ adresse i appen, f.eks. «#/lister/<id>» */
  url: string;
}

const MAANEDER = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/** «I dag», «I morgen», «Om 3 dager» */
export function naarTekst(dager: number): string {
  return dager === 0 ? 'i dag' : dager === 1 ? 'i morgen' : `om ${dager} dager`;
}

/** «fre. 30. okt.» */
function datoKort(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Hvilket varseltrinn gjelder i dag? Trinnene er dager før (f.eks. [21, 0]).
 * Det minste trinnet som er ≥ dagene som er igjen, sendes. Større trinn som ble hoppet over
 * (f.eks. når noe legges inn sent) merkes som sendt, så de ikke kommer etterpå.
 * Samme dag (0) gjelder bare på selve dagen.
 */
export function varseltrinn(dager: number, trinn: number[]): { trinn: number; alle: number[] } | null {
  if (dager < 0) return null;
  const aktuelle = [...new Set(trinn)].filter((t) => dager <= t).sort((a, b) => a - b);
  return aktuelle.length ? { trinn: aktuelle[0], alle: aktuelle } : null;
}

/** Lagrede innstillinger fylt ut med standardverdier (nye varseltyper mangler i eldre innstillinger) */
export function medStandard(inn: Partial<VarselInnstillinger> | null | undefined): VarselInnstillinger {
  // Tomme verdier (f.eks. en type som mangler) skal ikke overskrive standarden
  const typer = Object.fromEntries(Object.entries(inn?.typer ?? {}).filter(([, v]) => v && typeof v === 'object'));
  return { ...STANDARD_VARSLER, ...(inn ?? {}), typer: { ...STANDARD_VARSLER.typer, ...typer } };
}

export interface Kalenderdata {
  hendelser: Hendelse[];
  /** Navn på person eller familiemedlem */
  navn: (id: string) => string | undefined;
}

/** Linje i morgenoversikten: «16:00 Henting barnehagen – Ingrid» */
const avtaleLinje = (p: { fra?: string; tittel: string; ansvarlig?: string }, navn: Kalenderdata['navn']) =>
  `${p.fra ?? 'Hele dagen'} ${p.tittel}${p.ansvarlig && navn(p.ansvarlig) ? ` – ${navn(p.ansvarlig)}` : ''}`;

/** Alle varsler som er aktuelle i dag for én bruker. Listene skal være de brukeren kan se. */
export function beregnVarsler(lister: Liste[], punkter: Punkt[], innstillinger: VarselInnstillinger, iDag: string, kal?: Kalenderdata): Varsel[] {
  const ut: Varsel[] = [];
  const inn = medStandard(innstillinger);
  const t = inn.typer;
  const maksTrinn = Math.max(0, ...Object.values(t).filter((v) => v.pa).flatMap((v) => v.dager));
  const kjoptTekst = (gaver: Punkt[]) => gaver.filter((g) => erBrukt('gaveaar', g.status)).map((g) => g.tekst).join(', ');

  // Bursdager og andre anledninger (én per person og anledning)
  const alle = forekomster(lister, punkter, iDag, maksTrinn);
  for (const f of alle) {
    const type: VarselType = f.anledning.type === 'bursdag' ? 'bursdag' : f.anledning.type === 'jul' ? 'jul' : 'andre';
    if (type === 'jul' || !t[type].pa) continue;
    const valg = varseltrinn(f.dager, t[type].dager);
    if (!valg) continue;
    const kjopt = kjoptTekst(f.gaver);
    if (valg.trinn > 0 && inn.bareUtenGave && kjopt) continue;
    const base = `${type}:${f.mottaker.id}:${f.anledning.id}:${f.dato}`;
    const navn = f.mottaker.tekst;
    const hva = type === 'bursdag'
      ? `${navn} har bursdag${f.alder !== undefined ? ` (fyller ${f.alder})` : ''}`
      : `${anledningsNavn(f.anledning)} – ${navn}`;
    ut.push({
      type, nokkel: `${base}:${valg.trinn}`, nokler: valg.alle.map((x) => `${base}:${x}`),
      tittel: `${hva} ${naarTekst(f.dager)}`,
      tekst: kjopt ? `Gave: ${kjopt}` : f.dager === 0 ? 'Ingen gave er registrert.'
        : `${datoKort(f.dato)}: ingen gave kjøpt ennå${f.ideer ? ` – ${f.ideer} ${f.ideer === 1 ? 'idé' : 'ideer'} i idébanken` : ''}.`,
      url: `#/lister/${f.liste.id}`,
    });
  }

  // Jul: ett samlet varsel
  if (t.jul.pa) {
    const jul = alle.filter((f) => f.anledning.type === 'jul');
    if (jul.length) {
      const { dato, dager, aar } = jul[0];
      const valg = varseltrinn(dager, t.jul.dager);
      const personer = [...new Set(jul.map((f) => f.mottaker.tekst.trim().toLowerCase()))];
      const medGave = new Set(jul.filter((f) => f.gaver.some((g) => erBrukt('gaveaar', g.status))).map((f) => f.mottaker.tekst.trim().toLowerCase()));
      const alleKjopt = medGave.size >= personer.length;
      if (valg && !(valg.trinn > 0 && inn.bareUtenGave && alleKjopt)) {
        const base = `jul:${dato}`;
        ut.push({
          type: 'jul', nokkel: `${base}:${valg.trinn}`, nokler: valg.alle.map((x) => `${base}:${x}`),
          tittel: dager === 0 ? 'God jul!' : `Jul ${naarTekst(dager)}`,
          tekst: `Gave kjøpt til ${medGave.size} av ${personer.length}.`,
          url: `#/lister/plan/jul/${aar}`,
        });
      }
    }
  }

  // Frister i huskelister, oppgaver o.l.
  if (t.frist.pa) {
    for (const h of huskelapp(lister, punkter, iDag, maksTrinn)) {
      const valg = varseltrinn(h.dager, t.frist.dager);
      if (!valg) continue;
      const base = `frist:${h.punkt.id}:${h.punkt.dato}`;
      ut.push({
        type: 'frist', nokkel: `${base}:${valg.trinn}`, nokler: valg.alle.map((x) => `${base}:${x}`),
        tittel: `${h.dager === 0 ? 'I dag' : h.dager === 1 ? 'I morgen' : `Om ${h.dager} dager`}: ${h.punkt.tekst}`,
        tekst: `${h.liste.navn} · frist ${datoKort(h.punkt.dato!)}`,
        url: `#/lister/${h.liste.id}`,
      });
    }
  }

  // Kalenderluker (f.eks. adventskalender)
  if (t.kalender.pa) {
    const kalendere = new Map(lister.filter((l) => !l.mal && l.type === 'kalender').map((l) => [l.id, l]));
    for (const p of punkter) {
      const liste = kalendere.get(p.listeId);
      if (!liste || !p.dato) continue;
      const dager = dagerMellom(iDag, p.dato);
      const valg = varseltrinn(dager, t.kalender.dager);
      if (!valg) continue;
      const base = `kalender:${p.id}:${p.dato}`;
      ut.push({
        type: 'kalender', nokkel: `${base}:${valg.trinn}`, nokler: valg.alle.map((x) => `${base}:${x}`),
        tittel: `${dager === 0 ? 'Luke i dag' : `Luke ${naarTekst(dager)}`}: ${p.tekst}`,
        tekst: p.notat || (erFerdig('kalender', p.status) ? 'Klar.' : 'Ingen idé lagt inn ennå.'),
        url: `#/lister/${liste.id}`,
      });
    }
  }

  // Hagen: den 1. i måneden
  if (t.hage.pa && iDag.endsWith('-01')) {
    const oppgaver = hageIMaaned(lister, punkter, iDag).filter((o) => !o.gjort);
    if (oppgaver.length) {
      ut.push({
        type: 'hage', nokkel: `hage:${iDag.slice(0, 7)}`, nokler: [`hage:${iDag.slice(0, 7)}`],
        tittel: `I hagen i ${MAANEDER[Number(iDag.slice(5, 7)) - 1]}`,
        tekst: oppgaver.map((o) => (o.forelder ? `${o.forelder.tekst}: ${o.punkt.tekst.toLowerCase()}` : o.punkt.tekst)).join(', '),
        url: `#/lister/${oppgaver[0].liste.id}`,
      });
    }
  }
  // Morgenoversikt over avtalene i dag (0) og/eller i morgen (1)
  if (kal && t.avtaler.pa) {
    for (const d of [...new Set(t.avtaler.dager)].sort()) {
      const dato = leggTilDager(iDag, d);
      // Avlyste avtaler er ikke med (det kom eget varsel da de ble avlyst)
      const poster = kalenderPoster(kal.hendelser, [], [], dato, dato, { anledninger: false, frister: false }).filter((x) => paaDato(x, dato) && !x.avlyst);
      if (!poster.length) continue;
      const nokkel = `avtaler:${dato}:${d}`;
      ut.push({
        type: 'avtaler', nokkel, nokler: [nokkel],
        tittel: `${d === 0 ? 'I dag' : 'I morgen'}: ${poster.length} ${poster.length === 1 ? 'avtale' : 'avtaler'}`,
        tekst: poster.slice(0, 5).map((x) => avtaleLinje(x, kal.navn)).join('\n') + (poster.length > 5 ? `\n… og ${poster.length - 5} til` : ''),
        url: '#/kalender',
      });
    }
  }
  return ut;
}

/**
 * Varsel før avtaler som har «varsel før» (f.eks. 30 min). Sjekkes hvert kvarter: varselet sendes når tidspunktet
 * (start minus varseltid) er innenfor siste kvarter. Gjelder avtalen bestemte voksne (hvem/henter), får bare de varsel.
 */
export function forVarsler(hendelser: Hendelse[], naa: { dato: string; minutt: number }, kal: Kalenderdata & { personId?: string; voksne: Set<string> }, vindu = 15): Varsel[] {
  const ut: Varsel[] = [];
  const poster = kalenderPoster(hendelser, [], [], naa.dato, leggTilDager(naa.dato, 1), { anledninger: false, frister: false });
  for (const p of poster) {
    const varselMin = p.forekomst?.hendelse.varselMin;
    if (!p.fra || !varselMin || p.avlyst) continue;
    const start = (p.dato === naa.dato ? 0 : 1440) + minutter(p.fra);
    const varselTid = start - varselMin;
    if (varselTid > naa.minutt || varselTid <= naa.minutt - vindu) continue;
    const involverte = [...p.hvem, ...(p.ansvarlig ? [p.ansvarlig] : [])].filter((id) => kal.voksne.has(id));
    if (involverte.length && kal.personId && !involverte.includes(kal.personId)) continue;
    const nokkel = `for:${p.nokkel}`;
    const ansvarlig = p.ansvarlig ? kal.navn(p.ansvarlig) : undefined;
    ut.push({
      type: 'avtaleFor', nokkel, nokler: [nokkel],
      tittel: `${p.tittel} ${p.dato === naa.dato ? 'kl.' : 'i morgen kl.'} ${p.fra}`,
      tekst: [ansvarlig ? (p.ansvarlig === kal.personId ? 'Det er du som henter/leverer' : `${ansvarlig} henter/leverer`) : '', p.sted ?? ''].filter(Boolean).join(' · ') || 'Påminnelse',
      url: '#/kalender',
    });
  }
  return ut;
}

// ---------------------------------------------------------------- Det den andre gjør i delte lister

/** Varseltyper for det den andre gjør – sendes fortløpende, ikke på brukerens klokkeslett */
export const AKTIVITETSTYPER: VarselType[] = ['nyListe', 'nyttPunkt', 'gaveide', 'kjopt', 'avlyst'];

/**
 * En endring i en delt liste eller kalenderen (tabellen «aktivitet», fylles av databasetriggere i
 * supabase/varsler.sql og supabase/kalender.sql). liste = ny delt liste, punkt = nytt punkt,
 * status = punktet fikk ny status, avlyst = en avtale ble avlyst (hendelseId, listeId er da tom).
 */
export interface Aktivitet {
  id: number;
  /** Brukeren (auth-id) som gjorde endringen */
  bruker: string;
  hva: 'liste' | 'punkt' | 'status' | 'avlyst';
  listeId: string;
  punktId?: string | null;
  status?: string | null;
  hendelseId?: string | null;
}

/** «Melk, brød og egg» – maks fire, resten som «og 3 til» */
function opplisting(tekster: string[], maks = 4): string {
  if (tekster.length <= 1) return tekster[0] ?? '';
  if (tekster.length <= maks) return `${tekster.slice(0, -1).join(', ')} og ${tekster[tekster.length - 1]}`;
  return `${tekster.slice(0, maks).join(', ')} og ${tekster.length - maks} til`;
}

/**
 * Varsler om det andre har gjort i delte lister siden sist: nye lister, nye punkter, gaveideer og kjøp.
 * Én melding per liste og type, så ti nye ting i handlelisten blir ett varsel. Bare det som fortsatt er slik
 * (punktet finnes, er fortsatt kjøpt) varsles – angrer man med en gang, blir det ikke noe varsel.
 * Listene og punktene skal være de mottakeren kan se (felles).
 */
export function aktivitetsVarsler(aktiviteter: Aktivitet[], lister: Liste[], punkter: Punkt[], mottaker: string,
  innstillinger: VarselInnstillinger, navn: (bruker: string) => string | undefined): Varsel[] {
  const t = medStandard(innstillinger).typer;
  const listeMap = new Map(lister.filter((l) => !l.mal).map((l) => [l.id, l]));
  const punktMap = new Map(punkter.map((p) => [p.id, p]));
  const andres = aktiviteter.filter((a) => a.bruker !== mottaker && listeMap.has(a.listeId));
  const maksId = Math.max(0, ...andres.map((a) => a.id));
  const ut: Varsel[] = [];
  const legg = (type: VarselType, listeId: string, bruker: string, tittel: string, tekst: string, url = `#/lister/${listeId}`) => {
    const nokkel = `aktivitet:${type}:${listeId}:${bruker}:${maksId}`;
    ut.push({ type, nokkel, nokler: [nokkel], tittel, tekst, url });
  };
  const hvem = (bruker: string) => navn(bruker) ?? 'Noen';

  // Nye lister. Punktene som fulgte med (fra mal) varsles ikke for seg.
  const nyeLister = new Set<string>();
  for (const a of andres.filter((x) => x.hva === 'liste')) {
    if (nyeLister.has(a.listeId)) continue;
    nyeLister.add(a.listeId);
    if (!t.nyListe.pa) continue;
    const l = listeMap.get(a.listeId)!;
    const antall = punkter.filter((p) => p.listeId === l.id && !p.forelderId).length;
    legg('nyListe', l.id, a.bruker, `${hvem(a.bruker)} lagde en ny liste: ${l.navn}`, antall ? `${antall} ${antall === 1 ? 'punkt' : 'punkter'} så langt.` : 'Tom foreløpig – klar til å fylles.');
  }

  // Grupper per (bruker, liste): nye punkter, nye gaveideer og kjøp
  const grupper = new Map<string, { bruker: string; liste: Liste; nye: Punkt[]; ideer: Punkt[]; kjopt: Punkt[] }>();
  const sett = new Set<string>();
  for (const a of andres) {
    if (a.hva === 'liste' || !a.punktId || nyeLister.has(a.listeId)) continue;
    const p = punktMap.get(a.punktId);
    if (!p) continue;
    const liste = listeMap.get(a.listeId)!;
    const kjoptNaa = p.status === 'kjopt' && LISTETYPER[liste.type].statuser.some((s) => s.id === 'kjopt');
    const hva = kjoptNaa ? 'kjopt' : a.hva === 'punkt' ? (liste.type === 'gaveaar' && p.forelderId ? 'ideer' : 'nye') : null;
    // Status endret til noe annet enn kjøpt (eller tilbake igjen): ikke noe varsel
    if (!hva || (a.hva === 'status' && !kjoptNaa) || sett.has(`${hva}:${p.id}`)) continue;
    sett.add(`${hva}:${p.id}`);
    const nokkel = `${a.bruker}|${a.listeId}`;
    const g = grupper.get(nokkel) ?? { bruker: a.bruker, liste, nye: [], ideer: [], kjopt: [] };
    g[hva].push(p);
    grupper.set(nokkel, g);
  }

  const mottakerAv = (p: Punkt) => (p.forelderId ? punktMap.get(p.forelderId)?.tekst : undefined);
  for (const { bruker, liste, nye, ideer, kjopt } of grupper.values()) {
    const h = hvem(bruker);
    if (nye.length && t.nyttPunkt.pa) {
      legg('nyttPunkt', liste.id, bruker, `Nytt i ${liste.navn}`, `${h} la til ${opplisting(nye.map((p) => p.tekst))}.`);
    }
    if (ideer.length && t.gaveide.pa) {
      const til = [...new Set(ideer.map(mottakerAv).filter(Boolean))] as string[];
      legg('gaveide', liste.id, bruker,
        ideer.length === 1 ? `${h} har en gaveidé til ${til[0] ?? 'noen'}` : `${h} la inn ${ideer.length} gaveideer`,
        ideer.length === 1 ? `«${ideer[0].tekst}» · ${liste.navn}` : `Til ${opplisting(til)} · ${liste.navn}`);
    }
    if (kjopt.length && t.kjopt.pa) {
      const gaver = liste.type === 'gaveaar';
      const til = [...new Set(kjopt.map(mottakerAv).filter(Boolean))] as string[];
      const tittel = gaver
        ? (kjopt.length === 1 ? `${h} kjøpte gave til ${til[0] ?? 'noen'}` : `${h} kjøpte ${kjopt.length} gaver`)
        : `${h} kjøpte ${kjopt.length === 1 ? `«${kjopt[0].tekst}»` : `${kjopt.length} ting`}`;
      const tekst = gaver
        ? (kjopt.length === 1 ? `«${kjopt[0].tekst}» · ${liste.navn}` : `Til ${opplisting(til)} · ${liste.navn}`)
        : kjopt.length === 1 ? `Fra ${liste.navn}` : `${opplisting(kjopt.map((p) => p.tekst))} · ${liste.navn}`;
      legg('kjopt', liste.id, bruker, tittel, tekst);
    }
  }
  return ut;
}

/**
 * Varsel når den andre avlyser en avtale. Bare det som fortsatt er avlyst (angret man med en gang, blir det ikke noe varsel)
 * og som ikke allerede er over. Avlyses en hel serie, blir det ett varsel – ikke ett per endret dag i serien.
 */
export function avlysningsVarsler(aktiviteter: Aktivitet[], hendelser: Hendelse[], mottaker: string, innstillinger: VarselInnstillinger,
  navn: (bruker: string) => string | undefined, iDag: string): Varsel[] {
  if (!medStandard(innstillinger).typer.avlyst.pa) return [];
  const avlyst = new Map(aktiviteter.filter((a) => a.hva === 'avlyst' && a.hendelseId && a.bruker !== mottaker).map((a) => [a.hendelseId!, a]));
  const ut: Varsel[] = [];
  for (const h of hendelser) {
    const a = avlyst.get(h.id);
    if (!a || !h.innstilt || h.avlyst || (h.serieId && avlyst.has(h.serieId))) continue;
    const erSerie = !!h.gjentak && !h.serieId;
    if (erSerie ? !!h.gjentak!.til && h.gjentak!.til < iDag : (h.sluttDato ?? h.dato) < iDag) continue;
    const nokkel = `aktivitet:avlyst:${h.id}:${a.id}`;
    ut.push({
      type: 'avlyst', nokkel, nokler: [nokkel],
      tittel: `${navn(a.bruker) ?? 'Noen'} avlyste «${h.tittel}»`,
      tekst: erSerie
        ? `${h.dato > iDag ? `Fra ${datoKort(h.dato)}` : 'Alle gangene'} · ${gjentakTekst(h.gjentak, h.dato).toLowerCase()}`
        : `${datoKort(h.dato)}${h.fra ? ` kl. ${h.fra}` : ''}${h.sted ? ` · ${h.sted}` : ''}`,
      url: '#/kalender',
    });
  }
  return ut;
}

// ---------------------------------------------------------------- Sending

export interface Melding { tittel: string; tekst: string; url: string; nokler: string[]; type?: VarselType }

/** Mange varsler blir ett samlet varsel, så telefonen ikke fylles opp. Det samlede åpner varslene i appen. */
export function slaaSammen(varsler: Varsel[], maks = 3, samletTittel = (n: number) => `${n} påminnelser i dag`): Melding[] {
  if (varsler.length <= maks) return varsler.map((v) => ({ tittel: v.tittel, tekst: v.tekst, url: v.url, nokler: v.nokler, type: v.type }));
  return [{
    tittel: samletTittel(varsler.length),
    tekst: varsler.slice(0, 4).map((v) => v.tittel).join('\n') + (varsler.length > 4 ? `\n… og ${varsler.length - 4} til` : ''),
    url: '#/innboks',
    nokler: varsler.flatMap((v) => v.nokler),
  }];
}

/**
 * «Skjul detaljer»: det som vises på låseskjermen sier ikke hva det gjelder (navn, gaver, avtaler).
 * Varselet åpner varslene i appen (bjella), der detaljene står – ellers vet man ikke hva det gjaldt.
 */
export function utenDetaljer(meldinger: Melding[]): Melding[] {
  return meldinger.map((m) => ({
    ...m,
    tittel: 'Sulamitten',
    tekst: m.type === 'avtaleFor' ? 'En avtale nærmer seg. Åpne appen for å se hvilken.'
      : m.type === 'avlyst' ? 'En avtale er avlyst. Åpne appen for å se hvilken.'
      : m.type && AKTIVITETSTYPER.includes(m.type) ? 'Det er nytt i en delt liste. Åpne appen for å se hva.'
      : 'Det er noe å huske på i dag. Åpne appen for å se hva.',
    url: '#/innboks',
  }));
}

/** Dato, time og minutt fra midnatt akkurat nå i Norge (serveren går i UTC) */
export function norskTid(naa = new Date()): { dato: string; time: number; minutt: number } {
  const deler = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(naa).map((d) => [d.type, d.value]));
  const time = Number(deler.hour);
  return { dato: `${deler.year}-${deler.month}-${deler.day}`, time, minutt: time * 60 + Number(deler.minute) };
}
