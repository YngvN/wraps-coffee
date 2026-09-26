# Systembeskrivelse – ADHDisplay kasse

Systembeskrivelse etter kassasystemforskrifta § 2-1 og § 2-4. Beskrivelsen gjelder kassefunksjonen
(«Kasse») i ADHDisplay og skal holdes oppdatert ved endringer i funksjoner eller oppbygning.

> **Status:** Under utvikling. Kassesystemet er ikke produkterklært ennå. Til en produkterklæring er
> levert, skal salg også registreres i et produkterklært kassesystem.

| | |
|---|---|
| Produkt | ADHDisplay – Kasse |
| Versjon | Se `package.json` (`version`). Hver endring gir nytt versjonsnummer. |
| Leverandør | *Fylles ut: leverandørens navn og organisasjonsnummer* |
| Språk | Norsk. Kvitteringer kan skrives ut på engelsk, men de lovpålagte overskriftene er alltid på norsk. |

## 1. Oppbygning

- **Server:** Et Node.js-program på en maskin i butikkens lokale nett. Serveren eier all
  kassedata: prising, journal, signering, kvitteringsnummer, rapporter og eksport.
- **Kassepunkt:** Et nettbrett med ADHDisplay Companion-appen, godkjent i administrasjonen
  («Skjermbehandling») og tildelt en skjerm med kassefunksjonen. Hvert slikt nettbrett er én kasse
  med et fast kassenummer (1, 2, …) som aldri gjenbrukes.
- **Administrasjon:** Nettleserbasert dashbord med innlogging. Herfra settes firmaopplysninger,
  ansatte, skrivere og varer, og herfra hentes Z-rapporter og SAF-T-eksport.
- **Skriver:** ESC/POS-kvitteringsskriver på nettverk, USB på serveren eller USB på nettbrettet.
  Kassaskuff kobles til skriverens skuffport.

Nettbrettet stoles bare på som godkjent maskin som viser en kasseskjerm. I tillegg må en ansatt
være innlogget for alt som endrer noe.

## 2. Brukere og roller

- Ansatte legges inn i administrasjonen (Innstillinger → Kasse) med navn, ansattnummer, rolle og en
  personlig PIN på 4 siffer. PIN lagres bare som saltet scrypt-hash.
- **Roller:**
  - *Ansatt* selger, tar imot hentebestillinger og åpner skuffen.
  - *Leder* kan i tillegg endre varer (etter å ha låst opp redigering), registrere retur, ta X- og
    Z-rapporter og slå treningsmodus av og på.
- **Innlogging:** Kassen viser listen over ansatte. PIN kreves første gang per dag per kasse
  (eventuelt hver gang, per nettbrett). Deretter holder et trykk på navnet.
- **Utlogging:** Automatisk etter 1–10 minutter uten bruk (standard 2). Serveren avslutter også
  økten ved dagsskifte og når en leder endrer den ansatte.
- **Feil PIN:** Fem feil forsøk stenger nettbrettet i fem minutter.
- Ansatte slettes aldri, de gjøres inaktive, slik at journalen alltid peker på en person.

## 3. Elektronisk journal (§ 2-7)

- **Lagring:**
  - Journalen ligger på serveren i `server/data/journal/`, én fil per måned (`ÅÅÅÅ-MM.jsonl`), én
    JSON-linje per hendelse.
  - Filene skrives bare ved å legge til linjer. Hver linje synkroniseres til disk (fsync) før
    handlingen regnes som utført.
  - Ingen funksjon i systemet endrer eller sletter en linje.
- **Kjede:** Hver linje har et løpenummer (`seq`) uten hull og en SHA-256-hash over innholdet og
  hashen til linjen før. En endret, fjernet eller avkuttet linje oppdages.
- **Kontroll:**
  - Journalen kontrolleres ved hver oppstart og når administrator ber om det (Innstillinger → Kasse →
    Elektronisk journal).
  - Feil vises for administrator og rettes aldri automatisk.
- **Innhold:** Tidspunkt, kasse, operatør (ansatt eller administrator) og type, med data. Typene er:
  - salg og retur med alle linjer, beløp, mva og betaling;
  - kopikvitteringer, foreløpige kvitteringer og treningssalg;
  - skuffåpninger med årsak;
  - veksel og opptelling;
  - X- og Z-rapporter med fullt innhold;
  - prisendringer (fra dashbord, kasse eller nettside);
  - korreksjoner av linjer og annullerte salg;
  - pålogging, avlogging og overtakelse av handlekurv;
  - endringer av ansatte, treningsmodus av og på, og oppstart.
