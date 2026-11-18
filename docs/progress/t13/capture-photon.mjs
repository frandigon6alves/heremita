// One-off capture of Photon answers for the seed gazetteer (T13). Polite: 1 request / 1.2 s, real UA.
// Usage: node capture-photon.mjs <outDir>
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
mkdirSync(outDir, { recursive: true });
const CENTERS = {
  lisboa: [38.715, -9.14],
  'sao-paulo': [-23.56, -46.65],
  rio: [-22.95, -43.2],
  paris: [48.857, 2.345],
};
const QUERIES = {
  lisboa: [
    'Torre de Belém',
    'Mosteiro dos Jerónimos',
    'Praça do Comércio',
    'Miradouro de Santa Luzia',
    'Time Out Market Lisboa',
    'LX Factory',
    'Oceanário de Lisboa',
    'Padrão dos Descobrimentos',
    'Elevador de Santa Justa',
    'Sé de Lisboa',
    'Castelo de São Jorge',
    'Pastéis de Belém',
    'Museu Nacional de Arte Antiga',
    'A Brasileira',
    'Cervejaria Ramiro',
    'Jardim da Estrela',
    'Pousada de Lisboa',
    'Pensão Amor',
    'Estação do Cais do Sodré',
    'Miradouro da Senhora do Monte',
  ],
  'sao-paulo': [
    'Museu de Arte de São Paulo',
    'Parque Ibirapuera',
    'Pinacoteca do Estado',
    'Mercado Municipal de São Paulo',
    'Beco do Batman',
    'Theatro Municipal de São Paulo',
    'Catedral da Sé São Paulo',
    'Museu do Ipiranga',
    'Bar Brahma',
    'Museu do Futebol',
    'Japan House São Paulo',
    'Estação da Luz',
  ],
  rio: [
    'Cristo Redentor',
    'Pão de Açúcar',
    'Escadaria Selarón',
    'Jardim Botânico do Rio de Janeiro',
    'Praia de Ipanema',
    'Praia de Copacabana',
    'Estádio do Maracanã',
    'Arcos da Lapa',
    'Confeitaria Colombo',
    'Museu do Amanhã',
    'Parque Lage',
    'Mirante Dona Marta',
    'Praia do Leme',
    'Copacabana Palace',
  ],
  paris: [
    'Tour Eiffel',
    'Musée du Louvre',
    'Cathédrale Notre-Dame de Paris',
    "Musée d'Orsay",
    'Basilique du Sacré-Cœur',
    'Arc de Triomphe',
    'Jardin du Luxembourg',
    'Café de Flore',
    'Sainte-Chapelle',
    'Centre Pompidou',
    'Shakespeare and Company',
    'Panthéon Paris',
    'Marché des Enfants Rouges',
    'Gare du Nord',
  ],
};
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [city, queries] of Object.entries(QUERIES)) {
  const [lat, lon] = CENTERS[city];
  for (const q of queries) {
    for (const lang of ['default', 'en']) {
      const name = `seed_${city}_${slug(q)}_${lang}`;
      if (existsSync(path.join(outDir, `${name}.body`))) continue;
      const params = new URLSearchParams({
        q,
        lat: String(lat),
        lon: String(lon),
        zoom: '12',
        limit: '3',
        lang,
      });
      const url = `https://photon.komoot.io/api/?${params}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Heremita/0.0.0 (+http://localhost:3100/about)' },
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.text();
      writeFileSync(
        path.join(outDir, `${name}.hdr`),
        `HTTP/1.1 ${res.status}\nContent-Type: ${res.headers.get('content-type')}\n`,
      );
      writeFileSync(path.join(outDir, `${name}.body`), body);
      appendFileSync(
        path.join(outDir, 'requests.log'),
        `${new Date().toISOString()} ${name} ${url}\n`,
      );
      process.stdout.write(`${res.status} ${name}\n`);
      await sleep(1200);
    }
  }
}
