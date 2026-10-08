/**
 * Estado compartilhado entre a linha do tempo (GSAP, guiada pela rolagem) e a cena 3D.
 * É um objeto comum, mutável: o GSAP escreve, o useFrame do three.js lê a cada quadro.
 * Nada aqui dispara re-render do React.
 */
export const cena = {
  /** posição na lista de quadros de câmera (0 = primeiro quadro; frações interpolam) */
  cam: 0,
  /** 0 = mundo normal; 1 = corte geológico (raio X) aberto */
  corte: 0,
  /** nomes das camadas no corte geológico (0 a 1) */
  legendas: 0,
  /** frente de onda da sísmica (0 a 1) */
  sismica: 0,
  /** "imagem sísmica" (faixas claras e escuras nas camadas) depois dos ecos (0 a 1) */
  imagem: 0,
  /** poços de produção já existentes desenhados no corte (0 a 1) */
  pocos: 0,
  /** avanço da broca, do fundo do mar ao reservatório (0 a 1) */
  broca: 0,
  /** destaque da formação do petróleo na rocha geradora (0 a 1) */
  geracao: 0,
  /** frente do fluxo de óleo do reservatório até a plataforma (0 a 1) */
  fluxo: 0,
  /** corte do separador trifásico (0 a 1) */
  separador: 0,
  /** saída do navio aliviador rumo à costa (0 a 1) */
  aliviador: 0,
  /** corte da torre de destilação (0 a 1) */
  torre: 0,
  /** rede de distribuição de derivados (0 a 1) */
  rede: 0,
};

export type ParametroCena = keyof typeof cena;

/** Leituras feitas pela câmera a cada quadro, para o painel (profundidade). */
export const leitura = { alvoX: 0, alvoY: 0, camY: 0, tempo: 0 };

export type Qualidade = 'alta' | 'leve';
