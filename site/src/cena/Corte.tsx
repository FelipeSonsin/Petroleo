import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  DataTexture, DataUtils, DoubleSide, Group, HalfFloatType, LinearFilter, Mesh, PlaneGeometry, RGBAFormat,
  ShaderMaterial, Vector2, Vector4,
} from 'three';
import { cena, leitura } from '../estado';
import { CORTE_BASE, CORTE_LARGURA, CORTE_Z, FUNDO, POCOS, SISMICO, SONDA, camadas } from '../mundo';
import { meioReservatorio } from './trajetos';
import { GLSL_RUIDO, semReflexo } from './util';

const X_MIN = -CORTE_LARGURA / 2;
const AMOSTRAS = 1024;

/**
 * Limites das camadas (de mundo.ts) gravados numa textura, para o shader usar as mesmas formas.
 * Meia precisão (filtragem linear garantida no WebGL2): ~4 m de resolução a 8 km de profundidade.
 */
function texturaCamadas() {
  const dados = new Uint16Array(AMOSTRAS * 4);
  for (let i = 0; i < AMOSTRAS; i++) {
    const x = X_MIN + (CORTE_LARGURA * i) / (AMOSTRAS - 1);
    const v = [camadas.sedimentosBase(x), camadas.salBase(x), camadas.reservatorioBase(x), camadas.geradoraBase(x)];
    v.forEach((val, k) => {
      dados[i * 4 + k] = DataUtils.toHalfFloat(val);
    });
  }
  const t = new DataTexture(dados, AMOSTRAS, 1, RGBAFormat, HalfFloatType);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

const FONTE = new Vector2(SISMICO.x - 220, -6);

const GLSL_COMUM = /* glsl */ `
  uniform sampler2D uCamadas;
  uniform float uCorte;
  uniform float uSismica;
  uniform float uImagem;
  uniform float uTempo;
  uniform vec2 uFonte;
  varying vec3 vMundo;
  ${GLSL_RUIDO}
  vec4 camadas(float x) {
    return texture2D(uCamadas, vec2((x - ${X_MIN.toFixed(1)}) / ${CORTE_LARGURA.toFixed(1)}, 0.5));
  }
  float anel(float d, float r, float w) {
    float k = (d - r) / w;
    return r > 0.0 ? exp(-k * k) : 0.0;
  }
  // ruído celular: distância ao ponto mais próximo (poros redondos)
  float celulas(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float d = 1.5;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(hash12(i + g), hash12(i + g + 17.31));
        d = min(d, length(g + o - f));
      }
    }
    return d;
  }
  // distâncias ao 1º e ao 2º ponto mais próximos: F2 - F1 pequeno = borda entre células (fraturas, cristais)
  vec2 celulas2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 1.5, d2 = 1.5;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(hash12(i + g), hash12(i + g + 17.31));
        float d = length(g + o - f);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
    }
    return vec2(d1, d2);
  }
  // ondas da sísmica: onda direta + reflexos em cada contato entre camadas (fonte espelhada)
  float sismo(vec2 p, vec4 b, float px) {
    if (uSismica <= 0.001 || uSismica >= 0.999) return 0.0;
    float R = uSismica * 11000.0;
    float w = 34.0 + px * 2.0;
    float fim = 1.0 - smoothstep(0.85, 0.99, uSismica);
    vec4 bf = camadas(uFonte.x);
    float limites[5];
    limites[0] = ${FUNDO.toFixed(1)}; limites[1] = bf.x; limites[2] = bf.y; limites[3] = bf.z; limites[4] = bf.w;
    float forca[5];
    forca[0] = 0.45; forca[1] = 1.0; forca[2] = 0.9; forca[3] = 0.55; forca[4] = 0.35;
    float s = 0.0;
    for (int k = 0; k < 3; k++) {
      float r = R - float(k) * 1300.0;
      float d = distance(p, uFonte);
      s += anel(d, r, w) * exp(-d / 7000.0) * (1.0 - float(k) * 0.25);
      for (int i = 0; i < 5; i++) {
        float yb = limites[i];
        vec2 espelho = vec2(uFonte.x, 2.0 * yb - uFonte.y);
        if (p.y > yb && r > uFonte.y - yb) {
          float de = distance(p, espelho);
          s += anel(de, r, w) * forca[i] * 0.7 * exp(-de / 9000.0) * (1.0 - float(k) * 0.25);
        }
      }
    }
    return s * fim;
  }
`;

const VERT = /* glsl */ `
  varying vec3 vMundo;
  void main() {
    vec4 m = modelMatrix * vec4(position, 1.0);
    vMundo = m.xyz;
    gl_Position = projectionMatrix * viewMatrix * m;
  }
`;

function materialAgua(tex: DataTexture) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide, // a câmera fica do lado -Z do plano

    uniforms: {
      uCamadas: { value: tex }, uCorte: { value: 0 }, uSismica: { value: 0 }, uImagem: { value: 0 },
      uTempo: { value: 0 }, uFonte: { value: FONTE },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      ${GLSL_COMUM}
      void main() {
        float y = vMundo.y;
        float px = fwidth(y);
        float t = clamp(-y / ${(-FUNDO).toFixed(1)}, 0.0, 1.0);
        vec3 c = mix(vec3(0.035, 0.165, 0.24), vec3(0.008, 0.045, 0.09), pow(t, 0.55));
        float raios = fbm(vec2(vMundo.x * 0.003 + uTempo * 0.015, y * 0.0007));
        c += vec3(0.05, 0.13, 0.17) * raios * pow(1.0 - t, 2.0) * 0.9;
        c += vec3(0.45, 0.85, 1.0) * smoothstep(px * 2.5, 0.0, abs(y + 1.0)) * 0.9;
        c += vec3(0.4, 0.85, 1.0) * sismo(vMundo.xy, vec4(0.0), px);
        float bx = smoothstep(${(CORTE_LARGURA / 2).toFixed(1)}, ${(CORTE_LARGURA / 2 - 2600).toFixed(1)}, abs(vMundo.x));
        gl_FragColor = vec4(c, uCorte * bx * 0.96);
      }
    `,
  });
}

function materialRocha(tex: DataTexture) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uCamadas: { value: tex }, uCorte: { value: 0 }, uSismica: { value: 0 }, uImagem: { value: 0 },
      uTempo: { value: 0 }, uFonte: { value: FONTE }, uGeracao: { value: 0 }, uBroca: { value: 0 },
      uPocos: { value: 0 }, uFluxo: { value: 0 },
      uXPocos: { value: new Vector4(...POCOS.map((p) => p.x)) },
      uFundoPocos: { value: new Vector4(...POCOS.map((p) => meioReservatorio(p.x))) },
      uSonda: { value: new Vector2(SONDA.x, meioReservatorio(SONDA.x)) },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      ${GLSL_COMUM}
      uniform float uGeracao;
      uniform float uBroca;
      uniform float uPocos;
      uniform float uFluxo;
      uniform vec4 uXPocos;
      uniform vec4 uFundoPocos;
      uniform vec2 uSonda;

      // poço visto em corte: revestimento claro, miolo escuro; largura mínima de ~2 px
      vec3 poco(vec3 c, float x, float y, float xp, float fundo, float px, float mostra, float sobe, vec3 corFluxo) {
        if (mostra <= 0.0 || y < fundo || y > ${FUNDO.toFixed(1)}) return c;
        float prof = clamp((${FUNDO.toFixed(1)} - y) / 4500.0, 0.0, 1.0);
        float w = max(mix(26.0, 13.0, prof), px * 2.2);
        float dx = abs(x - xp);
        float corpo = smoothstep(w, w * 0.75, dx);
        float parede = smoothstep(w * 0.3, 0.0, abs(dx - w * 0.82));
        vec3 r = mix(c, vec3(0.03, 0.035, 0.045), corpo * 0.9);
        r += vec3(0.55, 0.75, 0.95) * parede * 0.75;
        float tracos = step(0.55, fract((y + sobe * uTempo * 160.0) / 90.0)) * smoothstep(w * 0.55, 0.0, dx);
        r += corFluxo * tracos * 1.6;
        return mix(c, r, mostra);
      }

      // some com padrões menores que ~4 px (evita cintilação vista de longe)
      float filtro(float periodo, float px) { return 1.0 - smoothstep(periodo * 0.16, periodo * 0.34, px); }
      // posição dentro de uma camada (0 no topo, 1 na base): o acamamento acompanha a forma dela
      float rel(float y, float topo, float base) { return clamp((topo - y) / max(topo - base, 1.0), 0.0, 1.0); }
      // falhas normais do rifte (só no pré-sal, seladas pelo sal): deslocam o acamamento de um lado
      float falhas(float x, float y, float px, out float linha) {
        linha = 0.0;
        float desloc = 0.0;
        vec3 f[3];
        f[0] = vec3(-3400.0, 0.42, 0.9);   // x na base do sal, inclinação (dx/dy) e rejeito (em camadas)
        f[1] = vec3(1300.0, -0.38, -0.7);
        f[2] = vec3(5600.0, 0.36, 0.8);
        for (int i = 0; i < 3; i++) {
          float xf = f[i].x + (y + 6000.0) * f[i].y;
          float d = x - xf;
          desloc += f[i].z * smoothstep(-px * 2.0, px * 2.0, d);
          linha = max(linha, smoothstep(px * 1.8 + 6.0, 0.0, abs(d)));
        }
        return desloc;
      }

      void main() {
        float x = vMundo.x;
        float y = vMundo.y;
        vec4 b = camadas(x);
        float px = max(fwidth(y), 0.001);
        float detalhe = smoothstep(28.0, 6.0, px);
        float n = fbm(vec2(x, y) * 0.0035);
        float n2 = fbm(vec2(x * 0.013, y * 0.04));
        float grao = fbm(vec2(x, y) * 0.03) * filtro(60.0, px);
        vec3 c;
        float h = 0.0;          // relevo da parede (m), para a luz rasante
        float linhaFalha = 0.0;
        if (y > b.x) {
          // sedimentos pós-sal: arenitos claros e folhelhos escuros alternados, dobrados sobre os domos de sal
          float r = rel(y, ${FUNDO.toFixed(1)}, b.x);
          float u = r * 24.0 + (fbm(vec2(x * 0.0007, r * 4.0)) - 0.5) * 1.6;
          float k = floor(u);
          float areia = step(0.42, hash12(vec2(k, 1.3)));
          vec3 arenito = mix(vec3(0.26, 0.2, 0.13), vec3(0.36, 0.29, 0.19), hash12(vec2(k, 5.1)));
          vec3 folhelho = mix(vec3(0.085, 0.078, 0.07), vec3(0.15, 0.13, 0.105), hash12(vec2(k, 8.7)));
          c = mix(folhelho, arenito, areia);
          float lam = 0.5 + 0.5 * sin((u * 7.0 + n * 2.0) * 6.2832);
          c *= 0.84 + 0.16 * mix(1.0, lam, filtro(12.0, px));
          c *= 0.86 + 0.28 * grao;
          // o arenito resiste mais à erosão: vira "degrau" na parede
          h = areia * 9.0 + fract(u) * 3.0 + grao * 5.0;
        } else if (y > b.y) {
          // sal: halita clara em faixas de fluxo dobradas, cristais e finas camadas escuras de anidrita
          float r = rel(y, b.x, b.y);
          float dobra = (fbm(vec2(x * 0.0011, r * 2.2)) - 0.5) * 3.2 + sin(x * 0.0019 + r * 6.0) * 0.5;
          float banda = r * 13.0 + dobra;
          float kb = floor(banda);
          float tom = fbm(vec2(x * 0.004, banda * 1.6));
          // faixas de fluxo alternando tons de cinza, branco e rosado
          float faixa = hash12(vec2(kb, 3.0));
          c = mix(vec3(0.27, 0.28, 0.32), vec3(0.46, 0.45, 0.48), faixa * 0.6 + tom * 0.4);
          c = mix(c, vec3(0.44, 0.35, 0.36), 0.25 * step(0.74, hash12(vec2(kb, 5.0))));
          float anid = smoothstep(0.05, 0.0, abs(fract(banda) - 0.5)) * step(0.68, hash12(vec2(kb, 9.0)));
          anid *= filtro(160.0, px);
          c = mix(c, vec3(0.1, 0.105, 0.12), anid * 0.75);
          // cristais: só um leve facetado e alguns brilhos (sem desenhar o contorno de cada grão)
          vec2 cr = celulas2(vec2(x, y) * 0.016 + vec2(n * 0.8, 0.0));
          float face = cr.y - cr.x;
          c *= 0.96 + 0.06 * smoothstep(0.0, 0.3, face) * detalhe;
          c += vec3(0.32, 0.4, 0.52) * smoothstep(0.05, 0.0, cr.x) * 0.22 * detalhe;
          h = smoothstep(0.0, 0.3, face) * 2.0 * detalhe + tom * 7.0 + faixa * 4.0 - anid * 4.0;
        } else {
          // pré-sal (rifte): camadas cortadas por falhas normais
          float desloc = falhas(x, y, px, linhaFalha);
          if (y > b.z) {
            // reservatório: carbonato bege e poroso; os poros grandes (vugs) guardam o óleo
            float r = rel(y, b.y, b.z);
            float u = r * 6.0 + desloc + (fbm(vec2(x * 0.0012, r)) - 0.5) * 0.7;
            vec3 rocha = mix(vec3(0.3, 0.25, 0.17), vec3(0.42, 0.36, 0.25), hash12(vec2(floor(u), 2.0)));
            rocha *= 0.85 + 0.3 * grao;
            float poro = celulas(vec2(x, y) * 0.028 + n * 1.2);
            float vug = smoothstep(0.34, 0.14, poro) * mix(0.35, 1.0, detalhe);
            float pulso = 0.85 + 0.15 * sin(uTempo * 1.3 + n * 12.0);
            c = mix(rocha, vec3(0.05, 0.03, 0.012), vug * 0.9);
            float borda = smoothstep(0.38, 0.3, poro) - smoothstep(0.3, 0.2, poro);
            c += vec3(1.0, 0.55, 0.16) * borda * 0.32 * pulso * detalhe;
            c += vec3(0.55, 0.28, 0.06) * vug * 0.12 * pulso;
            h = -vug * 7.0 + fract(u) * 4.0 + grao * 4.0;
          } else if (y > b.w) {
            // rocha geradora: folhelho negro bem laminado, rico em matéria orgânica
            float r = rel(y, b.z, b.w);
            float u = r * 26.0 + desloc * 4.0 + (n - 0.5) * 1.4;
            float lam = mix(0.5, 0.5 + 0.5 * sin(u * 6.2832), filtro(19.0, px));
            c = mix(vec3(0.04, 0.036, 0.032), vec3(0.085, 0.075, 0.064), lam * 0.6 + n2 * 0.4);
            c = mix(c, vec3(0.17, 0.15, 0.12), smoothstep(0.9, 0.97, hash12(vec2(floor(u * 0.5), 4.0))) * 0.55);
            float brasa = smoothstep(0.2, 0.04, celulas(vec2(x, y) * 0.022 + n)) * detalhe;
            c += vec3(1.0, 0.4, 0.08) * uGeracao * (0.06 + 0.32 * n2 * n2 + brasa * 0.42);
            h = lam * 3.0 + grao * 3.0;
          } else {
            // embasamento: basalto escuro com fraturas preenchidas de calcita
            // fraturas irregulares (células deformadas pelo ruído), finas e discretas
            vec2 q = vec2(x, y) * 0.0035 + vec2(fbm(vec2(x, y) * 0.0021), fbm(vec2(y, x) * 0.0023)) * 1.6;
            vec2 fr = celulas2(q);
            float veio = smoothstep(0.03, 0.0, fr.y - fr.x) * filtro(300.0, px);
            c = mix(vec3(0.035, 0.04, 0.045), vec3(0.08, 0.085, 0.09), n2 * 0.7 + grao * 0.3);
            c = mix(c, vec3(0.24, 0.25, 0.26), veio * 0.3);
            h = n2 * 8.0 + grao * 4.0 - veio * 2.0;
          }
          // traço das falhas
          c = mix(c, vec3(0.02, 0.018, 0.016), linhaFalha * 0.7);
          h -= linhaFalha * 6.0;
        }

        // relevo: gradiente do "h" no plano do corte (derivadas de tela convertidas para metros)
        // e uma luz rasante vinda de cima: a parede de rocha ganha volume em vez de ser uma textura chapada
        {
          float dxx = dFdx(x);
          float dyx = dFdy(x);
          float dxy = dFdx(y);
          float dyy = dFdy(y);
          float det = dxx * dyy - dxy * dyx;
          float hx = dFdx(h);
          float hy = dFdy(h);
          vec2 g = abs(det) > 1e-6 ? vec2(dyy * hx - dxy * hy, -dyx * hx + dxx * hy) / det : vec2(0.0);
          g = clamp(g, vec2(-3.0), vec2(3.0));
          vec3 nr = normalize(vec3(-g * 0.35, 1.0));
          float luz = clamp(dot(nr, normalize(vec3(0.3, 0.8, 0.55))), 0.0, 1.0);
          c *= 0.62 + 0.55 * luz;
        }

        // migração: gotas de óleo subindo da geradora até a base do sal (só durante a "geração")
        if (uGeracao > 0.0 && y < b.y && y > b.w - 80.0) {
          vec2 q = vec2(x * 0.02, (y - uTempo * 55.0) * 0.016);
          float gota = smoothstep(0.22, 0.05, celulas(q * 2.0)) * detalhe;
          c += vec3(1.0, 0.62, 0.2) * gota * uGeracao * 1.4;
        }

        // contatos entre camadas: linhas finas de luz
        float dmin = min(min(abs(y - b.x), abs(y - b.y)), min(abs(y - b.z), abs(y - b.w)));
        dmin = min(dmin, abs(y - ${FUNDO.toFixed(1)}));
        c += vec3(0.32, 0.78, 1.0) * smoothstep(px * 1.6, 0.0, dmin) * 0.55;

        // imagem sísmica: faixas claras e escuras ao longo dos contatos, perto do navio de pesquisa
        float area = smoothstep(4200.0, 2200.0, abs(x - uFonte.x));
        float faixas = sin(dmin * 0.05 + n * 2.0) * exp(-dmin / 300.0);
        vec3 sis = vec3(0.5 + 0.5 * faixas) * vec3(0.72, 0.84, 1.0);
        c = mix(c, sis, uImagem * area * 0.6);

        c += vec3(0.4, 0.85, 1.0) * sismo(vec2(x, y), b, px);

        // poços de produção e de injeção já existentes
        vec3 oleo = vec3(1.0, 0.6, 0.15) * uFluxo;
        c = poco(c, x, y, uXPocos.x, uFundoPocos.x, px, uPocos, 1.0, oleo);
        c = poco(c, x, y, uXPocos.y, uFundoPocos.y, px, uPocos, 1.0, oleo);
        c = poco(c, x, y, uXPocos.z, uFundoPocos.z, px, uPocos, -1.0, vec3(0.3, 0.75, 1.0) * uFluxo);
        c = poco(c, x, y, uXPocos.w, uFundoPocos.w, px, uPocos, 1.0, oleo);

        // poço novo, perfurado pelo navio-sonda: cresce com a broca
        float yBroca = mix(${FUNDO.toFixed(1)}, uSonda.y, uBroca);
        if (uBroca > 0.0) {
          c = poco(c, x, y, uSonda.x, yBroca, px, 1.0, -1.0, vec3(0.35, 0.8, 1.0) * 0.6);
          float dBroca = distance(vec2(x, y), vec2(uSonda.x, yBroca));
          float brilho = exp(-dBroca / max(22.0, px * 3.0));
          c += vec3(1.0, 0.55, 0.15) * brilho * 2.6 * (0.8 + 0.2 * sin(uTempo * 30.0));
        }

        float bx = smoothstep(${(CORTE_LARGURA / 2).toFixed(1)}, ${(CORTE_LARGURA / 2 - 2600).toFixed(1)}, abs(x));
        float by = smoothstep(${CORTE_BASE.toFixed(1)}, ${(CORTE_BASE + 1400).toFixed(1)}, y);
        gl_FragColor = vec4(c, uCorte * bx * by);
      }
    `,
  });
}

