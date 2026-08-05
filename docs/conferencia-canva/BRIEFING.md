# Conferência Canva × Checklist — briefing de implementação

Objetivo: criar dentro deste app uma visualização que compara o **design do Canva**
(`DAHQCLRJQuM`, 288 páginas de arte de personagem) com a **checklist da Linha do Tempo**
(`imageChecklist`, `type: 'timeline'`), mostrando o que está feito, o que falta, e onde a
ordem dos dois diverge.

Já existe um protótipo funcionando fora do app (página estática publicada). Este documento
tem tudo que é preciso para reimplementar como página React aqui dentro, no visual do sistema.

---

## 1. O achado que motivou isso

A checklist e o Canva **estão fora de sincronia por um bloco deslocado**, não por erro de
marcação.

O bloco do **Shikatsu** (5 fases: Prólogo, Clássico, 1ª, 3ª, 5ª) está nas **páginas 218–222**
do Canva — entre o Shin e o Shikure — quando a checklist o espera nas **posições 168–172**,
logo depois do Madara. Consequência: os itens 173 a 222 caem 5 páginas antes do que a posição
sugere.

Foi por isso que a arte exibida em "Shikatsu — 1ª Temporada" era, na verdade, o
"Katsuo — 1ª Temporada".

Números com o mapeamento corrigido (validado em 3 ago 2026):

| | |
|---|---|
| Itens na checklist | 288 |
| Páginas no Canva | 288 |
| Conferem | 273 |
| Falta marcar (página tem arte, item pendente) | 15 |
| Marcado como feito mas em branco | **0** |
| Páginas com arte | 210 |
| Páginas em branco (a produzir) | 78 |

Zero itens do tipo "marcado mas vazio" é o principal indicador de que o mapeamento está certo:
não há nenhuma marcação falsa na checklist.

**Conserto definitivo:** mover as páginas 218–222 do Canva para a posição 168. Depois disso o
mapeamento vira identidade — veja `DESIGN_REORDENADO` em `mapeamento.ts`.

---

## 2. Arquivos deste pacote

| Arquivo | O que é |
|---|---|
| `mapeamento.ts` | Módulo pronto: `paginaDoItem(posicao)`, `estaForaDeOrdem`, `situacaoDoItem`. Copie para `data/` ou `utils/`. |
| `estado-paginas.csv` | `pagina;tinta` — 288 linhas. Densidade de tinta medida na exportação. `tinta > 0` = página tem arte. |
| `conferencia-snapshot.json` | Resultado esperado completo (totais, os 15 itens que faltam marcar, o bloco do Shikatsu, e os 288 itens resolvidos). Use como fixture de teste. |
| `paginas/001.jpg … 288.jpg` | Miniaturas 120×180 das 288 páginas, ~2 MB no total. Veja a seção 5 antes de usar. |

---

## 3. Como o estado das páginas foi medido

As 288 páginas foram exportadas do Canva em JPG e medida a fração de pixels com
luminância < 240 ("tinta"). A separação é limpa e sem casos ambíguos:

- **78 páginas com exatamente 0,00%** → em branco
- **210 páginas acima de 10%** → têm arte
- nenhuma no meio

Ou seja: `temArte = tinta > 0` é seguro. Não invente um limiar diferente.

Esse número **não depende de nomes** — é medição por página. Continua válido mesmo que o
mapeamento mude.

---

## 4. Modelo de dados a usar

A checklist já está em `imageChecklist` (ver `data/firestore.ts` →
`subscribeImageChecklist`). Para esta tela:

```ts
const itens = checklist
  .filter(i => i.type === 'timeline')
  .sort((a, b) => a.order - b.order);
// posicao = índice + 1  (1-indexado)
// personagem = item.temporada
// fase       = item.arco
```

Cruze com o estado das páginas:

```ts
const posicao = idx + 1;
const pagina = paginaDoItem(posicao);
const temArte = tintaPorPagina[pagina] > 0;
const situacao = situacaoDoItem(item.done, temArte);
```

**Não** reordene, não agrupe por `temporada` como se fosse temporada de verdade — em
`type: 'timeline'` esse campo guarda o nome do personagem. Agrupe por `item.temporada`
para formar as faixas por personagem, preservando a ordem de `order`.

