import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Group,
  InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Plane, PlaneGeometry, Points,
  PointsMaterial, Quaternion, ShaderMaterial, TubeGeometry, UniformsLib, UniformsUtils, Vector3,
} from 'three';
import { cena, type Qualidade } from '../estado';
import { COSTA_X } from '../mundo';
import { REFINARIA, TORRE } from '../roteiro';
import { Corrente, OLEO, sanear } from './Fluxos';
import { Halo, registrarPontos, PONTOS } from './Plataforma';
import { precarregar, useModelo } from './modelos';
import { fbm2, pontoNaTabela, ruido2, tabela } from './trajetos';
import { GLSL_RUIDO, foraDoReflexo, mix, semReflexo, suave, texturaBrilho } from './util';

const ALTURA_REFINARIA = 5;

/** Relevo do litoral: mar raso, planície costeira, a refinaria em área plana e a serra ao fundo. */
export function alturaCosta(x: number, z: number) {
  const linha = COSTA_X + 420 * (fbm2(z / 4200, 3.1) - 0.5) + 170 * Math.sin(z / 1700);
  const d = linha - x; // positivo em terra
  if (d < 0) return -4 + d * 0.012;
  let h = 1.5 + Math.min(d, 600) * 0.006 + 18 * (fbm2(x / 700, z / 700) - 0.35) * suave(300, 2500, d);
  const serra = suave(5200, 9800, d) * (620 + 520 * fbm2(x / 2600, z / 2600) + 160 * ruido2(x / 600, z / 600));
  h += serra;
  const dr = Math.hypot(x - REFINARIA.x, z - REFINARIA.z);
  if (dr < 1500) h = mix(ALTURA_REFINARIA, h, suave(1050, 1500, dr));
  return Math.max(h, d < 120 ? 0.8 : 2);
}

/** Linha da costa (x onde a terra encontra o mar) em cada z: a mesma conta de alturaCosta. */
function linhaDaCosta(z: number) {
  return COSTA_X + 420 * (fbm2(z / 4200, 3.1) - 0.5) + 170 * Math.sin(z / 1700);
}

/** Áreas urbanas: centro, largura (eixo u), profundidade (eixo v), giro da malha de ruas e altura dos prédios. */
const CIDADES = [
  { cx: -29850, cz: 5000, largura: 3300, prof: 6400, ang: 0.21, alta: 1 },
  { cx: -29200, cz: -5800, largura: 2600, prof: 4800, ang: -0.14, alta: 0.8 },
  { cx: -27000, cz: 4600, largura: 1400, prof: 4400, ang: 0.42, alta: 0.6 },
];

/**
 * Terreno do litoral: praia, mata, encostas de rocha e o brilho alaranjado que as cidades
 * jogam no chão à noite; detalhe procedural (manchas e relevo fino) por cima da malha.
 */
