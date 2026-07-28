import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Database, Users, Shield, Scroll, Images, Clock, HardDrive, RefreshCw, Loader, Radio, AlertTriangle, ListOrdered, CheckCircle2, Search, Skull, SkipForward, BookOpen, Download, X, ChevronDown, ChevronUp, CheckSquare, MapPin, FlaskConical, Trash2, UserCheck, UserX, HeartPulse, Award } from 'lucide-react';
import { ref, listAll, getMetadata, StorageReference } from 'firebase/storage';
import JSZip from 'jszip';
import { storage } from '../firebaseStorage';
import { subscribeChecklist, fixChecklistOrder, subscribePrototype, deletePrototypeEntry, slugify } from '../data/firestore';
import { Character, ChecklistItem, PrototypeEntry, SEASON_LORE, SEASON_ORDER, PENDING_CHARACTERS } from '../types';
import { Equipment } from '../types/Equipment';

interface AdminPanelProps {
  characters: Character[];
  arsenalItems: Equipment[];
}

interface StorageStats {
  totalBytes: number;
  fileCount: number;
}

const FREE_TIER_BYTES = 5 * 1024 * 1024 * 1024;

async function walkStorage(folderRef: StorageReference): Promise<StorageStats> {
  const res = await listAll(folderRef);
  const metas = await Promise.all(res.items.map(item => getMetadata(item)));
  const own = metas.reduce(
    (acc, m) => ({ totalBytes: acc.totalBytes + (Number(m.size) || 0), fileCount: acc.fileCount + 1 }),
    { totalBytes: 0, fileCount: 0 },
  );
  const children = await Promise.all(res.prefixes.map(walkStorage));
  return children.reduce(
    (acc, c) => ({ totalBytes: acc.totalBytes + c.totalBytes, fileCount: acc.fileCount + c.fileCount }),
    own,
  );
}

const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const formatTime = (d: Date) => d.toLocaleTimeString('pt-BR');

const StatCard: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; sub?: string }> = ({ icon: Icon, label, value, sub }) => (
  <div className="border border-tech-border bg-tech-panel/30 p-4 flex flex-col gap-2">
    <div className="flex items-center gap-2 text-tech-primary/70">
      <Icon size={13} />
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </div>
    <div className="text-3xl font-black text-white text-glow">{value}</div>
    {sub && <div className="text-[10px] text-tech-primary/40 uppercase tracking-wide">{sub}</div>}
  </div>
);

const PANEL_TABS = ['geral', 'personagens', 'producao', 'prototipos', 'classificacoes'] as const;
type PanelTab = typeof PANEL_TABS[number];