---

## 5. Imagens — decida antes de codar

O protótipo embutiu as 288 miniaturas em base64 (~1 MB de HTML). **Não faça isso aqui.**
Este app tem Firebase Storage e o `ChecklistItem` já tem o campo `imageUrl`
("URL da imagem já produzida para este item").

Três caminhos, em ordem de preferência:

1. **Preencher `imageUrl`** nos itens da checklist com a arte correspondente e a tela passa a
   ler direto de lá. Resolve o problema de origem e serve também a aba Galeria.
2. **Subir as 288 miniaturas para o Storage** (há `scripts/migrate-images.mjs` como referência)
   e referenciar por número de página. Rápido, mas mantém a página do Canva como fonte.
3. **Sem miniaturas**, só o estado (feito / falta / em branco). A tela perde muito valor:
   o ponto de olhar a arte é justamente notar quando o nome não bate com a imagem.

Se for pelo caminho 2, as miniaturas em `paginas/` servem como estão. Elas foram geradas a
120×180 e q62 — bom para grade, apertado para ampliação. Para o modal de detalhe, exporte
maior.

---

## 6. Visual

Use os tokens que já existem em `tailwind.config.js` — nada de hex solto:

| Uso | Token |
|---|---|
| Fundo | `tech-bg` |
| Painel / célula | `tech-panel` |
| Confere / destaque / títulos | `tech-primary` |
| Falta marcar | `tech-secondary` |
| Bloco fora de ordem | `tech-accent` |
| Bordas | `tech-border`, `tech-dim` |

Essa tríade (`primary` / `secondary` / `accent`) foi verificada contra `tech-bg` para
daltonismo: separação ΔE 27 em protanopia e 33,9 em visão normal, contraste ≥ 3:1 nos três.
Pode usar com segurança.

**Mesmo assim, não sinalize estado só por cor.** No protótipo cada célula divergente leva
também hachura diagonal e um selo textual no canto. Mantenha esse encoding secundário — é o
que garante leitura em impressão, em daltonismo severo e em tela ruim.

Estrutura que funcionou bem (replique ou melhore):

- **Leitura de estado no topo** — os números da tabela da seção 1, em `font-mono`, tabular.
- **Mapa do desvio** — barra proporcional aos 288 itens com os três trechos
  (1–167 em ordem · 168–172 fora de ordem · 173–222 deslocados · 223–288 em ordem).
- **Grade tipo contact sheet** — uma faixa por personagem, células com a miniatura, a fase e
  **o número real da página no Canva** (não a posição na checklist — é isso que permite achar
  a página no documento).
- **Filtros** — tudo / confere / falta marcar / bloco fora de ordem / em branco, mais busca
  por personagem.
- **Detalhe ao clicar** — arte ampliada, posição, página real, o que a checklist diz, o que o
  Canva tem.
- **Vista de tabela** — mesma informação em `<table>`, para acessibilidade e para copiar.

---

## 7. Cuidados

**Não confie em teste de alinhamento de 1 bit.** O erro que originou tudo isso foi validar a
correspondência entre checklist e design comparando só "tem arte / em branco" por posição, com
um único deslocamento global. Com 78 brancos em 288 muita coisa coincide por acaso, e um bloco
de 5 páginas fora de lugar é invisível para esse teste. O mapeamento atual só foi fechado com
alinhamento de sequências (Needleman–Wunsch com penalidade de lacuna) **mais** confirmação
visual humana de duas âncoras.

**A identidade da arte não é verificável por código hoje.** As páginas do Canva não têm texto;
não há como afirmar que a arte da página X é do personagem Y sem alguém olhar. A tela deve
deixar isso explícito em vez de dar a impressão de que validou identidade. Se o campo
`imageUrl` for preenchido, esse problema desaparece — passa a existir vínculo declarado.

**Depois que o Canva for reordenado**, vire `DESIGN_REORDENADO = true` em `mapeamento.ts` e
confira que os totais continuam batendo (o snapshot muda: o bloco do Shikatsu deixa de ser
"fora de ordem").

---

## 8. Referência

O protótipo publicado (estático, fora do app):
https://claude.ai/code/artifact/e1acff00-b5cd-4d78-adf4-c33b2c9e5a94