- **Personopplysninger:** Journalen inneholder aldri kundens navn eller telefonnummer. Bestillinger
  anonymiseres etter 7 dager uten at journalen berøres.
- **Sikkerhetskopi:**
  - Journalen speiles fortløpende til en sikkerhetskopimappe.
  - En gjenoppretting kan aldri gjøre journalen kortere. En fil tas bare fra sikkerhetskopien når den
    utvider filen på disk. Er de uenige, beholdes disken og avviket rapporteres.

## 4. Digital signatur

- Hvert salg, hver retur og hvert treningssalg signeres med **RSA-SHA1-1024** etter Skatteetatens
  krav.
- Streng som signeres:
  `forrige signatur;transDate;transTime;nr;transAmntIn;transAmntEx`.
  - Forrige signatur er `0` for kassens første transaksjon.
  - Dato skrives `ÅÅÅÅ-MM-DD` og klokkeslett `TT:MM:SS` i norsk tid.
  - Beløp skrives med to desimaler og punktum; returer er negative.
- Kjeden er per kasse. `nr` er kassens løpende signerte transaksjonsnummer.
- **Nøkkel:**
  - Nøkkelparet lages første gang serveren trenger det og lagres bare på serveren
    (`register-signing-keys.json`, med i sikkerhetskopien).
  - Nøklene har versjon (`keyVersion`). Gamle versjoner beholdes slik at gamle signaturer kan
    kontrolleres.
- **Offentlig nøkkel:** Lastes ned i administrasjonen (Innstillinger → Kasse → SAF-T-eksport →
  «Last ned offentlig nøkkel»), i PEM-format med versjon.

## 5. Kvitteringer (§ 2-8)

Alle kvitteringer bygges fra journalen, ikke fra redigerbare data. De inneholder:
- firmanavn, adresse og organisasjonsnummer med «MVA» (og «Foretaksregisteret» der det gjelder);
- kvitteringsnummer, dato og klokkeslett;
- kasse og operatør;
- alle linjer, totalbeløp og mva per sats;
- betalingsmiddel.

| Kvittering | Når | Kjennetegn |
|---|---|---|
| Salgskvittering | Skrives ut automatisk ved hvert salg | Egen nummerserie per kasse |
| KOPI | Ved ny utskrift av et salg; **bare én kopi per salg**, flere nektes | «KOPI» med dobbel skriftstørrelse |
| Foreløpig kvittering | Fra handlekurven før betaling | «Foreløpig kvittering – IKKE KVITTERING FOR KJØP» i dobbel størrelse øverst og nederst; egen nummerserie |
| Returkvittering | Retur registrert av leder | Negative beløp, viser salgskvitteringen den gjelder og årsak; egen nummerserie |
| Treningskvittering | Salg i treningsmodus | «Treningskvittering – IKKE KVITTERING FOR KJØP» i dobbel størrelse; egen nummerserie |

- **Ordreseddel:** Kjøkkentavlen skriver kassesalg ut som «ORDRESEDDEL – IKKE KVITTERING», uten
  priser, slik at den ikke lager ekstra kopier.
- **Firmaopplysninger mangler:** Kassen selger ikke og skriver ikke ut kvitteringer før
  firmaopplysningene er fylt ut.

## 6. Salg, retur og korreksjoner

- **Prising:** Serveren priser alle salg fra varelisten. Nettbrettet sender aldri priser. Er prisen
  endret siden den ble vist, nektes salget til den ansatte har sett ny total.
- **Mva:** Mva-sats settes per linje ved salget: mat 15 % tatt med og 25 % spist her, standard 25 %,
  fritatt 0 %. Satsen lagres på salget.
- **Ingen endring av salg:** Et gjennomført salg kan ikke annulleres eller endres, verken på
  kjøkkentavlen, i administrasjonen eller direkte i data. Det kan bare motposteres med retur.
- **Retur:**
  - Velg linjer og antall, aldri mer enn det som er igjen av salget, og årsak.
  - Pengene går tilbake med samme betalingsmiddel. Kontant åpner skuffen. Kort og Vipps
    tilbakebetales på terminalen til betalingsintegrasjonen er i drift.
  - Varebeholdning føres tilbake.
