// Gera páginas estáticas <slug>.html em dist/ com meta tags Open Graph,
// para que links compartilhados (WhatsApp/Discord) mostrem nome + imagem.
// Roda após o build, lendo os dados públicos do Firestore (API REST).
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const PROJECT = 'era-genetica-db';
const API_KEY = 'AIzaSyD5mgExupTw0hRMPNBDTd2Lzk0frx_lp1o';
const BASE = 'https://era-genetica-db.web.app';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/\n/g, ' ').trim();

const fieldStr = (f) => (f ? (f.stringValue ?? f.integerValue ?? '') : '');

async function fetchCollection(name) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${name}?pageSize=300&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Firestore ${name}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.documents || []).map(doc => {
    const slug = doc.name.split('/').pop();
    const f = doc.fields || {};
    const out = { slug };
    for (const k of Object.keys(f)) out[k] = fieldStr(f[k]);
    return out;
  });
}

function ogTags({ title, description, image, url }) {
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Era Genética">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    image ? `<meta name="twitter:image" content="${esc(image)}">` : '',
  ].filter(Boolean).join('\n    ');
}

const template = readFileSync(join(DIST, 'index.html'), 'utf8');

function writeStub(slug, title, tags) {
  let html = template.replace('</head>', `    ${tags}\n  </head>`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  writeFileSync(join(DIST, `${slug}.html`), html, 'utf8');
}

const main = async () => {
  const characters = await fetchCollection('characters');
  for (const c of characters) {
    const desc = `${c.clan ? c.clan + ' — ' : ''}${(c.description || '').slice(0, 170)}`;
    writeStub(c.slug, `${c.name} | Era Genética`,
      ogTags({ title: c.name, description: desc, image: c.image, url: `${BASE}/${c.slug}` }));
  }

  const arsenal = await fetchCollection('arsenal');
  for (const a of arsenal) {
    const desc = `${a.classification ? '[' + a.classification + '] ' : ''}${(a.description || '').slice(0, 170)}`;
    writeStub(a.slug, `${a.name} | Arsenal — Era Genética`,
      ogTags({ title: a.name, description: desc, image: a.image, url: `${BASE}/${a.slug}` }));
  }

  console.log(`Prerender OG: ${characters.length} personagens + ${arsenal.length} armas geradas em dist/`);
};

main().catch(e => { console.error('Prerender OG falhou:', e.message); process.exit(1); });
