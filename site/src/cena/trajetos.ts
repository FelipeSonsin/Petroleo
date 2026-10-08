import { CatmullRomCurve3, Curve, CurvePath, LineCurve3, Vector3 } from 'three';
import { FUNDO, POCOS, POCO_PRINCIPAL, camadas } from '../mundo';

/**
 * Trajetos compartilhados pela cena (dutos, risers, poços) e pelas partículas de fluxo.
 * Tudo é determinístico: o mesmo cálculo desenha os tubos e move o "óleo" por dentro deles.
 */

// ------------------------------------------------------------------ ruído (relevo)

function hash(i: number, j: number) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function ruido2(x: number, y: number) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j);
  const b = hash(i + 1, j);
  const c = hash(i, j + 1);
  const d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x: number, y: number, oitavas = 4) {
  let s = 0;
  let a = 0.5;
  for (let k = 0; k < oitavas; k++) {
    s += a * ruido2(x, y);
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.3;
    a *= 0.5;
  }
  return s;
}

/** Altura do fundo do mar (lodo, ondulações suaves). */
export function alturaFundo(x: number, z: number) {
  return FUNDO + 16 * (fbm2(x / 1100, z / 1100) - 0.5) + 0.35 * (ruido2(x / 16, z / 16) - 0.5);
}

// ------------------------------------------------------------------ FPSO: pontos de pendurar risers

/** Saídas dos risers no balcão de bombordo da FPSO (iguais aos Empties ponto_riser_XX do Blender). */
export const PENDURAIS = Array.from({ length: 20 }, (_, i) => new Vector3(-57.5 + 5 * i, -1, -32));

/** Saída lateral da árvore de natal (ponto_saida do modelo), já girada para a FPSO. */
export function saidaArvore(x: number, z: number) {
  const lado = x < 0 ? 1 : -1;
  return new Vector3(x + 3.6 * lado, alturaFundo(x, z) + 0.9, z);
}

/** Riser em "onda preguiçosa" (lazy wave): desce, faz uma barriga, sobe nos flutuadores e pousa no fundo. */
export function curvaRiser(topo: Vector3, toque: Vector3) {
  const d = toque.clone().sub(topo);
  const p = (f: number, y: number) => new Vector3(topo.x + d.x * f, y, topo.z + d.z * f);
  return new CatmullRomCurve3(
    [topo, p(0.03, -240), p(0.16, -880), p(0.32, -1230), p(0.46, -1060), p(0.6, -1190), p(0.8, -1810), toque],
    false,
    'centripetal',
  );
}

export type Duto = {
  id: string;
  riser: CatmullRomCurve3;
  /** duto no fundo do mar, do ponto de toque até a árvore (ou até longe, no gasoduto) */
  fundo: CatmullRomCurve3;
  tipo: 'oleo' | 'injecao' | 'gas' | 'outro';
  /** trecho com flutuadores (fração da curva do riser) */
  flutuadores: [number, number];
};

function dutoNoFundo(a: Vector3, b: Vector3, passos = 8) {
  const pts: Vector3[] = [];
  for (let k = 0; k <= passos; k++) {
    const t = k / passos;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t + Math.sin(t * Math.PI) * 6;
    pts.push(new Vector3(x, alturaFundo(x, z) + 1.1, z));
  }
  pts[0].copy(a);
  pts[pts.length - 1].copy(b);
  return new CatmullRomCurve3(pts, false, 'centripetal');
}

function dutoParaPoco(id: string, pendural: number, poco: (typeof POCOS)[number], tipo: Duto['tipo']): Duto {
  const topo = PENDURAIS[pendural];
  const saida = saidaArvore(poco.x, poco.z);
  const dir = new Vector3(topo.x - saida.x, 0, topo.z - saida.z).normalize();
  const toque = saida.clone().addScaledVector(dir, 170);
  toque.y = alturaFundo(toque.x, toque.z) + 0.6;
  return { id, riser: curvaRiser(topo, toque), fundo: dutoNoFundo(toque, saida), tipo, flutuadores: [0.36, 0.56] };
}