function materialTerreno() {
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const centros = CIDADES.map((c) => new Vector3(c.cx, Math.max(c.largura, c.prof) * 0.55, c.cz));
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCidades = { value: centros };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerra;\nvarying vec3 vTerraN;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvTerraN = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerra = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTerra;
        varying vec3 vTerraN;
        uniform vec3 uCidades[3];
        ${GLSL_RUIDO}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // detalhe fino só onde cabe na tela (de longe e em ângulo rasante ele vira chuvisco)
          float pxT = length(fwidth(vTerra.xz));
          float mata = fbm(vTerra.xz * 0.004);
          float fino = mix(0.5, fbm(vTerra.xz * 0.03), 1.0 - smoothstep(4.0, 14.0, pxT));
          diffuseColor.rgb *= 0.72 + 0.56 * mata * (0.8 + 0.4 * fino);
          // rocha exposta nas encostas íngremes da serra
          float encosta = 1.0 - clamp(normalize(vTerraN + vec3(0.0, 1e-4, 0.0)).y, 0.0, 1.0);
          float rocha = smoothstep(0.16, 0.34, encosta + (fino - 0.5) * 0.12) * smoothstep(40.0, 200.0, vTerra.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.095, 0.092, 0.085) * (0.8 + 0.4 * fino), rocha);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // luz das cidades refletida no chão em volta delas
          float brilho = 0.0;
          for (int i = 0; i < 3; i++) {
            vec2 d = (vTerra.xz - uCidades[i].xz) / uCidades[i].y;
            brilho += exp(-dot(d, d) * 1.6);
          }
          totalEmissiveRadiance += vec3(0.034, 0.018, 0.007) * min(brilho, 1.5);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // relevo fino (cristas e grotas) que some com a distância, para não "chuviscar" de longe
          float pxB = length(fwidth(vTerra.xz));
          float forcaB = 1.0 - smoothstep(6.0, 20.0, pxB);
          float hf = fbm(vTerra.xz * 0.02) * 9.0 * forcaB;
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          float lx = length(sx);
          float ly = length(sy);
          if (forcaB > 0.001 && lx > 1e-6 && ly > 1e-6) {
            sx /= lx;
            sy /= ly;
            vec3 r1 = cross(sy, normal);
            vec3 r2 = cross(normal, sx);
            float det = dot(sx, r1);
            vec3 grad = sign(det) * (dFdx(hf) * r1 + dFdy(hf) * r2) * 0.5;
            vec3 nb = abs(det) * normal - grad;
            float lb = length(nb);
            if (lb > 1e-6) normal = nb / lb;
          }
        }`);
  };
  mat.customProgramCacheKey = () => 'terreno-costa';
  return mat;
}

function Relevo() {
  const geo = useMemo(() => {
    const nx = 240;
    const nz = 300;
    const x0 = -50000;
    const x1 = -24800;
    const z0 = -17000;
    const z1 = 17000;
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    const cor = new Float32Array((nx + 1) * (nz + 1) * 3);
    const c = new Color();
    const serra = new Color(0.075, 0.08, 0.075);
    let k = 0;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx;
        const z = z0 + ((z1 - z0) * j) / nz;
        const y = alturaCosta(x, z);
        pos.set([x, y, z], k);
        const mata = fbm2(x / 400, z / 400);
        // areia da praia, mata atlântica escura e o cinza-esverdeado do alto da serra
        if (y < 2.5) c.setRGB(0.24, 0.215, 0.16);
        else c.setRGB(0.032 + mata * 0.026, 0.052 + mata * 0.032, 0.03 + mata * 0.016);
        if (y > 500) c.lerp(serra, suave(500, 1100, y));
        c.toArray(cor, k);
        k += 3;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('color', new BufferAttribute(cor, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => materialTerreno(), []);
  return <mesh geometry={geo} material={mat} />;
}

/** Gerador de números pseudoaleatórios com semente (a cidade sai igual em toda abertura). */
function aleatorio(semente: number) {
  let s = semente;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const naTerra = (x: number, z: number) => x < linhaDaCosta(z) - 60;
const longeDaRefinaria = (x: number, z: number) => Math.hypot(x - REFINARIA.x, z - REFINARIA.z) > 1150;

/** Malha urbana: postes ao longo das ruas, avenidas mais claras e prédios alinhados às quadras. */
function planejarCidades(qualidade: Qualidade) {
  const rnd = aleatorio(29);
  const passoLuz = qualidade === 'alta' ? 32 : 48;
  const ruas: number[] = [];
  const avenidas: number[] = [];
  const predios: { x: number; z: number; w: number; d: number; h: number; a: number }[] = [];
  for (const c of CIDADES) {
    const passo = 115;
    const co = Math.cos(c.ang);
    const se = Math.sin(c.ang);
    const mundo = (u: number, v: number): [number, number] => [c.cx + u * co - v * se, c.cz + u * se + v * co];
    // densidade: alta no centro, some nas bordas com contorno irregular
    const densidade = (u: number, v: number) => {
      const [x, z] = mundo(u, v);
      const d = Math.hypot(u / (c.largura / 2), v / (c.prof / 2));
      return Math.min(1, Math.max(0, 1.3 - d * d) * (0.55 + 0.9 * ruido2(x / 700, z / 700)));
    };
    const luz = (u: number, v: number, lista: number[]) => {
      const [x, z] = mundo(u, v);
      if (!naTerra(x, z) || !longeDaRefinaria(x, z) || rnd() > densidade(u, v)) return;
      lista.push(x, alturaCosta(x, z) + 7, z);
    };
    const nu = Math.floor(c.largura / passo);
    const nv = Math.floor(c.prof / passo);
    for (let i = 0; i <= nu; i++) {
      const u = -c.largura / 2 + i * passo;
      for (let v = -c.prof / 2; v <= c.prof / 2; v += passoLuz) luz(u, v, i % 4 === 0 ? avenidas : ruas);
    }
    for (let j = 0; j <= nv; j++) {
      const v = -c.prof / 2 + j * passo;
      for (let u = -c.largura / 2; u <= c.largura / 2; u += passoLuz) luz(u, v, j % 4 === 0 ? avenidas : ruas);
    }
    // prédios dentro das quadras, mais altos e juntos perto do centro
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const uc = -c.largura / 2 + (i + 0.5) * passo;
        const vc = -c.prof / 2 + (j + 0.5) * passo;
        const p = densidade(uc, vc);
        const centro = Math.max(0, 1 - Math.hypot(uc / (c.largura / 2), vc / (c.prof / 2)) * 1.25);
        const n = rnd() < p ? 1 + Math.floor(rnd() * (qualidade === 'alta' ? 3 : 2)) : 0;
        for (let k = 0; k < n; k++) {
          const [x, z] = mundo(uc + (rnd() - 0.5) * 60, vc + (rnd() - 0.5) * 60);
          if (!naTerra(x, z) || !longeDaRefinaria(x, z)) continue;
          predios.push({
            x, z, a: c.ang,
            w: 14 + rnd() * 26, d: 12 + rnd() * 24,
            h: 7 + rnd() ** 2.2 * (18 + 120 * centro * c.alta),
          });
        }
      }
    }
  }
  return { ruas, avenidas, predios };
}

/** Prédios com janelas acesas (shader próprio, sem luzes reais: leve) e luz de aviação nos mais altos. */
function Cidade({ qualidade }: { qualidade: Qualidade }) {
  const plano = useMemo(() => planejarCidades(qualidade), [qualidade]);

  const malha = useMemo(() => {
    const geo = new BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new ShaderMaterial({
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uTempo: { value: 0 } }]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        varying vec3 vNormal;
        varying vec2 vFace;
        varying vec2 vSemente;
        varying float vAltura;
        void main() {
          mat4 m = modelMatrix;
          #ifdef USE_INSTANCING
            m = modelMatrix * instanceMatrix;
          #endif
          vec4 mundo = m * vec4(position, 1.0);
          vNormal = normalize(mat3(m) * normal);
          // coordenadas da face em metros (independem do giro do prédio): janelas certinhas
          vec3 escala = vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
          float u = abs(normal.x) > 0.5 ? position.z * escala.z : position.x * escala.x;
          vFace = vec2(u, position.y * escala.y);
          vAltura = escala.y;
          vSemente = vec2(m[3][0], m[3][2]);
          vec4 mvPosition = viewMatrix * mundo;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        varying vec3 vNormal;
        varying vec2 vFace;
        varying vec2 vSemente;
        varying float vAltura;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 n = normalize(vNormal);
          float tom = h(vSemente * 0.01);
          vec3 c = mix(vec3(0.012, 0.015, 0.022), vec3(0.03, 0.028, 0.026), tom) + vec3(0.03, 0.04, 0.06) * max(n.y, 0.0);
          if (abs(n.y) < 0.5) {
            vec2 cel = floor(vec2(vFace.x / 3.4, vFace.y / 3.3));
            vec2 f = fract(vec2(vFace.x / 3.4, vFace.y / 3.3));
            float janela = step(0.22, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.78);
            float r = h(cel + vSemente * 0.013);
            float acesa = step(r, 0.26 + 0.28 * h(vSemente));
            vec3 quente = mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.85, 1.0), step(0.78, h(cel.yx + vSemente)));
            c += janela * acesa * quente * (0.8 + 1.5 * h(cel * 1.7));
            // térreo com lojas iluminadas
            c += vec3(1.0, 0.62, 0.3) * 0.5 * (1.0 - step(3.2, vFace.y)) * step(0.5, h(vSemente + 3.0));
          }
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }
      `,
    });
    const inst = new InstancedMesh(geo, mat, plano.predios.length);
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    const Y = new Vector3(0, 1, 0);
    plano.predios.forEach((b, i) => {
      q.setFromAxisAngle(Y, -b.a);
      p.set(b.x, alturaCosta(b.x, b.z) - 1, b.z);
      s.set(b.w, b.h, b.d);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }, [plano]);

  const pontosDeLuz = (lista: number[], tamanho: number, cor: string) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(lista), 3));
    return new Points(g, new PointsMaterial({
      size: tamanho, map: texturaBrilho(), color: cor, transparent: true, depthWrite: false,
      blending: AdditiveBlending, sizeAttenuation: true, fog: true,
    }));
  };
  const ruas = useMemo(() => pontosDeLuz(plano.ruas, 6.5, '#ffb066'), [plano]);
  const avenidas = useMemo(() => pontosDeLuz(plano.avenidas, 9, '#ffd9a8'), [plano]);

  // luz vermelha piscando no topo dos prédios altos (balizamento para aviões)
  const aviacao = useMemo(() => {
    const lista: number[] = [];
    for (const b of plano.predios) if (b.h > 60) lista.push(b.x, alturaCosta(b.x, b.z) + b.h + 1.5, b.z);
    return pontosDeLuz(lista, 7, '#ff2a1a');
  }, [plano]);
  useFrame((e) => {
    (aviacao.material as PointsMaterial).opacity = 0.35 + 0.65 * Math.max(0, Math.sin(e.clock.elapsedTime * 2.2));
  });

  return (
    <group>
      <primitive object={malha} />
      <primitive object={ruas} />
      <primitive object={avenidas} />
      <primitive object={aviacao} />
    </group>
  );
}

