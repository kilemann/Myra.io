# Versjonslogg

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
