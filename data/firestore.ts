// Acesso aos dados no Firestore (leitura e escrita de admin).
import { collection, getDocs, doc, addDoc, setDoc, deleteDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Character, ChecklistItem, PrototypeEntry } from '../types';
import { Equipment } from '../types/Equipment';
import { groupItems } from './checklistGrouping';

// Gera um ID legível a partir do nome (ex: "Nishinoya Senju" -> "nishinoya-senju").
export function slugify(name: string): string {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos/macrons
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function fetchCharacters(): Promise<Character[]> {
  const snap = await getDocs(collection(db, 'characters'));
  return snap.docs
    .map(d => ({ ...(d.data() as Character), docId: d.id }))
    .sort((a, b) => a.id - b.id);
}

export async function fetchArsenal(): Promise<Equipment[]> {
  const snap = await getDocs(collection(db, 'arsenal'));
  return snap.docs
    .map(d => ({ ...(d.data() as Equipment), docId: d.id }))
    .sort((a, b) => a.id - b.id);
}

// Escuta o Firestore em tempo real (mudanças feitas por qualquer admin, em qualquer lugar,
// aparecem instantaneamente para quem estiver com o site aberto). Retorna a função de unsubscribe.
export function subscribeCharacters(
  onData: (chars: Character[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'characters'),
    snap => {
      const data = snap.docs
        .map(d => ({ ...(d.data() as Character), docId: d.id }))
        .sort((a, b) => a.id - b.id);
      onData(data);
    },
    onError,
  );
}

export function subscribeArsenal(
  onData: (items: Equipment[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'arsenal'),
    snap => {
      const data = snap.docs
        .map(d => ({ ...(d.data() as Equipment), docId: d.id }))
        .sort((a, b) => a.id - b.id);
      onData(data);
    },
    onError,
  );
}

// Limpa campos undefined (o Firestore não aceita undefined).
function clean<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Cria ou atualiza um personagem. O ID do documento é o slug do nome.
// `existingDocId` é passado na edição quando o nome (e portanto o slug) não muda.
export async function saveCharacter(
  character: Character,
  takenDocIds: string[],
  existingDocId?: string,
): Promise<string> {
  let docId = slugify(character.name) || `personagem-${character.id}`;
  // evita colisão de slug (a não ser que seja o próprio doc em edição)
  if (docId !== existingDocId && takenDocIds.includes(docId)) {
    docId = `${docId}-${character.id}`;
  }
  const { docId: _omit, ...data } = character as Character & { docId?: string };
  await setDoc(doc(db, 'characters', docId), clean(data));
  // se o nome mudou na edição, remove o documento antigo
  if (existingDocId && existingDocId !== docId) {
    await deleteDoc(doc(db, 'characters', existingDocId));
  }
  return docId;
}

export async function deleteCharacter(docId: string): Promise<void> {
  await deleteDoc(doc(db, 'characters', docId));
}

// Cria ou atualiza uma arma. O ID do documento é o slug do nome.
export async function saveEquipment(
  equipment: Equipment,
  takenDocIds: string[],
  existingDocId?: string,
): Promise<string> {
  let docId = slugify(equipment.name) || `arma-${equipment.id}`;
  if (docId !== existingDocId && takenDocIds.includes(docId)) {
    docId = `${docId}-${equipment.id}`;
  }
  const { docId: _omit, ...data } = equipment as Equipment & { docId?: string };
  await setDoc(doc(db, 'arsenal', docId), clean(data));
  if (existingDocId && existingDocId !== docId) {
    await deleteDoc(doc(db, 'arsenal', existingDocId));
  }
  return docId;
}

export async function deleteEquipment(docId: string): Promise<void> {
  await deleteDoc(doc(db, 'arsenal', docId));
}

// Checklist de produção de imagens (quem produz as imagens marca aqui o que já foi feito).
export function subscribeChecklist(
  onData: (items: ChecklistItem[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'imageChecklist'),
    snap => {
      const data = snap.docs
        .map(d => ({ ...(d.data() as ChecklistItem), docId: d.id }))
        .sort((a, b) => a.order - b.order);
      onData(data);
    },
    onError,
  );
}

export async function setChecklistItemDone(docId: string, done: boolean, doneBy?: string | null): Promise<void> {
  await updateDoc(doc(db, 'imageChecklist', docId), { done, doneBy: done ? (doneBy ?? null) : null });
}

// Edição administrativa da checklist (texto, ordem, placeholder, criação e remoção de itens).
export async function updateChecklistItem(docId: string, changes: Partial<ChecklistItem>): Promise<void> {
  const { docId: _omit, ...rest } = changes as ChecklistItem;
  await updateDoc(doc(db, 'imageChecklist', docId), clean(rest));
}

export async function addChecklistItem(item: Omit<ChecklistItem, 'docId'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'imageChecklist'), clean(item));
  return docRef.id;
}

export async function deleteChecklistItem(docId: string): Promise<void> {
  await deleteDoc(doc(db, 'imageChecklist', docId));
}

// Renumera o campo `order` de todos os itens do zero (0, 1, 2...), sem lacunas nem
// colisões, preservando a sequência que já aparece corretamente na visão agrupada
// (temporada > arco > subarco). Corrige a visão "Geral" da Galeria caso ela volte a
// ficar fora de ordem. Retorna quantos itens tiveram o `order` de fato alterado.
export async function fixChecklistOrder(): Promise<number> {
  const snap = await getDocs(collection(db, 'imageChecklist'));
  const items = snap.docs
    .map(d => ({ ...(d.data() as ChecklistItem), docId: d.id }))
    .sort((a, b) => a.order - b.order);

  const flat = groupItems(items).flatMap(t => t.arcos.flatMap(a => a.subarcos.flatMap(s => s.items)));

  const batch = writeBatch(db);
  let changed = 0;
  flat.forEach((item, index) => {
    if (item.order !== index) {
      batch.update(doc(db, 'imageChecklist', item.docId!), { order: index });
      changed++;
    }
  });
  if (changed > 0) await batch.commit();
  return changed;
}

// Rascunhos de personagens em desenvolvimento (aba "Protótipo" do Painel) — texto e/ou
// imagem soltos, mandados aos poucos antes de virarem ficha oficial.
export function subscribePrototype(
  onData: (items: PrototypeEntry[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'prototypeEntries'),
    snap => {
      const data = snap.docs
        .map(d => ({ ...(d.data() as PrototypeEntry), docId: d.id }))
        .sort((a, b) => a.order - b.order);
      onData(data);
    },
    onError,
  );
}

export async function deletePrototypeEntry(docId: string): Promise<void> {
  await deleteDoc(doc(db, 'prototypeEntries', docId));
}
