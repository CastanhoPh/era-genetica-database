import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import os from 'os';
import admin from 'firebase-admin';
function findServiceAccountKey() {
  const downloads = join(os.homedir(), 'Downloads');
  return readdirSync(downloads).filter(f => /firebase-adminsdk.*\.json$/i.test(f)).map(f => join(downloads, f)).filter(f => statSync(f).size > 0).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}
function norm(s) {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '') // extensão
    .replace(/\s*\(\d+\)\s*$/, '') // "(2)" no fim
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(findServiceAccountKey(), 'utf8'))) });
const db = admin.firestore();
const snap = await db.collection('imageChecklist').get();
const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

const folder = 'C:/Users/PedroCastanho/Downloads/todos';
const files = readdirSync(folder).filter(f => statSync(join(folder, f)).isFile());

const byNorm = new Map();
for (const item of items) {
  const key = norm(item.name);
  const list = byNorm.get(key) ?? [];
  list.push(item);
  byNorm.set(key, list);
}

const matched = [];
const unmatched = [];
const ambiguous = [];
for (const file of files) {
  const key = norm(file);
  const candidates = byNorm.get(key);
  if (!candidates) { unmatched.push(file); continue; }
  if (candidates.length > 1) { ambiguous.push({ file, candidates }); continue; }
  matched.push({ file, item: candidates[0] });
}

console.log(`=== CASADOS (${matched.length}) ===`);
matched.forEach(m => console.log(`  "${m.file}" -> [${m.item.temporada} / ${m.item.arco}${m.item.subarco ? ' / ' + m.item.subarco : ''}] ${m.item.name} (já tem imagem: ${!!m.item.imageUrl})`));

console.log(`\n=== AMBÍGUOS (${ambiguous.length}) ===`);
ambiguous.forEach(a => {
  console.log(`  "${a.file}" bate com ${a.candidates.length} itens:`);
  a.candidates.forEach(c => console.log(`     - [${c.temporada} / ${c.arco}${c.subarco ? ' / ' + c.subarco : ''}] ${c.name} (id=${c.id})`));
});

console.log(`\n=== SEM CORRESPONDÊNCIA (${unmatched.length}) ===`);
unmatched.forEach(f => console.log(`  ${f}`));
process.exit(0);