const AdminPanel: React.FC<AdminPanelProps> = ({ characters, arsenalItems }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [fixOrderLoading, setFixOrderLoading] = useState(false);
  const [fixOrderResult, setFixOrderResult] = useState<string | null>(null);
  const [fixOrderError, setFixOrderError] = useState<string | null>(null);
  const [chronologySearch, setChronologySearch] = useState('');

  const [bulkFases, setBulkFases] = useState<Set<string>>(new Set());
  const [bulkChars, setBulkChars] = useState<Set<string>>(new Set());
  const [bulkCharSearch, setBulkCharSearch] = useState('');
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false);

  const [expandedVillages, setExpandedVillages] = useState<Set<string>>(new Set());
  const [expandedClans, setExpandedClans] = useState<Set<string>>(new Set());

  // Aba ativa (e, dentro de Protótipos, o item aberto) vêm direto da URL — /painel/<aba>[/<item>] —
  // mesmo princípio já usado na ficha do personagem: nada de estado próprio pra duplicar a URL.
  const panelSegments = location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).slice(1);
  const activeTab: PanelTab = (PANEL_TABS as readonly string[]).includes(panelSegments[0]) ? (panelSegments[0] as PanelTab) : 'geral';
  const prototypeSlugFromUrl = activeTab === 'prototipos' && panelSegments[1] ? decodeURIComponent(panelSegments[1]) : undefined;
  const goToPanelTab = (tab: PanelTab) => navigate(`/painel/${tab}`);

  const [prototypeEntries, setPrototypeEntries] = useState<PrototypeEntry[]>([]);
  const [prototypeVillage, setPrototypeVillage] = useState('Konohagakure');
  const [classificationVillage, setClassificationVillage] = useState('Konohagakure');
  const [classificationFilter, setClassificationFilter] = useState<'nc30' | 'nc26' | 'nc20' | 'nc16' | 'nc8' | null>(null);
  const openPrototypeId = prototypeSlugFromUrl
    ? (prototypeEntries.find(e => slugify(e.title) === prototypeSlugFromUrl)?.docId ?? null)
    : null;

  useEffect(() => {
    const unsubscribe = subscribeChecklist(setChecklistItems, err => console.error('Erro ao escutar checklist:', err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePrototype(setPrototypeEntries, err => console.error('Erro ao escutar protótipos:', err));
    return () => unsubscribe();
  }, []);

  const handleDeletePrototypeEntry = useCallback(async (docId: string) => {
    if (!window.confirm('Apagar esse protótipo (com todas as imagens)? Não tem como desfazer.')) return;
    try {
      await deletePrototypeEntry(docId);
      if (openPrototypeId === docId) navigate('/painel/prototipos');
    } catch (e) {
      console.error('Erro ao apagar protótipo:', e);
    }
  }, [openPrototypeId, navigate]);

  const loadStorageStats = useCallback(async () => {
    setStorageLoading(true);
    setStorageError(null);
    try {
      const stats = await walkStorage(ref(storage));
      setStorageStats(stats);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Erro ao calcular uso do Storage:', e);
      setStorageError('Não foi possível calcular o uso do Storage.');
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => { loadStorageStats(); }, [loadStorageStats]);

  const handleFixOrder = useCallback(async () => {
    if (!window.confirm('Renumerar a ordem de todos os itens da checklist? Isso corrige a sequência caso a Galeria "Geral" esteja fora de ordem. Não afeta nomes, imagens ou status de "feito".')) return;
    setFixOrderLoading(true);
    setFixOrderError(null);
    setFixOrderResult(null);
    try {
      const changed = await fixChecklistOrder();
      setFixOrderResult(changed > 0 ? `${changed} item(ns) renumerado(s).` : 'Já estava tudo em ordem, nada mudou.');
    } catch (e) {
      console.error('Erro ao corrigir ordem da checklist:', e);
      setFixOrderError('Não foi possível corrigir a ordem.');
    } finally {
      setFixOrderLoading(false);
    }
  }, []);

  const deadCount = characters.filter(c => c.isDead).length;
  const totalTechniques = characters.reduce((sum, c) => sum + (c.techniques?.length || 0), 0);
  const totalTimelineImages = checklistItems.filter(i => i.type === 'timeline' && !!i.imageUrl).length;
  const totalEventoImages = checklistItems.filter(i => (i.type ?? 'evento') === 'evento' && !!i.imageUrl).length;
  const totalGalleryImages = totalTimelineImages + totalEventoImages;
  const totalImageRefs = characters.length + arsenalItems.length + totalTechniques + totalGalleryImages;

  // Painel de personagens (aba Personagens): com ficha vs. só pendentes, vivos/mortos, e o
  // tier máximo de NC (30) — Hades fica de fora de propósito (NC 0 = fora de escala).
  const pendingCount = PENDING_CHARACTERS.reduce((sum, g) => sum + g.entries.length, 0);
  const totalCharactersOverall = characters.length + pendingCount;
  const aliveCount = characters.length - deadCount;
  const nc30Count = characters.filter(c => c.nc === 30).length;

  // Personagens por vila de nascença: soma quem já tem ficha (`birthVillage`, um valor só por
  // pessoa — evita contar duas vezes quem tem mais de uma vila em `categories`, tipo afiliação
  // atual) com quem ainda está só na lista de pendentes (agrupada por vila lá mesmo).
  const VILLAGES = ['Konohagakure', 'Kirigakure', 'Sunagakure', 'Iwagakure', 'Kumogakure'];
  const villageRows = useMemo(() => {
    const registeredNames = new Map<string, string[]>(VILLAGES.map(v => [v, []]));
    let unclassified = 0;
    for (const c of characters) {
      if (c.birthVillage && registeredNames.has(c.birthVillage)) {
        registeredNames.get(c.birthVillage)!.push(c.name);
      } else {
        unclassified++;
      }
    }
    const pendingNames = new Map<string, string[]>(VILLAGES.map(v => [v, []]));
    for (const g of PENDING_CHARACTERS) {
      if (pendingNames.has(g.village)) pendingNames.set(g.village, g.entries.map(e => e.name));
    }
    const rows = VILLAGES
      .map(v => {
        const reg = [...(registeredNames.get(v) ?? [])].sort();
        const pend = [...(pendingNames.get(v) ?? [])].sort();
        return { village: v, registered: reg.length, pending: pend.length, total: reg.length + pend.length, registeredNames: reg, pendingNames: pend };
      })
      .sort((a, b) => b.total - a.total);
    return { rows, unclassified, maxTotal: Math.max(1, ...rows.map(r => r.total)) };
  }, [characters]);

  // Personagens pendentes (ainda sem ficha) que já têm NC decidido, indexados por nome — usado
  // pra mostrar o NC nos cards/modal de Protótipo e pra entrar na Classificação junto com quem
  // já tem ficha.
  const pendingNcByName = new Map<string, number>();
  for (const g of PENDING_CHARACTERS) {
    for (const e of g.entries) if (e.nc !== undefined) pendingNcByName.set(e.name, e.nc);
  }

  // Classificações: personagens com ficha (só eles têm NC oficial) + pendentes que já têm NC
  // decidido, agrupados pela vila de nascença, ordenados do maior NC pro menor — referência pra
  // decidir o NC de personagens novos. OCA é a única exceção: não é vila de nascença, é a tag
  // `categories` — por isso um personagem pode entrar em OCA *e* na vila dele ao mesmo tempo
  // (duplicado de propósito). Pendentes nunca entram em OCA (essa tag só existe pra quem já tem ficha).
  const CLASSIFICATION_GROUPS = [...VILLAGES, 'OCA'];
  const classificationsByVillage = useMemo(() => {
    const map = new Map<string, { name: string; nc: number; clan: string; pending?: boolean; dead?: boolean }[]>(CLASSIFICATION_GROUPS.map(v => [v, []]));
    for (const c of characters) {
      if (c.birthVillage && map.has(c.birthVillage)) {
        map.get(c.birthVillage)!.push({ name: c.name, nc: Number(c.nc) || 0, clan: c.clan, dead: !!c.isDead });
      }
      if (c.categories?.includes('OCA')) {
        map.get('OCA')!.push({ name: c.name, nc: Number(c.nc) || 0, clan: c.clan, dead: !!c.isDead });
      }
    }
    for (const g of PENDING_CHARACTERS) {
      if (!map.has(g.village)) continue;
      for (const e of g.entries) {
        if (e.nc === undefined) continue;
        map.get(g.village)!.push({ name: e.name, nc: e.nc, clan: e.role ?? '', pending: true, dead: !!e.dead });
      }
    }
    for (const list of map.values()) list.sort((a, b) => b.nc - a.nc);
    return map;
  }, [characters]);
  // "Todos" junta as 5 vilas (sem OCA, pra não contar quem tem as duas tags duas vezes).
  const classificationAllVillages = useMemo(() => {
    const all = VILLAGES.flatMap(v => classificationsByVillage.get(v) ?? []);
    return [...all].sort((a, b) => b.nc - a.nc);
  }, [classificationsByVillage]);
  const classificationChars = classificationVillage === 'Todos' ? classificationAllVillages : (classificationsByVillage.get(classificationVillage) ?? []);
  // Faixas exclusivas (não cumulativas): NC 30 é só o topo; 26+ é 26-29; 20+ é 20-25; etc.
  const NC_BANDS: Record<'nc30' | 'nc26' | 'nc20' | 'nc16' | 'nc8', (nc: number) => boolean> = {
    nc30: nc => nc === 30,
    nc26: nc => nc >= 26 && nc <= 29,
    nc20: nc => nc >= 20 && nc <= 25,
    nc16: nc => nc >= 16 && nc <= 19,
    nc8: nc => nc >= 8 && nc <= 15,
  };
  const classificationCounts = {
    nc30: classificationChars.filter(c => NC_BANDS.nc30(c.nc)).length,
    nc26: classificationChars.filter(c => NC_BANDS.nc26(c.nc)).length,
    nc20: classificationChars.filter(c => NC_BANDS.nc20(c.nc)).length,
    nc16: classificationChars.filter(c => NC_BANDS.nc16(c.nc)).length,
    nc8: classificationChars.filter(c => NC_BANDS.nc8(c.nc)).length,
  };
  const classificationFiltered = classificationFilter
    ? classificationChars.filter(c => NC_BANDS[classificationFilter](c.nc))
    : classificationChars;

  // Personagens por clã — combina quem já tem ficha (campo `clan`) com quem ainda está pendente.
  // A lista de pendentes não guarda clã explicitamente, mas a convenção de nomes do universo é
  // "Nome Clã" (o sobrenome é sempre o clã), então dá pra derivar do próprio nome.
  const clanRows = useMemo(() => {
    const registeredNames = new Map<string, string[]>();
    const pendingNames = new Map<string, string[]>();
    const bump = (map: Map<string, string[]>, clan: string, name: string) => {
      const list = map.get(clan) ?? [];
      list.push(name);
      map.set(clan, list);
    };
    for (const c of characters) bump(registeredNames, c.clan || 'Sem clã', c.name);
    for (const g of PENDING_CHARACTERS) {
      for (const e of g.entries) bump(pendingNames, e.name.split(' ')[1] || 'Sem clã', e.name);
    }
    const allClans = new Set([...registeredNames.keys(), ...pendingNames.keys()]);
    const rows = Array.from(allClans)
      .map(clan => {
        const reg = [...(registeredNames.get(clan) ?? [])].sort();
        const pend = [...(pendingNames.get(clan) ?? [])].sort();
        return { clan, registered: reg.length, pending: pend.length, total: reg.length + pend.length, registeredNames: reg, pendingNames: pend };
      })
      .sort((a, b) => b.total - a.total);
    return { rows, maxTotal: Math.max(1, ...rows.map(r => r.total)) };
  }, [characters]);

  const pctUsed = storageStats ? Math.min(100, (storageStats.totalBytes / FREE_TIER_BYTES) * 100) : 0;

  const chronologyExcluded = characters.filter(c => c.timelineExcluded);
  const chronologyRows = useMemo(() => {
    const term = chronologySearch.trim().toLowerCase();
    return characters
      .filter(c => !term || c.name.toLowerCase().includes(term))
      .sort((a, b) => a.id - b.id);
  }, [characters, chronologySearch]);

  // Download em lote: filtra a Linha do Tempo já pronta (com imagem) por fase + personagem,
  // busca cada imagem e monta um .zip só, pra baixar tudo de uma vez.
  const FASE_RANK: Record<string, number> = {
    'Prólogo': 0, 'Clássico': 1, '1ª Temporada': 2, '2ª Temporada': 3, 'Ambu': 4,
    'Kaminari': 5, 'Luta contra o Omega': 6, '3ª Temporada': 7, '4ª Temporada': 8,
    'Terceiro Hokage': 9, '5ª Temporada': 10,
  };
  const timelineDoneItems = useMemo(
    () => checklistItems.filter(i => i.type === 'timeline' && !!i.imageUrl),
    [checklistItems],
  );
  const bulkAvailableFases = useMemo(() => {
    const set: string[] = Array.from(new Set<string>(timelineDoneItems.map(i => i.arco)));
    return set.sort((a: string, b: string) => (FASE_RANK[a] ?? 99) - (FASE_RANK[b] ?? 99));
  }, [timelineDoneItems]);
  const charIdByName = useMemo(() => new Map<string, number>(characters.map(c => [c.name, c.id])), [characters]);
  const bulkAvailableChars = useMemo(() => {
    // Só mostra quem tem imagem na(s) fase(s) marcada(s) — nenhuma marcada = todo mundo.
    const relevant = bulkFases.size === 0 ? timelineDoneItems : timelineDoneItems.filter(i => bulkFases.has(i.arco));
    const set: string[] = Array.from(new Set<string>(relevant.map(i => i.temporada)));
    const term = bulkCharSearch.trim().toLowerCase();
    return set
      .filter((n: string) => !term || n.toLowerCase().includes(term))
      .sort((a: string, b: string) => (charIdByName.get(a) ?? 999) - (charIdByName.get(b) ?? 999));
  }, [timelineDoneItems, bulkFases, bulkCharSearch, charIdByName]);
  const bulkMatches = useMemo(() => {
    return timelineDoneItems.filter(i =>
      (bulkFases.size === 0 || bulkFases.has(i.arco)) &&
      (bulkChars.size === 0 || bulkChars.has(i.temporada)),
    );
  }, [timelineDoneItems, bulkFases, bulkChars]);

  // Separa as fases-padrão (Prólogo..5ª Temporada) dos marcos exclusivos (Ambu, Kaminari...)
  // só pra exibir em dois grupos visuais — não muda o filtro em si.
  const CORE_FASES = useMemo(() => new Set<string>(SEASON_ORDER), []);
  const bulkCoreFases = useMemo(() => bulkAvailableFases.filter(f => CORE_FASES.has(f)), [bulkAvailableFases, CORE_FASES]);
  const bulkExtraFases = useMemo(() => bulkAvailableFases.filter(f => !CORE_FASES.has(f)), [bulkAvailableFases, CORE_FASES]);

  // Agrupa o resultado final por personagem, na ordem cronológica das fases, só pra
  // dar uma pré-visualização do que exatamente vai entrar no zip antes de baixar.
  const bulkPreviewGroups = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const item of bulkMatches) {
      const list = map.get(item.temporada) ?? [];
      list.push(item);
      map.set(item.temporada, list);
    }
    return Array.from(map.entries())
      .map(([temporada, list]) => ({
        temporada,
        fases: [...list].sort((a, b) => (FASE_RANK[a.arco] ?? 99) - (FASE_RANK[b.arco] ?? 99)).map(i => i.arco),
      }))
      .sort((a, b) => (charIdByName.get(a.temporada) ?? 999) - (charIdByName.get(b.temporada) ?? 999));
  }, [bulkMatches, charIdByName]);

  const toggleInSet = (set: Set<string>, setSet: (s: Set<string>) => void, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setSet(next);
  };

  // Baixa uma imagem, tentando de novo se a primeira falhar. cache: 'no-store' evita pegar do
  // cache do navegador uma resposta antiga sem CORS (de quando a imagem foi vista via <img> em
  // outra tela, antes do bucket ter CORS liberado) — sem isso o fetch falha mesmo a imagem existindo.
  const fetchImageWithRetry = async (url: string): Promise<Blob> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.blob();
      } catch (e) {
        if (attempt === 1) throw e;
      }
    }
    throw new Error('unreachable');
  };

  const handleBulkDownload = useCallback(async () => {
    if (bulkMatches.length === 0) return;
    setBulkDownloading(true);
    setBulkError(null);
    setBulkProgress({ done: 0, total: bulkMatches.length });
    const failed: string[] = [];
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      for (let i = 0; i < bulkMatches.length; i++) {
        const item = bulkMatches[i];
        try {
          const blob = await fetchImageWithRetry(item.imageUrl!);
          const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
          let fileName = `${item.temporada} - ${item.arco}.${ext}`;
          let n = 2;
          while (usedNames.has(fileName)) { fileName = `${item.temporada} - ${item.arco} (${n}).${ext}`; n++; }
          usedNames.add(fileName);
          zip.file(fileName, blob);
        } catch (e) {
          console.error(`Falha ao baixar ${item.temporada} - ${item.arco}:`, e);
          failed.push(`${item.temporada} - ${item.arco}`);
        }
        setBulkProgress({ done: i + 1, total: bulkMatches.length });
      }
      if (failed.length === bulkMatches.length) {
        throw new Error('Nenhuma imagem pôde ser baixada.');
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linha-do-tempo-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      if (failed.length > 0) {
        setBulkError(`${failed.length} imagem(ns) não entraram no zip (falha ao baixar): ${failed.join(', ')}`);
      }
    } catch (e) {
      console.error('Erro ao baixar imagens em lote:', e);
      setBulkError('Não foi possível gerar o zip.');
    } finally {
      setBulkDownloading(false);
      setBulkProgress(null);
    }
  }, [bulkMatches]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <header className="mb-4 pl-6 py-2 relative">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-tech-primary"></div>
        <h1 className="text-3xl md:text-5xl font-black text-white mb-2 tracking-tighter uppercase relative inline-block">
          PAINEL<span className="text-tech-primary">_ADMINISTRATIVO</span>
        </h1>
        <p className="text-tech-primary/80 text-sm flex items-center gap-2">
          <Radio size={13} className="animate-pulse" />
          <span className="uppercase tracking-widest">Personagens e arsenal sincronizados em tempo real com o Firestore</span>
        </p>
      </header>

      <div className="flex items-center gap-1 border-b border-tech-border overflow-x-auto">
        {([
          { key: 'geral' as const, label: 'Visão Geral' },
          { key: 'personagens' as const, label: 'Personagens' },
          { key: 'producao' as const, label: 'Produção' },
          { key: 'prototipos' as const, label: 'Protótipos' },
          { key: 'classificacoes' as const, label: 'Classificações' },
        ]).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => goToPanelTab(t.key)}
            className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 -mb-px whitespace-nowrap ${activeTab === t.key ? 'border-tech-primary text-tech-primary' : 'border-transparent text-tech-primary/40 hover:text-tech-primary/70'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'geral' && (
      <>
      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Banco de Dados</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={Database} label="Total" value={totalImageRefs} sub="Personagens + Arsenal + Técnicas + Galeria" />
          <StatCard icon={Users} label="Personagens" value={characters.length} sub={characters.length ? `${deadCount} mortos (${((deadCount / characters.length) * 100).toFixed(0)}%)` : undefined} />
          <StatCard icon={Scroll} label="Técnicas cadastradas" value={totalTechniques} />
          <StatCard icon={Shield} label="Arsenal" value={arsenalItems.length} />
          <StatCard icon={Clock} label="Linha do tempo" value={totalTimelineImages} />
          <StatCard icon={Images} label="Eventos" value={totalEventoImages} />
        </div>
      </section>

      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Firebase Storage</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>

        <div className="border border-tech-border bg-tech-panel/30 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-2 text-tech-primary/70">
              <HardDrive size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Armazenamento de imagens</span>
            </div>
            <button
              type="button"
              onClick={loadStorageStats}
              disabled={storageLoading}
              className="flex items-center gap-1.5 px-2 py-1 border border-tech-primary/40 text-tech-primary text-[9px] font-bold uppercase hover:bg-tech-primary hover:text-black transition-all disabled:opacity-50"
            >
              {storageLoading ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              {storageLoading ? 'Calculando...' : 'Atualizar'}
            </button>
          </div>

          {storageError ? (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertTriangle size={14} /> {storageError}
            </div>
          ) : storageStats ? (
            <>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <span className="text-2xl font-black text-white text-glow">{formatMB(storageStats.totalBytes)} MB</span>
                  <span className="text-tech-primary/40 text-sm"> / 5.120 MB grátis</span>
                </div>
                <span className="text-tech-primary text-sm font-bold">{pctUsed.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-black border border-tech-border overflow-hidden mb-3">
                <div
                  className="h-full bg-tech-primary shadow-[0_0_8px_rgba(0,255,65,0.5)] transition-all duration-700"
                  style={{ width: `${pctUsed}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-tech-primary/40 uppercase tracking-wide">
                <span>{storageStats.fileCount} arquivos no bucket</span>
                {lastUpdated && <span>Atualizado às {formatTime(lastUpdated)}</span>}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-tech-primary/40 text-xs uppercase tracking-widest">
              <Loader size={13} className="animate-spin" /> Calculando uso do Storage...
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Temporadas</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>
        <div className="border border-tech-border bg-tech-panel/30 p-5">
          <div className="flex items-center gap-2 text-tech-primary/70 mb-1">
            <BookOpen size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Temporadas — nomes e marcos</span>
          </div>
          <p className="text-[9px] text-tech-primary/40 uppercase tracking-wide mb-3">Provisório — só referência de contexto, ainda não é oficial.</p>
          <div className="flex flex-col gap-3">
            {SEASON_LORE.map(s => (
              <div key={s.season} className="border border-tech-border/60 bg-black/30 p-3">
                <div className="text-tech-primary font-black uppercase tracking-wide text-xs">{s.season}</div>
                {s.title && <div className="text-white text-sm mb-1">{s.title}</div>}
                <div className="text-[10px] text-tech-primary/50">Início: {s.start}</div>
                <div className="text-[10px] text-tech-primary/50">Final: {s.end}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      </>
      )}

      {activeTab === 'producao' && (
      <>
      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Manutenção</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>

        <div className="border border-tech-border bg-tech-panel/30 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
            <div className="flex items-center gap-2 text-tech-primary/70">
              <ListOrdered size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Ordem da checklist</span>
            </div>
            <button
              type="button"
              onClick={handleFixOrder}
              disabled={fixOrderLoading}
              className="flex items-center gap-1.5 px-2 py-1 border border-tech-primary/40 text-tech-primary text-[9px] font-bold uppercase hover:bg-tech-primary hover:text-black transition-all disabled:opacity-50"
            >
              {fixOrderLoading ? <Loader size={11} className="animate-spin" /> : <ListOrdered size={11} />}
              {fixOrderLoading ? 'Corrigindo...' : 'Corrigir Ordem'}
            </button>
          </div>
          <p className="text-[10px] text-tech-primary/40 uppercase tracking-wide mb-2">
            Renumera o campo de ordem de todos os itens do zero, sem lacunas nem colisões, preservando a sequência já exibida por temporada/arco/subarco. Use se a visão "Geral" da Galeria aparecer fora de ordem.
          </p>
          {fixOrderError && (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertTriangle size={14} /> {fixOrderError}
            </div>
          )}
          {fixOrderResult && (
            <div className="flex items-center gap-2 text-tech-primary text-xs">
              <CheckCircle2 size={14} /> {fixOrderResult}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Baixar Imagens em Lote</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>

        <div className="border border-tech-border bg-tech-panel/30 p-5 space-y-5">
          <div className="flex items-center gap-2 text-tech-primary/70">
            <Download size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Linha do Tempo — escolha fase(s) e personagem(ns)</span>
          </div>

          {/* Passo 1: fases. Marcando alguma aqui já estreita a lista de personagens abaixo. */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[9px] text-tech-primary/50 uppercase tracking-widest flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-tech-primary/15 text-tech-primary text-[9px] font-black">1</span>
                Fases
                {bulkFases.size === 0
                  ? <span className="normal-case text-tech-primary/30">· nenhuma marcada, incluindo todas ({bulkAvailableFases.length})</span>
                  : <span className="normal-case text-tech-primary">· {bulkFases.size} de {bulkAvailableFases.length} marcada(s)</span>}
              </div>
              <div className="flex items-center gap-3">
                {bulkFases.size < bulkAvailableFases.length && (
                  <button type="button" onClick={() => setBulkFases(new Set(bulkAvailableFases))} className="text-[9px] text-tech-primary/50 hover:text-tech-primary flex items-center gap-1">
                    <CheckSquare size={10} /> marcar todas
                  </button>
                )}
                {bulkFases.size > 0 && (
                  <button type="button" onClick={() => setBulkFases(new Set())} className="text-[9px] text-tech-primary/50 hover:text-tech-primary flex items-center gap-1">
                    <X size={10} /> limpar
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {bulkCoreFases.map(fase => (
                <button
                  key={fase}
                  type="button"
                  onClick={() => toggleInSet(bulkFases, setBulkFases, fase)}
                  className={`px-2 py-1 border text-[10px] font-bold uppercase tracking-wide transition-all ${bulkFases.has(fase) ? 'bg-tech-primary text-black border-tech-primary' : 'border-tech-border text-tech-primary/70 hover:border-tech-primary/50'}`}
                >
                  {fase}
                </button>
              ))}
            </div>
            {bulkExtraFases.length > 0 && (
              <>
                <div className="text-[9px] text-tech-primary/30 uppercase tracking-widest mt-2 mb-1">Marcos exclusivos</div>
                <div className="flex flex-wrap gap-1.5">
                  {bulkExtraFases.map(fase => (
                    <button
                      key={fase}
                      type="button"
                      onClick={() => toggleInSet(bulkFases, setBulkFases, fase)}
                      className={`px-2 py-1 border text-[10px] font-bold uppercase tracking-wide transition-all ${bulkFases.has(fase) ? 'bg-tech-primary text-black border-tech-primary' : 'border-tech-border/60 text-tech-primary/50 hover:border-tech-primary/50'}`}
                    >
                      {fase}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Passo 2: personagens — a lista já reflete só quem tem imagem na(s) fase(s) marcada(s) acima. */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[9px] text-tech-primary/50 uppercase tracking-widest flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-tech-primary/15 text-tech-primary text-[9px] font-black">2</span>
                Personagens
                {bulkChars.size === 0
                  ? <span className="normal-case text-tech-primary/30">· nenhum marcado, incluindo todos ({bulkAvailableChars.length})</span>
                  : <span className="normal-case text-tech-primary">· {bulkChars.size} marcado(s)</span>}
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setBulkChars(new Set([...bulkChars, ...bulkAvailableChars]))} className="text-[9px] text-tech-primary/50 hover:text-tech-primary flex items-center gap-1">
                  <CheckSquare size={10} /> marcar visíveis ({bulkAvailableChars.length})
                </button>
                {bulkChars.size > 0 && (
                  <button type="button" onClick={() => setBulkChars(new Set())} className="text-[9px] text-tech-primary/50 hover:text-tech-primary flex items-center gap-1">
                    <X size={10} /> limpar
                  </button>
                )}
              </div>
            </div>
            <div className="w-full sm:w-64 bg-black border border-tech-border flex items-center px-3 h-9 group focus-within:border-tech-primary transition-all mb-2">
              <Search size={13} className="text-tech-dim group-focus-within:text-tech-primary transition-colors" />
              <input
                type="text"
                placeholder="BUSCAR_PERSONAGEM..."
                value={bulkCharSearch}
                onChange={(e) => setBulkCharSearch(e.target.value)}
                className="bg-transparent border-none outline-none text-tech-primary w-full ml-2 placeholder:text-tech-dim uppercase text-xs"
              />
            </div>
            <div className="max-h-48 overflow-y-auto border border-tech-border/60 bg-black/30 p-2 flex flex-wrap gap-1.5">
              {bulkAvailableChars.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleInSet(bulkChars, setBulkChars, name)}
                  className={`px-2 py-1 border text-[10px] font-bold transition-all ${bulkChars.has(name) ? 'bg-tech-primary text-black border-tech-primary' : 'border-tech-border text-tech-primary/70 hover:border-tech-primary/50'}`}
                >
                  {name}
                </button>
              ))}
              {bulkAvailableChars.length === 0 && (
                <span className="text-tech-primary/40 text-[10px] uppercase tracking-widest">Nenhum personagem encontrado.</span>
              )}
            </div>
          </div>

          {/* Passo 3: conferir e baixar. */}
          <div className="border-t border-tech-border/60 pt-4 space-y-3">
            <button
              type="button"
              onClick={() => setBulkPreviewOpen(o => !o)}
              disabled={bulkMatches.length === 0}
              className="flex items-center gap-1.5 text-[10px] text-tech-primary/70 hover:text-tech-primary uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {bulkPreviewOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {bulkPreviewOpen ? 'Esconder' : 'Conferir'} o que vai no zip ({bulkMatches.length} {bulkMatches.length === 1 ? 'imagem' : 'imagens'} de {bulkPreviewGroups.length} {bulkPreviewGroups.length === 1 ? 'personagem' : 'personagens'})
            </button>

            {bulkPreviewOpen && bulkMatches.length > 0 && (
              <div className="max-h-56 overflow-y-auto border border-tech-border/60 bg-black/30 p-3 space-y-2">
                {bulkPreviewGroups.map(g => (
                  <div key={g.temporada} className="text-xs">
                    <span className="text-white font-bold">{g.temporada}</span>
                    <span className="text-tech-primary/50"> — {g.fases.join(', ')}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleBulkDownload}
                disabled={bulkDownloading || bulkMatches.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 border border-tech-primary/40 text-tech-primary text-[10px] font-bold uppercase hover:bg-tech-primary hover:text-black transition-all disabled:opacity-50"
              >
                {bulkDownloading ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
                {bulkDownloading ? `Baixando ${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0}...` : `Baixar ZIP (${bulkMatches.length} ${bulkMatches.length === 1 ? 'imagem' : 'imagens'})`}
              </button>
              {bulkMatches.length === 0 && (
                <span className="text-tech-primary/40 text-[10px] uppercase tracking-wide">Nenhuma imagem bate com essa combinação de fase/personagem.</span>
              )}
              {bulkError && (
                <span className="flex items-center gap-1.5 text-red-400 text-xs"><AlertTriangle size={13} /> {bulkError}</span>
              )}
            </div>
          </div>
        </div>
      </section>
      </>
      )}

      {activeTab === 'personagens' && (
      <>
      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Personagens</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={Users} label="Personagens totais" value={totalCharactersOverall} sub="Com ficha + pendentes" />
          <StatCard icon={UserCheck} label="Com ficha" value={characters.length} />
          <StatCard icon={UserX} label="Sem ficha" value={pendingCount} sub="Pendentes" />
          <StatCard icon={HeartPulse} label="Vivos" value={aliveCount} />
          <StatCard icon={Skull} label="Mortos" value={deadCount} sub={characters.length ? `${((deadCount / characters.length) * 100).toFixed(0)}%` : undefined} />
          <StatCard icon={Award} label="NC 30" value={nc30Count} sub="Tier máximo" />
        </div>
      </section>

      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Cronologia da Linha do Tempo</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>

        <div className="border border-tech-border bg-tech-panel/30 p-5 space-y-4">
          <div className="flex items-center gap-2 text-tech-primary/70">
            <Clock size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Aparição / buracos / morte por personagem</span>
          </div>

          <div className="w-full sm:w-64 bg-black border border-tech-border flex items-center px-3 h-9 group focus-within:border-tech-primary transition-all">
            <Search size={13} className="text-tech-dim group-focus-within:text-tech-primary transition-colors" />
            <input
              type="text"
              placeholder="BUSCAR_PERSONAGEM..."
              value={chronologySearch}
              onChange={(e) => setChronologySearch(e.target.value)}
              className="bg-transparent border-none outline-none text-tech-primary w-full ml-2 placeholder:text-tech-dim uppercase text-xs"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] text-tech-primary/50 uppercase tracking-widest border-b border-tech-border">
                  <th className="text-left font-black py-2 pr-3">Personagem</th>
                  <th className="text-left font-black py-2 pr-3">Aparição</th>
                  <th className="text-left font-black py-2 pr-3">Não apareceu</th>
                  <th className="text-left font-black py-2 pr-3">Morte</th>
                </tr>
              </thead>
              <tbody>
                {chronologyRows.map(c => (
                  <tr key={c.docId ?? c.name} className="border-b border-tech-border/40 hover:bg-tech-primary/5">
                    <td className="py-1.5 pr-3 text-white font-bold whitespace-nowrap">{c.name}</td>
                    <td className="py-1.5 pr-3 text-tech-primary whitespace-nowrap">{c.timelineAppearance ?? 'Prólogo'}</td>
                    <td className="py-1.5 pr-3 text-yellow-400/80 whitespace-nowrap">
                      {c.timelineSkipped && c.timelineSkipped.length > 0 ? (
                        <span className="flex items-center gap-1"><SkipForward size={11} /> {c.timelineSkipped.join(', ')}</span>
                      ) : (
                        <span className="text-tech-primary/30">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {c.timelineDeath ? (
                        <span className="flex items-center gap-1 text-red-400"><Skull size={11} /> {c.timelineDeath}</span>
                      ) : (
                        <span className="text-tech-primary/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {chronologyRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-tech-primary/40 uppercase tracking-widest text-[10px]">
                      Nenhum personagem encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {chronologyExcluded.length > 0 && (
            <div className="text-[10px] text-tech-primary/40 uppercase tracking-wide">
              Fora da Linha do Tempo de propósito: {chronologyExcluded.map(c => c.name).join(', ')}.
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Personagens por Vila</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>

        <div className="border border-tech-border bg-tech-panel/30 p-5 space-y-3">
          <div className="flex items-center gap-2 text-tech-primary/70 mb-1">
            <MapPin size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Vila de nascença — com ficha + pendentes</span>
          </div>

          {villageRows.rows.map(r => {
            const isOpen = expandedVillages.has(r.village);
            return (
              <div key={r.village}>
                <button
                  type="button"
                  onClick={() => toggleInSet(expandedVillages, setExpandedVillages, r.village)}
                  disabled={r.total === 0}
                  className="w-full text-left group disabled:cursor-default"
                >
                  <div className="flex items-end justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-white font-bold text-sm group-hover:text-tech-primary transition-colors">
                      {r.total > 0 && (isOpen ? <ChevronUp size={13} className="text-tech-primary shrink-0" /> : <ChevronDown size={13} className="text-tech-primary/50 shrink-0" />)}
                      {r.village}
                    </span>
                    <span className="text-[10px] text-tech-primary/50 uppercase tracking-wide">
                      <span className="text-tech-primary font-bold">{r.registered}</span> com ficha
                      {r.pending > 0 && <> + <span className="text-tech-primary font-bold">{r.pending}</span> pendente{r.pending === 1 ? '' : 's'}</>}
                      {' '}= <span className="text-white font-black">{r.total}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-black border border-tech-border overflow-hidden">
                    <div
                      className="h-full bg-tech-primary shadow-[0_0_8px_rgba(0,255,65,0.5)] transition-all duration-700"
                      style={{ width: `${(r.total / villageRows.maxTotal) * 100}%` }}
                    />
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-2 mb-1 pl-1 flex flex-wrap gap-1.5">
                    {r.registeredNames.map(name => (
                      <span key={name} className="px-2 py-0.5 border border-tech-border/60 bg-black/30 text-white text-[10px]">{name}</span>
                    ))}
                    {r.pendingNames.map(name => (
                      <span key={name} className="px-2 py-0.5 border border-tech-border/40 text-tech-primary/50 text-[10px] italic">{name} (pendente)</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {villageRows.unclassified > 0 && (
            <div className="text-[10px] text-tech-primary/40 uppercase tracking-wide pt-1">
              {villageRows.unclassified} personagem(ns) com ficha ainda sem vila de nascença definida.
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Personagens por Clã</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>

        <div className="border border-tech-border bg-tech-panel/30 p-5 space-y-3">
          <div className="flex items-center gap-2 text-tech-primary/70 mb-1">
            <Users size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Com ficha + pendentes (clã derivado do sobrenome)</span>
          </div>

          {clanRows.rows.map(r => {
            const isOpen = expandedClans.has(r.clan);
            return (
              <div key={r.clan}>
                <button
                  type="button"
                  onClick={() => toggleInSet(expandedClans, setExpandedClans, r.clan)}
                  disabled={r.total === 0}
                  className="w-full text-left group disabled:cursor-default"
                >
                  <div className="flex items-end justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-white font-bold text-sm group-hover:text-tech-primary transition-colors">
                      {r.total > 0 && (isOpen ? <ChevronUp size={13} className="text-tech-primary shrink-0" /> : <ChevronDown size={13} className="text-tech-primary/50 shrink-0" />)}
                      {r.clan}
                    </span>
                    <span className="text-[10px] text-tech-primary/50 uppercase tracking-wide">
                      <span className="text-tech-primary font-bold">{r.registered}</span> com ficha
                      {r.pending > 0 && <> + <span className="text-tech-primary font-bold">{r.pending}</span> pendente{r.pending === 1 ? '' : 's'}</>}
                      {' '}= <span className="text-white font-black">{r.total}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-black border border-tech-border overflow-hidden">
                    <div
                      className="h-full bg-tech-primary shadow-[0_0_8px_rgba(0,255,65,0.5)] transition-all duration-700"
                      style={{ width: `${(r.total / clanRows.maxTotal) * 100}%` }}
                    />
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-2 mb-1 pl-1 flex flex-wrap gap-1.5">
                    {r.registeredNames.map(name => (
                      <span key={name} className="px-2 py-0.5 border border-tech-border/60 bg-black/30 text-white text-[10px]">{name}</span>
                    ))}
                    {r.pendingNames.map(name => (
                      <span key={name} className="px-2 py-0.5 border border-tech-border/40 text-tech-primary/50 text-[10px] italic">{name} (pendente)</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      </>
      )}

      {activeTab === 'prototipos' && (
      <>
      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Protótipos</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>

        <div className="border border-tech-border bg-tech-panel/30 p-5 space-y-4">
          <div className="flex items-center gap-2 text-tech-primary/70 mb-1">
            <FlaskConical size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Rascunho de personagem em desenvolvimento</span>
          </div>
          <p className="text-[9px] text-tech-primary/40 uppercase tracking-wide">
            Um quadrado por protótipo (nome do personagem), organizado por vila. Clique num quadrado pra ver todas as imagens e textos dele. Guardado num lugar simples no Storage — tudo é apagado ao fim do RPG. Envie as imagens e textos direto no chat — sem upload por aqui, por enquanto.
          </p>

          <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
            {['Todos', ...VILLAGES].map(v => {
              const count = v === 'Todos' ? prototypeEntries.length : prototypeEntries.filter(e => e.village === v).length;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPrototypeVillage(v)}
                  className={`shrink-0 whitespace-nowrap px-2.5 py-1 border text-[10px] font-bold uppercase tracking-wide transition-all ${prototypeVillage === v ? 'bg-tech-primary text-black border-tech-primary' : 'border-tech-border text-tech-primary/70 hover:border-tech-primary/50'}`}
                >
                  {v} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>

          {(() => {
            const filtered = prototypeVillage === 'Todos' ? prototypeEntries : prototypeEntries.filter(e => e.village === prototypeVillage);
            if (filtered.length === 0) {
              return <div className="text-tech-primary/40 text-xs uppercase tracking-widest text-center py-6">Nada guardado ainda em {prototypeVillage}.</div>;
            }
            return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(entry => (
                <button
                  key={entry.docId}
                  type="button"
                  onClick={() => navigate(`/painel/prototipos/${encodeURIComponent(slugify(entry.title))}`)}
                  className="aspect-square border border-tech-border/60 bg-black/30 hover:border-tech-primary/60 transition-all relative overflow-hidden group text-left"
                >
                  {entry.images[0] ? (
                    <img src={entry.images[0]} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                  ) : (
                    <FlaskConical size={20} className="absolute inset-0 m-auto text-tech-primary/30" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                  <span className="absolute bottom-1.5 left-1.5 right-1.5 text-white font-bold text-xs leading-tight">{entry.title}</span>
                  {pendingNcByName.get(entry.title) !== undefined && (
                    <span className="absolute top-1.5 left-1.5 bg-black/70 text-tech-primary text-[9px] font-black px-1.5 py-0.5 border border-tech-border/60">NC {pendingNcByName.get(entry.title)}</span>
                  )}
                  {entry.images.length > 1 && (
                    <span className="absolute top-1.5 right-1.5 bg-black/70 text-tech-primary text-[9px] font-bold px-1.5 py-0.5 border border-tech-border/60">{entry.images.length}</span>
                  )}
                </button>
              ))}
            </div>
            );
          })()}
        </div>
      </section>

      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Personagens Pendentes</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>
        <div className="border border-tech-border bg-tech-panel/30 p-5">
          <div className="flex items-center gap-2 text-tech-primary/70 mb-1">
            <Users size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Adicionar futuramente no Banco de Dados</span>
          </div>
          <p className="text-[9px] text-tech-primary/40 uppercase tracking-wide mb-3">Personagens que já existem na história mas ainda não foram cadastrados. † = morto.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PENDING_CHARACTERS.map(g => (
              <div key={g.village} className="border border-tech-border/60 bg-black/30 p-3">
                <div className="text-tech-primary font-black uppercase tracking-wide text-xs mb-2">{g.village}</div>
                <ul className="space-y-3">
                  {g.entries.map((e, i) => (
                    <li key={`${e.name}-${i}`} className="text-white text-xs">
                      <span className="inline-flex items-center gap-1">
                        {e.name}
                        {e.dead && <Skull size={10} className="text-red-400 shrink-0" />}
                        {e.nc !== undefined && <span className="text-tech-primary font-bold">NC {e.nc}</span>}
                      </span>
                      {e.role && <span className="text-tech-primary/50"> ({e.role})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
      </>
      )}

      {openPrototypeId && (() => {
        const entry = prototypeEntries.find(e => e.docId === openPrototypeId);
        if (!entry) return null;
        return (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => navigate('/painel/prototipos')}>
            <div className="max-w-3xl w-full max-h-[85vh] overflow-y-auto border border-tech-primary/40 bg-tech-panel p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">{entry.title}</h2>
                  {pendingNcByName.get(entry.title) !== undefined && (
                    <span className="text-tech-primary font-black text-sm border border-tech-primary/40 px-2 py-0.5 shrink-0">NC {pendingNcByName.get(entry.title)}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDeletePrototypeEntry(entry.docId!)}
                    title="Apagar protótipo"
                    className="text-red-500/70 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button type="button" onClick={() => navigate('/painel/prototipos')} title="Fechar" className="text-tech-primary/70 hover:text-tech-primary transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>
              {entry.images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {entry.images.map(url => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="" className="w-full h-32 object-cover border border-tech-border" />
                    </a>
                  ))}
                </div>
              )}
              {entry.text && <p className="text-white text-sm whitespace-pre-wrap leading-relaxed">{entry.text}</p>}
            </div>
          </div>
        );
      })()}

      {activeTab === 'classificacoes' && (
      <section>
        <div className="text-[10px] font-black text-tech-primary/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Classificações</span>
          <span className="flex-1 h-px bg-tech-border"></span>
        </div>

        <div className="border border-tech-border bg-tech-panel/30 p-5 space-y-4">
          <div className="flex items-center gap-2 text-tech-primary/70 mb-1">
            <Award size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">NC por vila de nascença — só quem já tem ficha</span>
          </div>
          <p className="text-[9px] text-tech-primary/40 uppercase tracking-wide">
            Referência pra decidir o NC de personagens novos. Ordenado do maior NC pro menor dentro de cada vila.
          </p>

          <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
            {['Todos', ...CLASSIFICATION_GROUPS].map(v => {
              const count = v === 'Todos' ? classificationAllVillages.length : (classificationsByVillage.get(v)?.length ?? 0);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setClassificationVillage(v); setClassificationFilter(null); }}
                  className={`shrink-0 whitespace-nowrap px-2.5 py-1 border text-[10px] font-bold uppercase tracking-wide transition-all ${classificationVillage === v ? 'bg-tech-primary text-black border-tech-primary' : 'border-tech-border text-tech-primary/70 hover:border-tech-primary/50'}`}
                >
                  {v} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {([
              { key: 'nc30' as const, label: 'NC 30' },
              { key: 'nc26' as const, label: 'NC 26+' },
              { key: 'nc20' as const, label: 'NC 20+' },
              { key: 'nc16' as const, label: 'NC 16+' },
              { key: 'nc8' as const, label: 'NC 8+' },
            ]).map(band => (
              <button
                key={band.key}
                type="button"
                onClick={() => setClassificationFilter(f => f === band.key ? null : band.key)}
                disabled={classificationCounts[band.key] === 0}
                className={`text-left border p-4 flex flex-col gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${classificationFilter === band.key ? 'border-tech-primary bg-tech-primary/10' : 'border-tech-border bg-tech-panel/30 hover:border-tech-primary/50'}`}
              >
                <div className="flex items-center gap-2 text-tech-primary/70">
                  <Award size={13} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{band.label}</span>
                </div>
                <div className="text-3xl font-black text-white text-glow">{classificationCounts[band.key]}</div>
              </button>
            ))}
          </div>

          {classificationFilter && (
            <button
              type="button"
              onClick={() => setClassificationFilter(null)}
              className="text-[9px] text-tech-primary/50 hover:text-tech-primary flex items-center gap-1"
            >
              <X size={10} /> limpar filtro
            </button>
          )}

          {classificationFiltered.length === 0 ? (
            <div className="text-tech-primary/40 text-xs uppercase tracking-widest text-center py-6">
              {classificationChars.length === 0 ? `Nenhum personagem com ficha em ${classificationVillage}.` : 'Nenhum personagem nessa faixa.'}
            </div>
          ) : (
            <div className="border border-tech-border/60 bg-black/30 divide-y divide-tech-border/40">
              {classificationFiltered.map(c => (
                <div key={c.name} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-sm ${c.pending ? 'text-tech-primary/70 italic' : 'text-white'}`}>{c.name}</span>
                    {c.dead && <Skull size={12} className="text-red-500 shrink-0" />}
                    {c.pending && (
                      <span className="text-tech-primary/40 text-[10px] uppercase tracking-wide">(pendente{c.clan ? ` — ${c.clan}` : ''})</span>
                    )}
                  </div>
                  <span className="text-tech-primary font-black text-sm">NC {c.nc}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      )}

      <div className="text-[10px] text-tech-primary/40 uppercase tracking-widest border-t border-tech-border pt-3">
        Personagens e arsenal acima refletem o Firestore em tempo real (nenhum recarregamento necessário). O uso de Storage é recalculado ao abrir esta página ou clicar em "Atualizar".
      </div>
    </div>
  );
};

export default AdminPanel;
