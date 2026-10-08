import type { ParametroCena } from './estado';

/**
 * ROTEIRO DA JORNADA — fonte única do conteúdo e do ritmo.
 *
 * O tempo é medido em "unidades de rolagem" (1 unidade = VH_POR_UNIDADE % da altura da tela).
 * Cada cena tem:
 *  - camera: quadro onde a câmera chega (depois de `transicao` unidades);
 *  - deriva: quadro opcional para onde a câmera desliza devagar até o fim da cena;
 *  - textos: blocos que aparecem e somem (posição na tela, rótulo, título, texto, dado);
 *  - efeitos: parâmetros da cena 3D animados pela rolagem (ver estado.ts).
 * Os tempos de `entra`, `sai`, `de` e `ate` são relativos ao início da cena.
 */

export type V3 = [number, number, number];
export type Quadro = { pos: V3; alvo: V3; fov?: number };
export type Posicao = 'centro' | 'esquerda' | 'direita' | 'base';

export type Texto = {
  posicao: Posicao;
  rotulo?: string;
  titulo?: string;
  texto?: string;
  dado?: { valor: string; legenda: string };
  dica?: string;
  creditos?: string[];
  /** início da entrada (padrão: logo após a câmera chegar) */
  entra?: number;
  /** início da saída (padrão: perto do fim da cena); null = nunca sai */
  sai?: number | null;
};

export type Efeito = {
  parametro: ParametroCena;
  de: number;
  para: number;
  inicio: number;
  fim: number;
  ease?: string;
};

export type Cena = {
  id: string;
  capitulo: string;
  duracao: number;
  transicao?: number;
  /** curva da transição (padrão power2.inOut); a deriva é sempre linear */
  ease?: string;
  camera: Quadro;
  deriva?: Quadro;
  textos?: Texto[];
  efeitos?: Efeito[];
};

export const VH_POR_UNIDADE = 90;

export const CAPITULOS = [
  { id: 'inicio', nome: 'Início' },
  { id: 'origem', nome: 'Origem' },
  { id: 'exploracao', nome: 'Exploração' },
  { id: 'perfuracao', nome: 'Perfuração' },
  { id: 'extracao', nome: 'Extração' },
  { id: 'producao', nome: 'Produção' },
  { id: 'transporte', nome: 'Transporte' },
  { id: 'refino', nome: 'Refino' },
  { id: 'consumo', nome: 'Consumo' },
  { id: 'desafio', nome: 'Desafio' },
] as const;

// Torre de destilação e refinaria (ver cena/Costa.tsx)
export const REFINARIA = { x: -27600, z: 0 };
export const TORRE = { x: -27560, z: 40, altura: 62 };