/** Espuma das ondas quebrando na praia: uma faixa animada ao longo de toda a linha da costa. */
function Arrebentacao() {
  const malha = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    let k = 0;
    for (let z = -17000; z <= 17000; z += 30) {
      const x = linhaDaCosta(z);
      pos.push(x - 8, 0.45, z, x + 55, 0.45, z);
      uv.push(z / 220, 0, z / 220, 1);
      if (k > 0) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
      k++;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uTempo: { value: 0 } }]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uTempo;
        varying vec2 vUv;
        ${GLSL_RUIDO}
        void main() {
          // ondas chegando: faixas que andam do mar (v = 1) para a areia (v = 0)
          float n = fbm(vec2(vUv.x * 3.0, vUv.y * 2.0 - uTempo * 0.12));
          float ondas = 0.5 + 0.5 * sin((vUv.y * 7.0 + uTempo * 0.9 + n * 3.0) * 6.2832);
          float espuma = smoothstep(0.62, 0.95, ondas * (0.6 + 0.6 * n));
          float faixa = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
          float a = (espuma * 0.75 + (1.0 - smoothstep(0.0, 0.25, vUv.y)) * 0.35) * faixa;
          #ifdef FOG_EXP2
            a *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #endif
          gl_FragColor = vec4(vec3(0.62, 0.74, 0.85) * a * 0.55, a);
        }
      `,
    });
    const faixa = new Mesh(g, m);
    foraDoReflexo.add(faixa);
    return faixa;
  }, []);
  useFrame((e) => {
    (malha.material as ShaderMaterial).uniforms.uTempo.value = e.clock.elapsedTime;
  });
  return <primitive object={malha} />;
}

/** Luzes esparsas na serra (casas e estradas de morro) e navios fundeados esperando para atracar. */
function LuzesDaPaisagem() {
  const pontos = useMemo(() => {
    const rnd = aleatorio(71);
    const pos: number[] = [];
    const cor: number[] = [];
    const c = new Color();
    let tentativas = 0;
    while (pos.length < 650 * 3 && tentativas++ < 20000) {
      const x = mix(-46000, -27000, rnd());
      const z = mix(-15000, 15000, rnd());
      const y = alturaCosta(x, z);
      if (y < 60 || y > 950 || rnd() > ruido2(x / 900, z / 900) * 1.3) continue;
      pos.push(x, y + 4, z);
      c.set(rnd() < 0.8 ? '#ffb066' : '#dfe8ff').multiplyScalar(0.6 + rnd() * 0.5);
      cor.push(c.r, c.g, c.b);
    }
    // navios fundeados ao largo do porto: uma fileira de luzes e a luz vermelha do mastro
    for (let k = 0; k < 7; k++) {
      const x0 = -25300 + rnd() * 1800;
      const z0 = -4200 + k * 1250 + rnd() * 400;
      const ang = rnd() * Math.PI;
      for (let i = 0; i < 9; i++) {
        const f = i / 8 - 0.5;
        pos.push(x0 + Math.cos(ang) * f * 170, 9 + (i === 1 ? 14 : 0), z0 + Math.sin(ang) * f * 170);
        c.set(i === 1 ? '#ff3a22' : '#ffe2b0');
        cor.push(c.r, c.g, c.b);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(cor), 3));
    return new Points(g, new PointsMaterial({
      size: 5.5, map: texturaBrilho(), vertexColors: true, transparent: true, depthWrite: false,
      blending: AdditiveBlending, sizeAttenuation: true, fog: true,
    }));
  }, []);
  return <primitive object={pontos} />;
}

/** Trânsito: faróis brancos num sentido e lanternas vermelhas no outro, na rodovia da orla e na ligação entre as cidades. */
function Transito({ qualidade }: { qualidade: Qualidade }) {
  const { pontos, tabelas, offs, n } = useMemo(() => {
    const via = (pts: [number, number][]) =>
      new CatmullRomCurve3(pts.map(([x, z]) => new Vector3(x, alturaCosta(x, z) + 3, z)), false, 'centripetal');
    const zs = [-9000, -6000, -3000, 0, 3000, 6000, 9000];
    const vias = [
      via(zs.map((z) => [linhaDaCosta(z) - 650, z])),
      via([[-29850, 1500], [-29700, -400], [-29400, -2400], [-29200, -3400]]),
      via([[-30400, 5400], [-34000, 5100], [-39000, 4700], [-45000, 4400]]),
    ];
    const tabelas = vias.map((v) => tabela(v, 1024));
    const porVia = qualidade === 'alta' ? 260 : 120;
    const n = porVia * vias.length;
    const offs = new Float32Array(n);
    const cor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      offs[i] = Math.random();
      const ida = i % 2 === 0;
      cor.set(ida ? [1, 0.92, 0.78] : [1, 0.12, 0.06], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new BufferAttribute(cor, 3));
    const pontos = new Points(g, new PointsMaterial({
      size: 4.5, map: texturaBrilho(), vertexColors: true, transparent: true, depthWrite: false,
      blending: AdditiveBlending, sizeAttenuation: true, fog: true,
    }));
    pontos.frustumCulled = false;
    foraDoReflexo.add(pontos);
    return { pontos, tabelas, offs, n };
  }, [qualidade]);
  const p = useMemo(() => new Vector3(), []);
  useFrame((e) => {
    // o litoral só aparece com a câmera perto dele (ver Costa): fora disso não gasta tempo
    if (e.camera.position.x > -11000) return;
    const t = e.clock.elapsedTime;
    const attr = pontos.geometry.getAttribute('position') as BufferAttribute;
    const arr = attr.array as Float32Array;
    const porVia = n / tabelas.length;
    for (let i = 0; i < n; i++) {
      const ida = i % 2 === 0;
      const tab = tabelas[Math.floor(i / porVia)];
      const s = (((offs[i] + (ida ? 1 : -1) * t * 0.004) % 1) + 1) % 1;
      pontoNaTabela(tab, s, p);
      arr[i * 3] = p.x + (ida ? 4 : -4);
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    attr.needsUpdate = true;
  });
  return <primitive object={pontos} />;
}

/** Vapor saindo das torres de resfriamento e chaminés da refinaria, iluminado de baixo pelas luzes. */
function Vapor() {
  const malha = useMemo(() => {
    // pontos de saída em coordenadas do Blender (x, y, altura), convertidos para o site (x, altura, -y)
    const fontes: [number, number, number][] = [
      [184.5, 207, 17], [228.5, 207, 17], [272.5, 235, 17], [206.5, 235, 17],
      [-20, 260, 111], [150, -260, 91], [-260, 180, 81],
    ];
    const porFonte = 9;
    const n = fontes.length * porFonte;
    const geo = new PlaneGeometry(1, 1);
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uTempo: { value: 0 } }]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute float aFase;
        uniform float uTempo;
        varying vec2 vUv;
        varying float vVida;
        void main() {
          vUv = uv;
          float vida = fract(uTempo * 0.035 + aFase);
          vVida = vida;
          vec3 centro = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          centro += vec3(vida * 26.0, vida * 95.0, vida * 10.0);   // sobe e é levado pelo vento
          float tam = 14.0 + vida * 70.0;
          vec3 direita = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 cima = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 p = centro + (direita * position.x + cima * position.y) * tam;
          vec4 mvPosition = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        varying vec2 vUv;
        varying float vVida;
        ${GLSL_RUIDO}
        void main() {
          vec2 d = vUv - 0.5;
          float r = length(d) * 2.0;
          float nuvem = fbm(vUv * 3.0 + vVida * 2.0);
          float a = (1.0 - smoothstep(0.35, 1.0, r + (nuvem - 0.5) * 0.5)) * smoothstep(0.0, 0.1, vVida) * (1.0 - vVida);
          a = clamp(a, 0.0, 1.0) * 0.11;
          #ifdef FOG_EXP2
            a *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #endif
          // embaixo, alaranjado pelas luzes da refinaria; em cima, cinza-azulado do luar
          vec3 cor = mix(vec3(1.0, 0.62, 0.35), vec3(0.55, 0.62, 0.75), clamp(vVida * 1.6, 0.0, 1.0));
          gl_FragColor = vec4(cor * a, a);
        }
      `,
    });
    const inst = new InstancedMesh(geo, mat, n);
    const fase = new Float32Array(n);
    const m = new Matrix4();
    fontes.forEach(([bx, by, bz], f) => {
      for (let k = 0; k < porFonte; k++) {
        const i = f * porFonte + k;
        fase[i] = k / porFonte + f * 0.137;
        m.makeTranslation(REFINARIA.x + bx, ALTURA_REFINARIA + bz, REFINARIA.z - by);
        inst.setMatrixAt(i, m);
      }
    });
    geo.setAttribute('aFase', new InstancedBufferAttribute(fase, 1));
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    foraDoReflexo.add(inst);
    return inst;
  }, []);
  useFrame((e) => {
    (malha.material as ShaderMaterial).uniforms.uTempo.value = e.clock.elapsedTime;
  });
  return <primitive object={malha} />;
}

