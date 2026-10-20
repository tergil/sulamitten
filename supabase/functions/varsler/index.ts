// GENERERT av npm run funksjoner fra supabase/kilde/varsler.ts – ikke rediger denne fila.
// Lim hele innholdet inn i Supabase → Edge Functions → varsler (eller: npx supabase functions deploy varsler --no-verify-jwt).
// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
//#region src/data/modell.ts
const STANDARD_VARSLER = {
	time: 8,
	bareUtenGave: true,
	typer: {
		bursdag: {
			pa: true,
			dager: [21, 0]
		},
		jul: {
			pa: true,
			dager: [21]
		},
		andre: {
			pa: true,
			dager: [21, 0]
		},
		frist: {
			pa: true,
			dager: [3, 0]
		},
		kalender: {
			pa: false,
			dager: [0]
		},
		hage: {
			pa: true,
			dager: [0]
		},
		/** Morgenoversikt: 0 = dagens avtaler, 1 = morgendagens */
		avtaler: {
			pa: true,
			dager: [0]
		},
		/** Varsel før en avtale, når avtalen har «varsel før» */
		avtaleFor: {
			pa: true,
			dager: [0]
		},
		/** Den andre lager en ny delt liste */
		nyListe: {
			pa: true,
			dager: [0]
		},
		/** Den andre legger til noe i en delt liste */
		nyttPunkt: {
			pa: true,
			dager: [0]
		},
		/** Den andre legger til en gaveidé i et felles gaveår */
		gaveide: {
			pa: true,
			dager: [0]
		},
		/** Den andre markerer noe som kjøpt i en delt liste */
		kjopt: {
			pa: true,
			dager: [0]
		},
		/** Den andre avlyser en avtale i kalenderen */
		avlyst: {
			pa: true,
			dager: [0]
		}
	}
};
//#endregion
//#region src/logikk/lister.ts
const LISTETYPER = {
	sjekk: {
		navn: "Huskeliste",
		beskrivelse: "Vanlig liste med avkrysning",
		ikon: "liste",
		statuser: [{
			id: "apen",
			tekst: "Ikke gjort"
		}, {
			id: "ferdig",
			tekst: "Gjort"
		}],
		brukt: ["ferdig"],
		felt: [
			"dato",
			"belop",
			"lenke"
		]
	},
	gave: {
		navn: "Gaveliste",
		beskrivelse: "Idé → kjøpt → gitt, med mottaker og historikk",
		ikon: "gave",
		statuser: [
			{
				id: "ide",
				tekst: "Idé"
			},
			{
				id: "kjopt",
				tekst: "Kjøpt"
			},
			{
				id: "gitt",
				tekst: "Gitt"
			}
		],
		brukt: ["kjopt", "gitt"],
		felt: [
			"mottaker",
			"belop",
			"lenke",
			"dato"
		]
	},
	onske: {
		navn: "Ønskeliste",
		beskrivelse: "Ting dere ønsker eller trenger, med pris",
		ikon: "stjerne",
		statuser: [{
			id: "onske",
			tekst: "Ønsker"
		}, {
			id: "kjopt",
			tekst: "Kjøpt"
		}],
		brukt: ["kjopt"],
		felt: [
			"belop",
			"lenke",
			"dato"
		]
	},
	oppgave: {
		navn: "Oppgaver",
		beskrivelse: "Ting som skal fikses, f.eks. av elektrikeren",
		ikon: "verktoy",
		statuser: [
			{
				id: "apen",
				tekst: "Må fikses"
			},
			{
				id: "bestilt",
				tekst: "Bestilt"
			},
			{
				id: "ferdig",
				tekst: "Ferdig"
			}
		],
		brukt: ["ferdig"],
		felt: [
			"belop",
			"dato",
			"lenke"
		]
	},
	opplevelse: {
		navn: "Steder å besøke",
		beskrivelse: "Restauranter og opplevelser, med vurdering",
		ikon: "bestikk",
		statuser: [{
			id: "vil",
			tekst: "Vil prøve"
		}, {
			id: "besokt",
			tekst: "Besøkt"
		}],
		brukt: [],
		felt: [
			"vurdering",
			"lenke",
			"dato"
		]
	},
	serie: {
		navn: "Serier og filmer",
		beskrivelse: "Vil se → ser nå → sett, med vurdering",
		ikon: "tv",
		statuser: [
			{
				id: "vil",
				tekst: "Vil se"
			},
			{
				id: "ser",
				tekst: "Ser nå"
			},
			{
				id: "sett",
				tekst: "Sett"
			}
		],
		brukt: [],
		felt: ["vurdering", "lenke"]
	},
	hage: {
		navn: "Hage",
		beskrivelse: "Planter og ting, med stell per måned",
		ikon: "spire",
		statuser: [{
			id: "apen",
			tekst: "Aktiv"
		}],
		brukt: [],
		felt: ["plassering", "maaneder"]
	},
	kalender: {
		navn: "Kalender",
		beskrivelse: "Luker med dato og idé, f.eks. adventskalender",
		ikon: "lys",
		statuser: [{
			id: "apen",
			tekst: "Ikke klar"
		}, {
			id: "klar",
			tekst: "Klar"
		}],
		brukt: ["klar"],
		felt: ["dato", "belop"]
	},
	gaveaar: {
		navn: "Gaveår",
		beskrivelse: "Faste mottakere med bursdag, jul og andre anledninger, idébank og budsjett per person",
		ikon: "kake",
		statuser: [
			{
				id: "ide",
				tekst: "Idé"
			},
			{
				id: "kjopt",
				tekst: "Kjøpt"
			},
			{
				id: "gitt",
				tekst: "Gitt"
			}
		],
		brukt: ["kjopt", "gitt"],
		felt: ["belop", "lenke"]
	}
};
/** Statusen punktet har – ukjente statuser (f.eks. etter typebytte) regnes som den første */
function gyldigStatus(type, status) {
	const s = LISTETYPER[type].statuser;
	return s.some((x) => x.id === status) ? status : s[0].id;
}
function erFerdig(type, status) {
	const s = LISTETYPER[type].statuser;
	return s.length > 1 && gyldigStatus(type, status) === s[s.length - 1].id;
}
function erBrukt(type, status) {
	return LISTETYPER[type].brukt.includes(gyldigStatus(type, status));
}
const DAG$1 = 864e5;
function utc$1(iso) {
	const [a, m, d] = iso.split("-").map(Number);
	return Date.UTC(a, m - 1, d);
}
/** Dager fra a til b (b − a), uavhengig av sommertid */
function dagerMellom(a, b) {
	return Math.round((utc$1(b) - utc$1(a)) / DAG$1);
}
/** Punkter med dato innen horisonten (eller forfalt) som ikke er ferdige. Kalenderluker og maler er ikke med. */
function huskelapp(lister, punkter, iDag, horisont = 14) {
	const aktuelle = new Map(lister.filter((l) => !l.mal && l.type !== "kalender" && l.type !== "hage").map((l) => [l.id, l]));
	const ut = [];
	for (const p of punkter) {
		const liste = aktuelle.get(p.listeId);
		if (!liste || !p.dato || erFerdig(liste.type, p.status) || erBrukt(liste.type, p.status)) continue;
		const dager = dagerMellom(iDag, p.dato);
		if (dager <= horisont) ut.push({
			punkt: p,
			liste,
			dager
		});
	}
	return ut.sort((a, b) => a.dager - b.dager);
}
/** Hagepunkter som skal gjøres i måneden til iDag */
function hageIMaaned(lister, punkter, iDag) {
	const maaned = Number(iDag.slice(5, 7));
	const hager = new Map(lister.filter((l) => !l.mal && l.type === "hage").map((l) => [l.id, l]));
	return punkter.filter((p) => hager.has(p.listeId) && p.maaneder?.includes(maaned)).map((p) => ({
		punkt: p,
		liste: hager.get(p.listeId),
		forelder: p.forelderId ? punkter.find((f) => f.id === p.forelderId) : void 0,
		gjort: !!p.sistGjort && p.sistGjort.slice(0, 7) === iDag.slice(0, 7)
	})).sort((a, b) => Number(a.gjort) - Number(b.gjort) || a.punkt.rekkefolge - b.punkt.rekkefolge);
}
//#endregion
//#region src/logikk/gaveaar.ts
const ANLEDNING_NAVN = {
	bursdag: "Bursdag",
	jul: "Jul",
	morsdag: "Morsdag",
	farsdag: "Farsdag",
	egen: "Annen anledning"
};
/** Alderen personen fyller på datoen (fødselsdato ÅÅÅÅ-MM-DD) */
function alder(fodt, dato) {
	if (!fodt || !/^\d{4}-\d{2}-\d{2}$/.test(fodt)) return void 0;
	const aar = Number(dato.slice(0, 4)) - Number(fodt.slice(0, 4)) - (dato.slice(5) < fodt.slice(5) ? 1 : 0);
	return aar >= 0 ? aar : void 0;
}
const pad = (n) => String(n).padStart(2, "0");
/** Andre søndag i måneden (morsdag i februar, farsdag i november) */
function andreSondag(aar, maaned) {
	const ukedag = new Date(Date.UTC(aar, maaned - 1, 1)).getUTCDay();
	return `${aar}-${pad(maaned)}-${pad(1 + (7 - ukedag) % 7 + 7)}`;
}
/** Datoen anledningen faller på i året, eller null (mangler dato, eller én gang i et annet år) */
function anledningsDato(a, aar) {
	if (a.aar && a.aar !== aar) return null;
	switch (a.type) {
		case "jul": return `${aar}-12-24`;
		case "morsdag": return andreSondag(aar, 2);
		case "farsdag": return andreSondag(aar, 11);
		default: return a.dag ? `${aar}-${a.dag}` : null;
	}
}
function anledningsNavn(a) {
	return a.type === "egen" ? a.navn?.trim() || ANLEDNING_NAVN.egen : ANLEDNING_NAVN[a.type];
}
const anledningsNokkel = (a, aar) => `${a.id}:${aar}`;
/** Gavelistene som er gaveår (ikke maler) */
const gaveaar = (lister) => lister.filter((l) => !l.mal && l.type === "gaveaar");
/** Mottakerne i et gaveår: hovedpunktene */
const mottakere = (listeId, punkter) => punkter.filter((p) => p.listeId === listeId && !p.forelderId).sort((a, b) => a.rekkefolge - b.rekkefolge);
/** Gaver og ideer til en mottaker */
const gaverTil = (mottakerId, punkter) => punkter.filter((p) => p.forelderId === mottakerId).sort((a, b) => a.rekkefolge - b.rekkefolge);
/** Alle anledninger de neste 12 månedene (fra i dag), sortert på dato */
function forekomster$1(lister, punkter, iDag, dagerFrem = 365) {
	const iAar = Number(iDag.slice(0, 4));
	const ut = [];
	for (const liste of gaveaar(lister)) for (const mottaker of mottakere(liste.id, punkter)) {
		const alle = gaverTil(mottaker.id, punkter);
		const ideer = alle.filter((g) => !g.anledning && !erBrukt("gaveaar", g.status)).length;
		for (const anledning of mottaker.anledninger ?? []) for (const aar of [iAar, iAar + 1]) {
			const dato = anledningsDato(anledning, aar);
			if (!dato) continue;
			const dager = dagerMellom(iDag, dato);
			if (dager < 0 || dager > dagerFrem) continue;
			const nokkel = anledningsNokkel(anledning, aar);
			ut.push({
				liste,
				mottaker,
				anledning,
				aar,
				dato,
				dager,
				nokkel,
				gaver: alle.filter((g) => g.anledning === nokkel),
				ideer,
				alder: anledning.type === "bursdag" ? alder(mottaker.fodt, dato) : void 0
			});
		}
	}
	return ut.sort((a, b) => a.dato.localeCompare(b.dato) || a.mottaker.tekst.localeCompare(b.mottaker.tekst, "nb"));
}
//#endregion
//#region src/logikk/kalender.ts
/** Kategoriene dere starter med. Kan endres, legges til og slettes i kalenderen (lagres i fellesdokumentet). */
const STANDARD_KALENDERKATEGORIER = [
	{
		id: "barnehage",
		navn: "Barnehage/skole",
		farge: 1
	},
	{
		id: "trening",
		navn: "Trening og aktivitet",
		farge: 4
	},
	{
		id: "sosialt",
		navn: "Sosialt",
		farge: 6
	},
	{
		id: "mote",
		navn: "Møte",
		farge: 5
	},
	{
		id: "besok",
		navn: "Besøk og reise",
		farge: 2
	},
	{
		id: "annet",
		navn: "Annet",
		farge: 7
	}
];
const UKEDAGER_KORT = [
	"man",
	"tir",
	"ons",
	"tor",
	"fre",
	"lør",
	"søn"
];
const DAG = 864e5;
const utc = (iso) => {
	const [a, m, d] = iso.split("-").map(Number);
	return Date.UTC(a, m - 1, d);
};
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const leggTilDager = (dato, n) => iso(utc(dato) + n * DAG);
/** 1 = mandag … 7 = søndag */
function ukedag(dato) {
	const d = new Date(utc(dato)).getUTCDay();
	return d === 0 ? 7 : d;
}
const mandagI = (dato) => leggTilDager(dato, 1 - ukedag(dato));
/** Minutter fra midnatt for «HH:MM» */
const minutter = (tid) => Number(tid.slice(0, 2)) * 60 + Number(tid.slice(3, 5));
/** Faller serien på datoen? (Unntak ikke medregnet.) */
function treffer(h, d) {
	const g = h.gjentak;
	if (!g) return d === h.dato;
	if (d < h.dato || g.til && d > g.til) return false;
	const n = Math.max(1, g.intervall || 1);
	const aar = (x) => Number(x.slice(0, 4));
	const mnd = (x) => Number(x.slice(5, 7));
	switch (g.frekvens) {
		case "dag": return dagerMellom(h.dato, d) % n === 0;
		case "uke":
			if (!(g.ukedager?.length ? g.ukedager : [ukedag(h.dato)]).includes(ukedag(d))) return false;
			return dagerMellom(mandagI(h.dato), mandagI(d)) / 7 % n === 0;
		case "maaned": return d.slice(8) === h.dato.slice(8) && ((aar(d) - aar(h.dato)) * 12 + mnd(d) - mnd(h.dato)) % n === 0;
		case "aar": return d.slice(5) === h.dato.slice(5) && (aar(d) - aar(h.dato)) % n === 0;
	}
}
/** «Hverdager», «Hver uke: man, ons», «Hver 2. uke: tor», «Hver måned den 14.» */
function gjentakTekst(g, dato) {
	if (!g) return "Gjentas ikke";
	const n = Math.max(1, g.intervall || 1);
	const hver = n === 1 ? "Hver" : `Hver ${n}.`;
	let tekst;
	if (g.frekvens === "dag") tekst = n === 1 ? "Hver dag" : `Hver ${n}. dag`;
	else if (g.frekvens === "uke") {
		const dager = [...g.ukedager?.length ? g.ukedager : [ukedag(dato)]].sort();
		if (n === 1 && dager.join() === "1,2,3,4,5") tekst = "Hverdager";
		else if (n === 1 && dager.length === 7) tekst = "Hver dag";
		else tekst = `${hver} uke: ${dager.map((x) => UKEDAGER_KORT[x - 1]).join(", ")}`;
	} else if (g.frekvens === "maaned") tekst = `${hver} måned den ${Number(dato.slice(8))}.`;
	else tekst = n === 1 ? "Hvert år" : `Hvert ${n}. år`;
	return g.til ? `${tekst} til ${Number(g.til.slice(8))}.${Number(g.til.slice(5, 7))}.${g.til.slice(0, 4)}` : tekst;
}
/** Hvor mange dager en avtale varer utover startdagen */
const varighet = (h) => h.sluttDato && h.sluttDato > h.dato ? dagerMellom(h.dato, h.sluttDato) : 0;
/** Alle forekomster som overlapper perioden fra–til (inklusiv), sortert på dato og tid */
function forekomster(hendelser, fra, til) {
	const serier = hendelser.filter((h) => !h.serieId);
	const unntak = new Map(hendelser.filter((h) => h.serieId && h.originalDato).map((h) => [`${h.serieId}|${h.originalDato}`, h]));
	const ut = [];
	for (const serie of serier) {
		const lengde = varighet(serie);
		const start = [serie.dato, leggTilDager(fra, -lengde)].sort()[1];
		const slutt = [til, serie.gjentak?.til ?? (serie.gjentak ? til : serie.dato)].sort()[0];
		for (let d = start; d <= slutt; d = leggTilDager(d, 1)) {
			if (!treffer(serie, d)) continue;
			const nokkel = `${serie.id}|${d}`;
			const u = unntak.get(nokkel);
			if (u) {
				if (!u.avlyst && u.dato <= til && leggTilDager(u.dato, varighet(u)) >= fra) ut.push({
					nokkel,
					serie,
					hendelse: {
						...u,
						gjentak: serie.gjentak
					},
					dato: u.dato,
					originalDato: d,
					unntak: u
				});
				continue;
			}
			ut.push({
				nokkel,
				serie,
				hendelse: serie,
				dato: d,
				originalDato: d
			});
		}
	}
	for (const u of unntak.values()) {
		const serie = serier.find((s) => s.id === u.serieId);
		if (!serie || u.avlyst || u.dato < fra || u.dato > til || ut.some((f) => f.unntak?.id === u.id)) continue;
		if (!treffer(serie, u.originalDato)) continue;
		ut.push({
			nokkel: `${serie.id}|${u.originalDato}`,
			serie,
			hendelse: {
				...u,
				gjentak: serie.gjentak
			},
			dato: u.dato,
			originalDato: u.originalDato,
			unntak: u
		});
	}
	return ut.sort((a, b) => a.dato.localeCompare(b.dato) || (a.hendelse.fra ?? "").localeCompare(b.hendelse.fra ?? "") || a.hendelse.tittel.localeCompare(b.hendelse.tittel, "nb"));
}
/** Avtaler, anledninger fra gaveårene (unntatt jul) og frister fra listene i perioden */
function kalenderPoster(hendelser, lister, punkter, fra, til, valg = {
	anledninger: true,
	frister: true
}, kategorier = STANDARD_KALENDERKATEGORIER) {
	const ut = forekomster(hendelser, fra, til).map((f) => {
		const h = f.hendelse;
		const farge = kategorier.find((k) => k.id === h.kategori)?.farge ?? -1;
		const forskyvning = varighet(h);
		return {
			nokkel: f.nokkel,
			dato: f.dato,
			sluttDato: forskyvning ? leggTilDager(f.dato, forskyvning) : void 0,
			fra: h.fra,
			til: h.til,
			tittel: h.tittel,
			farge,
			hvem: h.hvem ?? [],
			ansvarlig: h.ansvarlig,
			sted: h.sted,
			notat: h.notat,
			kilde: "avtale",
			forekomst: f,
			gjentar: !!f.serie.gjentak,
			endret: !!f.unntak && !h.innstilt,
			avlyst: h.innstilt || void 0
		};
	});
	if (valg.anledninger) {
		const sett = /* @__PURE__ */ new Set();
		const forste = Number(fra.slice(0, 4));
		const siste = Number(til.slice(0, 4));
		for (const liste of gaveaar(lister)) for (const m of mottakere(liste.id, punkter)) for (const a of m.anledninger ?? []) {
			if (a.type === "jul") continue;
			for (let aar = forste; aar <= siste; aar++) {
				const dato = anledningsDato(a, aar);
				if (!dato || dato < fra || dato > til) continue;
				const nokkel = `${m.tekst.trim().toLowerCase()}|${anledningsNavn(a).toLowerCase()}|${dato}`;
				if (sett.has(nokkel)) continue;
				sett.add(nokkel);
				const fyller = a.type === "bursdag" ? alder(m.fodt, dato) : void 0;
				ut.push({
					nokkel: `anledning|${m.id}|${a.id}|${dato}`,
					dato,
					kilde: "anledning",
					hvem: [],
					farge: 0,
					tittel: a.type === "bursdag" ? `${m.tekst} har bursdag${fyller !== void 0 ? ` (${fyller} år)` : ""}` : `${anledningsNavn(a)} – ${m.tekst}`,
					url: `#/lister/${liste.id}`
				});
			}
		}
	}
	if (valg.frister) {
		const aktuelle = new Map(lister.filter((l) => !l.mal && l.type !== "kalender" && l.type !== "hage" && l.type !== "gaveaar").map((l) => [l.id, l]));
		for (const p of punkter) {
			const l = aktuelle.get(p.listeId);
			if (!l || !p.dato || p.dato < fra || p.dato > til || erFerdig(l.type, p.status) || erBrukt(l.type, p.status)) continue;
			ut.push({
				nokkel: `frist|${p.id}`,
				dato: p.dato,
				kilde: "frist",
				hvem: [],
				farge: 3,
				tittel: `Frist: ${p.tekst}`,
				url: `#/lister/${l.id}`
			});
		}
	}
	return ut.sort((a, b) => a.dato.localeCompare(b.dato) || (a.fra ?? "").localeCompare(b.fra ?? "") || a.tittel.localeCompare(b.tittel, "nb"));
}
/** Er posten på datoen (også flerdagers som startet før)? */
const paaDato = (p, dato) => p.dato === dato || !!p.sluttDato && p.dato < dato && p.sluttDato >= dato;
//#endregion
//#region src/logikk/varsler.ts
const MAANEDER = [
	"januar",
	"februar",
	"mars",
	"april",
	"mai",
	"juni",
	"juli",
	"august",
	"september",
	"oktober",
	"november",
	"desember"
];
/** «I dag», «I morgen», «Om 3 dager» */
function naarTekst(dager) {
	return dager === 0 ? "i dag" : dager === 1 ? "i morgen" : `om ${dager} dager`;
}
/** «fre. 30. okt.» */
function datoKort(iso) {
	const [a, m, d] = iso.split("-").map(Number);
	return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("nb-NO", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC"
	});
}
/**
* Hvilket varseltrinn gjelder i dag? Trinnene er dager før (f.eks. [21, 0]).
* Det minste trinnet som er ≥ dagene som er igjen, sendes. Større trinn som ble hoppet over
* (f.eks. når noe legges inn sent) merkes som sendt, så de ikke kommer etterpå.
* Samme dag (0) gjelder bare på selve dagen.
*/
function varseltrinn(dager, trinn) {
	if (dager < 0) return null;
	const aktuelle = [...new Set(trinn)].filter((t) => dager <= t).sort((a, b) => a - b);
	return aktuelle.length ? {
		trinn: aktuelle[0],
		alle: aktuelle
	} : null;
}
/** Lagrede innstillinger fylt ut med standardverdier (nye varseltyper mangler i eldre innstillinger) */
function medStandard(inn) {
	const typer = Object.fromEntries(Object.entries(inn?.typer ?? {}).filter(([, v]) => v && typeof v === "object"));
	return {
		...STANDARD_VARSLER,
		...inn ?? {},
		typer: {
			...STANDARD_VARSLER.typer,
			...typer
		}
	};
}
/** Linje i morgenoversikten: «16:00 Henting barnehagen – Ingrid» */
const avtaleLinje = (p, navn) => `${p.fra ?? "Hele dagen"} ${p.tittel}${p.ansvarlig && navn(p.ansvarlig) ? ` – ${navn(p.ansvarlig)}` : ""}`;
/** Alle varsler som er aktuelle i dag for én bruker. Listene skal være de brukeren kan se. */
function beregnVarsler(lister, punkter, innstillinger, iDag, kal) {
	const ut = [];
	const inn = medStandard(innstillinger);
	const t = inn.typer;
	const maksTrinn = Math.max(0, ...Object.values(t).filter((v) => v.pa).flatMap((v) => v.dager));
	const kjoptTekst = (gaver) => gaver.filter((g) => erBrukt("gaveaar", g.status)).map((g) => g.tekst).join(", ");
	const alle = forekomster$1(lister, punkter, iDag, maksTrinn);
	for (const f of alle) {
		const type = f.anledning.type === "bursdag" ? "bursdag" : f.anledning.type === "jul" ? "jul" : "andre";
		if (type === "jul" || !t[type].pa) continue;
		const valg = varseltrinn(f.dager, t[type].dager);
		if (!valg) continue;
		const kjopt = kjoptTekst(f.gaver);
		if (valg.trinn > 0 && inn.bareUtenGave && kjopt) continue;
		const base = `${type}:${f.mottaker.id}:${f.anledning.id}:${f.dato}`;
		const navn = f.mottaker.tekst;
		const hva = type === "bursdag" ? `${navn} har bursdag${f.alder !== void 0 ? ` (fyller ${f.alder})` : ""}` : `${anledningsNavn(f.anledning)} – ${navn}`;
		ut.push({
			type,
			nokkel: `${base}:${valg.trinn}`,
			nokler: valg.alle.map((x) => `${base}:${x}`),
			tittel: `${hva} ${naarTekst(f.dager)}`,
			tekst: kjopt ? `Gave: ${kjopt}` : f.dager === 0 ? "Ingen gave er registrert." : `${datoKort(f.dato)}: ingen gave kjøpt ennå${f.ideer ? ` – ${f.ideer} ${f.ideer === 1 ? "idé" : "ideer"} i idébanken` : ""}.`,
			url: `#/lister/${f.liste.id}`
		});
	}
	if (t.jul.pa) {
		const jul = alle.filter((f) => f.anledning.type === "jul");
		if (jul.length) {
			const { dato, dager, aar } = jul[0];
			const valg = varseltrinn(dager, t.jul.dager);
			const personer = [...new Set(jul.map((f) => f.mottaker.tekst.trim().toLowerCase()))];
			const medGave = new Set(jul.filter((f) => f.gaver.some((g) => erBrukt("gaveaar", g.status))).map((f) => f.mottaker.tekst.trim().toLowerCase()));
			const alleKjopt = medGave.size >= personer.length;
			if (valg && !(valg.trinn > 0 && inn.bareUtenGave && alleKjopt)) {
				const base = `jul:${dato}`;
				ut.push({
					type: "jul",
					nokkel: `${base}:${valg.trinn}`,
					nokler: valg.alle.map((x) => `${base}:${x}`),
					tittel: dager === 0 ? "God jul!" : `Jul ${naarTekst(dager)}`,
					tekst: `Gave kjøpt til ${medGave.size} av ${personer.length}.`,
					url: `#/lister/plan/jul/${aar}`
				});
			}
		}
	}
	if (t.frist.pa) for (const h of huskelapp(lister, punkter, iDag, maksTrinn)) {
		const valg = varseltrinn(h.dager, t.frist.dager);
		if (!valg) continue;
		const base = `frist:${h.punkt.id}:${h.punkt.dato}`;
		ut.push({
			type: "frist",
			nokkel: `${base}:${valg.trinn}`,
			nokler: valg.alle.map((x) => `${base}:${x}`),
			tittel: `${h.dager === 0 ? "I dag" : h.dager === 1 ? "I morgen" : `Om ${h.dager} dager`}: ${h.punkt.tekst}`,
			tekst: `${h.liste.navn} · frist ${datoKort(h.punkt.dato)}`,
			url: `#/lister/${h.liste.id}`
		});
	}
	if (t.kalender.pa) {
		const kalendere = new Map(lister.filter((l) => !l.mal && l.type === "kalender").map((l) => [l.id, l]));
		for (const p of punkter) {
			const liste = kalendere.get(p.listeId);
			if (!liste || !p.dato) continue;
			const dager = dagerMellom(iDag, p.dato);
			const valg = varseltrinn(dager, t.kalender.dager);
			if (!valg) continue;
			const base = `kalender:${p.id}:${p.dato}`;
			ut.push({
				type: "kalender",
				nokkel: `${base}:${valg.trinn}`,
				nokler: valg.alle.map((x) => `${base}:${x}`),
				tittel: `${dager === 0 ? "Luke i dag" : `Luke ${naarTekst(dager)}`}: ${p.tekst}`,
				tekst: p.notat || (erFerdig("kalender", p.status) ? "Klar." : "Ingen idé lagt inn ennå."),
				url: `#/lister/${liste.id}`
			});
		}
	}
	if (t.hage.pa && iDag.endsWith("-01")) {
		const oppgaver = hageIMaaned(lister, punkter, iDag).filter((o) => !o.gjort);
		if (oppgaver.length) ut.push({
			type: "hage",
			nokkel: `hage:${iDag.slice(0, 7)}`,
			nokler: [`hage:${iDag.slice(0, 7)}`],
			tittel: `I hagen i ${MAANEDER[Number(iDag.slice(5, 7)) - 1]}`,
			tekst: oppgaver.map((o) => o.forelder ? `${o.forelder.tekst}: ${o.punkt.tekst.toLowerCase()}` : o.punkt.tekst).join(", "),
			url: `#/lister/${oppgaver[0].liste.id}`
		});
	}
	if (kal && t.avtaler.pa) for (const d of [...new Set(t.avtaler.dager)].sort()) {
		const dato = leggTilDager(iDag, d);
		const poster = kalenderPoster(kal.hendelser, [], [], dato, dato, {
			anledninger: false,
			frister: false
		}).filter((x) => paaDato(x, dato) && !x.avlyst);
		if (!poster.length) continue;
		const nokkel = `avtaler:${dato}:${d}`;
		ut.push({
			type: "avtaler",
			nokkel,
			nokler: [nokkel],
			tittel: `${d === 0 ? "I dag" : "I morgen"}: ${poster.length} ${poster.length === 1 ? "avtale" : "avtaler"}`,
			tekst: poster.slice(0, 5).map((x) => avtaleLinje(x, kal.navn)).join("\n") + (poster.length > 5 ? `\n… og ${poster.length - 5} til` : ""),
			url: "#/kalender"
		});
	}
	return ut;
}
/**
* Varsel før avtaler som har «varsel før» (f.eks. 30 min). Sjekkes hvert kvarter: varselet sendes når tidspunktet
* (start minus varseltid) er innenfor siste kvarter. Gjelder avtalen bestemte voksne (hvem/henter), får bare de varsel.
*/
function forVarsler(hendelser, naa, kal, vindu = 15) {
	const ut = [];
	const poster = kalenderPoster(hendelser, [], [], naa.dato, leggTilDager(naa.dato, 1), {
		anledninger: false,
		frister: false
	});
	for (const p of poster) {
		const varselMin = p.forekomst?.hendelse.varselMin;
		if (!p.fra || !varselMin || p.avlyst) continue;
		const varselTid = (p.dato === naa.dato ? 0 : 1440) + minutter(p.fra) - varselMin;
		if (varselTid > naa.minutt || varselTid <= naa.minutt - vindu) continue;
		const involverte = [...p.hvem, ...p.ansvarlig ? [p.ansvarlig] : []].filter((id) => kal.voksne.has(id));
		if (involverte.length && kal.personId && !involverte.includes(kal.personId)) continue;
		const nokkel = `for:${p.nokkel}`;
		const ansvarlig = p.ansvarlig ? kal.navn(p.ansvarlig) : void 0;
		ut.push({
			type: "avtaleFor",
			nokkel,
			nokler: [nokkel],
			tittel: `${p.tittel} ${p.dato === naa.dato ? "kl." : "i morgen kl."} ${p.fra}`,
			tekst: [ansvarlig ? p.ansvarlig === kal.personId ? "Det er du som henter/leverer" : `${ansvarlig} henter/leverer` : "", p.sted ?? ""].filter(Boolean).join(" · ") || "Påminnelse",
			url: "#/kalender"
		});
	}
	return ut;
}
/** Varseltyper for det den andre gjør – sendes fortløpende, ikke på brukerens klokkeslett */
const AKTIVITETSTYPER = [
	"nyListe",
	"nyttPunkt",
	"gaveide",
	"kjopt",
	"avlyst"
];
/** «Melk, brød og egg» – maks fire, resten som «og 3 til» */
function opplisting(tekster, maks = 4) {
	if (tekster.length <= 1) return tekster[0] ?? "";
	if (tekster.length <= maks) return `${tekster.slice(0, -1).join(", ")} og ${tekster[tekster.length - 1]}`;
	return `${tekster.slice(0, maks).join(", ")} og ${tekster.length - maks} til`;
}
/**
* Varsler om det andre har gjort i delte lister siden sist: nye lister, nye punkter, gaveideer og kjøp.
* Én melding per liste og type, så ti nye ting i handlelisten blir ett varsel. Bare det som fortsatt er slik
* (punktet finnes, er fortsatt kjøpt) varsles – angrer man med en gang, blir det ikke noe varsel.
* Listene og punktene skal være de mottakeren kan se (felles).
*/
function aktivitetsVarsler(aktiviteter, lister, punkter, mottaker, innstillinger, navn) {
	const t = medStandard(innstillinger).typer;
	const listeMap = new Map(lister.filter((l) => !l.mal).map((l) => [l.id, l]));
	const punktMap = new Map(punkter.map((p) => [p.id, p]));
	const andres = aktiviteter.filter((a) => a.bruker !== mottaker && listeMap.has(a.listeId));
	const maksId = Math.max(0, ...andres.map((a) => a.id));
	const ut = [];
	const legg = (type, listeId, bruker, tittel, tekst, url = `#/lister/${listeId}`) => {
		const nokkel = `aktivitet:${type}:${listeId}:${bruker}:${maksId}`;
		ut.push({
			type,
			nokkel,
			nokler: [nokkel],
			tittel,
			tekst,
			url
		});
	};
	const hvem = (bruker) => navn(bruker) ?? "Noen";
	const nyeLister = /* @__PURE__ */ new Set();
	for (const a of andres.filter((x) => x.hva === "liste")) {
		if (nyeLister.has(a.listeId)) continue;
		nyeLister.add(a.listeId);
		if (!t.nyListe.pa) continue;
		const l = listeMap.get(a.listeId);
		const antall = punkter.filter((p) => p.listeId === l.id && !p.forelderId).length;
		legg("nyListe", l.id, a.bruker, `${hvem(a.bruker)} lagde en ny liste: ${l.navn}`, antall ? `${antall} ${antall === 1 ? "punkt" : "punkter"} så langt.` : "Tom foreløpig – klar til å fylles.");
	}
	const grupper = /* @__PURE__ */ new Map();
	const sett = /* @__PURE__ */ new Set();
	for (const a of andres) {
		if (a.hva === "liste" || !a.punktId || nyeLister.has(a.listeId)) continue;
		const p = punktMap.get(a.punktId);
		if (!p) continue;
		const liste = listeMap.get(a.listeId);
		const kjoptNaa = p.status === "kjopt" && LISTETYPER[liste.type].statuser.some((s) => s.id === "kjopt");
		const hva = kjoptNaa ? "kjopt" : a.hva === "punkt" ? liste.type === "gaveaar" && p.forelderId ? "ideer" : "nye" : null;
		if (!hva || a.hva === "status" && !kjoptNaa || sett.has(`${hva}:${p.id}`)) continue;
		sett.add(`${hva}:${p.id}`);
		const nokkel = `${a.bruker}|${a.listeId}`;
		const g = grupper.get(nokkel) ?? {
			bruker: a.bruker,
			liste,
			nye: [],
			ideer: [],
			kjopt: []
		};
		g[hva].push(p);
		grupper.set(nokkel, g);
	}
	const mottakerAv = (p) => p.forelderId ? punktMap.get(p.forelderId)?.tekst : void 0;
	for (const { bruker, liste, nye, ideer, kjopt } of grupper.values()) {
		const h = hvem(bruker);
		if (nye.length && t.nyttPunkt.pa) legg("nyttPunkt", liste.id, bruker, `Nytt i ${liste.navn}`, `${h} la til ${opplisting(nye.map((p) => p.tekst))}.`);
		if (ideer.length && t.gaveide.pa) {
			const til = [...new Set(ideer.map(mottakerAv).filter(Boolean))];
			legg("gaveide", liste.id, bruker, ideer.length === 1 ? `${h} har en gaveidé til ${til[0] ?? "noen"}` : `${h} la inn ${ideer.length} gaveideer`, ideer.length === 1 ? `«${ideer[0].tekst}» · ${liste.navn}` : `Til ${opplisting(til)} · ${liste.navn}`);
		}
		if (kjopt.length && t.kjopt.pa) {
			const gaver = liste.type === "gaveaar";
			const til = [...new Set(kjopt.map(mottakerAv).filter(Boolean))];
			const tittel = gaver ? kjopt.length === 1 ? `${h} kjøpte gave til ${til[0] ?? "noen"}` : `${h} kjøpte ${kjopt.length} gaver` : `${h} kjøpte ${kjopt.length === 1 ? `«${kjopt[0].tekst}»` : `${kjopt.length} ting`}`;
			const tekst = gaver ? kjopt.length === 1 ? `«${kjopt[0].tekst}» · ${liste.navn}` : `Til ${opplisting(til)} · ${liste.navn}` : kjopt.length === 1 ? `Fra ${liste.navn}` : `${opplisting(kjopt.map((p) => p.tekst))} · ${liste.navn}`;
			legg("kjopt", liste.id, bruker, tittel, tekst);
		}
	}
	return ut;
}
/**
* Varsel når den andre avlyser en avtale. Bare det som fortsatt er avlyst (angret man med en gang, blir det ikke noe varsel)
* og som ikke allerede er over. Avlyses en hel serie, blir det ett varsel – ikke ett per endret dag i serien.
*/
function avlysningsVarsler(aktiviteter, hendelser, mottaker, innstillinger, navn, iDag) {
	if (!medStandard(innstillinger).typer.avlyst.pa) return [];
	const avlyst = new Map(aktiviteter.filter((a) => a.hva === "avlyst" && a.hendelseId && a.bruker !== mottaker).map((a) => [a.hendelseId, a]));
	const ut = [];
	for (const h of hendelser) {
		const a = avlyst.get(h.id);
		if (!a || !h.innstilt || h.avlyst || h.serieId && avlyst.has(h.serieId)) continue;
		const erSerie = !!h.gjentak && !h.serieId;
		if (erSerie ? !!h.gjentak.til && h.gjentak.til < iDag : (h.sluttDato ?? h.dato) < iDag) continue;
		const nokkel = `aktivitet:avlyst:${h.id}:${a.id}`;
		ut.push({
			type: "avlyst",
			nokkel,
			nokler: [nokkel],
			tittel: `${navn(a.bruker) ?? "Noen"} avlyste «${h.tittel}»`,
			tekst: erSerie ? `${h.dato > iDag ? `Fra ${datoKort(h.dato)}` : "Alle gangene"} · ${gjentakTekst(h.gjentak, h.dato).toLowerCase()}` : `${datoKort(h.dato)}${h.fra ? ` kl. ${h.fra}` : ""}${h.sted ? ` · ${h.sted}` : ""}`,
			url: "#/kalender"
		});
	}
	return ut;
}
/** Mange varsler blir ett samlet varsel, så telefonen ikke fylles opp. Det samlede åpner varslene i appen. */
function slaaSammen(varsler, maks = 3, samletTittel = (n) => `${n} påminnelser i dag`) {
	if (varsler.length <= maks) return varsler.map((v) => ({
		tittel: v.tittel,
		tekst: v.tekst,
		url: v.url,
		nokler: v.nokler,
		type: v.type
	}));
	return [{
		tittel: samletTittel(varsler.length),
		tekst: varsler.slice(0, 4).map((v) => v.tittel).join("\n") + (varsler.length > 4 ? `\n… og ${varsler.length - 4} til` : ""),
		url: "#/innboks",
		nokler: varsler.flatMap((v) => v.nokler)
	}];
}
/**
* «Skjul detaljer»: det som vises på låseskjermen sier ikke hva det gjelder (navn, gaver, avtaler).
* Varselet åpner varslene i appen (bjella), der detaljene står – ellers vet man ikke hva det gjaldt.
*/
function utenDetaljer(meldinger) {
	return meldinger.map((m) => ({
		...m,
		tittel: "Sulamitten",
		tekst: m.type === "avtaleFor" ? "En avtale nærmer seg. Åpne appen for å se hvilken." : m.type === "avlyst" ? "En avtale er avlyst. Åpne appen for å se hvilken." : m.type && AKTIVITETSTYPER.includes(m.type) ? "Det er nytt i en delt liste. Åpne appen for å se hva." : "Det er noe å huske på i dag. Åpne appen for å se hva.",
		url: "#/innboks"
	}));
}
/** Dato, time og minutt fra midnatt akkurat nå i Norge (serveren går i UTC) */
function norskTid(naa = /* @__PURE__ */ new Date()) {
	const deler = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Oslo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23"
	}).formatToParts(naa).map((d) => [d.type, d.value]));
	const time = Number(deler.hour);
	return {
		dato: `${deler.year}-${deler.month}-${deler.day}`,
		time,
		minutt: time * 60 + Number(deler.minute)
	};
}
//#endregion
//#region supabase/kilde/felles.ts
const tilListe = (r) => ({
	eier: r.eier ?? null,
	liste: {
		...r.ekstra ?? {},
		id: r.id,
		navn: r.navn,
		ikon: r.ikon,
		kategori: r.kategori,
		type: r.type,
		privat: r.eier !== null,
		mal: r.mal,
		rekkefolge: Number(r.rekkefolge),
		opprettet: String(r.opprettet).slice(0, 10)
	}
});
const tilPunkt = (r) => ({
	...r.ekstra ?? {},
	id: r.id,
	listeId: r.liste_id,
	forelderId: r.forelder_id,
	tekst: r.tekst,
	notat: r.notat ?? "",
	status: r.status,
	belop: r.belop === null ? null : Number(r.belop),
	dato: r.dato,
	rekkefolge: Number(r.rekkefolge)
});
const tilHendelse = (r) => ({
	...r.ekstra ?? {},
	id: r.id,
	tittel: r.tittel,
	dato: r.dato,
	serieId: r.serie_id ?? void 0,
	originalDato: r.original_dato ?? void 0,
	avlyst: r.avlyst ? true : void 0
});
/** Alt varsler og kalender trenger: lister, punkter, avtaler og fellesdokumentet (personer, familie, kalendernøkkel) */
async function hentAlt(db) {
	const [l, p, h, f] = await Promise.all([
		db.from("liste").select("id, eier, navn, ikon, kategori, type, mal, rekkefolge, ekstra, opprettet").limit(5e3),
		db.from("listepunkt").select("id, liste_id, forelder_id, tekst, notat, status, belop, dato, rekkefolge, ekstra").limit(5e4),
		db.from("hendelse").select("id, serie_id, original_dato, avlyst, tittel, dato, ekstra").limit(2e4),
		db.from("felles_dok").select("data").eq("id", 1).maybeSingle()
	]);
	const feil = l.error ?? p.error ?? f.error;
	if (feil) throw new Error(feil.message);
	return {
		lister: (l.data ?? []).map(tilListe),
		punkter: (p.data ?? []).map(tilPunkt),
		hendelser: h.error ? [] : (h.data ?? []).map(tilHendelse),
		felles: f.data?.data ?? null
	};
}
/** Navn på personer og familiemedlemmer */
function navnFra(felles) {
	const alle = new Map([...felles?.personer ?? [], ...felles?.familie ?? []].map((p) => [p.id, p.navn]));
	return (id) => alle.get(id);
}
//#endregion
//#region supabase/kilde/varsler.ts
const env = (n) => Deno.env.get(n) ?? "";
const svar = (data, status = 200) => new Response(JSON.stringify(data), {
	status,
	headers: {
		"Content-Type": "application/json",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
	}
});
/** Feil fra siste sending, så de kan vises i svaret (ikke bare i loggen) */
let sendefeil = [];
/** Sender til alle enhetene. Enheter som ikke finnes lenger (404/410), slettes. */
async function send(db, enheter, melding) {
	let sendt = 0;
	for (const e of enheter) try {
		await webpush.sendNotification({
			endpoint: e.endpoint,
			keys: {
				p256dh: e.p256dh,
				auth: e.auth
			}
		}, JSON.stringify({
			tittel: melding.tittel,
			tekst: melding.tekst,
			url: melding.url
		}), { TTL: 72e3 });
		sendt++;
	} catch (feil) {
		const f = feil;
		if (f.statusCode === 404 || f.statusCode === 410) {
			await db.from("varsel_abonnement").delete().eq("id", e.id);
			sendefeil.push(`${new URL(e.endpoint).host}: enheten finnes ikke lenger (${f.statusCode}) – slettet`);
		} else {
			console.error("Kunne ikke sende", f.statusCode, feil);
			sendefeil.push(`${new URL(e.endpoint).host}: ${f.statusCode ?? ""} ${(f.body || f.message || String(feil)).slice(0, 300)}`.trim());
		}
	}
	return sendt;
}
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return svar("ok");
	try {
		return await behandle(req);
	} catch (e) {
		console.error(e);
		return svar({ feil: e instanceof Error ? e.message : String(e) }, 500);
	}
});
async function behandle(req) {
	sendefeil = [];
	const mangler = [
		"VAPID_PUBLIC_KEY",
		"VAPID_PRIVATE_KEY",
		"CRON_HEMMELIGHET"
	].filter((n) => !env(n));
	if (mangler.length) return svar({ feil: `Mangler hemmelighet i Supabase (Edge Functions → Secrets): ${mangler.join(", ")}` }, 500);
	const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
	try {
		webpush.setVapidDetails(env("VAPID_SUBJECT") || "https://tergil.github.io/sulamitten/", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
	} catch (e) {
		return svar({ feil: `VAPID-nøklene er ugyldige – sjekk at de er limt inn helt, uten mellomrom: ${e instanceof Error ? e.message : e}` }, 500);
	}
	const kropp = await req.json().catch(() => ({}));
	if (kropp.handling === "test") {
		const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
		const { data } = await db.auth.getUser(jwt);
		if (!data.user) return svar({ feil: "Ikke innlogget" }, 401);
		const { data: enheter } = await db.from("varsel_abonnement").select("id, bruker, endpoint, p256dh, auth").eq("bruker", data.user.id);
		const n = await send(db, enheter ?? [], {
			tittel: "Testvarsel fra Sulamitten",
			tekst: "Det virker! Nå får du beskjed når noe er verdt å huske.",
			url: "#/varsler"
		});
		if (!n && sendefeil.length) return svar({
			feil: `Push-tjenesten sa nei: ${sendefeil.join(" | ")}`,
			sendt: 0,
			enheter: enheter?.length ?? 0
		}, 502);
		return svar({
			sendt: n,
			enheter: enheter?.length ?? 0,
			feil: sendefeil.length ? sendefeil : void 0
		});
	}
	if (!env("CRON_HEMMELIGHET") || req.headers.get("x-cron-hemmelighet") !== env("CRON_HEMMELIGHET")) return svar({ feil: "Ikke tilgang" }, 401);
	const { dato, time, minutt } = norskTid();
	const daglig = kropp.tving || minutt % 60 < 15;
	const { data: innstillinger, error } = await db.from("varsel_innstilling").select("bruker, data");
	if (error) return svar({ feil: error.message }, 500);
	const brukere = (innstillinger ?? []).map((r) => ({
		bruker: r.bruker,
		inn: medStandard(r.data)
	}));
	const dagligFor = (inn) => daglig && (!!kropp.tving || inn.time === time);
	const natt = time < 7 || time >= 22;
	let aktiviteter = [];
	if (!natt || kropp.tving) {
		const hent = (felt) => db.from("aktivitet").select(felt).lt("tid", (/* @__PURE__ */ new Date(Date.now() - 6e4)).toISOString()).order("id").limit(2e3);
		let svarRader = await hent("id, bruker, hva, liste_id, punkt_id, status, hendelse_id");
		if (svarRader.error) svarRader = await hent("id, bruker, hva, liste_id, punkt_id, status");
		aktiviteter = (svarRader.data ?? []).map((r) => ({
			id: Number(r.id),
			bruker: r.bruker,
			hva: r.hva,
			listeId: r.liste_id ?? "",
			punktId: r.punkt_id,
			status: r.status,
			hendelseId: r.hendelse_id
		}));
	}
	if (time === 3 && minutt % 60 < 15) await db.from("varsel_innboks").delete().lt("opprettet", (/* @__PURE__ */ new Date(Date.now() - 5184e6)).toISOString());
	const aktuelle = brukere.filter((r) => dagligFor(r.inn) || r.inn.typer.avtaleFor.pa || aktiviteter.length > 0);
	if (!aktuelle.length) return svar({
		dato,
		time,
		brukere: 0
	});
	const { lister, punkter, hendelser, felles } = await hentAlt(db);
	const navn = navnFra(felles);
	const voksne = new Set((felles?.personer ?? []).map((x) => x.id));
	const personer = /* @__PURE__ */ new Map();
	async function personFor(bruker) {
		if (!personer.has(bruker)) {
			const { data: u } = await db.auth.admin.getUserById(bruker);
			const epost = u?.user?.email?.toLowerCase();
			personer.set(bruker, felles?.personer.find((x) => x.epost.toLowerCase() === epost));
		}
		return personer.get(bruker);
	}
	for (const a of aktiviteter) await personFor(a.bruker);
	const resultat = {};
	for (const { bruker, inn } of aktuelle) {
		const synlige = lister.filter((x) => x.eier === null || x.eier === bruker).map((x) => x.liste);
		const ider = new Set(synlige.map((x) => x.id));
		const synligePunkter = punkter.filter((x) => ider.has(x.listeId));
		const kandidater = [];
		if (dagligFor(inn)) kandidater.push(...beregnVarsler(synlige, synligePunkter, inn, dato, {
			hendelser,
			navn
		}));
		if (inn.typer.avtaleFor.pa && hendelser.length) kandidater.push(...forVarsler(hendelser, {
			dato,
			minutt
		}, {
			hendelser,
			navn,
			personId: (await personFor(bruker))?.id,
			voksne
		}));
		const delteLister = synlige.filter((l) => !l.privat);
		if (aktiviteter.length) {
			kandidater.push(...aktivitetsVarsler(aktiviteter, delteLister, synligePunkter, bruker, inn, (b) => personer.get(b)?.navn));
			kandidater.push(...avlysningsVarsler(aktiviteter, hendelser, bruker, inn, (b) => personer.get(b)?.navn, dato));
		}
		if (!kandidater.length) continue;
		const { data: sendtFor } = await db.from("varsel_sendt").select("nokkel").eq("bruker", bruker).in("nokkel", kandidater.map((k) => k.nokkel));
		const sendt = new Set((sendtFor ?? []).map((r) => r.nokkel));
		const nye = kandidater.filter((k) => !sendt.has(k.nokkel));
		if (!nye.length) continue;
		const { error: innboksFeil } = await db.from("varsel_innboks").insert(nye.map((v) => ({
			bruker,
			type: v.type,
			tittel: v.tittel,
			tekst: v.tekst,
			url: v.url
		})));
		if (innboksFeil) console.error("Innboks:", innboksFeil.message);
		const huskes = nye.filter((v) => !AKTIVITETSTYPER.includes(v.type)).flatMap((v) => v.nokler);
		if (huskes.length) await db.from("varsel_sendt").upsert(huskes.map((nokkel) => ({
			bruker,
			nokkel
		})), {
			onConflict: "bruker,nokkel",
			ignoreDuplicates: true
		});
		const { data: enheter } = await db.from("varsel_abonnement").select("id, bruker, endpoint, p256dh, auth").eq("bruker", bruker);
		if (!enheter?.length) continue;
		const enkelt = (v) => ({
			tittel: v.tittel,
			tekst: v.tekst,
			url: v.url,
			nokler: v.nokler,
			type: v.type
		});
		const alene = (v) => v.type === "avtaleFor" || v.type === "avlyst";
		const alleMeldinger = [
			...nye.filter(alene).map(enkelt),
			...slaaSammen(nye.filter((v) => !alene(v) && !AKTIVITETSTYPER.includes(v.type))),
			...slaaSammen(nye.filter((v) => !alene(v) && AKTIVITETSTYPER.includes(v.type)), 2, (n) => `${n} nye ting i delte lister`)
		];
		const meldinger = inn.skjulDetaljer ? utenDetaljer(alleMeldinger) : alleMeldinger;
		let antall = 0;
		for (const melding of meldinger) if (await send(db, enheter, melding)) antall++;
		resultat[bruker] = antall;
	}
	if (aktiviteter.length) await db.from("aktivitet").delete().lte("id", Math.max(...aktiviteter.map((a) => a.id)));
	return svar({
		dato,
		time,
		minutt,
		brukere: aktuelle.length,
		aktiviteter: aktiviteter.length,
		sendt: resultat,
		feil: sendefeil.length ? sendefeil : void 0
	});
}
//#endregion