function dutoDistante(id: string, pendural: number, x: number, z: number, tipo: Duto['tipo'] = 'outro'): Duto {
  const topo = PENDURAIS[pendural];
  const toque = new Vector3(x, alturaFundo(x, z) + 0.6, z);
  const longe = new Vector3(x * 1.6, 0, z * 1.4 - 300);
  longe.y = alturaFundo(longe.x, longe.z) + 0.6;
  return { id, riser: curvaRiser(topo, toque), fundo: dutoNoFundo(toque, longe, 12), tipo, flutuadores: [0.36, 0.56] };
}

export const DUTOS: Duto[] = [
  dutoParaPoco('p1', 2, POCOS[0], 'oleo'),
  dutoParaPoco('p2', 6, POCOS[1], 'oleo'),
  dutoParaPoco('i1', 9, POCOS[2], 'injecao'),
  dutoParaPoco('p3', 14, POCOS[3], 'oleo'),
  dutoDistante('gas', 18, -420, -420, 'gas'),
  dutoDistante('d1', 0, -2300, -700),
  dutoDistante('d2', 4, -3100, -260),
  dutoDistante('d3', 11, 1900, -820),
  dutoDistante('d4', 16, 2600, -380),
  dutoDistante('d5', 19, 1400, -1200),
];

// gasoduto de exportação: do ponto de toque segue pelo fundo rumo à costa (oeste)
{
  const gas = DUTOS.find((d) => d.id === 'gas')!;
  const a = gas.riser.points[gas.riser.points.length - 1];
  gas.fundo = dutoNoFundo(a, new Vector3(-9000, alturaFundo(-9000, -1500) + 0.6, -1500), 20);
}

// ------------------------------------------------------------------ caminho do óleo (poço principal -> FPSO)

/** Profundidade média do reservatório sob um ponto (meio da rocha com óleo). */
export function meioReservatorio(x: number) {
  return (camadas.salBase(x) + camadas.reservatorioBase(x)) / 2;
}

/** Caminho completo do óleo: reservatório -> poço -> árvore -> duto -> riser -> separador da FPSO. */
export function caminhoDoOleo(separador = new Vector3(17.5, 34.2, -16)) {
  const p = POCO_PRINCIPAL;
  const duto = DUTOS.find((d) => d.id === 'p2')!;
  const base = alturaFundo(p.x, p.z);
  const caminho = new CurvePath<Vector3>();
  const fundoPoco = new Vector3(p.x, meioReservatorio(p.x), p.z);
  const cabeca = new Vector3(p.x, base + 2.6, p.z);
  caminho.add(new LineCurve3(fundoPoco, cabeca));
  const saida = saidaArvore(p.x, p.z);
  caminho.add(new LineCurve3(cabeca, saida));
  // duto no fundo (invertido: da árvore ao ponto de toque) e riser (invertido: do fundo ao topo)
  caminho.add(inverter(duto.fundo));
  caminho.add(inverter(duto.riser));
  const topo = PENDURAIS[6];
  const subida = new CatmullRomCurve3([
    topo, new Vector3(topo.x, 10, topo.z), new Vector3(topo.x + 4, 15, -26),
    new Vector3(separador.x - 6, 18, -22), new Vector3(separador.x - 8, separador.y - 1, separador.z - 3),
    separador,
  ], false, 'centripetal');
  caminho.add(subida);
  return caminho;
}

class CurvaInvertida extends Curve<Vector3> {
  constructor(private origem: Curve<Vector3>) {
    super();
  }
  getPoint(t: number, alvo = new Vector3()) {
    return this.origem.getPoint(1 - t, alvo);
  }
}

export function inverter(c: Curve<Vector3>) {
  return new CurvaInvertida(c);
}

/** Amostra uma curva em pontos igualmente espaçados (tabela para mover partículas rápido). */
export function tabela(c: Curve<Vector3>, n = 2048) {
  const pts = c.getSpacedPoints(n);
  const arr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => p.toArray(arr, i * 3));
  return arr;
}

/** Ponto em uma tabela, com t de 0 a 1. */
export function pontoNaTabela(tab: Float32Array, t: number, alvo: Vector3) {
  const n = tab.length / 3 - 1;
  const f = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const k = f - i;
  const a = i * 3;
  const b = a + 3;
  alvo.set(
    tab[a] + (tab[b] - tab[a]) * k,
    tab[a + 1] + (tab[b + 1] - tab[a + 1]) * k,
    tab[a + 2] + (tab[b + 2] - tab[a + 2]) * k,
  );
  return alvo;
}
