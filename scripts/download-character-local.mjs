// Baixa o retrato e as imagens de técnica de UM personagem do Firestore para
// uma pasta local, renomeando cada arquivo para o nome do personagem/técnica
// (em vez do nome aleatório do Cloudinary). Passo de staging antes de subir
// pro Firebase Storage com nomes limpos.
//
// Uso: node scripts/download-character-local.mjs --slug=nishinoya-senju
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import admin from 'firebase-admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SLUG = process.argv.find(a => a.startsWith('--slug='))?.slice('--slug='.length);
const OUT_BASE = process.argv.find(a => a.startsWith('--out='))?.slice('--out='.length)
  || join(ROOT, 'imagens-migradas');

if (!SLUG) {
  console.error('Uso: node scripts/download-character-local.mjs --slug=<docId>');
  process.exit(1);
}

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

// Remove caracteres inválidos em nomes de arquivo do Windows.
function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function extFromUrlOrContentType(url, contentType) {
  const fromUrl = extname(new URL(url).pathname);
  if (fromUrl) return fromUrl;
  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('webp')) return '.webp';
  return '.jpg';
}

async function downloadTo(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filePath, buf);
  return { size: buf.length, contentType: res.headers.get('content-type') };
}

async function main() {
  const keyPath = findServiceAccountKey();
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const docSnap = await db.collection('characters').doc(SLUG).get();
  if (!docSnap.exists) throw new Error(`Personagem "${SLUG}" não encontrado em characters/`);
  const data = docSnap.data();

  const folderName = sanitizeFilename(`${data.id} - ${data.name}`);
  const charDir = join(OUT_BASE, folderName);
  const techDir = join(charDir, 'tecnicas');
  mkdirSync(techDir, { recursive: true });

  console.log(`Personagem: ${data.name} (id ${data.id})`);
  console.log(`Pasta: ${charDir}\n`);

  // Retrato
  if (data.image) {
    const ext = extFromUrlOrContentType(data.image, null);
    const dest = join(charDir, sanitizeFilename(data.name) + ext);
    process.stdout.write(`Retrato -> ${dest} ... `);
    try {
      await downloadTo(data.image, dest);
      console.log('ok');
    } catch (e) {
      console.log(`FALHOU (${e.message})`);
    }
  }

  // Técnicas
  const techniques = data.techniques || [];
  for (const [i, t] of techniques.entries()) {
    if (!t.image) continue;
    const ext = extFromUrlOrContentType(t.image, null);
    const num = String(i + 1).padStart(2, '0');
    const dest = join(techDir, `${num} - ${sanitizeFilename(t.name)}${ext}`);
    process.stdout.write(`[${num}] ${t.name} -> ${dest} ... `);
    try {
      await downloadTo(t.image, dest);
      console.log('ok');
    } catch (e) {
      console.log(`FALHOU (${e.message})`);
    }
  }

  console.log('\nConcluído.');
  process.exit(0);
}

main().catch(e => { console.error('Falhou:', e); process.exit(1); });