/** Nomes das camadas, acompanhando a câmera pela lateral do corte. */
function Legendas() {
  const grupo = useRef<Group>(null);
  const caixas = useRef<(HTMLDivElement | null)[]>([]);
  const itens = useMemo(
    () => [
      { nome: 'Água do mar', detalhe: '0 a 2.000 m', y: (x: number) => FUNDO / 2 + x * 0 },
      { nome: 'Sedimentos', detalhe: 'areia e argila endurecidas', y: (x: number) => (FUNDO + camadas.sedimentosBase(x)) / 2 },
      { nome: 'Sal', detalhe: 'até ~2.000 m de espessura', y: (x: number) => (camadas.sedimentosBase(x) + camadas.salBase(x)) / 2 },
      { nome: 'Pré-sal', detalhe: 'rocha porosa com óleo', y: (x: number) => (camadas.salBase(x) + camadas.reservatorioBase(x)) / 2 },
      { nome: 'Rocha geradora', detalhe: 'onde o petróleo se formou', y: (x: number) => (camadas.reservatorioBase(x) + camadas.geradoraBase(x)) / 2 },
    ],
    [],
  );
  const refs = useRef<(Group | null)[]>([]);

  useFrame((estado) => {
    const g = grupo.current;
    if (!g) return;
    const vis = cena.legendas * cena.corte;
    for (const c of caixas.current) if (c) c.style.opacity = String(vis);
    g.visible = vis > 0.01;
    // a câmera olha para +Z, então a direita da tela é o lado -X do mundo
    const dist = Math.abs(estado.camera.position.z - CORTE_Z);
    const x = leitura.alvoX - dist * 0.36;
    itens.forEach((it, i) => {
      const r = refs.current[i];
      if (r) r.position.set(x, it.y(x), CORTE_Z - 5);
    });
  });

  return (
    <group ref={grupo}>
      {itens.map((it, i) => (
        <group key={it.nome} ref={(el) => { refs.current[i] = el; }}>
          <Html zIndexRange={[12, 10]} style={{ pointerEvents: 'none' }}>
            <div
              ref={(el) => {
                caixas.current[i] = el;
              }}
              className="-translate-y-1/2 whitespace-nowrap"
              style={{ opacity: 0 }}
            >
              <span className="rotulo flex items-center gap-2 !text-[10px] text-tinta">
                <span className="inline-block h-px w-5 bg-brilho/80" />
                {it.nome}
              </span>
              <span className="rotulo mt-1 block pl-7 !text-[9px] !tracking-[0.12em] normal-case text-nevoa/70">{it.detalhe}</span>
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

/** Corte geológico: face da água e face de rocha no plano z = CORTE_Z. */
export function Corte() {
  const tex = useMemo(texturaCamadas, []);
  const agua = useMemo(() => materialAgua(tex), [tex]);
  const rocha = useMemo(() => materialRocha(tex), [tex]);
  const malhaAgua = useRef<Mesh>(null);
  const malhaRocha = useRef<Mesh>(null);
  const geoAgua = useMemo(() => new PlaneGeometry(CORTE_LARGURA, -FUNDO), []);
  const geoRocha = useMemo(() => new PlaneGeometry(CORTE_LARGURA, FUNDO - CORTE_BASE), []);

  useFrame((estado) => {
    const t = estado.clock.elapsedTime;
    const k = cena.corte;
    for (const m of [agua, rocha]) {
      m.uniforms.uCorte.value = k;
      m.uniforms.uSismica.value = cena.sismica;
      m.uniforms.uImagem.value = cena.imagem;
      m.uniforms.uTempo.value = t;
    }
    rocha.uniforms.uGeracao.value = cena.geracao;
    rocha.uniforms.uBroca.value = cena.broca;
    rocha.uniforms.uPocos.value = cena.pocos;
    rocha.uniforms.uFluxo.value = 0.35 + 0.65 * Math.max(cena.fluxo, cena.pocos);
    const vis = k > 0.002;
    if (malhaAgua.current) malhaAgua.current.visible = vis;
    if (malhaRocha.current) malhaRocha.current.visible = vis;
  });

  return (
    <group ref={semReflexo}>
      <mesh ref={malhaAgua} name="corte_agua" geometry={geoAgua} material={agua} position={[0, FUNDO / 2, CORTE_Z]} renderOrder={-2} />
      <mesh
        name="corte_rocha"
        ref={malhaRocha}
        geometry={geoRocha}
        material={rocha}
        position={[0, (FUNDO + CORTE_BASE) / 2, CORTE_Z]}
        renderOrder={-2}
      />
      <Legendas />
    </group>
  );
}
