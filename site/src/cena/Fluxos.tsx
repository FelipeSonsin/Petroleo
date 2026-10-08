import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, Box3, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, type Curve, Frustum, Matrix4, Points,
  PointsMaterial, ShaderMaterial, Sphere, TubeGeometry, Vector3,
} from 'three';
import { cena, type Qualidade } from '../estado';
import { caminhoDoOleo, pontoNaTabela, tabela } from './trajetos';
import { semReflexo, texturaBrilho } from './util';

const p = new Vector3();
const visao = new Frustum();
const projecao = new Matrix4();

type Props = {
  curva: Curve<Vector3>;
  n: number;
  cores: string[];
  /** proporção de cada cor (mesma ordem de `cores`) */
  pesos?: number[];
  tamanho: number;
  velocidade: number;
  /** até onde o fluxo já chegou (0 a 1) */
  frente: () => number;
  amostras?: number;
};

/** Partículas luminosas correndo por dentro de uma curva, até a "frente" do fluxo. */
export function Corrente({ curva, n, cores, pesos, tamanho, velocidade, frente, amostras = 4096 }: Props) {
  const { pontos, tab, offs, base, esfera } = useMemo(() => {
    const tab = tabela(curva, amostras);
    // esfera que envolve o trajeto: se ela está fora da tela, não calcula as partículas no quadro
    const caixa = new Box3();
    for (let i = 0; i < tab.length; i += 3) caixa.expandByPoint(p.set(tab[i], tab[i + 1], tab[i + 2]));
    const esfera = caixa.getBoundingSphere(new Sphere());
    esfera.radius += tamanho * 2;
    const offs = new Float32Array(n);
    const base = new Float32Array(n * 3);
    const cor = new Color();
    const acumulado = (pesos ?? cores.map(() => 1)).reduce<number[]>((a, v, i) => [...a, (a[i - 1] ?? 0) + v], []);
    const total = acumulado[acumulado.length - 1];
    for (let i = 0; i < n; i++) {
      offs[i] = (i + Math.random() * 0.8) / n;
      const r = Math.random() * total;
      cor.set(cores[acumulado.findIndex((v) => r <= v)]);
      cor.toArray(base, i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(n * 4), 4));
    // sem neblina: o brilho do fluxo aparece mesmo no escuro do mar profundo
    const m = new PointsMaterial({
      size: tamanho, map: texturaBrilho(), vertexColors: true, transparent: true, depthWrite: false,
      blending: AdditiveBlending, sizeAttenuation: true, fog: false,
    });
    // as partículas correm dentro dos tubos: empurra cada uma um pouco para a câmera,
    // senão a parede do duto as esconde (no subsolo continuam escondidas pela rocha)
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        mvPosition.xyz += normalize(-mvPosition.xyz) * ${(0.9 + tamanho * 0.25).toFixed(2)};
        gl_Position = projectionMatrix * mvPosition;`,
      );
    };
    // o valor injetado muda com o tamanho: cada um precisa do seu programa
    m.customProgramCacheKey = () => `fluxo-${tamanho}`;
    const pontos = new Points(g, m);
    pontos.frustumCulled = false;
    return { pontos, tab, offs, base, esfera };
  }, [curva, n, cores, pesos, tamanho, amostras]);

  useFrame((estado) => {
    const f = frente();
    pontos.visible = f > 0.001;
    if (!pontos.visible) return;
    const cam = estado.camera;
    cam.updateMatrixWorld();
    projecao.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    visao.setFromProjectionMatrix(projecao);
    pontos.visible = visao.intersectsSphere(esfera);
    if (!pontos.visible) return;
    const t = estado.clock.elapsedTime;
    const pos = pontos.geometry.getAttribute('position') as BufferAttribute;
    const col = pontos.geometry.getAttribute('color') as BufferAttribute;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const s = (offs[i] + t * velocidade) % 1;
      pontoNaTabela(tab, s, p);
      pa[i * 3] = p.x;
      pa[i * 3 + 1] = p.y;
      pa[i * 3 + 2] = p.z;
      // atrás da frente: aceso; perto da frente: mais forte; depois dela: apagado
      const brilho = s > f ? 0 : 0.55 + 0.9 * Math.exp(-(f - s) * 60);
      ca[i * 4] = base[i * 3] * brilho;
      ca[i * 4 + 1] = base[i * 3 + 1] * brilho;
      ca[i * 4 + 2] = base[i * 3 + 2] * brilho;
      ca[i * 4 + 3] = brilho > 0 ? 1 : 0;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  return <primitive object={pontos} />;
}

export const OLEO = '#ffae42';
export const GAS = '#62e4ff';
export const AGUA = '#3f86ff';
const MISTURA = [OLEO, GAS, AGUA];
const PESOS_MISTURA = [0.72, 0.16, 0.12];
const SO_OLEO = [OLEO];
const SO_GAS = [GAS];
const SO_AGUA = [AGUA];

/**
 * Óleo (com gás e água misturados) subindo do reservatório até o separador da FPSO.
 * O parâmetro cena.fluxo segue marcos do roteiro (o poço tem 4 km e engoliria a animação):
 * 0,18 = chegou à árvore de natal; 0,30 = ponto de toque do riser; 0,86 = topo do riser; 1 = separador.
 */
export function FluxoDoOleo({ qualidade }: { qualidade: Qualidade }) {
  const { curva, marcos } = useMemo(() => {
    const curva = caminhoDoOleo();
    const acum = curva.getCurveLengths();
    const total = acum[acum.length - 1];
    const f = (i: number) => acum[i] / total;
    // [parâmetro, fração do comprimento]
    const marcos: [number, number][] = [[0, 0], [0.18, f(1)], [0.3, f(2)], [0.86, f(3)], [1, 1]];
    return { curva, marcos };
  }, []);
  const frente = () => {
    const p = cena.fluxo;
    for (let i = 1; i < marcos.length; i++) {
      const [p0, s0] = marcos[i - 1];
      const [p1, s1] = marcos[i];
      if (p <= p1) return s0 + ((p - p0) / (p1 - p0)) * (s1 - s0);
    }
    return 1;
  };
  return (
    <group ref={semReflexo}>
      <TuboDeLuz curva={curva} frente={frente} />
      <Corrente
        curva={curva}
        n={qualidade === 'alta' ? 2600 : 1300}
        cores={MISTURA}
        pesos={PESOS_MISTURA}
        tamanho={2.6}
        velocidade={0.0045}
        frente={frente}
      />
    </group>
  );
}

/**
 * Troca valores inválidos (NaN) por números seguros. Tubos ao longo de caminhos com emendas
 * bruscas podem gerar normais NaN, e um único pixel NaN vira uma tela preta depois do bloom.
 */
export function sanear<T extends BufferGeometry>(geo: T): T {
  for (const nome of ['position', 'normal', 'uv'] as const) {
    const attr = geo.getAttribute(nome) as BufferAttribute | undefined;
    if (!attr) continue;
    const a = attr.array as Float32Array;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i])) a[i] = nome === 'normal' && i % 3 === 1 ? 1 : 0;
    }
    attr.needsUpdate = true;
  }
  return geo;
}

/**
 * "Rio de luz" âmbar por dentro dos dutos, aceso do reservatório até onde o óleo já chegou.
 * Fica visível no escuro do mar profundo (como as correntes de luz da referência).
 */
function TuboDeLuz({ curva, frente }: { curva: Curve<Vector3>; frente: () => number }) {
  const { geo, mat } = useMemo(() => {
    const geo = sanear(new TubeGeometry(curva, 1600, 0.85, 8, false));
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uFrente: { value: 0 }, uTempo: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vBorda;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 nn = normalMatrix * normal;
          vec3 n = length(nn) > 1e-5 ? normalize(nn) : vec3(0.0, 0.0, 1.0);
          vBorda = clamp(abs(dot(n, normalize(-mv.xyz))), 0.0, 1.0);
          // empurra para a câmera para não ficar escondido dentro do riser
          mv.xyz += normalize(-mv.xyz) * 1.2;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uFrente;
        uniform float uTempo;
        varying vec2 vUv;
        varying float vBorda;
        // sem pow() e com tudo limitado: no Direct3D (Windows) um NaN aqui apagava a tela inteira
        void main() {
          float aceso = smoothstep(uFrente + 0.002, uFrente - 0.01, vUv.x);
          float cabeca = exp(-min(abs(vUv.x - uFrente) * 260.0, 30.0));
          float pulso = 0.7 + 0.3 * sin(vUv.x * 900.0 - uTempo * 6.0);
          float b = clamp(vBorda, 0.0, 1.0);
          float a = clamp((aceso * (0.35 + 0.25 * pulso) + cabeca * 1.4) * b * b, 0.0, 2.0);
          gl_FragColor = vec4(vec3(1.0, 0.58, 0.18) * a, min(a, 1.0));
        }
      `,
    });
    return { geo, mat };
  }, [curva]);
  useFrame((e) => {
    mat.uniforms.uFrente.value = frente();
    mat.uniforms.uTempo.value = e.clock.elapsedTime;
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />;
}

/** Depois do separador: óleo para os tanques do casco, gás para compressores e tocha, água tratada para o mar. */
export function SaidasDoSeparador() {
  const curvas = useMemo(() => {
    const c = (pts: [number, number, number][]) =>
      new CatmullRomCurve3(pts.map((v) => new Vector3(...v)), false, 'centripetal');
    return {
      oleo: c([[17.5, 33, -16], [17.5, 26, -15], [16, 16, -14], [10, 11, -10], [-20, 6, -6], [-60, 2, -4]]),
      gas: c([[17.5, 36.6, -16], [17.5, 42, -8], [30, 42, 6], [70, 40, 10], [118, 30, 4], [138, 60, 0], [147, 118, 0]]),
      agua: c([[17.5, 31.6, -16], [8, 24, -22], [-2, 14, -27], [-6, 6, -30], [-8, -4, -31]]),
    };
  }, []);
  const frente = () => Math.max(0, (cena.separador - 0.35) / 0.65);
  return (
    <group ref={semReflexo}>
      <Corrente curva={curvas.oleo} n={260} cores={SO_OLEO} tamanho={1.1} velocidade={0.045} frente={frente} amostras={512} />
      <Corrente curva={curvas.gas} n={420} cores={SO_GAS} tamanho={1.2} velocidade={0.03} frente={frente} amostras={1024} />
      <Corrente curva={curvas.agua} n={200} cores={SO_AGUA} tamanho={1.0} velocidade={0.05} frente={frente} amostras={512} />
    </group>
  );
}
