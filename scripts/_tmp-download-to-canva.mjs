import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import os from 'os';
import admin from 'firebase-admin';

function findServiceAccountKey() {
  const downloads = join(os.homedir(), 'Downloads');
  const candidates = readdirSync(downloads)
    .filter(f => /firebase-adminsdk.*\.json$/i.test(f))
    .map(f => ({ full: join(downloads, f), mtime: statSync(join(downloads, f)).mtimeMs, size: statSync(join(downloads, f)).size }))
    .filter(f => f.size > 0)
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0].full;
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(findServiceAccountKey(), 'utf8'))) });
const db = admin.firestore();

const DEST = 'C:/Users/PedroCastanho/OneDrive - Teddy Open Finance/Área de Trabalho/Canva';

const snap = await db.collection('imageChecklist').get();
const items = snap.docs.map(d => d.data())
  .filter(i => i.type === 'timeline' && i.imageUrl)
  .sort((a, b) => a.order - b.order);

console.log(`${items.length} imagem(ns) pra baixar.\n`);

function extFromUrl(url) {
  const clean = url.split('?')[0];
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : 'png';
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '');
}

let ok = 0, fail = 0;
for (const item of items) {
  const firstName = item.temporada.split(' ')[0];
  const ext = extFromUrl(item.imageUrl);
  const fileName = sanitize(`${firstName} - ${item.arco}.${ext}`);
  const dest = join(DEST, fileName);
  try {
    const res = await fetch(item.imageUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    console.log(`OK   ${fileName}`);
    ok++;
  } catch (e) {
    console.log(`FALHOU ${fileName}: ${e.message}`);
    fail++;
  }
}

console.log(`\n${ok} baixada(s), ${fail} falha(s).`);
