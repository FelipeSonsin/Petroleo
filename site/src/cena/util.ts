import { CanvasTexture, SRGBColorSpace, type Object3D } from 'three';

/**
 * Objetos que não precisam aparecer no reflexo do mar (tudo o que fica debaixo d'água, partículas,
 * a refinaria longe da margem...). O Oceano os esconde só durante o desenho do reflexo: a água
 * redesenha a cena inteira a cada quadro, e isso era metade do trabalho da placa de vídeo.
 */
export const foraDoReflexo = new Set<Object3D>();

/** Registra um objeto em foraDoReflexo enquanto o componente estiver montado (use como ref). */
export function semReflexo(o: Object3D | null) {
  if (!o) return undefined;
  foraDoReflexo.add(o);
  return () => {
    foraDoReflexo.delete(o);
  };
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Suaviza de 0 a 1 entre a e b (aceita a > b para inverter). */
export const suave = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Amortecimento exponencial independente da taxa de quadros. */
export const amortecer = (atual: number, alvo: number, lambda: number, dt: number) =>
  mix(atual, alvo, 1 - Math.exp(-lambda * dt));

let brilho: CanvasTexture | null = null;
/** Disco suave branco (para partículas e halos aditivos). */
export function texturaBrilho() {
  if (brilho) return brilho;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  brilho = new CanvasTexture(c);
  brilho.colorSpace = SRGBColorSpace;
  return brilho;
}

/** Ruído e funções GLSL compartilhados pelos shaders da cena. */
export const GLSL_RUIDO = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float ruido(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
               mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * ruido(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
`;
