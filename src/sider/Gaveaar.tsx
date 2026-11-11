// Gaveår: faste mottakere med anledninger, idébank og budsjett – og samlet plan for jul, bursdager og andre anledninger
// på tvers av det felles og ditt private gaveår. Data i liste/listepunkt, logikk i logikk/gaveaar.ts.
import { useState, type FormEvent } from 'react';
import type { Anledning, AnledningType, Liste, Punkt } from '../data/modell';
import { nyId } from '../data/modell';
import { listeLager, useLister } from '../data/lister';
import { lager } from '../data/lager';
import { useTilstand } from '../data/tilstand';
import { iDag, sum } from '../logikk/beregning';
import { erBrukt, gavehistorikk, medStatus, nesteRekkefolge, nesteStatus, nyttPunkt, tidligereGaver } from '../logikk/lister';
import {
  ANLEDNING_IKON, ANLEDNING_NAVN, PLAN_IKON, anledningsNokkel, gaveStatus, kjoptAv, medFerdig, PLAN_NAVN, PLAN_TYPER, alder, anledningsDato, anledningsNavn, anledningsPlan, budsjettPerPott, erMinMottaker, flyttGavelister,
  flyttMottaker, forekomster, gaveaar, gaverTil, medAutoAnledning, mineForekomster, mittGaveaar, mottakere, nesteDato, nokkelTekst, nyAnledning, planNokkel,
  planTittel, planlagtPris, potter, rundDag, sorterAnledninger, tilPlanType,
  filtrerForekomster, type AnledningFilter, type Forekomst, type PlanDel, type PlanType,
} from '../logikk/gaveaar';
import { Ark, BelopFelt, Felt, Ikon, IkonBoble, MAANEDER_KORT, Segment, Tom, datoTekst, kortDato, kr, maanedTekst, useBekreft } from '../ui/felles';
import { UtgiftSkjema, type UtgiftForslag } from '../ui/UtgiftSkjema';
import { Sveip } from '../ui/Sveip';
import { BudsjettKort, FeilBanner, FristMerke, ListeSkjema, PunktArk, SeksjonHode, StatusKnapp, ValgArk } from './Lister';

const iAar = () => Number(iDag().slice(0, 4));

/** Jul: i år, eller neste år etter julaften. Bursdager og andre: kalenderåret. */
function nestePlanAar(type: PlanType): number {
  const aar = iAar();
  return type === 'jul' && (anledningsDato({ id: '', type: 'jul' }, aar) ?? '') < iDag() ? aar + 1 : aar;
}

/** «85 år · fyller 86 14. mars» */
function fodtTekst(fodt: string, idag: string): string {
  const naa = alder(fodt, idag) ?? 0;
  const neste = nesteDato({ id: '', type: 'bursdag', dag: fodt.slice(5) }, idag);
  if (neste === idag) return `Fyller ${naa} i dag. Hipp hurra!`;
  return `${naa} år · fyller ${neste ? alder(fodt, neste) : naa + 1}${neste ? ` ${kortDato(neste)}` : ''}`;
}

/** «fyller 70» – med merke for runde dager */
function Alder({ alder: a, forbi }: { alder?: number; forbi?: boolean }) {
  if (a === undefined) return null;
  const ord = forbi ? 'fylte' : 'fyller';
  return rundDag(a) ? <span className="merkelapp aksent"><Ikon navn="fest" storrelse={12} />{ord} {a}</span> : <span className="dempet">{ord} {a}</span>;
}

function nyttGaveaar(privat: boolean, rekkefolge: number): Liste {
  return {
    id: nyId(), navn: privat ? 'Mitt gaveår' : 'Gaveår', ikon: 'kake', kategori: 'Gaver', type: 'gaveaar',
    privat, mal: false, rekkefolge, opprettet: iDag(),
  };
}

// ---------------------------------------------------------------- Flytte gamle gavelister inn

function FlyttGavelister() {
  const { lister, punkter } = useLister();
  const { visToast } = useTilstand();
  const [flytter, setFlytter] = useState(false);
  const gamle = lister.filter((l) => !l.mal && l.type === 'gave');
  if (!gamle.length) return null;

  async function flytt() {
    setFlytter(true);
    const alle = gaveaar(lister);
    const rekkefolge = lister.reduce((m, l) => Math.max(m, l.rekkefolge), 0);
    let felles = alle.find((l) => !l.privat);
    let privat = alle.find((l) => l.privat);
    if (gamle.some((l) => !l.privat) && !felles) { felles = nyttGaveaar(false, rekkefolge + 1); await listeLager.opprett(felles, []); }
    if (gamle.some((l) => l.privat) && !privat) { privat = nyttGaveaar(true, rekkefolge + 2); await listeLager.opprett(privat, []); }
    const f = flyttGavelister(lister, punkter, { felles, privat });
    const nye = f.mottakere.filter((m) => !punkter.some((p) => p.id === m.id));
    if (!(await listeLager.lagrePunkter([...f.mottakere, ...f.gaver]))) { setFlytter(false); return; }
    for (const v of f.vedlegg) await lager.kopierVedlegg(v.fra, v.til).catch(console.error);
    const tilbake = f.flyttet.map((l) => listeLager.slettListe(l));
    visToast({
      tekst: `Flyttet ${f.gaver.length} gaver fra ${f.flyttet.length} ${f.flyttet.length === 1 ? 'liste' : 'lister'}`,
      angre: () => {
        // Nye mottakere slettes med gavene sine, gaver hos eksisterende mottakere slettes enkeltvis
        nye.forEach((m) => listeLager.slettPunkt(m));
        f.gaver.filter((g) => !nye.some((m) => m.id === g.forelderId)).forEach((g) => listeLager.slettPunkt(g));
        tilbake.forEach((t) => void t());
        visToast(null);
      },
    });
    setFlytter(false);
  }

  return (
    <div className="banner info">
      <Ikon navn="gave" />
      <div>
        <strong>Du har {gamle.length} {gamle.length === 1 ? 'gaveliste' : 'gavelister'} fra før</strong>
        <p className="liten">{gamle.map((l) => l.navn).join(', ')}. Flytt dem inn i gaveåret, så følger gavene og historikken med. Private havner i ditt private gaveår.</p>
      </div>
      <button className="knapp liten" onClick={() => void flytt()} disabled={flytter}>{flytter ? 'Flytter …' : 'Flytt inn'}</button>
    </div>
  );
}

// ---------------------------------------------------------------- Ett gaveår (årshjulet)

/** Henter gaveåret (felles eller privat) – lager det hvis det ikke finnes ennå */
async function hentEllerLag(lister: Liste[], privat: boolean): Promise<Liste | null> {
  const ga = mittGaveaar(lister);
  const finnes = privat ? ga.privat : ga.felles;
  if (finnes) return finnes;
  const ny = nyttGaveaar(privat, lister.reduce((m, l) => Math.max(m, l.rekkefolge), 0) + 1);
  return (await listeLager.opprett(ny, [])) ? ny : null;
}

/** «Mine | Alle» huskes per enhet */
const VISNING = 'familie.gaveaar.visning';
type Visning = 'mine' | 'alle';
function lesVisning(): Visning {
  try { return localStorage.getItem(VISNING) === 'mine' ? 'mine' : 'alle'; } catch { return 'alle'; }
}