export const CENAS: Cena[] = [
  // ------------------------------------------------------------ INÍCIO
  {
    id: 'abertura', capitulo: 'inicio', duracao: 1.4,
    // olhando um pouco para baixo: a FPSO fica acima do título e o mar reflete as luzes embaixo
    camera: { pos: [760, 24, 1700], alvo: [-40, -230, 0], fov: 32 },
    deriva: { pos: [600, 22, 1460], alvo: [-40, -215, 0], fov: 32 },
    textos: [{
      posicao: 'centro', entra: -1, sai: 0.55,
      rotulo: 'Seminário de Geografia · Fontes de energia',
      titulo: 'Petróleo',
      texto: 'Da rocha ao mundo. Role a página para descer 7 mil metros e acompanhar, em 3D, cada etapa da produção.',
      dica: 'Role para começar',
    }],
  },
  {
    id: 'chegada', capitulo: 'inicio', duracao: 1.9, transicao: 1.1,
    // alvo à esquerda da FPSO (lado +X/+Z): o navio fica à direita do texto
    camera: { pos: [430, 75, -470], alvo: [60, 14, 57], fov: 40 },
    deriva: { pos: [330, 52, -380], alvo: [34, 6, 33], fov: 40 },
    textos: [{
      posicao: 'esquerda',
      rotulo: 'Bacia de Santos · pré-sal',
      titulo: '300 km mar adentro',
      texto: 'Plataformas como esta tiram petróleo de rochas que estão a até 7 mil metros abaixo do nível do mar, no chamado pré-sal.',
      dado: { valor: '≈ 80%', legenda: 'do petróleo e do gás produzidos no Brasil em 2025 vieram do pré-sal (ANP)' },
    }],
  },
  {
    id: 'descida', capitulo: 'inicio', duracao: 2.0, transicao: 0.9,
    camera: { pos: [-60, -45, -190], alvo: [-10, -170, -40], fov: 45 },
    deriva: { pos: [-180, -1640, -330], alvo: [-520, -1990, -60], fov: 45 },
    textos: [{
      posicao: 'direita',
      rotulo: 'Descida',
      titulo: '2 mil metros de água',
      texto: 'A luz do sol não passa dos primeiros 200 metros. No fundo, a água fica perto de 4 °C e a pressão é cerca de 200 vezes maior que na superfície.',
    }],
  },
  // ------------------------------------------------------------ 1. ORIGEM
  {
    id: 'formacao', capitulo: 'origem', duracao: 2.2, transicao: 1.5,
    camera: { pos: [-700, -4300, -9300], alvo: [-700, -4350, 100], fov: 40 },
    deriva: { pos: [-700, -4700, -8400], alvo: [-700, -4800, 100], fov: 40 },
    efeitos: [
      { parametro: 'corte', de: 0, para: 1, inicio: 0.15, fim: 1.3, ease: 'power1.inOut' },
      { parametro: 'legendas', de: 0, para: 1, inicio: 1.3, fim: 1.6 },
    ],
    textos: [{
      posicao: 'esquerda',
      rotulo: '1 · Origem',
      titulo: 'Como o petróleo se formou',
      texto: 'Há mais de 100 milhões de anos, quando a América do Sul e a África se separavam, grandes lagos acumularam no fundo restos de algas e micro-organismos.',
    }],
  },
  {
    id: 'geracao', capitulo: 'origem', duracao: 1.7, transicao: 0.9,
    camera: { pos: [-1300, -6600, -3700], alvo: [-1300, -6650, 100], fov: 40 },
    deriva: { pos: [-1100, -6450, -3400], alvo: [-1100, -6500, 100], fov: 40 },
    efeitos: [{ parametro: 'geracao', de: 0, para: 1, inicio: 0.5, fim: 1.6 }],
    textos: [{
      posicao: 'esquerda',
      rotulo: '1 · Origem',
      titulo: 'Calor, pressão e tempo',
      texto: 'Coberta por novas camadas de sedimentos, essa matéria orgânica foi aquecida e comprimida durante milhões de anos até se transformar em petróleo e gás.',
    }],
  },
  {
    id: 'presal', capitulo: 'origem', duracao: 1.9, transicao: 0.9,
    camera: { pos: [-500, -5300, -4300], alvo: [-500, -5250, 100], fov: 40 },
    deriva: { pos: [-300, -5250, -3900], alvo: [-300, -5200, 100], fov: 40 },
    textos: [{
      posicao: 'esquerda',
      rotulo: '1 · Origem',
      titulo: 'Preso sob o sal',
      texto: 'O óleo subiu pelos poros das rochas até ficar retido numa rocha porosa, como água numa esponja. Por cima, uma camada de sal de cerca de 2 mil metros funciona como tampa.',
      dado: { valor: '≈ 2.000 m', legenda: 'de sal sobre o reservatório' },
    }],
  },
  // ------------------------------------------------------------ 2. EXPLORAÇÃO
  {
    id: 'sismica', capitulo: 'exploracao', duracao: 2.0, transicao: 1.2,
    camera: { pos: [-4700, -3150, -10200], alvo: [-4300, -3000, 100], fov: 40 },
    deriva: { pos: [-4500, -3150, -9800], alvo: [-4200, -3050, 100], fov: 40 },
    efeitos: [
      { parametro: 'legendas', de: 1, para: 0, inicio: 0, fim: 0.4 },
      { parametro: 'sismica', de: 0, para: 0.62, inicio: 0.9, fim: 2.0, ease: 'none' },
    ],
    textos: [{
      posicao: 'direita',
      rotulo: '2 · Exploração',
      titulo: 'Ouvir as rochas',
      texto: 'Para encontrar o petróleo, um navio de pesquisa dispara pulsos de som. Cada camada de rocha devolve um eco, captado por cabos com sensores arrastados pelo navio.',
    }],
  },
  {
    id: 'sismica-imagem', capitulo: 'exploracao', duracao: 1.6,
    camera: { pos: [-4500, -3150, -9800], alvo: [-4200, -3050, 100], fov: 40 },
    deriva: { pos: [-4100, -3300, -9500], alvo: [-3900, -3200, 100], fov: 40 },
    efeitos: [
      { parametro: 'sismica', de: 0.62, para: 1, inicio: 0, fim: 1.5, ease: 'none' },
      { parametro: 'imagem', de: 0, para: 1, inicio: 0.45, fim: 1.3 },
    ],
    textos: [{
      posicao: 'direita', entra: 0.15,
      rotulo: '2 · Exploração',
      texto: 'Computadores transformam os ecos em imagens 3D do subsolo, uma espécie de ultrassom da Terra. Mas só a perfuração confirma se há petróleo.',
    }],
  },
  // ------------------------------------------------------------ 3. PERFURAÇÃO
  {
    id: 'perfuracao', capitulo: 'perfuracao', duracao: 2.1, transicao: 1.2,
    camera: { pos: [2900, -3300, -10200], alvo: [2700, -3150, 100], fov: 40 },
    deriva: { pos: [2800, -3500, -9600], alvo: [2700, -3400, 100], fov: 40 },
    efeitos: [
      { parametro: 'imagem', de: 1, para: 0, inicio: 0, fim: 0.6 },
      { parametro: 'broca', de: 0, para: 0.55, inicio: 0.9, fim: 2.1, ease: 'none' },
    ],
    textos: [{
      posicao: 'esquerda',
      rotulo: '3 · Perfuração',
      titulo: 'Atravessar 5 km de rocha e sal',
      texto: 'Um navio-sonda gira uma broca na ponta de uma coluna de tubos de aço, que desce 2 km de água e avança rocha adentro.',
    }],
  },
  {
    id: 'perfuracao-poco', capitulo: 'perfuracao', duracao: 1.9, transicao: 0.9,
    camera: { pos: [2700, -5650, -4300], alvo: [2700, -5600, 100], fov: 40 },
    deriva: { pos: [2650, -5900, -4000], alvo: [2700, -5850, 100], fov: 40 },
    efeitos: [
      { parametro: 'broca', de: 0.55, para: 1, inicio: 0, fim: 1.5, ease: 'none' },
      { parametro: 'pocos', de: 0, para: 1, inicio: 1.4, fim: 1.9 },
    ],
    textos: [{
      posicao: 'direita',
      rotulo: '3 · Perfuração',
      titulo: 'Lama, aço e cimento',
      texto: 'Uma lama especial resfria a broca e traz os fragmentos de rocha para cima. O poço é revestido com tubos de aço cimentados e, no fundo do mar, válvulas de segurança (o BOP) evitam vazamentos.',
      dado: { valor: '≈ 7 km', legenda: 'do nível do mar até o óleo, somando água, rocha e sal' },
    }],
  },
  // ------------------------------------------------------------ 4. EXTRAÇÃO
  {
    id: 'volta', capitulo: 'extracao', duracao: 1.3, transicao: 1.3,
    // sobe do subsolo para o mar, ainda longe da face do corte, enquanto o fundo do mar reaparece
    camera: { pos: [-980, -1640, -2500], alvo: [-850, -1995, -55], fov: 42 },
    efeitos: [{ parametro: 'corte', de: 1, para: 0, inicio: 0.1, fim: 1.2, ease: 'power1.inOut' }],
  },
  {
    id: 'arvore', capitulo: 'extracao', duracao: 1.7, transicao: 0.8,
    camera: { pos: [-829, -1990, -84], alvo: [-850, -1996, -55], fov: 45 },
    deriva: { pos: [-824, -1991, -78], alvo: [-850, -1996, -55], fov: 45 },
    textos: [{
      posicao: 'esquerda',
      rotulo: '4 · Extração',
      titulo: 'A árvore de natal',
      texto: 'Com o poço pronto, instala-se no fundo do mar a árvore de natal molhada: um conjunto de válvulas que abre, fecha e controla a saída do petróleo.',
    }],
  },
  {
    id: 'rov', capitulo: 'extracao', duracao: 1.5, transicao: 0.6,
    camera: { pos: [-880, -1990, -80], alvo: [-850, -1997, -55], fov: 45 },
    deriva: { pos: [-886, -1988, -66], alvo: [-850, -1997, -55], fov: 45 },
    textos: [{
      posicao: 'direita',
      rotulo: '4 · Extração',
      texto: 'Toda a montagem é feita por robôs submarinos (ROVs), comandados da plataforma: nenhum mergulhador chega a essa profundidade.',
    }],
  },
  {
    id: 'subida', capitulo: 'extracao', duracao: 1.7, transicao: 0.8,
    // atrás da árvore, olhando pelo duto até onde o riser começa a subir
    camera: { pos: [-905, -1976, -102], alvo: [-720, -1985, -48], fov: 48 },
    deriva: { pos: [-880, -1970, -112], alvo: [-690, -1965, -48], fov: 48 },
    efeitos: [{ parametro: 'fluxo', de: 0, para: 0.42, inicio: 0, fim: 1.7, ease: 'none' }],
    textos: [{
      posicao: 'esquerda',
      rotulo: '4 · Extração',
      titulo: 'A subida',
      texto: 'A pressão do próprio reservatório empurra para cima uma mistura de óleo, gás e água, que corre por dutos no fundo do mar até os risers.',
    }],
  },
  {
    id: 'risers', capitulo: 'extracao', duracao: 2.0, transicao: 0.6,
    // perto do trecho com flutuadores (a "onda" do riser), depois sobe até o casco da FPSO
    camera: { pos: [-400, -1250, -150], alvo: [-300, -1090, -40], fov: 48 },
    deriva: { pos: [-130, -90, -170], alvo: [-30, -5, -35], fov: 45 },
    efeitos: [{ parametro: 'fluxo', de: 0.42, para: 1, inicio: 0, fim: 2.0, ease: 'none' }],
    textos: [{
      posicao: 'direita',
      rotulo: '4 · Extração',
      texto: 'Os risers, dutos flexíveis, sobem 2 km até a plataforma. Quando a pressão do reservatório cai, injeta-se água ou gás para continuar empurrando o óleo.',
    }],
  },
  // ------------------------------------------------------------ 5. PRODUÇÃO
  {
    id: 'fpso', capitulo: 'producao', duracao: 1.9, transicao: 1.0,
    camera: { pos: [-40, 70, -210], alvo: [10, 28, -15], fov: 42 },
    deriva: { pos: [60, 92, -195], alvo: [20, 30, -15], fov: 42 },
    textos: [{
      posicao: 'esquerda',
      rotulo: '5 · Produção',
      titulo: 'Uma fábrica sobre o mar',
      texto: 'A FPSO é um navio-plataforma que produz, processa, armazena e transfere o petróleo. Mais de cem pessoas vivem e trabalham a bordo, em turnos.',
      dado: { valor: '≈ 300 m', legenda: 'de comprimento, quase três campos de futebol' },
    }],
  },
  {
    id: 'separador', capitulo: 'producao', duracao: 1.9, transicao: 1.0,
    camera: { pos: [13, 42, -41], alvo: [17.5, 33.5, -16], fov: 42 },
    deriva: { pos: [19, 43, -43], alvo: [17.5, 33.5, -16], fov: 42 },
    efeitos: [{ parametro: 'separador', de: 0, para: 1, inicio: 0.9, fim: 1.6 }],
    textos: [{
      posicao: 'esquerda',
      rotulo: '5 · Produção',
      titulo: 'Separar para aproveitar',
      texto: 'No separador, a mistura descansa e se divide pelo peso: o gás sobe, a água desce e o óleo fica no meio.',
    }],
  },
  {
    id: 'destinos', capitulo: 'producao', duracao: 1.8,
    camera: { pos: [19, 43, -43], alvo: [17.5, 33.5, -16], fov: 42 },
    deriva: { pos: [30, 49, -50], alvo: [18, 32, -16], fov: 42 },
    efeitos: [{ parametro: 'separador', de: 1, para: 0, inicio: 1.4, fim: 1.8 }],
    textos: [{
      posicao: 'esquerda', entra: 0.1,
      rotulo: '5 · Produção',
      texto: 'O óleo é tratado e guardado nos tanques do casco. O gás é comprimido: parte gera a energia da plataforma, parte volta ao reservatório ou segue por gasoduto até a costa. A água é tratada antes de voltar ao mar.',
    }],
  },
  {
    id: 'tocha', capitulo: 'producao', duracao: 1.7, transicao: 1.0,
    camera: { pos: [92, 58, -100], alvo: [147, 112, 0], fov: 40 },
    deriva: { pos: [85, 52, -112], alvo: [147, 114, 0], fov: 40 },
    textos: [{
      posicao: 'esquerda',
      rotulo: '5 · Produção',
      titulo: 'A tocha',
      texto: 'A chama no alto da torre queima, por segurança, o gás que não pode ser aproveitado naquele momento.',
    }],
  },
  // ------------------------------------------------------------ 6. TRANSPORTE
  {
    id: 'aliviador', capitulo: 'transporte', duracao: 1.9, transicao: 1.2,
    camera: { pos: [-185, 40, -150], alvo: [-375, 2, 0], fov: 40 },
    deriva: { pos: [-205, 36, -168], alvo: [-390, 2, 0], fov: 40 },
    textos: [{
      posicao: 'esquerda',
      rotulo: '6 · Transporte',
      titulo: 'O navio aliviador',
      texto: 'A cada poucos dias, um navio aliviador se conecta à popa da plataforma por uma mangueira e recebe até 1 milhão de barris de óleo.',
    }],
  },
  {
    id: 'rumo-costa', capitulo: 'transporte', duracao: 2.4, transicao: 0.8,
    // acompanha o aliviador que já partiu carregado (ver posicaoAliviadorEmViagem em cena/Navios.tsx)
    camera: { pos: [-1180, 120, -760], alvo: [-1400, 10, -300], fov: 40 },
    deriva: { pos: [-20180, 120, -760], alvo: [-20400, 10, -300], fov: 40 },
    efeitos: [{ parametro: 'aliviador', de: 0, para: 1, inicio: 0.8, fim: 2.4, ease: 'none' }],
    textos: [{
      posicao: 'base',
      rotulo: '6 · Transporte',
      titulo: 'Rumo à costa',
      texto: 'O óleo segue para terminais no litoral e, de lá, para as refinarias. Parte é exportada: o Brasil está entre os dez maiores produtores de petróleo do mundo.',
    }],
  },
  // ------------------------------------------------------------ 7. REFINO
  {
    id: 'refinaria', capitulo: 'refino', duracao: 2.0, transicao: 1.4,
    camera: { pos: [-26860, 105, -560], alvo: [-27640, 18, 40], fov: 42 },
    deriva: { pos: [-26990, 88, -470], alvo: [-27640, 18, 40], fov: 42 },
    textos: [{
      posicao: 'esquerda',
      rotulo: '7 · Refino',
      titulo: 'A refinaria',
      texto: 'O petróleo cru não serve direto nos motores. Na refinaria, ele é aquecido a quase 400 °C e entra, já como vapor, na torre de destilação.',
    }],
  },
  {
    id: 'torre', capitulo: 'refino', duracao: 2.0, transicao: 1.2,
    // o alvo fica um pouco à esquerda da torre: ela aparece à direita do centro, longe do texto
    camera: { pos: [TORRE.x + 62, 42, TORRE.z - 72], alvo: [TORRE.x + 8, 34, TORRE.z + 7], fov: 42 },
    deriva: { pos: [TORRE.x + 72, 38, TORRE.z - 60], alvo: [TORRE.x + 7, 33, TORRE.z + 8], fov: 42 },
    efeitos: [{ parametro: 'torre', de: 0, para: 1, inicio: 0.9, fim: 1.7 }],
    textos: [{
      posicao: 'esquerda',
      rotulo: '7 · Refino',
      titulo: 'Cada fração na sua altura',
      texto: 'Subindo pela torre, o vapor esfria e se condensa em andares diferentes: no alto saem os derivados mais leves; embaixo, os mais pesados.',
    }],
  },
  {
    id: 'craqueamento', capitulo: 'refino', duracao: 1.5,
    camera: { pos: [TORRE.x + 72, 38, TORRE.z - 60], alvo: [TORRE.x + 7, 33, TORRE.z + 8], fov: 42 },
    deriva: { pos: [TORRE.x + 95, 55, TORRE.z - 40], alvo: [TORRE.x - 13, 30, TORRE.z + 20], fov: 42 },
    efeitos: [{ parametro: 'torre', de: 1, para: 0, inicio: 1.1, fim: 1.5 }],
    textos: [{
      posicao: 'esquerda', entra: 0.1,
      rotulo: '7 · Refino',
      texto: 'Outras unidades quebram as frações pesadas em leves (craqueamento) e retiram o enxofre, para combustíveis menos poluentes.',
    }],
  },
  // ------------------------------------------------------------ 8. CONSUMO
  {
    id: 'distribuicao', capitulo: 'consumo', duracao: 2.0, transicao: 1.4,
    camera: { pos: [-26200, 1100, -2700], alvo: [-29400, 0, 1700], fov: 45 },
    deriva: { pos: [-26000, 950, -2500], alvo: [-29400, 0, 1700], fov: 45 },
    efeitos: [{ parametro: 'rede', de: 0, para: 1, inicio: 0.8, fim: 2.0, ease: 'none' }],
    textos: [{
      posicao: 'esquerda',
      rotulo: '8 · Consumo',
      titulo: 'Da refinaria ao dia a dia',
      texto: 'Dutos, navios, trens e caminhões levam os derivados até distribuidoras, indústrias e postos de combustível.',
    }],
  },
  {
    id: 'usos', capitulo: 'consumo', duracao: 1.7,
    camera: { pos: [-26000, 950, -2500], alvo: [-29400, 0, 1700], fov: 45 },
    deriva: { pos: [-25700, 820, -2350], alvo: [-29400, 0, 1700], fov: 45 },
    textos: [{
      posicao: 'direita', entra: 0.1,
      rotulo: '8 · Consumo',
      texto: 'Gasolina, diesel e querosene movem carros, caminhões e aviões. O GLP é o gás de cozinha. A nafta vira plásticos e tecidos sintéticos. O resíduo vira asfalto.',
    }],
  },
  // ------------------------------------------------------------ DESAFIO E FIM
  {
    id: 'impacto', capitulo: 'desafio', duracao: 2.0, transicao: 1.3,
    camera: { pos: [-24300, 260, -2300], alvo: [-27500, 120, 500], fov: 42 },
    deriva: { pos: [-24000, 300, -2600], alvo: [-27500, 120, 500], fov: 42 },
    textos: [{
      posicao: 'esquerda',
      rotulo: 'Desafio',
      titulo: 'Energia com custo',
      texto: 'Queimar derivados de petróleo libera CO₂, principal gás do aquecimento global, e vazamentos ameaçam a vida marinha. O desafio é produzir com segurança e depender cada vez menos dele.',
      dado: { valor: '≈ 35%', legenda: 'da energia ofertada no Brasil vem do petróleo e derivados (EPE, 2023)' },
    }],
  },
  {
    id: 'final', capitulo: 'desafio', duracao: 2.0, transicao: 1.4,
    camera: { pos: [-22800, 900, -5400], alvo: [-27500, 300, 0], fov: 40 },
    deriva: { pos: [-22500, 1000, -5700], alvo: [-27500, 300, 0], fov: 40 },
    textos: [{
      posicao: 'centro', sai: null,
      rotulo: 'Seminário de Geografia · Fontes de energia',
      titulo: 'Petróleo',
      texto: 'Da rocha ao mundo.',
      creditos: ['Felipe Barrence Sonsin · 2º ano do Ensino Médio', 'Fontes: Petrobras, ANP, EPE e Coppe/UFRJ'],
    }],
  },
];

