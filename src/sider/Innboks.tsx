// Bjella: varslene i appen, med alle detaljer (også når «Skjul detaljer» gjør push-varselet tomt).
// Push-varsler som er samlet eller skjult, åpner denne siden. Data: data/innboks.ts (tabellen varsel_innboks).
import { useEffect, useState } from 'react';
import type { InnboksVarsel } from '../data/modell';
import { lager } from '../data/lager';
import { merkAltLest, useInnboks } from '../data/innboks';
import { IkonBoble, Ikon, Laster } from '../ui/felles';
import { varselIkon } from './Varsler';

const lokalDato = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** «Nå nettopp», «For 25 min siden», «Kl. 08:00», «I går 08:00», «12. okt.» */
function naarTekst(iso: string, naa = new Date()): string {
  const d = new Date(iso);
  const min = Math.round((naa.getTime() - d.getTime()) / 60_000);
  const kl = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  if (min < 1) return 'Nå nettopp';
  if (min < 60) return `For ${min} min siden`;
  if (lokalDato(d) === lokalDato(naa)) return `Kl. ${kl}`;
  if (lokalDato(d) === lokalDato(new Date(naa.getTime() - 86_400_000))) return `I går ${kl}`;
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

function gruppe(iso: string, naa = new Date()): string {
  const d = lokalDato(new Date(iso));
  if (d === lokalDato(naa)) return 'I dag';
  if (d === lokalDato(new Date(naa.getTime() - 86_400_000))) return 'I går';
  return 'Tidligere';
}

export function Innboks({ gaaTil }: { gaaTil: (r: string) => void }) {
  const { varsler, lastet, feil } = useInnboks();
  // Det som var nytt da siden ble åpnet, beholder markeringen mens man ser på den (selv om alt merkes som lest)
  const [nye, setNye] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!lastet || nye) return;
    setNye(new Set(varsler.filter((v) => !v.lest).map((v) => v.id)));
    void merkAltLest();
  }, [lastet, varsler, nye]);

  if (!lastet) return <Laster />;

  const aapne = (v: InnboksVarsel) => {
    const rute = v.url.replace(/^#\/?/, '');
    if (rute && rute !== 'innboks') gaaTil(rute);
  };
  const grupper = ['I dag', 'I går', 'Tidligere']
    .map((navn) => ({ navn, varsler: varsler.filter((v) => gruppe(v.opprettet) === navn) }))
    .filter((g) => g.varsler.length);

  return (
    <>
      {feil && (
        <div className="banner info">
          <Ikon navn="info" />
          <div>
            <strong>Bjella er ikke helt klar ennå.</strong>
            <p className="liten">{/varsel_innboks/.test(feil) ? 'Tabellen for varsler i appen mangler – kjør supabase/varsler.sql i Supabase.' : feil}</p>
          </div>
        </div>
      )}

      <section className="kort">
        <div className="kort-hode">
          <div className="tittel">
            <h2>Siste varsler</h2>
            <span className="dempet liten">Det samme som kommer som push – med alle detaljer</span>
          </div>
          <a className="knapp liten flat" href="#/varsler"><Ikon navn="rediger" storrelse={16} />Velg varsler</a>
        </div>

        {!varsler.length && !feil && (
          <div className="tom">
            <Ikon navn="bjelle" storrelse={28} />
            <strong>Helt stille her</strong>
            <p>Bursdager, frister, avtaler og det den andre gjør i delte lister havner her – også om du ikke har slått på push.</p>
          </div>
        )}

        {grupper.map((g) => (
          <div key={g.navn} className="innboks-gruppe">
            <div className="kal-mini-dag">{g.navn}</div>
            <div className="liste">
              {g.varsler.map((v) => {
                const ny = nye?.has(v.id) ?? !v.lest;
                return (
                  <button key={v.id} className={`rad innboks-rad${ny ? ' ny' : ''}`} onClick={() => aapne(v)}>
                    <IkonBoble ikon={varselIkon(v.type)} storrelse="liten" />
                    <span className="hoved">
                      <span className="navn">{v.tittel}</span>
                      {v.tekst && <span className="info">{v.tekst}</span>}
                      <span className="innboks-tid">{naarTekst(v.opprettet)}</span>
                    </span>
                    {ny && <span className="innboks-prikk" role="img" aria-label="Nytt" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {lager.modus === 'lokal' && varsler.length > 0 && <p className="dempet liten" style={{ marginTop: 12 }}>Demomodus: varslene over er oppdiktet.</p>}
      </section>
    </>
  );
}
