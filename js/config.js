/*
 * Myra gårdsutsalg – innstillinger. Ingen hemmeligheter her:
 * fila er offentlig. GitHub-nøkkelen lagres bare kryptert på selgers telefon.
 */
window.MYRA_CONFIG = {
  version: '1.2',

  // Hvor datafila ligger på GitHub
  github: {
    owner: 'kilemann',
    repo: 'myra.io',
    branch: 'main',
    path: 'data/products.json'
  },

  // Brukernavnet selger skriver inn
  adminUsername: 'Myra',

  // Tekster på kundesiden
  shop: {
    name: 'Myra',
    kicker: 'Gårdsutsalg',
    payment: 'Vipps (nummer kommer senere)',
    address: 'Kommer senere',
    hours: 'Kommer senere'
  },

  // Hvor ofte kundesiden ser etter nye tall (sekunder)
  refreshSeconds: 60
};