const FRACOES = [
  { nome: 'GLP · gás de cozinha', z0: 51, z1: 60.5, cor: '#8fe6ff' },
  { nome: 'Gasolina e nafta', z0: 41, z1: 51, cor: '#ffe45c' },
  { nome: 'Querosene de aviação', z0: 31, z1: 41, cor: '#ffc247' },
  { nome: 'Diesel', z0: 21, z1: 31, cor: '#ff9a36' },
  { nome: 'Óleo combustível', z0: 11, z1: 21, cor: '#e2622a' },
  { nome: 'Resíduo → asfalto', z0: 4.6, z1: 11, cor: '#c2502a' },
];

const planoTorre = new Plane(new Vector3(1, 0, 0), 0);

/** Refinaria do Blender, com o corte da torre de destilação e a tocha. */
function Refinaria() {
  const { scene } = useModelo('refinaria');
  const internos = useRef<Mesh[]>([]);
  const rotulos = useRef<HTMLDivElement>(null);
  const centro = useMemo(() => new Vector3(TORRE.x, ALTURA_REFINARIA, TORRE.z), []);

  useMemo(() => {
    scene.position.set(REFINARIA.x, ALTURA_REFINARIA, REFINARIA.z);
    registrarPontos(scene);
    internos.current = [];
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (m.name === 'torre_torre_casco') {
        const mat = (m.material as MeshStandardMaterial).clone();
        mat.clippingPlanes = [planoTorre];
        mat.side = DoubleSide;
        m.material = mat;
      }
      if (m.name.startsWith('torre_internos')) {
        m.visible = false;
        m.material = (m.material as MeshStandardMaterial).clone();
        internos.current.push(m);
      }
    });
  }, [scene]);

  useFrame((estado) => {
    const k = cena.torre;
    // o plano corta a metade da torre voltada para a câmera
    const dir = new Vector3().subVectors(estado.camera.position, centro).setY(0).normalize();
    planoTorre.normal.copy(dir).negate();
    const afastamento = mix(4.5, -0.25, k);
    planoTorre.constant = -planoTorre.normal.dot(centro) + afastamento;
    for (const m of internos.current) {
      m.visible = k > 0.02;
      const mat = m.material as MeshStandardMaterial;
      if (m.name.includes('_fr_')) mat.emissiveIntensity = 0.95 * k;
    }
    if (rotulos.current) rotulos.current.style.opacity = String(suave(0.5, 1, k));
  });

  const tocha = PONTOS.ponto_tocha_refinaria;

  return (
    <group>
      {/* a refinaria fica longe da margem: fora do reflexo do mar (são 300 mil triângulos) */}
      <primitive object={scene} ref={semReflexo} />
      {tocha && <ChamaPequena posicao={tocha} />}
      <LuzesDaRefinaria />
      <Halo posicao={[REFINARIA.x, 60, REFINARIA.z]} escala={1600} cor="#ffb066" opacidade={0.035} />
      <Html position={[TORRE.x, ALTURA_REFINARIA, TORRE.z]} zIndexRange={[14, 10]} style={{ pointerEvents: 'none' }}>
        <div ref={rotulos} style={{ opacity: 0 }} className="relative h-0 w-0">
          {FRACOES.map((f) => (
            <span
              key={f.nome}
              className="rotulo absolute left-[90px] flex items-center gap-2 whitespace-nowrap !text-[10px] text-tinta"
              data-z={(f.z0 + f.z1) / 2}
            >
              <span className="inline-block h-px w-7" style={{ background: f.cor }} />
              {f.nome}
            </span>
          ))}
        </div>
      </Html>
      <PosicionarRotulos alvo={rotulos} />
    </group>
  );
}

