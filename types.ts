export interface Power {
  name: string;
  level: number | string;
}

export interface Stats {
  strength: number | string;
  dexterity: number | string;
  agility: number | string;
  intelligence: number | string;
  spirit: number | string;
  vigor: number | string;
  perception: number | string;
}

export interface Technique {
  name: string;
  classification?: string;
  nature?: string;
  description?: string;
  destruction?: string;
  history?: string;
  status?: string;
  image?: string;
}

export interface GalleryImage {
  url: string;
  caption?: string;
  category: 'era' | 'evento';
  /** Só relevante para category "evento": qual temporada/arco (1ª a 5ª Temporada). */
  season?: string;
}

export const EVENT_SEASONS = ['1ª Temporada', '2ª Temporada', '3ª Temporada', '4ª Temporada', '5ª Temporada'] as const;

// Item da checklist de produção de imagens (organizada por Temporada > Arco > Subarco).
// Também reaproveitado para a Linha do Tempo (type: "timeline"): nesse caso
// `temporada` guarda o nome do personagem e `arco` guarda a fase da linha do tempo.
export interface ChecklistItem {
  docId?: string;
  /** Ausente ou "evento" = checklist de Eventos (padrão). "timeline" = Linha do Tempo. */
  type?: 'evento' | 'timeline';
  temporada: string;
  arco: string;
  subarco?: string;
  name: string;
  /** Ordem global de exibição (sequência única entre todos os itens). */
  order: number;
  done: boolean;
  /** Item "Será adicionado em breve": ainda não tem conteúdo definido, não é marcável. */
  placeholder?: boolean;
  /** Nome de quem marcou o item como feito (só preenchido quando done=true). */
  doneBy?: string | null;
  /** URL da imagem já produzida para este item (exibida na aba Galeria). */
  imageUrl?: string | null;
}

// Rascunho livre de personagem em desenvolvimento (aba "Protótipo" do Painel): o Pedro manda
// imagens/textos aos poucos, antes de o personagem virar ficha oficial ou entrar em
// PENDING_CHARACTERS. Um card por protótipo (título = nome do personagem), que pode acumular
// várias imagens e texto ao longo do tempo. Apagado por completo ao fim do RPG.
export interface PrototypeEntry {
  docId?: string;
  title: string;
  /** Vila do personagem (Konohagakure, Kirigakure, Sunagakure, Iwagakure ou Kumogakure) — organiza a aba em sub-abas por vila. */
  village: string;
  text?: string;
  images: string[];
  /** Ordem de exibição (mais recente por último). */
  order: number;
}

export interface Weapon {
  name: string;
  classification?: string;
  nature?: string;
  origin?: string;
  description?: string;
  destruction?: string;
  history?: string;
  status?: string;
  image?: string;
}

export interface Character {
  docId?: string; // ID do documento no Firestore (slug do nome)
  id: number;
  name: string;
  clan: string;
  categories: string[];
  titles: string[];
  nc: number;
  position: string;
  role: string;
  description: string;
  hp: number;
  chakra: number;
  image: string;
  stats: Stats;
  powers: Power[];
  aptitudes: string[];
  isDead?: boolean;
  killedBy?: string;
  techniques?: Technique[];
  arsenal?: number[];
  gallery?: GalleryImage[];
  /** Temporada da 1ª aparição na história (padrão: "Prólogo"). Fases antes disso não existem. */
  timelineAppearance?: string;
  /** Temporada em que o personagem morreu, se aplicável — nada depois disso existe. */
  timelineDeath?: string | null;
  /** Temporadas em que o personagem não apareceu (buraco pontual, volta depois). */
  timelineSkipped?: string[];
  /** Boss final ou similar: não tem Linha do Tempo nenhuma, de propósito. */
  timelineExcluded?: boolean;
  /** Vila de nascença (única, mesmo quando `categories` lista mais de uma vila de afiliação/atuação). */
  birthVillage?: string;
}