// ------------------------------------------------------------------ tempos derivados

export type Marca = { cena: Cena; inicio: number; fim: number };

export const MARCAS: Marca[] = [];
/** Quadros de câmera em ordem; a câmera vai do quadro i-1 ao i entre `inicio` e `tempo`. */
export const QUADROS: (Quadro & { inicio: number; tempo: number; ease: string })[] = [];

{
  let t = 0;
  for (const c of CENAS) {
    const transicao = c.transicao ?? 0;
    if (QUADROS.length === 0) {
      QUADROS.push({ ...c.camera, inicio: 0, tempo: 0, ease: 'none' });
    } else if (transicao > 0) {
      QUADROS.push({ ...c.camera, inicio: t, tempo: t + transicao, ease: c.ease ?? 'power2.inOut' });
    } else {
      // sem transição: a câmera já está aqui (o quadro anterior deve ser igual a este)
      QUADROS.push({ ...c.camera, inicio: t, tempo: t + 0.001, ease: 'none' });
    }
    if (c.deriva) {
      QUADROS.push({ ...c.deriva, inicio: t + transicao, tempo: t + c.duracao, ease: 'none' });
    }
    MARCAS.push({ cena: c, inicio: t, fim: t + c.duracao });
    t += c.duracao;
  }
}

export const DURACAO = MARCAS[MARCAS.length - 1].fim;

