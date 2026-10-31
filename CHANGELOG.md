# Versjonslogg

## v1.6.1 – 2026-10-31
- Enheten står i entall når antallet er 1: «1 flaske», «1 boks», «1 sekk» (og fortsatt «2 flasker» osv.). Gjelder kundesiden, tallet i admin og commit-meldingene.

## v1.6 – 2026-10-31
- **Ved** er delt i fire typer: Bjørk, Eik, Furu og Gran. Hver type har eget antall og egen pris per sekk.
- Dataformat v4. Synligheten for ved beholdes. Den gamle enkeltvaren «Ved» (1 sekk, uten pris) kunne ikke knyttes til én type og er ikke tatt med.

## v1.5 – 2026-10-31
- Kategoriene på kundesiden sorteres automatisk i tre grupper:
  1. **Med beholdning** (minst én type over 0). **Egg står alltid øverst** så lenge egg eller små egg ikke er utsolgt.
  2. **Helt utsolgt** (alle typer i kategorien er 0, f.eks. alle fire saftene).
  3. **Kommer senere** (skjulte kategorier).
- Innenfor hver gruppe er rekkefølgen den faste: Egg, Saft, Honning, Syltetøy, Bær/frukt/grønt, Ved.
- Admin-siden beholder fast rekkefølge.

## v1.4.1 – 2026-10-31
- «Midlertidig utsolgt» og andre merkelapper holder seg inne i boksen. Er det ikke plass ved siden av navnet, havner merkelappen på linja under. Teksten er litt mindre.
- Fjernet «– samme pris for alle» etter felles pris for saft og syltetøy.
- Testen sjekker nå at merkelappene ikke går utenfor boksen ved 390 og 320 px bredde.

## v1.4 – 2026-10-31
- Dataformat v3. Lageret flyttes automatisk over, og egg og ved er uendret.
- **Saft** har faste typer: Bærsaft, Solbærsaft, Aroniasaft og Ripssaft. Hver type har eget antall, og prisen per flaske er felles.
- **Syltetøy** har faste typer: Bringebær-, Jordbær-, Bjørnebær- og Blåbærsyltetøy. Hver type har eget antall, og prisen per glass er felles.
- **Honning** er delt i tre: Flytende honning (per boks), Sommerhonning og Lynghonning (per 500 g), hver med egen pris.
- Varer med beholdning 0 vises som **Midlertidig utsolgt** på kundesiden.
- Kundesiden viser felles pris øverst i kategoriboksen. Admin har et eget felt for felles pris.

## v1.3.1 – 2026-10-30
- Små egg har fått pris **per brett (12 stk)** i tillegg til pris per egg.
- Nye prisfelt i standardoppsettet legges automatisk til i eksisterende lagerdata, uten å endre priser som allerede er satt.

## v1.3 – 2026-10-30
- Nytt dataformat (v2): **kategorier med varer**. Eksisterende lager (egg, saft, ved) flyttes automatisk over.
- **Egg** har nå to varer: *Egg* (pris per egg og per brett) og *Små egg* (eget antall og egen pris per egg).
- **Grønnsaker** er fjernet som egen kategori.
- Ny kategori **Honning** – pris per boks.
- Ny kategori **Syltetøy** – 4 typer der selger skriver navnet selv; pris per glass.
- Ny kategori **Bær, frukt og grønnsaker** – 8 typer der selger skriver navnet selv; pris og antall per hg.
- Hver kategori slås av/på med Synlig/Skjult. Varer uten navn vises ikke for kundene.
- Kundesiden viser kategorier med flere varer som en liste, og «Oppdatert …» per kategori.
- Admin: kategorier med mange varer kan foldes sammen. Hurtigknapper ±1/±5 for alt unntatt egg (±1/±6/±12).

## v1.2 – 2026-10-27
- Ny logo (variant A: kurv med saft, egg og gulrot i grønn sirkel) i toppen av kundesiden – `img/logo.svg`.
- Logoen brukes som fane-ikon, og som `img/logo-180.png` når kundesiden legges på hjemskjermen.
- Admin-appen beholder det gamle ikonet inntil videre.

## v1.1.1 – 2026-10-27
- Fjernet lenken «Selger? Oppdater lager» fra kundesiden. Admin-siden nås direkte på `admin.html` (eller fra hjemskjermen).
- Ende-til-ende-testen bruker nå fast testdata (`tests/fixtures/products.json`) i stedet for den ekte lagerfila.

## v1.1 – 2026-10-27
- Lagring via GitHub i stedet for Supabase: admin-siden skriver `data/products.json` til `main` med GitHubs Contents API, og GitHub Pages publiserer.
- **Publiser**-knapp i stedet for autolagring. Det blir én commit per publisering, endrede varer markeres, og **Forkast** angrer.
- Førstegangsoppsett per telefon. GitHub-nøkkelen krypteres med selgers passord (PBKDF2-SHA256, 600 000 iterasjoner, AES-GCM) og lagres bare lokalt.
- Innlogging med brukernavn og passord låser opp nøkkelen. Det ligger ingen passord eller hasher i koden.
- Konflikthåndtering: hvis noen andre har publisert, hentes nyeste versjon, og egne endringer legges oppå.
- Commits signeres med det nøytrale navnet «Myra lager».
- Kundesiden henter datafila uten mellomlagring og ser etter nye tall hvert minutt.
- «Glem denne enheten» og «Bytt GitHub-nøkkel» krever to trykk.
- Testdrevet: enhetstester (node:test) og ende-til-ende-test i nettleser mot en falsk GitHub.

## v1.0 – 2026-10-25
- Første versjon: kundeside med produktliste, status og «sist oppdatert» per vare. Oppdateringsside med antall, priser og synlighet. Demomodus (localStorage) og Supabase-modus.
- Ble ikke publisert til GitHub.