- **Korreksjoner og annullering:** En fjernet linje eller et redusert antall før betaling journalføres
  som linjekorreksjon. En tømt handlekurv med varer journalføres som annullert salg. Serveren priser
  begge.

## 7. Kontanter, skuff og rapporter

- **Veksel:** Registreres ved første innlogging etter Z-rapport.
- **Skuffen åpnes:**
  - etter kontantsalg og kontantretur, én gang hver, innen tre minutter;
  - manuelt av innlogget ansatt, med årsak.
  - Alle åpninger journalføres.
- **Åpen skuff (§ 2-6):**
  - For nettverksskriver med skuffsensor slått på leses skuffens tilstand med ESC/POS DLE EOT 1. Salg
    registreres ikke mens skuffen er åpen.
  - Uten sensor, eller uten svar fra skriveren, blokkeres ikke salg.
- **X-rapport:** Viser perioden så langt og endrer ingenting.
- **Z-rapport:**
  - Krever opptalt kontantbeløp. Forventet beløp, opptalt beløp og differanse journalføres.
  - Rapporten får løpenummer per kasse og avslutter perioden. Den inneholder ikke registreringer fra
    tidligere Z-rapporter.
  - Den nektes mens en betaling pågår og i treningsmodus.
- **Innhold (§ 2-8-2):** Begge rapportene har alle feltene:
  - salg og retur;
  - per varegruppe, betalingsmiddel og ansatt;
  - mva per sats;
  - veksel og skuffåpninger;
  - antall og beløp for kopier, foreløpige kvitteringer, returer, rabatter, annullerte salg,
    linjekorreksjoner, prisforespørsler, utleveringskvitteringer, treningskvitteringer og tips;
  - grand total salg, retur og netto, som aldri nullstilles.
- **Rapportene** beregnes bare fra journalen og skrives ut. Z-rapporter kan skrives ut på nytt fra
  administrasjonen, merket «KOPI».

## 8. Treningsmodus

- Slås på og av av leder per kasse. Både på og av journalføres.
- Mens den er på:
  - viser kassen et tydelig banner;
  - salg journalføres som signerte treningssalg i egen serie;
  - det skrives ut treningskvittering;
  - det lages ingen bestilling og varebeholdningen berøres ikke;
  - retur og betalingsterminaler er stengt.
- Rapportene viser treningssalg for seg.

## 9. SAF-T Kasse

- Eksport i Skatteetatens format «Norwegian SAF-T Cash Register» versjon 1.00 for valgfri periode og
  kasse (Innstillinger → Kasse → SAF-T-eksport).
- **Innhold:**
  - firma, mva-koder, ansatte (ansattnummer), varer og alle koder (`basics`);
  - per kasse alle hendelser og alle signerte transaksjoner med linjer, mva, betaling, signatur og
    nøkkelversjon;
  - X- og Z-rapporter som `eventReport`.
- **Varegrupper:** Hver varekategori gis en varegruppekode (Mat, Mineralvann, Annen drikke …).
  Standard er Mat.
- **Hendelser uten kasse:** Prisendringer fra dashbordet, endringer av ansatte og oppstart føres
  under laveste kassenummer, fordi formatet bare tillater hendelser under en kasse.
- Eksporten kontrolleres mot Skatteetatens XSD i automatiske tester.

## 10. Funksjoner systemet ikke har

- **Kredittsalg og utleveringskvittering.** Butikken selger ikke på konto. Utleveringskvitteringer
  rapporteres som 0.
- **Prisforespørsel** som egen funksjon. Rapporteres som 0.
- **Rabatter ved salg og tips.** Planlagt. Rapporteres som 0 til de finnes.
- **Parkering av bestillinger.** Planlagt.
- **Uttak og innskudd av kontanter** utenom salg og retur.
- **Frakoblet salg.** Uten forbindelse til serveren kan det ikke selges.
- **Funksjoner forbudt i § 2-6** finnes ikke:
  - endring eller sletting av journal;
  - salg uten kvittering;
  - mer enn én kopi;
  - salg med åpen integrert skuff (der sensor er i bruk);
  - å holde registreringer utenfor rapportene.

## 11. Oppbevaring

- Journal, signaturnøkler og rapporter oppbevares på serveren og i sikkerhetskopien så lenge
  bokføringsloven krever.
- Systemet sletter aldri journalen.
- Butikken må sørge for at sikkerhetskopien tas vare på.
