# Myra gårdsutsalg

En enkel nettside som viser hva Myra har til salgs. Ved siden av ligger en mobilvennlig side der selger oppdaterer antall, priser og hvilke varer som vises.

- **Kundesiden:** https://kilemann.github.io/myra.io/
- **Oppdateringssiden:** https://kilemann.github.io/myra.io/admin.html

Versjon: se [CHANGELOG.md](CHANGELOG.md).

## Slik virker det

```
Selgers telefon (admin.html)  ──Publiser──►  GitHub API  ──commit──►  data/products.json
                                                                           │
Kunder (index.html)  ◄──── GitHub Pages bygger og publiserer (noen minutter) ┘
```

- All lagerstatus ligger i `data/products.json`.
- Når selger trykker **Publiser**, skriver admin-siden en ny versjon av fila til `main` via GitHubs API. Det blir én commit per publisering.
- GitHub Pages bygger siden på nytt. Kundesiden henter fila med en unik adresse hver gang, så den ikke viser en gammel versjon fra mellomlageret.
- Regn med **noen minutter** fra du trykker Publiser til endringen er synlig for kundene.

## Oppsett (én gang)

### 1. Slå på GitHub Pages

Gå til **Settings → Pages**. Under *Build and deployment* velger du *Deploy from a branch*, deretter branch `main` og mappe `/ (root)`, og trykker **Save**.

### 2. Lag en GitHub-nøkkel som bare kan skrive til dette repoet

1. Gå til GitHub og velg **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Gi den et navn, for eksempel `Myra lager`, og en utløpsdato (for eksempel 1 år).
3. Under **Repository access** velger du *Only select repositories* og deretter **myra.io**.
4. Under **Permissions → Repository permissions** setter du **Contents** til **Read and write**. Ingen andre tillatelser trengs.
5. Trykk **Generate token** og kopier nøkkelen (`github_pat_…`). GitHub viser den bare én gang.

### 3. Sett opp telefonen

1. Åpne `admin.html` på telefonen.
2. Skriv brukernavn **Myra**, lim inn nøkkelen og velg et passord på minst 8 tegn.
3. Nøkkelen krypteres med passordet (PBKDF2 + AES-GCM) og lagres **bare på den telefonen**. Den ligger aldri i repoet.
4. Legg siden på hjemskjermen:
   - **iPhone:** Del → *Legg til på Hjem-skjerm*
   - **Android:** ⋮ → *Legg til på startsiden*

Neste gang trenger selger bare brukernavn og passord.

## Daglig bruk

1. Logg inn.
2. Juster antall med **−12 … +12**, eller trykk på tallet og skriv det inn. Skriv inn priser, og bruk **Synlig/Skjult** for å vise en vare eller sette den på «Kommer senere».
3. Varer du har endret, får gul ramme, og nederst står hvor mange varer som er endret.
4. Trykk **Publiser**. Det blir én commit uansett hvor mange endringer du har gjort.
5. **Forkast** angrer alt som ikke er publisert.

Hvis noen andre har publisert i mellomtiden, henter siden den nyeste versjonen og beholder dine endringer oppå. Da trykker du Publiser én gang til.

## Sikkerhet

- Repoet er offentlig, og det inneholder ingen hemmeligheter.
- GitHub-nøkkelen har bare tilgang til *Contents* i dette ene repoet.
- **Hvis telefonen blir borte:** Slett nøkkelen under *Fine-grained tokens* på GitHub. Da virker den ikke lenger, uansett passord.
- **Når nøkkelen utløper:** Lag en ny, og trykk *Bytt GitHub-nøkkel* på innloggingssiden.
- Commits fra admin-siden står med navnet «Myra lager», ikke med e-posten din.
- Brukernavnet er bare en enkel sjekk. Den egentlige beskyttelsen er passordet som krypterer nøkkelen.
- Historikken til `data/products.json` er offentlig, så alle kan se når lageret har endret seg.

## Begrensninger

- GitHub Pages har en myk grense på 10 bygg i timen når siden publiseres fra en branch. Publiser-knappen gjør at det blir få bygg.
- Dette er en testløsning. For sanntidsoppdatering kan datalaget senere byttes til en database (for eksempel Supabase) uten å endre dataformatet.

## Legge til en ny vare

Rediger `data/products.json` på GitHub og legg til et nytt objekt med unik `id` og `sort` (rekkefølgen). Kopier gjerne en eksisterende vare:

```json
{ "id": "honning", "sort": 50, "name": "Honning", "note": "Lokal", "unit": "glass",
  "qty": 0, "active": false, "prices": [{ "label": "per glass", "amount": null }], "updatedAt": null }
```

## Utvikling og tester

Prosjektet er laget testdrevet. Testene kjøres med Node 18 eller nyere, og det trengs ingen pakker for enhetstestene:

```
npm test              # enhetstester (kjerne, kryptering, GitHub-klient)
npm run test:e2e      # nettlesertest med falsk GitHub (krever Playwright)
```

| Fil | Innhold |
|---|---|
| `js/core.js` | Dataformat, formatering, endringsdeteksjon, sammenslåing ved konflikt |
| `js/vault.js` | Kryptering av nøkkelen med passord |
| `js/github.js` | Lesing og skriving via GitHubs Contents API |
| `js/public.js`, `js/admin.js` | De to sidene |
| `js/config.js` | Repo, brukernavn og tekster på kundesiden |
| `tests/` | Enhetstester og ende-til-ende-test |