export const SEASON_ORDER = ['Prólogo', 'Clássico', '1ª Temporada', '2ª Temporada', '3ª Temporada', '4ª Temporada', '5ª Temporada'] as const;

// Nomes/marcos das temporadas — PROVISÓRIO, só referência (não usar em outro lugar do app).
export const SEASON_LORE: { season: string; title: string; start: string; end: string }[] = [
  { season: 'Prólogo', title: 'O Início', start: '1ª Guerra Ninja', end: 'Fundação de Konoha e Primeiras Gerações' },
  { season: 'Clássico', title: 'Um mundo de Paz', start: 'Início da Academia Ninja', end: 'Fim da Academia Ninja' },
  { season: '1ª Temporada', title: 'Prefácios', start: 'Lámen com Nishinoya', end: 'Hiato Pós Exame Chunin' },
  { season: '2ª Temporada', title: 'A Primeira Queda', start: 'Reencontro de Kaito, Oddy, Katsumi e Najin', end: 'Luta contra Omega' },
  { season: '3ª Temporada', title: 'Ecos da Dor', start: 'Morte de Nishinoya', end: 'Treinamento com Kai' },
  { season: '4ª Temporada', title: 'A Última Esperança', start: 'Volta do Treinamento', end: 'Luta contra os Kages' },
  { season: '5ª Temporada', title: '', start: 'Chegada a Sunagakure', end: '(em andamento)' },
];