/** Milhares de lâmpadas nas unidades, ruas e tanques: o "brilho" de uma refinaria à noite. */
function LuzesDaRefinaria() {
  const pontos = useMemo(() => {
    let s = 7;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const n = 5200;
    const pos = new Float32Array(n * 3);
    const cor = new Float32Array(n * 3);
    const c = new Color();
    for (let i = 0; i < n; i++) {
      // concentradas na área das unidades de processo (±300 m), espalhadas no resto
      const nasUnidades = i < n * 0.72;
      const raio = nasUnidades ? 330 * Math.sqrt(rnd()) : 900 * Math.sqrt(rnd());
      const a = rnd() * Math.PI * 2;
      const x = REFINARIA.x + Math.cos(a) * raio;
      const z = REFINARIA.z + Math.sin(a) * raio * 0.9;
      const y = ALTURA_REFINARIA + (nasUnidades ? 2 + rnd() * rnd() * 30 : 3 + rnd() * 6);
      pos.set([x, y, z], i * 3);
      c.set(rnd() < 0.78 ? '#ffb15e' : '#e8f0ff').multiplyScalar(0.7 + rnd() * 0.6);
      c.toArray(cor, i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('color', new BufferAttribute(cor, 3));
    return new Points(g, new PointsMaterial({
      size: 2.6, map: texturaBrilho(), vertexColors: true, transparent: true, depthWrite: false,
      blending: AdditiveBlending, sizeAttenuation: true, fog: true,
    }));
  }, []);
  return <primitive object={pontos} />;
}

/** Coloca cada rótulo de fração na altura certa da torre, projetando o ponto 3D na tela. */
function PosicionarRotulos({ alvo }: { alvo: React.RefObject<HTMLDivElement | null> }) {
  const p = useMemo(() => new Vector3(), []);
  const base = useMemo(() => new Vector3(), []);
  useFrame((estado) => {
    const el = alvo.current;
    if (!el || cena.torre < 0.01) return;
    const { camera, size } = estado;
    base.set(TORRE.x, ALTURA_REFINARIA, TORRE.z).project(camera);
    const yBase = (-base.y * 0.5 + 0.5) * size.height;
    el.querySelectorAll<HTMLSpanElement>('[data-z]').forEach((s) => {
      p.set(TORRE.x, ALTURA_REFINARIA + Number(s.dataset.z), TORRE.z).project(camera);
      const y = (-p.y * 0.5 + 0.5) * size.height;
      s.style.top = `${y - yBase}px`;
    });
  });
  return null;
}

function ChamaPequena({ posicao }: { posicao: Vector3 }) {
  const ref = useRef<Mesh>(null);
  useFrame((e) => {
    if (ref.current) ref.current.scale.setScalar(1 + 0.12 * Math.sin(e.clock.elapsedTime * 9));
  });
  return (
    <group position={posicao}>
      <mesh ref={ref} position={[0, 4, 0]}>
        <sphereGeometry args={[3.2, 12, 8]} />
        <meshBasicMaterial color="#ff8a33" toneMapped={false} />
      </mesh>
      <Halo posicao={[0, 5, 0]} escala={90} cor="#ff7a2c" opacidade={0.55} />
    </group>
  );
}

/** Rotas de distribuição: rios de luz saindo da refinaria para cidades, estradas e porto. */
function Distribuicao() {
  const rotas = useMemo(() => {
    const c = (pts: [number, number][]) =>
      new CatmullRomCurve3(
        pts.map(([x, z]) => new Vector3(x, alturaCosta(x, z) + 9, z)),
        false,
        'centripetal',
      );
    const r = REFINARIA;
    return [
      c([[r.x, r.z + 300], [r.x - 600, r.z + 1600], [-29400, 3600], [-30200, 5600], [-30800, 7800]]),
      c([[r.x - 200, r.z + 200], [r.x - 1500, r.z + 900], [-31200, 2600], [-34500, 3800], [-39000, 4400], [-46000, 5200]]),
      c([[r.x - 300, r.z - 200], [r.x - 900, r.z - 1800], [-29200, -4200], [-29800, -6200], [-30200, -8100]]),
      c([[r.x - 400, r.z - 100], [r.x - 2600, r.z - 1100], [-33500, -2600], [-38000, -3400], [-46000, -4800]]),
      c([[r.x + 200, r.z + 400], [r.x + 900, r.z + 1500], [-26400, 3400], [-26700, 5800]]),
      c([[r.x + 300, r.z - 300], [r.x + 1300, r.z - 600], [-25200, -650]]),
    ];
  }, []);
  // "rios de luz": um tubo brilhante que se acende do início ao fim conforme cena.rede
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uRede: { value: 0 }, uTempo: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uRede;
          uniform float uTempo;
          varying vec2 vUv;
          void main() {
            float aceso = smoothstep(uRede, uRede - 0.04, vUv.x);
            float pulso = 0.65 + 0.35 * sin(vUv.x * 160.0 - uTempo * 3.0);
            float centro = 1.0 - abs(vUv.y - 0.5) * 2.0;
            float a = aceso * pulso * (0.25 + 0.75 * centro) * 0.55;
            gl_FragColor = vec4(vec3(1.0, 0.62, 0.22) * a * 1.6, a);
          }
        `,
      }),
    [],
  );
  const tubos = useMemo(() => rotas.map((c) => sanear(new TubeGeometry(c, 400, 9, 6, false))), [rotas]);
  useFrame((e) => {
    material.uniforms.uRede.value = cena.rede * 1.04;
    material.uniforms.uTempo.value = e.clock.elapsedTime;
  });
  return (
    <group ref={semReflexo}>
      {tubos.map((g, i) => (
        <mesh key={`t${i}`} geometry={g} material={material} />
      ))}
      {rotas.map((curva, i) => (
        <Corrente
          key={i}
          curva={curva}
          n={700}
          cores={ROTA_CORES}
          tamanho={24}
          velocidade={0.012}
          frente={() => cena.rede}
          amostras={2048}
        />
      ))}
    </group>
  );
}

const ROTA_CORES = [OLEO, '#ffd27a'];

/** Litoral: relevo, refinaria, navio no píer, cidades e rotas de distribuição. */
export function Costa({ qualidade }: { qualidade: Qualidade }) {
  const aliviador = useModelo('aliviador');
  const atracado = useMemo(() => aliviador.scene.clone(true), [aliviador.scene]);
  const grupo = useRef<Group>(null);
  // o litoral (300 km na vida real) só aparece quando a câmera se aproxima dele
  useFrame((e) => {
    if (grupo.current) grupo.current.visible = e.camera.position.x < -11000;
  });
  return (
    <group ref={grupo}>
      <Relevo />
      <Arrebentacao />
      <Refinaria />
      <Vapor />
      <primitive object={atracado} position={[REFINARIA.x + 2470, 0, REFINARIA.z - 660]} rotation={[0, Math.PI, 0]} />
      <Cidade qualidade={qualidade} />
      <LuzesDaPaisagem />
      <Transito qualidade={qualidade} />
      <Distribuicao />
      {/* brilho alaranjado da iluminação das cidades no ar úmido */}
      {CIDADES.map((c) => (
        <Halo key={c.cx} posicao={[c.cx, 260, c.cz]} escala={Math.max(c.largura, c.prof) * 1.6} cor="#ff9a50" opacidade={0.05} />
      ))}
    </group>
  );
}

precarregar('refinaria');