/** Filteret i årshjulet huskes også per enhet */
const FILTER = 'familie.gaveaar.filter';
type Filter = { anledning: AnledningFilter; skjulKjopte: boolean };
function lesFilter(): Filter {
  try {
    const f = JSON.parse(localStorage.getItem(FILTER) ?? '{}') as Partial<Filter>;
    return { anledning: f.anledning && (f.anledning === 'alle' || PLAN_TYPER.includes(f.anledning)) ? f.anledning : 'alle', skjulKjopte: !!f.skjulKjopte };
  } catch { return { anledning: 'alle', skjulKjopte: false }; }
}

/** Navnet på en person fra felles-dokumentet – «deg» for den innloggede */
function useNavnPaa() {
  const { felles, meg } = useTilstand();
  return (id: string | undefined) => (!id ? 'Felles' : id === meg?.id ? 'deg' : felles?.personer.find((p) => p.id === id)?.navn ?? 'Ukjent');
}

export function GaveaarSide({ liste, gaaTil }: { liste: Liste; gaaTil: (r: string) => void }) {
  const { lister, punkter, feil } = useLister();
  const { meg } = useTilstand();
  const navnPaa = useNavnPaa();
  const [aapen, setAapen] = useState<string | null>(null);
  const [valg, setValg] = useState(false);
  const [endrer, setEndrer] = useState(false);
  const [nyMottaker, setNyMottaker] = useState(false);
  const [visning, setVisningRaa] = useState<Visning>(lesVisning);
  const setVisning = (v: Visning) => { setVisningRaa(v); try { localStorage.setItem(VISNING, v); } catch { /* ignorer */ } };
  const [filter, setFilterRaa] = useState<Filter>(lesFilter);
  const setFilter = (endring: Partial<Filter>) => {
    const ny = { ...filter, ...endring };
    setFilterRaa(ny);
    try { localStorage.setItem(FILTER, JSON.stringify(ny)); } catch { /* ignorer */ }
  };
  const idag = iDag();
  // Felles og ditt private gaveår vises som ett
  const ga = mittGaveaar(lister);
  const alleLister = ga.alle.length ? ga.alle : [liste];
  const mine = punkter.filter((p) => p.listeId === liste.id);
  const alleMott = alleLister.flatMap((l) => mottakere(l.id, punkter).map((m) => ({ liste: l, m })))
    .sort((a, b) => a.m.tekst.localeCompare(b.m.tekst, 'nb'));
  const bareMine = visning === 'mine';
  const mott = bareMine ? alleMott.filter(({ liste: l, m }) => erMinMottaker(l, m, meg?.id)) : alleMott;
  const utenAnsvarlig = alleMott.filter(({ liste: l, m }) => !l.privat && !m.ansvarlig).length;
  const tidslinjeAlle = forekomster(alleLister, punkter, idag);
  const tidslinjeUfiltrert = bareMine ? mineForekomster(tidslinjeAlle, meg?.id) : tidslinjeAlle;
  const tidslinje = filtrerForekomster(tidslinjeUfiltrert, filter);
  const filtrert = filter.anledning !== 'alle' || filter.skjulKjopte;
  const totalt = sum(tidslinje, (f) => planlagtPris(f).belop);

  // Tidslinjen gruppert per måned
  const perMaaned = new Map<string, Forekomst[]>();
  for (const f of tidslinje) perMaaned.set(f.dato.slice(0, 7), [...(perMaaned.get(f.dato.slice(0, 7)) ?? []), f]);

  /** Ny mottaker fra arket: lagres, og mottakerarket åpnes så anledninger og ideer kan legges inn */
  async function leggTilMottaker(navn: string, fodt: string, privat: boolean): Promise<boolean> {
    const til = await hentEllerLag(lister, privat && !!meg);
    if (!til) return false;
    // Bursdag og jul er med fra start. Fødselsdato gir bursdagen med en gang.
    const m: Punkt = {
      ...nyttPunkt(til.id, 'gaveaar', navn, nesteRekkefolge(punkter.filter((p) => p.listeId === til.id))),
      fodt: fodt || undefined,
      anledninger: [nyAnledning('bursdag', fodt ? { dag: fodt.slice(5) } : {}), nyAnledning('jul')],
    };
    if (!(await listeLager.lagrePunkter([m]))) return false;
    setNyMottaker(false);
    setAapen(m.id);
    return true;
  }

  return (
    <>
      <FeilBanner feil={feil} />
      <div className="verktoylinje">
        <button className="knapp flat liten" onClick={() => gaaTil('lister')}><Ikon navn="pilvenstre" storrelse={18} />Alle lister</button>
        <button className="knapp liten" onClick={() => setValg(true)}><Ikon navn="mer" storrelse={16} />Valg</button>
      </div>

      {meg && (
        <Segment etikett="Vis" full verdi={visning} endre={setVisning}
          valg={[{ verdi: 'mine', tekst: 'Mine kjøp', ikon: 'person' }, { verdi: 'alle', tekst: 'Alle', ikon: 'gave' }]} />
      )}

      <FlyttGavelister />

      <BudsjettKort liste={liste} punkter={mine} endre={() => setEndrer(true)} />

      <div className="rutenett to">
        <section className="kort">
          <div className="kort-hode">
            <div className="tittel">
              <h2>{bareMine ? 'Det du skal kjøpe' : 'De neste 12 månedene'}</h2>
              <span className="dempet liten">{bareMine ? 'Dine egne, og felles der du er ansvarlig' : 'Varsles på huskelappen 3 uker før hvis ingenting er kjøpt'}</span>
              {totalt > 0 && <span className="liten">Til sammen (gave eller budsjett) <strong className="tall">{kr(totalt)}</strong></span>}
            </div>
          </div>
          <div className="filter-chips" role="group" aria-label="Filter">
            {(['alle', ...PLAN_TYPER] as AnledningFilter[]).map((a) => (
              <button key={a} type="button" className="chip" aria-pressed={filter.anledning === a} onClick={() => setFilter({ anledning: a })}>
                {a !== 'alle' && <Ikon navn={PLAN_IKON[a]} storrelse={15} />}{a === 'alle' ? 'Alle' : PLAN_NAVN[a]}
              </button>
            ))}
          </div>
          {/* Et valg i tillegg til anledningen – derfor bryter, ikke enda en knapp i rekken */}
          <label className="rad filter-bryter">
            <span className="hoved"><span className="navn">Skjul kjøpte</span></span>
            <input type="checkbox" className="bryter" checked={filter.skjulKjopte} onChange={(e) => setFilter({ skjulKjopte: e.target.checked })} />
          </label>
          {/* Planen har potter, budsjett per anledning og tidligere år – nås herfra når en anledning er valgt */}
          {filter.anledning !== 'alle' && (
            <button type="button" className="lenkeknapp plan-lenke" onClick={() => gaaTil(`lister/plan/${filter.anledning}/${nestePlanAar(filter.anledning as PlanType)}`)}>
              {planTittel(filter.anledning, nestePlanAar(filter.anledning))}: potter, budsjett og tidligere år<Ikon navn="pilhoyre" storrelse={14} />
            </button>
          )}
          {tidslinje.length === 0 && filtrert && tidslinjeUfiltrert.length > 0 && (
            <Tom ikon="sjekk" tittel={filter.skjulKjopte ? 'Alt er kjøpt' : 'Ingenting her'}
              tekst={filter.skjulKjopte ? 'Godt jobbet. Ingenting igjen å handle med dette filteret.' : 'Ingen anledninger av denne typen de neste 12 månedene.'} />
          )}
          {tidslinjeUfiltrert.length === 0 && (bareMine
            ? <Tom ikon="gave" tittel="Ingenting på deg" tekst="Sett deg som ansvarlig på en felles mottaker, eller legg til dine egne. Så havner de her." />
            : <Tom ikon="kalender" tittel="Årshjulet er tomt" tekst="Legg til mottakere og bursdager, så husker Sulamitten dem for dere." />)}
          {[...perMaaned].map(([maaned, liste_]) => (
            <div className="seksjon" key={maaned}>
              <SeksjonHode tittel={maanedTekst(maaned)} />
              <div className="liste">
                {liste_.map((f) => <ForekomstRad key={f.nokkel + f.mottaker.id} f={f} aapne={() => setAapen(f.mottaker.id)} />)}
              </div>
            </div>
          ))}
          {bareMine && utenAnsvarlig > 0 && (
            <p className="dempet liten">{utenAnsvarlig} felles {utenAnsvarlig === 1 ? 'mottaker har' : 'mottakere har'} ingen ansvarlig og vises bare under «Alle».</p>
          )}
        </section>

        <section className="kort">
          <div className="kort-hode med-knapp">
            <div className="tittel"><h2>{bareMine ? 'Dine mottakere' : 'Mottakere'}</h2><span className="dempet liten">{mott.length} personer · trykk for ideer, anledninger og historikk</span></div>
            <button type="button" className="knapp primar ikon" aria-label="Ny mottaker" title="Ny mottaker" onClick={() => setNyMottaker(true)}><Ikon navn="pluss" /></button>
          </div>
          {mott.length === 0 && bareMine && <p className="dempet liten">Ingen mottakere er dine ennå.</p>}
          <div className="liste">
            {mott.map(({ liste: l, m }) => {
              const ideer = gaverTil(m.id, punkter).filter((g) => !g.anledning && !erBrukt('gaveaar', g.status)).length;
              const mangler = (m.anledninger ?? []).filter((a) => (a.type === 'bursdag' || a.type === 'egen') && !a.dag);
              const aarsbudsjett = sum(m.anledninger ?? [], (a) => a.budsjett ?? 0);
              const bursdag = m.anledninger?.find((a) => a.type === 'bursdag');
              const nesteBursdag = bursdag ? nesteDato(bursdag, idag) : null;
              const fyller = nesteBursdag ? alder(m.fodt, nesteBursdag) : undefined;
              return (
                <button className="rad" key={m.id} onClick={() => setAapen(m.id)}>
                  <span className="avatar noytral" aria-hidden="true">{m.tekst.slice(0, 1).toUpperCase()}</span>
                  <span className="hoved">
                    <span className="navn">{m.tekst}{fyller !== undefined && <span className="dempet liten" style={{ fontWeight: 400 }}> · fyller {fyller}{rundDag(fyller) ? ' (rund dag)' : ''}</span>}</span>
                    <span className="info">
                      {(m.anledninger ?? []).map((a) => (
                        <span key={a.id} className="anledning-merke"><Ikon navn={ANLEDNING_IKON[a.type]} storrelse={12} />{a.type === 'bursdag' || a.type === 'egen' ? (a.dag ? kortDato(`2000-${a.dag}`) : anledningsNavn(a)) : anledningsNavn(a)}</span>
                      ))}
                      {ideer ? ` · ${ideer} ${ideer === 1 ? 'idé' : 'ideer'}` : ''}
                    </span>
                    {mangler.length > 0 && <span className="info varsel-tekst"><Ikon navn="advarsel" storrelse={11} /> {anledningsNavn(mangler[0])} mangler dato</span>}
                    <span className="info">
                      {l.privat
                        ? <span className="merkelapp"><Ikon navn="privat" storrelse={12} />Bare meg</span>
                        : m.ansvarlig ? <>Kjøper: {navnPaa(m.ansvarlig)}</> : 'Felles – ingen ansvarlig'}
                    </span>
                  </span>
                  {aarsbudsjett > 0 && <span className="belop">{kr(aarsbudsjett)}<small>i året</small></span>}
                  <Ikon navn="pilhoyre" storrelse={16} />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {aapen && <MottakerArk mottakerId={aapen} lukk={() => setAapen(null)} />}
      {nyMottaker && <NyMottakerArk visSynlighet={!!meg} lagre={leggTilMottaker} lukk={() => setNyMottaker(false)} />}
      {valg && <ValgArk liste={liste} punkter={mine} lukk={() => setValg(false)} endre={() => { setValg(false); setEndrer(true); }} del={() => setValg(false)} gaaTil={gaaTil} />}
      {endrer && <ListeSkjema liste={liste} lukk={() => setEndrer(false)} />}
    </>
  );
}

function ForekomstRad({ f, aapne }: { f: Forekomst; aapne: () => void }) {
  const info = f.gaver.length ? f.gaver.map((g) => g.tekst).join(', ') : f.ideer ? `${f.ideer} ${f.ideer === 1 ? 'idé' : 'ideer'} i idébanken` : 'Ingen ideer ennå';
  const pris = planlagtPris(f);
  const tilstand = gaveStatus(f.gaver, f.bekreftet, f.anledning.antall);
  const ferdig = tilstand === 'ferdig';
  // Ferdig = grønt. Alt kjøpt, men ikke bekreftet = «Alt kjøpt?» (bekreftes i arket). Delvis = nøytralt.
  const merke = ferdig
    ? <span className="merkelapp bra"><Ikon navn="sjekk" storrelse={12} />{f.gaver.length && f.gaver.every((g) => g.status === 'gitt') ? 'Gitt' : 'Ferdig'}</span>
    : tilstand === 'venter' ? <span className="merkelapp info"><Ikon navn="sjekk" storrelse={12} />Alt kjøpt?</span>
      : tilstand === 'delvis' ? <span className="merkelapp">{kjoptAv(f.gaver, f.anledning.antall)}</span> : null;
  return (
    <button className={`rad${ferdig ? ' kjopt' : ''}`} onClick={aapne}>
      {/* Ferdig: grønn datorute med hake i hjørnet, så det synes når man skumleser */}
      <span className="dato-blokk" aria-hidden="true">
        <span className="dag">{Number(f.dato.slice(8))}</span><span className="mnd">{MAANEDER_KORT[Number(f.dato.slice(5, 7)) - 1]}</span>
        {ferdig && <span className="dato-hake"><Ikon navn="sjekk" storrelse={11} /></span>}
      </span>
      <span className="hoved">
        <span className="navn"><span className="navn-ikon"><Ikon navn={ANLEDNING_IKON[f.anledning.type]} storrelse={15} /></span>{anledningsNavn(f.anledning)} – {f.mottaker.tekst}</span>
        <span className="info">{f.alder !== undefined && <><Alder alder={f.alder} /> · </>}{info}</span>
      </span>
      {/* Pris til høyre, status eller frist under den (frist bare når det haster) – så navnet får plass */}
      {(() => {
        const under = merke ?? (tilstand === 'ingen' && f.dager <= 21 ? <FristMerke dager={f.dager} /> : null);
        if (under) return <span className="belop">{pris.belop > 0 && kr(pris.belop)}{under}</span>;
        return pris.belop > 0 ? <span className="belop">{kr(pris.belop)}<small>{pris.budsjett ? 'budsjett' : 'valgt'}</small></span> : null;
      })()}
    </button>
  );
}

// ---------------------------------------------------------------- Ny mottaker

function NyMottakerArk({ visSynlighet, lagre, lukk }: {
  visSynlighet: boolean; lagre: (navn: string, fodt: string, privat: boolean) => Promise<boolean>; lukk: () => void;
}) {
  const [navn, setNavn] = useState('');
  const [fodt, setFodt] = useState('');
  const [privat, setPrivat] = useState(false);
  const [lagrer, setLagrer] = useState(false);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!navn.trim() || lagrer) return;
    setLagrer(true);
    if (!(await lagre(navn.trim(), fodt, privat))) setLagrer(false);
  }
  return (
    <Ark tittel="Ny mottaker" lukk={lukk}>
      <form className="skjema" onSubmit={(e) => void send(e)}>
        <div className="felt-rad">
          <Felt etikett="Navn"><input value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="F.eks. Bestemor" required autoFocus /></Felt>
          <Felt etikett="Født (valgfritt)"><input type="date" value={fodt} max={iDag()} onChange={(e) => setFodt(e.target.value)} /></Felt>
        </div>
        {visSynlighet && (
          <Felt etikett="Hvem ser" hjelp={privat ? 'Bare du ser personen og gavene.' : 'Dere ser begge personen og gavene.'}>
            <select value={privat ? 'privat' : 'felles'} onChange={(e) => setPrivat(e.target.value === 'privat')}>
              <option value="felles">Felles</option>
              <option value="privat">Bare meg</option>
            </select>
          </Felt>
        )}
        <p className="dempet liten">Bursdag og jul er med fra start. Ideer, budsjett og andre anledninger legger du inn etterpå.</p>
        <div className="knapperad slutt">
          <button type="button" className="knapp" onClick={lukk}>Avbryt</button>
          <button type="submit" className="knapp primar" disabled={!navn.trim() || lagrer}>{lagrer ? 'Legger til …' : 'Legg til'}</button>
        </div>
      </form>
    </Ark>
  );
}

// ---------------------------------------------------------------- Én mottaker: anledninger, idébank, planlagt og historikk

function MottakerArk({ mottakerId, lukk }: { mottakerId: string; lukk: () => void }) {
  const { lister, punkter } = useLister();
  const { visToast, meg, felles } = useTilstand();
  const [redigerer, setRedigerer] = useState<Punkt | null>(null);
  const [nyIde, setNyIde] = useState('');
  const [utgift, setUtgift] = useState<UtgiftForslag | null>(null);
  const [nyEgen, setNyEgen] = useState(false);
  const [flytter, setFlytter] = useState(false);
  const mottaker = punkter.find((p) => p.id === mottakerId);
  const liste = lister.find((l) => l.id === mottaker?.listeId);
  const [navn, setNavn] = useState(mottaker?.tekst ?? '');
  if (!mottaker || !liste) return null;
  const idag = iDag();
  const mine = punkter.filter((p) => p.listeId === liste.id);
  const alle = gaverTil(mottaker.id, punkter);
  const anledninger = mottaker.anledninger ?? [];
  const andre = felles?.personer.find((p) => p.id !== meg?.id);

  /** Felles ↔ bare meg: flytter mottakeren med gaver og ideer til det andre gaveåret */
  async function settSynlighet(privat: boolean) {
    if (privat === liste!.privat || flytter) return;
    setFlytter(true);
    const til = await hentEllerLag(lister, privat);
    if (til) {
      const foer = [mottaker!, ...alle];
      const f = flyttMottaker(mottaker!, punkter, til);
      if (await listeLager.lagrePunkter(f.punkter)) {
        for (const v of f.vedlegg) await lager.kopierVedlegg(v.fra, v.til).catch(console.error);
        visToast({
          tekst: privat ? `Nå ser bare du ${mottaker!.tekst}` : `${mottaker!.tekst} er felles${andre ? ` – ${andre.navn} ser det også` : ''}`,
          angre: () => { void listeLager.lagrePunkter(foer); visToast(null); },
        });
      }
    }
    setFlytter(false);
  }
  const ideer = alle.filter((g) => !g.anledning && !erBrukt('gaveaar', g.status));
  // Valgt eller kjøpt: gaver med anledning eller som er kjøpt, til de er gitt
  const planlagt = alle.filter((g) => (g.anledning || erBrukt('gaveaar', g.status)) && g.status !== 'gitt');
  const planlagtIder = new Set([...planlagt, ...ideer].map((g) => g.id));
  const historikk = tidligereGaver(gavehistorikk(lister, punkter), mottaker.tekst).filter((g) => !planlagtIder.has(g.punkt.id));

  const lagreMottaker = (endring: Partial<Punkt>) => void listeLager.lagrePunkter([{ ...mottaker, ...endring }]);
  const settAnledning = (a: Anledning) => lagreMottaker({ anledninger: anledninger.map((x) => (x.id === a.id ? a : x)) });
  const fjernAnledning = (a: Anledning) => lagreMottaker({ anledninger: anledninger.filter((x) => x.id !== a.id) });
  const leggTilAnledning = (a: Anledning) => lagreMottaker({ anledninger: [...anledninger, a] });

  /** Fødselsdato setter også bursdagen (og legger den til hvis den mangler) */
  function settFodt(fodt: string | undefined) {
    if (!fodt) { lagreMottaker({ fodt: undefined }); return; }
    const bursdag = anledninger.find((a) => a.type === 'bursdag');
    lagreMottaker({
      fodt,
      anledninger: bursdag
        ? anledninger.map((a) => (a.id === bursdag.id ? { ...a, dag: fodt.slice(5), aar: undefined } : a))
        : [nyAnledning('bursdag', { dag: fodt.slice(5) }), ...anledninger],
    });
  }

  function leggTilIde(e: FormEvent) {
    e.preventDefault();
    if (!nyIde.trim()) return;
    void listeLager.lagrePunkter([{ ...nyttPunkt(liste!.id, 'gaveaar', nyIde.trim(), nesteRekkefolge(mine)), forelderId: mottaker!.id }]);
    setNyIde('');
  }

  /** Gaver og bekreftelse for én anledning (én gang) – brukes under hver anledning i arket */
  const erBekreftet = (nokkel: string) => !!mottaker.ferdigeAnledninger?.includes(nokkel);
  const anledningGaver = (nokkel: string): AnledningGaver => ({
    gaver: alle.filter((g) => g.anledning === nokkel),
    bekreftet: erBekreftet(nokkel),
    bekreft: (n, ferdig) => {
      void listeLager.lagrePunkter([medFerdig(mottaker!, n, ferdig)]);
      if (ferdig) {
        visToast({
          tekst: `${mottaker!.tekst} er ferdig til ${nokkelTekst(mottaker, n).toLowerCase()}`,
          angre: () => { void listeLager.lagrePunkter([medFerdig(mottaker!, n, false)]); visToast(null); },
        });
      }
    },
  });

  function lagreGave(foer: Punkt | undefined, endret: Punkt) {
    const etter = medAutoAnledning(endret, mottaker, idag);
    // En gave som ikke er kjøpt på en anledning som var bekreftet ferdig: da er man ikke ferdig likevel
    const angreFerdig = !!etter.anledning && erBekreftet(etter.anledning) && !erBrukt('gaveaar', etter.status);
    void listeLager.lagrePunkter(angreFerdig ? [etter, medFerdig(mottaker!, etter.anledning!, false)] : [etter]);
    if (erBrukt('gaveaar', etter.status) && !(foer && erBrukt('gaveaar', foer.status))) {
      const til = etter.anledning ? ` til ${nokkelTekst(mottaker, etter.anledning).toLowerCase()}` : '';
      // Hvor langt man er kommet: ferdig (planlagt antall nådd), x av y, eller bekreft (uten planlagt antall)
      let mer = '';
      if (etter.anledning) {
        const gaver = [...alle.filter((g) => g.anledning === etter.anledning && g.id !== etter.id), etter];
        const antall = anledninger.find((a) => etter.anledning!.startsWith(`${a.id}:`))?.antall;
        const s = gaveStatus(gaver, erBekreftet(etter.anledning), antall);
        mer = s === 'ferdig' ? `. ${mottaker!.tekst} er ferdig.` : s === 'venter' ? '. Ferdig? Bekreft under Anledninger.' : antall ? `. ${kjoptAv(gaver, antall)}.` : '';
      }
      visToast({
        tekst: `«${etter.tekst}» kjøpt${til}${mer}`,
        handling: etter.belop ? { tekst: 'Før utgift', kjor: () => { setUtgift(forslag(etter)); visToast(null); } } : undefined,
      });
    }
  }
  // En felles gave som du betaler, føres som privat utgift
  const forslag = (g: Punkt): UtgiftForslag => ({ belop: g.belop ?? 0, notat: `${g.tekst} til ${mottaker!.tekst}`, privat: liste.privat || (!!meg && g.betaler === meg.id) });

  const [bekreftDialog, spor] = useBekreft();
  function slettMottaker() {
    const angre = listeLager.slettPunkt(mottaker!);
    visToast({ tekst: `Slettet ${mottaker!.tekst}`, angre: () => { void angre(); visToast(null); } });
    lukk();
  }

  // Redigering av én gave vises i stedet for mottakerarket
  if (redigerer) {
    return (
      <PunktArk key={redigerer.id} liste={liste} start={redigerer} ny={false} alle={mine} historikk={gavehistorikk(lister, punkter)}
        lagre={lagreGave} lukk={() => setRedigerer(null)} aapne={setRedigerer}
        forUtgift={(g) => { setRedigerer(null); setUtgift(forslag(g)); }} />
    );
  }
  if (utgift) return <UtgiftSkjema forslag={utgift} privatStart={!!utgift.privat} lukk={() => setUtgift(null)} />;

  /** Sveip mot høyre = kjøpt (havner på neste anledning), mot venstre = slett */
  function slettGave(g: Punkt) {
    const angre = listeLager.slettPunkt(g);
    visToast({ tekst: `Slettet «${g.tekst}»`, angre: () => { void angre(); visToast(null); } });
  }
  const sveipKjopt = (g: Punkt) => (g.status === 'ide'
    ? { tekst: 'Kjøpt', ikon: 'sjekk', gjor: () => lagreGave(g, medStatus(g, 'gaveaar', 'kjopt', idag)) }
    : undefined);

  const gaveRad = (g: Punkt, visAnledning = false) => (
    <Sveip className="rad" key={g.id} hoyre={sveipKjopt(g)} venstre={{ tekst: 'Slett', ikon: 'slett', fare: true, gjor: () => slettGave(g) }}>
      <button className="rad-knapp" onClick={() => setRedigerer(g)}>
        <span className="hoved">
          <span className="navn">{g.tekst}</span>
          <span className="info">{[
            visAnledning && g.anledning ? nokkelTekst(mottaker, g.anledning) : null,
            g.betaler ? `betales av ${g.betaler === meg?.id ? 'deg' : 'den andre'}` : null,
            g.lenke ? 'lenke' : null, g.vedlegg?.length ? `${g.vedlegg.length} vedlegg` : null, g.notat,
          ].filter(Boolean).join(' · ')}</span>
        </span>
        {g.belop ? <span className="belop">{kr(g.belop)}</span> : null}
      </button>
      <StatusKnapp type="gaveaar" status={g.status} endre={() => lagreGave(g, medStatus(g, 'gaveaar', nesteStatus('gaveaar', g.status), idag))} />
    </Sveip>
  );

  // Bursdag og jul er med fra start. Mangler de (slettet), foreslås de i «Legg til anledning».
  const mangler = (['bursdag', 'jul'] as AnledningType[]).filter((t) => !anledninger.some((a) => a.type === t));

  return (
    <Ark tittel={mottaker.tekst} lukk={lukk} bred>
      <div className="skjema">
        <div className="felt-rad">
          <Felt etikett="Navn">
            <input value={navn} onChange={(e) => setNavn(e.target.value)} onBlur={() => navn.trim() && navn.trim() !== mottaker.tekst && lagreMottaker({ tekst: navn.trim() })} />
          </Felt>
          <Felt etikett="Født (valgfritt)">
            <input type="date" value={mottaker.fodt ?? ''} max={idag} onChange={(e) => settFodt(e.target.value || undefined)} />
          </Felt>
        </div>
        {mottaker.fodt && <p className="dempet liten" style={{ marginTop: -8 }}>{fodtTekst(mottaker.fodt, idag)}</p>}

        <div className="felt">
          <span>Idébanken</span>
          <form className="hurtig" onSubmit={leggTilIde}>
            <input value={nyIde} onChange={(e) => setNyIde(e.target.value)} placeholder="Ny idé" aria-label="Ny idé" enterKeyHint="done" />
            <button type="submit" className="knapp primar ikon" aria-label="Legg til idé" disabled={!nyIde.trim()}><Ikon navn="pluss" /></button>
          </form>
          {ideer.length > 0 ? <div className="liste">{ideer.map((g) => gaveRad(g))}</div>
            : <small>Ingen ideer ennå.</small>}
        </div>

        {planlagt.length > 0 && (
          <div className="felt">
            <span>Valgt eller kjøpt</span>
            <div className="liste">{planlagt.sort((a, b) => (a.anledning ?? '').localeCompare(b.anledning ?? '')).map((g) => gaveRad(g, true))}</div>
          </div>
        )}

        <div className="felt">
          <span>Anledninger og budsjett</span>
          <div className="anledninger">
            {sorterAnledninger(anledninger, idag).map((a) => <AnledningRad key={a.id} a={a} fodt={a.type === 'bursdag' ? mottaker.fodt : undefined} endre={settAnledning} fjern={() => fjernAnledning(a)}
              mottakerNavn={mottaker.tekst} g={anledningGaver} />)}
          </div>
          {nyEgen
            ? <NyEgenAnledning mangler={mangler} lagre={(a) => { leggTilAnledning(a); setNyEgen(false); }} avbryt={() => setNyEgen(false)} />
            : <div><button type="button" className="knapp liten" onClick={() => setNyEgen(true)}><Ikon navn="pluss" storrelse={16} />Legg til anledning</button></div>}
        </div>

        {meg && (
          <div className="felt-rad">
            <Felt etikett="Hvem ser" hjelp={liste.privat ? 'Bare du ser personen og gavene.' : `Dere ser begge personen og gavene.`}>
              <select value={liste.privat ? 'privat' : 'felles'} disabled={flytter} onChange={(e) => void settSynlighet(e.target.value === 'privat')}>
                <option value="felles">Felles</option>
                <option value="privat">Bare meg</option>
              </select>
            </Felt>
            <Felt etikett="Kjøper" hjelp={liste.privat ? 'Du kjøper selv.' : 'Budsjett og kjøp teller i den personens pott.'}>
              <select value={liste.privat ? meg.id : mottaker.ansvarlig ?? ''} disabled={liste.privat} onChange={(e) => lagreMottaker({ ansvarlig: e.target.value || undefined })}>
                {liste.privat
                  ? <option value={meg.id}>Deg</option>
                  : <>
                    <option value="">Felles (ikke bestemt)</option>
                    {(felles?.personer ?? []).map((p) => <option key={p.id} value={p.id}>{p.id === meg.id ? `${p.navn} (deg)` : p.navn}</option>)}
                  </>}
              </select>
            </Felt>
          </div>
        )}

        {historikk.length > 0 && (
          <div className="felt">
            <span>Historikk</span>
            <div className="liste">
              {historikk.map((g) => {
                // Gaver i dette gaveåret kan endres herfra. Gaver fra andre lister vises bare.
                const her = alle.some((x) => x.id === g.punkt.id);
                const innhold = (
                  <>
                    <span className="merkelapp tall">{g.aar}</span>
                    <span className="hoved"><span className="navn">{g.punkt.tekst}</span><span className="info">{g.punkt.anledning ? nokkelTekst(punkter.find((x) => x.id === g.punkt.forelderId), g.punkt.anledning) : g.liste.navn}</span></span>
                    {g.punkt.belop ? <span className="belop">{kr(g.punkt.belop)}</span> : null}
                  </>
                );
                return her ? (
                  <div className="rad" key={g.punkt.id}>
                    <button className="rad-knapp" onClick={() => setRedigerer(g.punkt)}>{innhold}</button>
                    <StatusKnapp type="gaveaar" status={g.punkt.status} endre={() => lagreGave(g.punkt, medStatus(g.punkt, 'gaveaar', nesteStatus('gaveaar', g.punkt.status), idag))} />
                  </div>
                ) : <div className="rad" key={g.punkt.id}>{innhold}</div>;
              })}
            </div>
          </div>
        )}

        <div className="knapperad slutt">
          <button type="button" className="knapp flat fare dytt" onClick={() => spor({
            tittel: `Slette ${mottaker!.tekst}?`,
            tekst: alle.length ? `${alle.length} gaver og ideer forsvinner også, sammen med historikken. Du kan angre rett etterpå.` : 'Du kan angre rett etterpå.',
            knapp: 'Slett mottaker',
            ja: slettMottaker,
          })}><Ikon navn="slett" storrelse={18} />Slett mottaker</button>
          <button type="button" className="knapp primar" onClick={lukk}>Ferdig</button>
        </div>
      </div>
      {bekreftDialog}
    </Ark>
  );
}

interface AnledningGaver {
  /** Gavene til neste gang (nøkkelen «<anledning-id>:<år>») */
  gaver: Punkt[];
  bekreftet: boolean;
  bekreft: (nokkel: string, ferdig: boolean) => void;
}

function AnledningRad({ a, fodt, endre, fjern, mottakerNavn, g }: {
  a: Anledning; fodt?: string; endre: (a: Anledning) => void; fjern: () => void; mottakerNavn: string; g: (nokkel: string) => AnledningGaver;
}) {
  const idag = iDag();
  // Bursdag med fødselsdato regnes ut, akkurat som jul, morsdag og farsdag
  const fast = a.type === 'jul' || a.type === 'morsdag' || a.type === 'farsdag' || (a.type === 'bursdag' && !!fodt);
  const neste = nesteDato(a, idag);
  const nokkel = neste ? anledningsNokkel(a, Number(neste.slice(0, 4))) : null;
  const gaver = nokkel ? g(nokkel) : null;
  const tilstand = gaver ? gaveStatus(gaver.gaver, gaver.bekreftet, a.antall) : 'ingen';
  // «jul 2026», «bursdag 2026»
  const gangen = neste ? `${anledningsNavn(a).toLocaleLowerCase('nb')} ${neste.slice(0, 4)}` : '';
  // Datofeltet trenger et år: bruk neste gang (eller året for engangsanledninger)
  const visAar = a.aar ?? Number((neste ?? idag).slice(0, 4));
  return (
    <div className="anledning-rad">
      <IkonBoble ikon={ANLEDNING_IKON[a.type]} kategori="Gaver" storrelse="liten" />
      <div className="anledning-felt">
        {a.type === 'egen'
          ? <input className="anledning-navn" value={a.navn ?? ''} onChange={(e) => endre({ ...a, navn: e.target.value })} aria-label="Navn på anledningen" placeholder="Navn" />
          : <strong>{anledningsNavn(a)}</strong>}
        {fast
          ? <span className="dempet liten">{neste ? `Neste: ${datoTekst(neste)}` : ''}{fodt && neste ? ` · fyller ${alder(fodt, neste)}` : ''}</span>
          : (
            <span className="anledning-dato">
              <input type="date" value={a.dag ? `${visAar}-${a.dag}` : ''} aria-label={`Dato for ${anledningsNavn(a)}`}
                onChange={(e) => endre({ ...a, dag: e.target.value ? e.target.value.slice(5) : undefined, aar: a.aar ? Number(e.target.value.slice(0, 4)) || a.aar : undefined })} />
              <label className="liten dempet"><input type="checkbox" checked={!!a.aar} onChange={(e) => endre({ ...a, aar: e.target.checked ? visAar : undefined })} /> Bare én gang</label>
            </span>
          )}
        {!fast && !a.dag && <span className="liten varsel-tekst">Mangler dato – vises ikke i årshjulet</span>}
      </div>
      <div className="anledning-tall">
        <label className="anledning-antall">
          <span className="dempet liten">Gaver</span>
          <input type="number" inputMode="numeric" min={1} max={20} value={a.antall ?? ''} placeholder="–" aria-label={`Planlagt antall gaver til ${anledningsNavn(a)}`}
            onChange={(e) => { const n = Math.round(Number(e.target.value)); endre({ ...a, antall: n > 0 ? Math.min(n, 20) : undefined }); }} />
        </label>
        <div className="anledning-budsjett">
          <span className="dempet liten">Budsjett</span>
          <BelopFelt verdi={a.budsjett ?? 0} endre={(v) => endre({ ...a, budsjett: v || undefined })} />
        </div>
      </div>
      <button type="button" className="knapp flat ikon liten" onClick={fjern} aria-label={`Fjern ${anledningsNavn(a)}`}><Ikon navn="lukk" storrelse={16} /></button>

      {/* Status for neste gang: ferdig når planlagt antall er kjøpt – uten antall må det bekreftes */}
      {nokkel && gaver && tilstand !== 'ingen' && (
        <div className="anledning-gaver">
          {tilstand === 'venter' && (
            <div className="banner info">
              <Ikon navn="sjekk" />
              <div>
                <strong>Alle gavene til {gangen} er kjøpt</strong>
                <p className="liten">Er {mottakerNavn} ferdig? Skal det kjøpes flere, sett antall gaver over.</p>
              </div>
              <button type="button" className="knapp primar liten" onClick={() => gaver.bekreft(nokkel, true)}>Ja, ferdig</button>
            </div>
          )}
          {tilstand === 'ferdig' && (
            <span className="anledning-status">
              <span className="merkelapp bra"><Ikon navn="sjekk" storrelse={12} />Ferdig til {gangen}</span>
              {gaver.bekreftet && <button type="button" className="lenkeknapp" onClick={() => gaver.bekreft(nokkel, false)}>Ikke ferdig likevel</button>}
            </span>
          )}
          {tilstand === 'delvis' && <span className="dempet liten">{kjoptAv(gaver.gaver, a.antall)} til {gangen}</span>}
        </div>
      )}
    </div>
  );
}

function NyEgenAnledning({ mangler, lagre, avbryt }: { mangler: AnledningType[]; lagre: (a: Anledning) => void; avbryt: () => void }) {
  const [navn, setNavn] = useState('');
  const [dato, setDato] = useState('');
  const [enGang, setEnGang] = useState(true);
  return (
    <div className="kort innfelt">
      {mangler.length > 0 && (
        <div className="valgchips" role="group" aria-label="Forslag">
          {mangler.map((t) => (
            <button key={t} type="button" onClick={() => lagre(nyAnledning(t))}><Ikon navn={ANLEDNING_IKON[t]} storrelse={15} />{ANLEDNING_NAVN[t]}</button>
          ))}
        </div>
      )}
      <div className="felt-rad">
        <Felt etikett="Anledning"><input value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="F.eks. Konfirmasjon" autoFocus /></Felt>
        <Felt etikett="Dato"><input type="date" value={dato} onChange={(e) => setDato(e.target.value)} /></Felt>
      </div>
      <label className="rad" style={{ cursor: 'pointer', minHeight: 44, borderBottom: 0 }}>
        <span className="hoved"><span className="navn">Bare én gang</span><span className="info">På for konfirmasjon, bryllup o.l. Av for noe som gjentas hvert år.</span></span>
        <input type="checkbox" className="bryter" checked={enGang} onChange={(e) => setEnGang(e.target.checked)} />
      </label>
      <div className="knapperad slutt">
        <button type="button" className="knapp" onClick={avbryt}>Avbryt</button>
        <button type="button" className="knapp primar" disabled={!navn.trim() || !dato}
          onClick={() => lagre(nyAnledning('egen', { navn: navn.trim(), dag: dato.slice(5), aar: enGang ? Number(dato.slice(0, 4)) : undefined }))}>Legg til</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Plan for én anledning (Juleplan osv.)

export function AnledningsPlan({ type: t, aar: a, gaaTil }: { type?: string; aar?: string; gaaTil: (r: string) => void }) {
  const { lister, punkter, lastet } = useLister();
  const { felles, meg } = useTilstand();
  const [mottakerArk, setMottakerArk] = useState<{ liste: Liste; id: string } | null>(null);
  const [budsjettFor, setBudsjettFor] = useState<Liste | null>(null);
  const [nyNavn, setNyNavn] = useState('');
  const type = tilPlanType(t);
  const aar = Number(a) || nestePlanAar(type);
  if (!lastet) return <div className="laster"><div className="spinner" aria-label="Laster" /></div>;

  const alleAar = gaveaar(lister);
  const fellesListe = alleAar.find((l) => !l.privat);
  const minListe = alleAar.find((l) => l.privat);
  const nyIListe = nyListeValg(fellesListe, minListe);
  const plan = anledningsPlan(lister, punkter, type, aar);
  // Bursdager og andre: det som har vært, havner i egen bolk nederst. Jul er én dag for alle.
  const idag = iDag();
  const kommende = type === 'jul' ? plan : plan.filter((p) => p.dato >= idag);
  const tidligere = type === 'jul' ? [] : plan.filter((p) => p.dato < idag);
  const pottListe = potter(plan, meg?.id);
  const perPott = budsjettPerPott(plan, meg?.id);
  const nokkel = planNokkel(type, aar);
  const gaa = (ny: { type?: PlanType; aar?: number }) => gaaTil(`lister/plan/${ny.type ?? type}/${ny.aar ?? (ny.type && ny.type !== type ? nestePlanAar(ny.type) : aar)}`);
  const navnPaa = (id: string) => felles?.personer.find((p) => p.id === id)?.navn ?? 'Ukjent';

  // Pottene: felles, deg og eventuelt den andre (felles mottakere den andre er ansvarlig for, eller gaver den betaler).
  // Personbudsjettene fordeles etter hvem som er ansvarlig for mottakeren.
  const fliser: { id: string; tittel: string; liste?: Liste; budsjett: number; egetBudsjett: boolean }[] = [];
  if (fellesListe) {
    const eget = fellesListe.anledningsBudsjett?.[nokkel];
    fliser.push({ id: 'felles', tittel: 'Felles', liste: fellesListe, budsjett: eget ?? perPott.get('felles') ?? 0, egetBudsjett: eget !== undefined });
  }
  if (meg) {
    const eget = minListe?.anledningsBudsjett?.[nokkel];
    fliser.push({ id: meg.id, tittel: `Fra deg (${meg.navn})`, liste: minListe, budsjett: eget ?? perPott.get(meg.id) ?? 0, egetBudsjett: eget !== undefined });
  }
  const andrePotter = new Set([...pottListe.map((p) => p.id), ...perPott.keys()]);
  for (const id of andrePotter) if (!fliser.some((f) => f.id === id)) fliser.push({ id, tittel: `Fra ${navnPaa(id)}`, budsjett: perPott.get(id) ?? 0, egetBudsjett: false });

  /** Ny mottaker til jul eller bursdag. Bursdag åpner arket, så datoen kan legges inn. («Andre» legges til på personen.) */
  function leggTil(e: FormEvent, liste: Liste) {
    e.preventDefault();
    const navn = nyNavn.trim();
    if (!navn || type === 'andre') return;
    const finnes = mottakere(liste.id, punkter).find((m) => m.tekst.trim().toLocaleLowerCase('nb') === navn.toLocaleLowerCase('nb'));
    let id = finnes?.id;
    if (finnes) {
      if (!finnes.anledninger?.some((x) => x.type === type)) void listeLager.lagrePunkter([{ ...finnes, anledninger: [...(finnes.anledninger ?? []), nyAnledning(type)] }]);
    } else {
      const ny = { ...nyttPunkt(liste.id, 'gaveaar', navn, nesteRekkefolge(punkter.filter((p) => p.listeId === liste.id))), anledninger: [nyAnledning(type)] };
      id = ny.id;
      void listeLager.lagrePunkter([ny]);
    }
    setNyNavn('');
    if (type === 'bursdag' && id) setMottakerArk({ liste, id });
  }

  return (
    <>
      <div className="verktoylinje">
        <button className="knapp flat liten" onClick={() => gaaTil(fellesListe ? `lister/${fellesListe.id}` : 'lister')}><Ikon navn="pilvenstre" storrelse={18} />Gaveår</button>
        <div className="maanedsvelger" role="group" aria-label="År">
          <button className="knapp ikon flat liten" onClick={() => gaa({ aar: aar - 1 })} aria-label="Forrige år"><Ikon navn="pilvenstre" storrelse={18} /></button>
          <span className="tall">{aar}</span>
          <button className="knapp ikon flat liten" onClick={() => gaa({ aar: aar + 1 })} aria-label="Neste år"><Ikon navn="pilhoyre" storrelse={18} /></button>
        </div>
      </div>
      <Segment etikett="Anledning" full verdi={type} endre={(x) => gaa({ type: x })}
        valg={PLAN_TYPER.map((x) => ({ verdi: x, tekst: PLAN_NAVN[x], ikon: PLAN_IKON[x] }))} />

      {!alleAar.length ? (
        <section className="kort">
          <Tom ikon="gave" tittel="Ingen gaveår ennå" tekst="Lag et felles gaveår og ditt eget private under Lister → Ny liste → Gaveår. Så slipper dere panikkhandel på bensinstasjonen.">
            <button className="knapp primar" onClick={() => gaaTil('lister')}>Til listene</button>
          </Tom>
        </section>
      ) : (
        <>
          <div className="kpi-rad">
            {fliser.map((f) => {
              const p = pottListe.find((x) => x.id === f.id);
              const brukt = (p?.brukt ?? 0) + (p?.planlagt ?? 0);
              const over = f.budsjett > 0 && brukt > f.budsjett;
              return (
                <div className="kpi" key={f.id}>
                  <span className="etikett">{f.tittel}</span>
                  <span className="verdi">{kr(brukt)}</span>
                  <span className="under">
                    {f.budsjett > 0 ? <span className={over ? 'varsel-tekst' : undefined}>av {kr(f.budsjett)}{f.egetBudsjett ? '' : ' (personbudsjett)'}</span> : 'Ingen budsjett'}
                    {f.liste && <button className="lenkeknapp" onClick={() => setBudsjettFor(f.liste!)}>Endre</button>}
                  </span>
                  {p && p.brukt > 0 && <span className="under">{kr(p.brukt)} kjøpt</span>}
                </div>
              );
            })}
          </div>

          <section className="kort">
            <div className="kort-hode">
              <div className="tittel"><h2>{planTittel(type, aar)}</h2><span className="dempet liten">{plan.length} {plan.length === 1 ? 'mottaker' : 'mottakere'} fra {alleAar.length > 1 ? 'felles og ditt private gaveår' : 'gaveåret'}</span></div>
            </div>
            {type === 'andre' && <p className="dempet liten" style={{ marginBottom: 8 }}>Konfirmasjon, navnefest og andre anledninger. Legg dem til på personen i gaveåret.</p>}
            {nyIListe.length > 0 && type !== 'andre' && (
              <form className="hurtig" onSubmit={(e) => leggTil(e, nyIListe[nyIListe.length > 1 && (e.currentTarget.elements.namedItem('hvor') as HTMLSelectElement)?.value === 'privat' ? 1 : 0])}>
                <input value={nyNavn} onChange={(e) => setNyNavn(e.target.value)} placeholder="Ny mottaker" aria-label="Ny mottaker" />
                {nyIListe.length > 1 && (
                  <select name="hvor" className="hurtig-velg" aria-label="Hvilket gaveår" defaultValue="felles">
                    <option value="felles">Felles</option>
                    <option value="privat">Mitt</option>
                  </select>
                )}
                <button type="submit" className="knapp primar ikon" aria-label="Legg til" disabled={!nyNavn.trim()}><Ikon navn="pluss" /></button>
              </form>
            )}
            {plan.length === 0 && <Tom ikon="gave" tittel={type === 'jul' ? 'Ingen mottakere med jul ennå' : type === 'bursdag' ? 'Ingen bursdager med dato ennå' : `Ingen andre anledninger i ${aar}`} />}
            {[...kommende, ...(tidligere.length ? [null] : []), ...tidligere].map((person) => person === null ? (
              <div className="seksjon har-vaert" key="har-vaert"><SeksjonHode tittel="Har vært" antall={tidligere.length} /></div>
            ) : (
              <section className={`seksjon boks${person.dato < iDag() && type !== 'jul' ? ' forbi' : ''}`} key={person.navn + person.tittel}>
                <SeksjonHode person
                  tittel={type === 'andre' ? `${person.tittel} – ${person.navn}` : person.navn}
                  merke={type === 'jul' ? undefined : <span className="dato-blokk" aria-hidden="true"><span className="dag">{Number(person.dato.slice(8))}</span><span className="mnd">{MAANEDER_KORT[Number(person.dato.slice(5, 7)) - 1]}</span></span>}
                  etterTittel={person.alder !== undefined ? <Alder alder={person.alder} forbi={person.dato < idag} /> : undefined}
                  under={person.deler.map((d) => `${d.liste.privat ? 'Mitt' : 'Felles'}${d.anledning.budsjett ? ` · budsjett ${kr(d.anledning.budsjett)}` : ''}`).join('  |  ')}
                  sum={sum(person.deler.flatMap((d) => d.gaver), (g) => g.belop ?? 0)} />
                {person.deler.map((d) => <PlanDelVisning key={d.mottaker.id} d={d} flere={person.deler.length > 1} navnPaa={navnPaa} megId={meg?.id}
                  aapne={() => setMottakerArk({ liste: d.liste, id: d.mottaker.id })} />)}
              </section>
            ))}
          </section>
        </>
      )}

      {mottakerArk && <MottakerArk mottakerId={mottakerArk.id} lukk={() => setMottakerArk(null)} />}
      {budsjettFor && <BudsjettArk liste={budsjettFor} nokkel={nokkel} tittel={planTittel(type, aar)} lukk={() => setBudsjettFor(null)} />}
    </>
  );
}

/** Gaveårene du kan legge nye mottakere i: felles først, så ditt private */
function nyListeValg(felles?: Liste, privat?: Liste): Liste[] {
  return [felles, privat].filter((l): l is Liste => !!l);
}

function PlanDelVisning({ d, flere, navnPaa, megId, aapne }: { d: PlanDel; flere: boolean; navnPaa: (id: string) => string; megId?: string; aapne: () => void }) {
  const idag = iDag();
  return (
    <div className="plan-del">
      {flere && <span className="plan-del-hode">{d.liste.privat ? 'Fra deg' : 'Felles'}</span>}
      {d.gaver.length > 0 ? (
        <div className="liste">
          {d.gaver.map((g) => (
            <div className="rad" key={g.id}>
              <button className="rad-knapp" onClick={aapne}>
                <span className="hoved">
                  <span className="navn">{g.tekst}</span>
                  {g.betaler && <span className="info">Betales av {g.betaler === megId ? 'deg' : navnPaa(g.betaler)}</span>}
                </span>
                {g.belop ? <span className="belop">{kr(g.belop)}</span> : null}
              </button>
              <StatusKnapp type="gaveaar" status={g.status} endre={() => void listeLager.lagrePunkter([medStatus(g, 'gaveaar', nesteStatus('gaveaar', g.status), idag)])} />
            </div>
          ))}
        </div>
      ) : (
        <button className="rad tom-gave" onClick={aapne}>
          <span className="hoved">
            <span className="navn dempet">Ingen gave valgt</span>
            <span className="info">{d.ideer.length ? `${d.ideer.length} ${d.ideer.length === 1 ? 'idé' : 'ideer'} i idébanken: ${d.ideer.slice(0, 3).map((i) => i.tekst).join(', ')}` : 'Ingen ideer ennå – trykk for å legge til'}</span>
          </span>
          <Ikon navn="pilhoyre" storrelse={16} />
        </button>
      )}
    </div>
  );
}

function BudsjettArk({ liste, nokkel, tittel, lukk }: { liste: Liste; nokkel: string; tittel: string; lukk: () => void }) {
  const [belop, setBelop] = useState(liste.anledningsBudsjett?.[nokkel] ?? 0);
  function lagre(fjern = false) {
    const ny = { ...(liste.anledningsBudsjett ?? {}) };
    if (fjern || !belop) delete ny[nokkel]; else ny[nokkel] = belop;
    void listeLager.lagreListe({ ...liste, anledningsBudsjett: ny });
    lukk();
  }
  return (
    <Ark tittel={`Budsjett – ${tittel}`} lukk={lukk}>
      <form className="skjema" onSubmit={(e) => { e.preventDefault(); lagre(); }}>
        <p className="dempet liten">Samlet ramme for {liste.privat ? 'dine gaver' : 'felles gaver'}. Uten egen ramme brukes summen av budsjettene per person.</p>
        <Felt etikett={liste.privat ? 'Fra deg' : 'Felles'}><BelopFelt verdi={belop} endre={setBelop} autoFocus /></Felt>
        <div className="knapperad slutt">
          {liste.anledningsBudsjett?.[nokkel] !== undefined && <button type="button" className="knapp flat dytt" onClick={() => lagre(true)}>Bruk personbudsjettene</button>}
          <button type="button" className="knapp" onClick={lukk}>Avbryt</button>
          <button type="submit" className="knapp primar">Lagre</button>
        </div>
      </form>
    </Ark>
  );
}
