// Sincroniza data/characters.ts e data/arsenal.ts (fonte editada localmente)
// para o Firestore (fonte lida pelo site). Roda em modo "dry run" por padrão;
// use --apply para gravar de verdade.
//
// Autenticação: Admin SDK com uma chave de serviço. Por padrão procura o
// arquivo mais recente "*firebase-adminsdk*.json" na pasta Downloads do
// usuário; pode ser sobrescrito com a env var SERVICE_ACCOUNT_KEY_PATH.
import { readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import os from 'os';
import esbuild from 'esbuild';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const ONLY_ARG = process.argv.find(a => a.startsWith('--only='));
const ONLY = ONLY_ARG ? new Set(ONLY_ARG.slice('--only='.length).split(',').map(s => s.trim())) : null;

function findServiceAccountKey() {
  if (process.env.SERVICE_ACCOUNT_KEY_PATH) return process.env.SERVICE_ACCOUNT_KEY_PATH;
  const downloads = join(os.homedir(), 'Downloads');
  const candidates = readdirSync(downloads)
    .filter(f => /firebase-adminsdk.*\.json$/i.test(f))
    .map(f => {
      const full = join(downloads, f);
      return { full, mtime: statSync(full).mtimeMs, size: statSync(full).size };
    })
    .filter(f => f.size > 0)
    .sort((a, b) => b.mtime - a.mtime);
  if (!candidates.length) {
    throw new Error(`Nenhuma chave de serviço válida encontrada em ${downloads}. Gere uma no Console Firebase ou defina SERVICE_ACCOUNT_KEY_PATH.`);
  }
  return candidates[0].full;
}

// Compila um .ts com esbuild e importa o export nomeado, sem deixar arquivo temporário.
async function loadTsExport(relPath, exportName) {
  const absPath = join(ROOT, relPath);
  const src = readFileSync(absPath, 'utf8');
  const { code } = await esbuild.transform(src, { loader: 'ts', format: 'esm', target: 'node20' });
  const tmpFile = join(os.tmpdir(), `sync-push-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmpFile, code, 'utf8');
  try {
    const mod = await import(pathToFileURL(tmpFile).href);
    return mod[exportName];
  } finally {
    unlinkSync(tmpFile);
  }
}

// Mesma lógica de data/firestore.ts (slugify + resolução de colisão), para os
// IDs de documento ficarem idênticos aos que o app geraria via UI.
function slugify(name) {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function withDocIds(items) {
  const used = new Set();
  return items.map(item => {
    let docId = slugify(item.name) || `item-${item.id}`;
    if (used.has(docId)) docId = `${docId}-${item.id}`;
    used.add(docId);
    return { docId, data: JSON.parse(JSON.stringify(item)) }; // limpa undefined
  });
}

async function pushCollection(db, collectionName, items, existingDocIds) {
  let entries = withDocIds(items);
  const localDocIds = new Set(entries.map(e => e.docId));
  const orphans = existingDocIds.filter(id => !localDocIds.has(id));

  if (ONLY) {
    entries = entries.filter(e => ONLY.has(e.docId));
  }

  console.log(`\n${collectionName}: ${entries.length} itens selecionados para push (de ${localDocIds.size} no arquivo local, ${existingDocIds.length} no Firestore).`);
  if (orphans.length) {
    console.log(`  Presentes no Firestore mas ausentes no arquivo local (NÃO serão apagados): ${orphans.join(', ')}`);
  }

  if (!APPLY) {
    console.log(`  [dry run] ${entries.length} documentos seriam gravados: ${entries.map(e => e.docId).join(', ')}`);
    return;
  }

  const BATCH_LIMIT = 400;
  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const { docId, data } of entries.slice(i, i + BATCH_LIMIT)) {
      batch.set(db.collection(collectionName).doc(docId), data);
    }
    await batch.commit();
  }
  console.log(`  ✓ ${entries.length} documentos gravados no Firestore.`);
}

async function main() {
  const keyPath = findServiceAccountKey();
  console.log(`Usando chave de serviço: ${keyPath}`);
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const [characters, arsenal] = await Promise.all([
    loadTsExport('data/characters.ts', 'initialData'),
    loadTsExport('data/arsenal.ts', 'arsenalData'),
  ]);

  const [charSnap, arsenalSnap] = await Promise.all([
    db.collection('characters').listDocuments(),
    db.collection('arsenal').listDocuments(),
  ]);

  await pushCollection(db, 'characters', characters, charSnap.map(d => d.id));
  await pushCollection(db, 'arsenal', arsenal, arsenalSnap.map(d => d.id));

  if (!APPLY) {
    console.log('\nModo dry run — nada foi gravado. Rode com --apply para sincronizar de verdade.');
  }
  process.exit(0);
}

main().catch(e => { console.error('Sync push falhou:', e); process.exit(1); });
