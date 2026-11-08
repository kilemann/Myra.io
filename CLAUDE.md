# Myra gårdsutsalg (repo Myra.io)
Kundeside (`index.html`) som viser varer til salgs, og mobilvennlig oppdateringsside (`admin.html`) der selger endrer antall og priser.
Flere filer: `css/`, `js/` (config, core, dom, github, public, admin, vault), `data/products.json`, `img/`.
Nettside: https://kilemann.github.io/myra.io/

## Regler for alt arbeid i dette repoet
- Svar brukeren på norsk. Commit-meldinger på norsk, med versjon først (f.eks. «Appnavn 1.4.0: kort beskrivelse»).
- Hver endring får nytt versjonsnummer (MAJOR.MINOR.PATCH) og en linje i endringsloggen. Versjonen skal være lik på alle stedene under.
- Lever rett på `main` når resultatet er godt nok og testene er grønne. Kjør `git fetch origin main` og rebase før push.
- Testdrevet utvikling (TDD) bare når brukeren ber om det. Eksisterende tester kjøres alltid før push.
- Tekniske påstander skal sjekkes mot dokumentasjon eller kilde, ikke gjettes.
- Publiseres med GitHub Pages fra `main` (rot). Det tar noen minutter før endringen er ute.

## Versjon står her
- `js/config.js` (`version`)
- `package.json`
- `CHANGELOG.md`

## Tester
`npm test` (Node 22): `tests/core.test.js`, `tests/vault.test.js`, `tests/github.test.js`. `tests/e2e.test.js` kjøres for seg med `node --test tests/e2e.test.js` (ekte nettleser via Playwright, hoppes over hvis Playwright mangler).

## Viktig
- `data/products.json` skrives av admin-siden via GitHub API (én commit per publisering). Ikke endre den for hånd, og hent alltid siste `main` før push.