// Personagens que já existem na história mas ainda não foram cadastrados no Banco de Dados.
// Baseado na lista mestre que o Pedro mantém à parte — atualizar conforme ele for adicionando.
// `role` é só pra lembrete (parentesco/cargo), não é dado oficial de ficha. `nc` é opcional —
// só preenchido quando o Pedro já decidiu o NC do personagem antes de ele virar ficha oficial.
export const PENDING_CHARACTERS: { village: string; entries: { name: string; role?: string; dead?: boolean; nc?: number }[] }[] = [
  {
    village: 'Konohagakure',
    entries: [
      { name: 'Amai Inuzuka', role: 'Mãe de Najin', nc: 25 },
      { name: 'Kawarama Senju', role: 'Pai de Nishinoya', dead: true, nc: 28 },
      { name: 'Sakura Namizake', role: 'Mãe de Nishinoya', dead: true, nc: 26 },
      { name: 'Mito Uzumaki', role: 'Esposa de Hashirama', dead: true, nc: 28 },
      { name: 'Hiruzen Sarutobi', role: 'Pai de Shoei e Apollo', nc: 28 },
      { name: 'Hina Sarutobi', role: 'Mãe de Shoei e Apollo', nc: 24 },
      { name: 'Oogway Uchiha', role: 'Pai de Sho', nc: 30 },
      { name: 'Konan Uchiha', role: 'Mãe de Oddy', nc: 24 },
      { name: 'Inazuma Uchiha', role: 'Filho do Velho, morto por Beta, descartado pela OCA', dead: true, nc: 14 },
      { name: 'Shikado Nara', role: 'Pai de Shikaki e Shikatsu, morto por Hades', dead: true, nc: 26 },
      { name: 'Kurai Nara', role: 'Mãe de Shikaki e Shikatsu, morta por Hades', dead: true, nc: 26 },
      { name: 'Iwaki Haruno', role: 'Pai de Yui, ensinou Doton a Kaito e morto pelo Nagare', dead: true, nc: 18 },
      { name: 'Hina Haruno', role: 'Mãe de Yui', nc: 16 },
      { name: 'Yui Haruno', role: 'Criança Prodígio', nc: 8 },
      { name: 'Renji Hyuga', role: 'Irmão de Ryuta, treinou Katsumi e morto pelo Furyuzan', dead: true, nc: 16 },
      { name: 'Minoru Hyuga', role: 'Pai de Hoshiro, Kai e Haruki, morto por Maldição do Fujogan', dead: true, nc: 30 },
      { name: 'Ashina Uzumaki', role: 'Pai de Mito, Yumi e Naomi, morreu selando Kurama em Naomi', dead: true, nc: 30 },
    ],
  },
  {
    village: 'Kirigakure',
    entries: [
      { name: 'Murasame Hoshigaki', role: 'Mãe de Kazuki, morta por Ganmasen', dead: true, nc: 18 },
      { name: 'Ganmaren Yuki', role: 'Grande Almirante da Marinha, comandante supremo das três frotas; irmão de Ganmasen', nc: 30 },
      { name: 'Amakuro Kozuki', role: 'Almirante da 1ª Frota (Kraken)', nc: 28 },
      { name: 'Seiran Kirisame', role: 'Vice-Almirante da 1ª Frota (Kraken)', nc: 28 },
      { name: 'Kōga Kirisame', role: 'Capitão de Frota da 1ª Frota (Kraken)', nc: 24 },
      { name: 'Nao Shiosaki', role: 'Capitão-Tenente da 1ª Frota (Kraken)', nc: 20 },
      { name: 'Raizen Kuroshio', role: 'Almirante da 2ª Frota (Leviatã)', nc: 28 },
      { name: 'Genzō Umikage', role: 'Vice-Almirante da 2ª Frota (Leviatã)', nc: 26 },
      { name: 'Kaien Arashio', role: 'Capitão de Frota da 2ª Frota (Leviatã)', nc: 22 },
      { name: 'Suiren Shiranami', role: 'Capitão-Tenente da 2ª Frota (Leviatã)', nc: 20 },
      { name: 'Rinako Kuroshio', role: 'Almirante da 3ª Frota (Megalodon)', nc: 28 },
      { name: 'Ayame Sazanami', role: 'Vice-Almirante da 3ª Frota (Megalodon)', nc: 26 },
      { name: 'Mirei Sazanami', role: 'Capitã de Frota da 3ª Frota (Megalodon)', nc: 22 },
      { name: 'Tōma Umikage', role: 'Capitão-Tenente da 3ª Frota (Megalodon)', nc: 20 },
      // 4ª Frota (Jörmungandr) — Almirante é o Ganmasen Yuki, que já tem ficha própria (não entra aqui).
      { name: 'Raizuki Hoshigaki', role: 'Pai de Kazuki, morto por Ganmasen; Vice-Almirante da 4ª Frota (Jörmungandr)', dead: true, nc: 28 },
      { name: 'Mei Yuki', role: 'Filha de Ganmasen, morta por Nagare; Capitã de Frota da 4ª Frota (Jörmungandr)', dead: true, nc: 22 },
      { name: 'Himari Yuki', role: 'Filho de Ganmasen, morto por Nagare; Capitão-Tenente da 4ª Frota (Jörmungandr)', dead: true, nc: 20 },
    ],
  },
  {
    village: 'Kumogakure',
    entries: [
      { name: 'Inazuma Kazuchi', role: 'Irmão mais velho de Yoru', nc: 26 },
      { name: 'Raiden Kurokumo', role: 'Criança prodígio', nc: 8 },
    ],
  },
  {
    village: 'Iwagakure',
    entries: [
      { name: 'Oryo Soryo', role: 'Mestre do Koton, Pai de Kenma e Líder da linhagem vermelha (Espírito)', nc: 30 },
      { name: 'Iwana Soryo', role: 'Mestre do Senjutsu e Mãe de Kenma', nc: 26 },
      { name: 'Bilal Bakuren', role: 'Criança Prodígio', nc: 8 },
      { name: 'Iwana Bakuren', role: 'Mãe de Bilal', nc: 16 },
      { name: 'Banjin Bakuren', role: 'Pai de Bilal', nc: 20 },
      { name: 'Iwato Kamizuru', role: 'Mestre das Abelhas e Líder da linhagem verde (Corpo)', nc: 27 },
      { name: 'Sora Ganseki', role: 'Mestre de Genjutsu pelas vibrações do solo e Líder da linhagem azul (Alma)', nc: 27 },
      { name: 'Sekio Ishi', role: 'Rei dos Samurai', nc: 30 },
    ],
  },
];