const mesmoPonto = (a: V3, b: V3) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

/**
 * Quadros de câmera sem repetições: uma cena sem transição começa exatamente onde a anterior
 * terminou, então o quadro dela é o mesmo da deriva anterior e sai da lista.
 */
export const CHAVES = QUADROS.filter((q, i) => {
  if (i === 0) return true;
  const a = QUADROS[i - 1];
  return !(mesmoPonto(a.pos, q.pos) && mesmoPonto(a.alvo, q.alvo) && (a.fov ?? 40) === (q.fov ?? 40));
});

// ------------------------------------------------------------------ câmera com velocidade contínua

/** Quanto a imagem "anda" entre dois quadros: deslocamento relativo à distância do assunto + giro + zoom. */
function movimento(a: Quadro, b: Quadro) {
  const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const tam = (v: V3) => Math.hypot(v[0], v[1], v[2]);
  const va = sub(a.alvo, a.pos);
  const vb = sub(b.alvo, b.pos);
  const dist = (tam(va) + tam(vb)) / 2;
  const desloc = tam(sub(b.pos, a.pos)) / Math.max(dist, 1);
  const cos = (va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]) / Math.max(tam(va) * tam(vb), 1e-9);
  const giro = Math.acos(Math.min(1, Math.max(-1, cos)));
  const zoom = Math.abs((b.fov ?? 40) - (a.fov ?? 40)) / 40;
  return desloc + giro + zoom + 1e-3;
}

