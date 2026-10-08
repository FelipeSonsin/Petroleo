/**
 * Geografia do mundo 3D, em metros (1 unidade = 1 m, escala real na vertical).
 * Eixos do three.js: X = leste–oeste (proa da FPSO em +X), Y = altura (mar em 0), Z = norte–sul.
 * Modelos vindos do Blender: (x, y, z) do Blender viram (x, z, -y) aqui.
 */
export const MAR = 0;
export const FUNDO = -2000;

/** Plano do corte geológico: o "raio X" mostra a face z = CORTE_Z; a câmera fica em z < CORTE_Z. */
export const CORTE_Z = 100;
export const CORTE_LARGURA = 24000;
export const CORTE_BASE = -8400;

/**
 * Base de cada camada (y) em função de x. Pré-sal da Bacia de Santos, simplificado:
 * ~2.000 m de água, sedimentos pós-sal, ~2.000 m de sal, reservatório (carbonatos com óleo),
 * rocha geradora (folhelhos de antigos lagos) e embasamento. Formas suaves; o ruído fica no shader.
 */
export const camadas = {
  /** base dos sedimentos = topo do sal: ondulado, com dois domos de sal */
  sedimentosBase: (x: number) =>
    -4000 + 120 * Math.sin(x / 1900) + 60 * Math.sin(x / 700 + 1) +
    700 * Math.exp(-(((x - 4300) / 650) ** 2)) + 520 * Math.exp(-(((x + 5600) / 560) ** 2)),
  /** base do sal = topo do reservatório, mais alto no centro (armadilha em domo) */
  salBase: (x: number) => -6050 + 220 * Math.exp(-(((x + 400) / 2600) ** 2)) + 40 * Math.sin(x / 900),
  reservatorioBase: (x: number) => -6550 + 170 * Math.exp(-(((x + 400) / 2800) ** 2)),
  geradoraBase: (x: number) => -7050 + 90 * Math.sin(x / 2300),
};

/** Árvores de natal molhadas (cabeça de poço no fundo do mar). */
export const POCOS = [
  { id: 'p1', x: -1500, z: -55, tipo: 'producao' as const },
  { id: 'p2', x: -850, z: -55, tipo: 'producao' as const },
  { id: 'i1', x: -260, z: -55, tipo: 'injecao' as const },
  { id: 'p3', x: 650, z: -55, tipo: 'producao' as const },
];
export const POCO_PRINCIPAL = POCOS[1];

/** Navio-sonda perfurando um poço novo e navio de sísmica, à frente do corte. */
export const SONDA = { x: 2700, z: -70 };
export const SISMICO = { x: -4300, z: -85 };

/** Navio aliviador encostado na popa da FPSO e rota até a costa. */
export const ALIVIADOR = { x: -470, z: 0 };
export const COSTA_X = -26000;

/** Profundidade real (positiva) para o painel. */
export function profundidade(y: number) {
  return Math.max(0, -y);
}
