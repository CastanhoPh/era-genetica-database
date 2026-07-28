// Migra o retrato + imagens de técnica de personagens (e a imagem de itens de
// arsenal) do Cloudinary pro Firebase Storage, com nomes legíveis:
//   Characters/<id> - <Nome do Personagem>/<Nome do Personagem>.<ext>
//   Characters/<id> - <Nome do Personagem>/tecnicas/<NN> - <Nome da Técnica>.<ext>
//   Arsenal/<id> - <Nome da Arma>.<ext>
// Atualiza o Firestore e os arquivos locais data/characters.ts e
// data/arsenal.ts com as novas URLs.
//
// Roda em modo dry-run por padrão. Use --apply para baixar, subir e gravar
// de verdade. Use --only=<docId1,docId2,...> para restringir a personagens
// e/ou armas específicos (recomendado: migrar aos poucos).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const ONLY_ARG = process.argv.find(a => a.startsWith('--only='));
const ONLY = ONLY_ARG ? new Set(ONLY_ARG.slice('--only='.length).split(',').map(s => s.trim())) : null;
const BUCKET = 'era-genetica-db.firebasestorage.app';

function findServiceAccountKey() {
  if (process.env.SERVICE_ACCOUNT_KEY_PATH) return process.env.SERVICE_ACCOUNT_KEY_PATH;
  const downloads = join(os.homedir(), 'Downloads');
  const candidates = readdirSync(downloads)
    .filter(f => /firebase-adminsdk.*\.json$/i.test(f))
    .map(f => join(downloads, f))
    .filter(f => statSync(f).size > 0)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!candidates.length) throw new Error(`Nenhuma chave de serviço válida encontrada em ${downloads}.`);
  return candidates[0];
}

// Nomes de objeto do Cloud Storage aceitam praticamente qualquer caractere
// Unicode (inclusive ":"); só evitamos "/" pra não criar subpastas acidentais.
function cleanSegment(name) {
  return String(name).replace(/\//g, '-').replace(/\s+/g, ' ').trim();
}

function extFromUrl(url) {
  const m = new URL(url).pathname.match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0] : '.jpg';
}

// Monta o plano de upload para UM personagem: [{ path, url, apply(newUrl) }]
function padId(id) {
  return String(id).padStart(2, '0');
}

function planForCharacter(data) {
  const plan = [];
  const charFolder = `Characters/${padId(data.id)} - ${cleanSegment(data.name)}`;
  if (data.image) {
    plan.push({
      url: data.image,
      path: `${charFolder}/${cleanSegment(data.name)}${extFromUrl(data.image)}`,
      apply: (newUrl) => { data.image = newUrl; },
    });
  }
  (data.techniques || []).forEach((t, i) => {
    if (!t.image) return;
    const num = String(i + 1).padStart(2, '0');
    plan.push({
      url: t.image,
      path: `${charFolder}/Tecnicas/${num} - ${cleanSegment(t.name)}${extFromUrl(t.image)}`,
      apply: (newUrl) => { t.image = newUrl; },
    });
  });
  return plan;
}

function planForEquipment(data) {
  if (!data.image) return [];
  return [{
    url: data.image,
    path: `Arsenal/${padId(data.id)} - ${cleanSegment(data.name)}${extFromUrl(data.image)}`,
    apply: (newUrl) => { data.image = newUrl; },
  }];
}

async function main() {
  const keyPath = findServiceAccountKey();
  console.log(`Usando chave de serviço: ${keyPath}`);
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: BUCKET });
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  const collections = {};
  for (const [col, planFn] of [['characters', planForCharacter], ['arsenal', planForEquipment]]) {
    const snap = await db.collection(col).get();
    let items = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    if (ONLY) items = items.filter(i => ONLY.has(i.id));
    collections[col] = items.map(i => ({ ...i, plan: planFn(i.data) }));
  }
  const totalItems = collections.characters.length + collections.arsenal.length;
  if (ONLY && totalItems === 0) {
    console.error(`Nenhum documento encontrado para --only=${[...ONLY].join(',')}`);
    process.exit(1);
  }

  const fullPlan = [...collections.characters, ...collections.arsenal].flatMap(i => i.plan);
  console.log(`\n${totalItems} item(ns) selecionado(s), ${fullPlan.length} imagens no plano.`);

  if (!APPLY) {
    for (const p of fullPlan) console.log(`  ${p.path}`);
    console.log('\n[dry run] Rode com --apply para baixar, subir ao Storage e atualizar Firestore + arquivos locais.');
    process.exit(0);
  }

  // cache pra não baixar a mesma URL duas vezes (ex: imagem duplicada entre itens)
  const downloadCache = new Map();
  const localFileReplacements = []; // [oldUrl, newUrl]
  let ok = 0, fail = 0;

  for (const [i, p] of fullPlan.entries()) {
    process.stdout.write(`[${i + 1}/${fullPlan.length}] ${p.path} ... `);
    try {
      let buf, contentType;
      if (downloadCache.has(p.url)) {
        ({ buf, contentType } = downloadCache.get(p.url));
      } else {
        const res = await fetch(p.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
        contentType = res.headers.get('content-type') || 'application/octet-stream';
        downloadCache.set(p.url, { buf, contentType });
      }
      await bucket.file(p.path).save(buf, { metadata: { contentType, cacheControl: 'public, max-age=86400' } });
      const newUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(p.path)}?alt=media`;
      p.apply(newUrl);
      localFileReplacements.push([p.url, newUrl]);
      ok++;
      console.log('ok');
    } catch (e) {
      fail++;
      console.log(`FALHOU (${e.message}) — mantendo URL antiga do Cloudinary`);
    }
  }
  console.log(`\nUpload: ${ok} ok, ${fail} falharam.`);

  console.log('\nAtualizando Firestore...');
  for (const col of ['characters', 'arsenal']) {
    const items = collections[col];
    if (!items.length) continue;
    const batch = db.batch();
    for (const { id, data } of items) batch.set(db.collection(col).doc(id), data);
    await batch.commit();
    console.log(`  ✓ ${col}: ${items.length} documento(s) atualizado(s).`);
  }

  console.log('\nAtualizando arquivos locais...');
  for (const relPath of ['data/characters.ts', 'data/arsenal.ts']) {
    const absPath = join(ROOT, relPath);
    let content = readFileSync(absPath, 'utf8');
    let replaced = 0;
    for (const [oldUrl, newUrl] of localFileReplacements) {
      if (content.includes(oldUrl)) {
        content = content.split(oldUrl).join(newUrl);
        replaced++;
      }
    }
    writeFileSync(absPath, content, 'utf8');
    console.log(`  ✓ ${relPath}: ${replaced} URLs substituídas.`);
  }

  console.log(`\nMigração concluída. ${ok} imagens no Storage, ${fail} continuam no Cloudinary.`);
  process.exit(0);
}

main().catch(e => { console.error('Migração falhou:', e); process.exit(1); });