/**
 * Trechos da câmera entre chaves consecutivas, cada um com uma curva de Hermite cujas
 * inclinações nas pontas fazem a velocidade da imagem passar de um trecho ao outro sem
 * trancos e sem parar a cada cena (média harmônica das velocidades vizinhas, como no
 * método de Fritsch–Carlson, que também garante que a câmera nunca anda para trás).
 */
const TRECHOS = (() => {
  const base = CHAVES.slice(1).map((q, i) => {
    const dur = Math.max(q.tempo - q.inicio, 1e-3);
    return { ini: q.inicio, fim: q.tempo, dur, vel: movimento(CHAVES[i], q) / dur, a: 1, b: 1 };
  });
  const juncao = (v1: number, v2: number) => (v1 > 0 && v2 > 0 ? (2 * v1 * v2) / (v1 + v2) : 0);
  base.forEach((t, k) => {
    const antes = k === 0 ? t.vel : juncao(base[k - 1].vel, t.vel);
    const depois = k === base.length - 1 ? t.vel : juncao(t.vel, base[k + 1].vel);
    let a = antes / t.vel;
    let b = depois / t.vel;
    const m = Math.hypot(a, b);
    if (m > 3) {
      a *= 3 / m;
      b *= 3 / m;
    }
    t.a = a;
    t.b = b;
  });
  return base;
})();

/** Posição na lista de chaves (0 a CHAVES.length - 1) em cada instante da rolagem. */
export function camNoTempo(tempo: number) {
  if (tempo <= TRECHOS[0].ini) return 0;
  for (let k = 0; k < TRECHOS.length; k++) {
    const t = TRECHOS[k];
    if (tempo > t.fim) continue;
    const u = Math.min(1, Math.max(0, (tempo - t.ini) / t.dur));
    const u2 = u * u;
    const u3 = u2 * u;
    return k + t.a * (u3 - 2 * u2 + u) + (3 * u2 - 2 * u3) + t.b * (u3 - u2);
  }
  return CHAVES.length - 1;
}

/** Momento em que os textos de cada cena estão inteiros na tela (para navegar por teclado). */
export const PARADAS = MARCAS.filter((m) => m.cena.textos?.length).map((m) => {
  // texto já visível desde o início (abertura): a parada é o próprio começo
  if (m.cena.textos!.some((tx) => (tx.entra ?? 0) < 0)) return m.inicio;
  const entra = Math.max(0, ...m.cena.textos!.map((tx) => tx.entra ?? padraoEntrada(m.cena)));
  return Math.min(m.fim - 0.05, m.inicio + entra + 0.4);
});

export function padraoEntrada(c: Cena) {
  return (c.transicao ?? 0) * 0.65 + 0.05;
}

export function padraoSaida(c: Cena) {
  return c.duracao - 0.32;
}

export function capituloNoTempo(tempo: number) {
  let atual = MARCAS[0].cena.capitulo;
  for (const m of MARCAS) if (tempo >= m.inicio - 0.01) atual = m.cena.capitulo;
  return atual;
}

export function inicioDoCapitulo(id: string) {
  const m = MARCAS.find((mm) => mm.cena.capitulo === id);
  return m ? m.inicio : 0;
}
