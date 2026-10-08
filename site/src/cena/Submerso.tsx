import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh, Matrix4, PlaneGeometry,
  Points, PointsMaterial, Quaternion, ShaderMaterial, UniformsLib, UniformsUtils, Vector3,
} from 'three';
import { cena, type Qualidade } from '../estado';
import { luzDaAgua } from './Ambiente';
import { GLSL_RUIDO, foraDoReflexo, texturaBrilho } from './util';

const FRIO = new Color('#7fc6ff');
const QUENTE = new Color('#ffb36b');
const m4 = new Matrix4();
const q = new Quaternion();
const s = new Vector3();
const p = new Vector3();
const Y = new Vector3(0, 1, 0);
const cor = new Color();

/**
 * Raios de luz descendo da superfície (feixes aditivos sempre de frente para a câmera).
 * Ficam presos ao mundo numa "caixa" que acompanha a câmera, então passam por ela com
 * paralaxe ao descer e subir. Perto da FPSO ficam alaranjados (luzes do convés).
 */
export function RaiosDeLuz({ qualidade }: { qualidade: Qualidade }) {
  const camera = useThree((st) => st.camera);
  const n = qualidade === 'alta' ? 22 : 12;
  const caixa = 420;
  const altura = 360;
  const { malha, base, larguras } = useMemo(() => {
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uTempo: { value: 0 }, uForca: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vCor;
        varying float vDist;
        varying float vSemente;
        void main() {
          vUv = uv;
          vCor = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
            vCor = instanceColor;
          #endif
          vec4 mundo = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vSemente = fract(instanceMatrix[3][0] * 0.0137 + instanceMatrix[3][2] * 0.0071);
          vec4 mv = viewMatrix * mundo;
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTempo;
        uniform float uForca;
        varying vec2 vUv;
        varying vec3 vCor;
        varying float vDist;
        varying float vSemente;
        ${GLSL_RUIDO}
        void main() {
          float bordas = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x);
          float n = ruido(vec2(vUv.x * 4.0 + vSemente * 40.0, vUv.y * 0.9 - uTempo * 0.05));
          float n2 = ruido(vec2(vUv.x * 11.0 - vSemente * 13.0, vUv.y * 2.0 + uTempo * 0.03));
          float estrias = 0.35 + 0.65 * (n * 0.65 + n2 * 0.35);
          float topo = vUv.y * vUv.y;
          float perto = smoothstep(14.0, 60.0, vDist) * (1.0 - smoothstep(260.0, 520.0, vDist));
          float a = clamp(bordas * estrias * topo * perto * uForca * 0.2, 0.0, 1.0);
          gl_FragColor = vec4(vCor * a, a);
        }
      `,
    });
    const geo = new PlaneGeometry(1, 1);
    geo.translate(0, -0.5, 0); // topo do plano na superfície
    const malha = new InstancedMesh(geo, mat, n);
    malha.frustumCulled = false;
    malha.renderOrder = 3;
    foraDoReflexo.add(malha);
    for (let i = 0; i < n; i++) malha.setColorAt(i, FRIO);
    const base = Array.from({ length: n }, () => [Math.random() * caixa, Math.random() * caixa]);
    const larguras = Array.from({ length: n }, () => 7 + Math.random() * 22);
    return { malha, base, larguras };
  }, [n]);

  useFrame((estado) => {
    const c = camera.position;
    const forca = luzDaAgua.raios;
    malha.visible = forca > 0.01 && cena.corte < 0.05;
    if (!malha.visible) return;
    const mat = malha.material as ShaderMaterial;
    mat.uniforms.uTempo.value = estado.clock.elapsedTime;
    mat.uniforms.uForca.value = forca;
    // perto da superfície os feixes começam nela; no fundo, acompanham a câmera (só um brilho difuso)
    const topo = Math.min(-0.5, c.y + 230);
    for (let i = 0; i < n; i++) {
      const [bx, bz] = base[i];
      const x = c.x + ((((bx - c.x) % caixa) + caixa) % caixa) - caixa / 2;
      const z = c.z + ((((bz - c.z) % caixa) + caixa) % caixa) - caixa / 2;
      // de frente para a câmera, girando só em volta do eixo vertical
      q.setFromAxisAngle(Y, Math.atan2(c.x - x, c.z - z));
      m4.compose(p.set(x, topo, z), q, s.set(larguras[i], altura, 1));
      malha.setMatrixAt(i, m4);
      // alaranjado sob as luzes da FPSO, azul do luar no resto
      const fpso = 1 - Math.min(1, Math.max(0, (Math.hypot(x, z * 1.6) - 120) / 260));
      malha.setColorAt(i, cor.copy(FRIO).lerp(QUENTE, fpso));
    }
    malha.instanceMatrix.needsUpdate = true;
    if (malha.instanceColor) malha.instanceColor.needsUpdate = true;
  });

  return <primitive object={malha} />;
}

/**
 * Plâncton luminoso: pontinhos azul-ciano que acendem e apagam devagar em volta da câmera, no mar
 * fundo. É o "brilho" da água escura: deixa a escuridão viva em vez de um preto chapado.
 */
export function Plancton({ qualidade }: { qualidade: Qualidade }) {
  const camera = useThree((st) => st.camera);
  const altura = useThree((st) => st.size.height);
  const dpr = useThree((st) => st.viewport.dpr);
  const n = qualidade === 'alta' ? 1100 : 450;
  const caixa = 120;
  const { pontos, base } = useMemo(() => {
    const base = new Float32Array(n * 3);
    const fase = new Float32Array(n);
    const tam = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) base[i * 3 + k] = Math.random() * caixa;
      fase[i] = Math.random() * Math.PI * 2;
      tam[i] = 0.12 + Math.random() ** 3 * 0.55;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aFase', new BufferAttribute(fase, 1));
    g.setAttribute('aTam', new BufferAttribute(tam, 1));
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, {
        uTempo: { value: 0 }, uEscala: { value: 400 }, uForca: { value: 0 }, uMapa: { value: null },
      }]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute float aFase;
        attribute float aTam;
        uniform float uTempo;
        uniform float uEscala;
        varying float vBrilho;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          // pisca devagar, cada um no seu ritmo (s >= 0: sem pow de número negativo)
          float s = max(sin(uTempo * (0.5 + fract(aFase * 3.7) * 1.3) + aFase), 0.0);
          vBrilho = 0.18 + 0.82 * s * s * s;
          gl_PointSize = aTam * uEscala / max(-mvPosition.z, 0.5);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform sampler2D uMapa;
        uniform float uForca;
        varying float vBrilho;
        void main() {
          float a = texture2D(uMapa, gl_PointCoord).a * vBrilho * uForca;
          #ifdef FOG_EXP2
            // partícula aditiva: a neblina apaga o brilho (em vez de clarear para a cor da névoa)
            a *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.5);
          #endif
          gl_FragColor = vec4(vec3(0.3, 0.8, 1.55) * a, a);
        }
      `,
    });
    m.uniforms.uMapa.value = texturaBrilho();
    const pts = new Points(g, m);
    pts.frustumCulled = false;
    foraDoReflexo.add(pts);
    return { pontos: pts, base };
  }, [n]);

  useFrame((estado) => {
    const c = camera.position;
    const t = estado.clock.elapsedTime;
    const forca = Math.min(1, Math.max(0, (-c.y - 60) / 500)) * (1 - Math.min(1, cena.corte * 3));
    pontos.visible = forca > 0.01;
    if (!pontos.visible) return;
    const m = pontos.material as ShaderMaterial;
    m.uniforms.uTempo.value = t;
    m.uniforms.uForca.value = forca;
    m.uniforms.uEscala.value = altura * 0.5 * dpr;
    const attr = pontos.geometry.getAttribute('position') as BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const bx = base[i * 3] + Math.sin(t * 0.07 + i) * 1.5;
      const by = base[i * 3 + 1] + t * 0.12;
      const bz = base[i * 3 + 2] + Math.cos(t * 0.05 + i * 2.3) * 1.5;
      arr[i * 3] = c.x + ((((bx - c.x) % caixa) + caixa) % caixa) - caixa / 2;
      arr[i * 3 + 1] = c.y + ((((by - c.y) % caixa) + caixa) % caixa) - caixa / 2;
      arr[i * 3 + 2] = c.z + ((((bz - c.z) % caixa) + caixa) % caixa) - caixa / 2;
    }
    attr.needsUpdate = true;
  });

  return <primitive object={pontos} />;
}

/**
 * Partículas grandes e desfocadas bem perto da câmera ("bokeh" de partículas em suspensão):
 * dão profundidade quando a câmera atravessa a água escura.
 */
export function Bokeh({ qualidade }: { qualidade: Qualidade }) {
  const camera = useThree((st) => st.camera);
  const n = qualidade === 'alta' ? 220 : 90;
  const caixa = 46;
  const { pontos, base } = useMemo(() => {
    const base = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) base[i] = Math.random() * caixa;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    const m = new PointsMaterial({
      size: 1.1, map: texturaBrilho(), color: '#a9d8f5', transparent: true, opacity: 0.16,
      depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true, fog: true,
    });
    const pts = new Points(g, m);
    pts.frustumCulled = false;
    foraDoReflexo.add(pts);
    return { pontos: pts, base };
  }, [n]);

  useFrame((estado) => {
    const c = camera.position;
    const t = estado.clock.elapsedTime;
    pontos.visible = c.y < -3 && cena.corte < 0.3;
    if (!pontos.visible) return;
    const attr = pontos.geometry.getAttribute('position') as BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const bx = base[i * 3] + Math.sin(t * 0.13 + i) * 0.6;
      const by = base[i * 3 + 1] + t * 0.18;
      const bz = base[i * 3 + 2] + Math.cos(t * 0.11 + i * 1.7) * 0.6;
      arr[i * 3] = c.x + ((((bx - c.x) % caixa) + caixa) % caixa) - caixa / 2;
      arr[i * 3 + 1] = c.y + ((((by - c.y) % caixa) + caixa) % caixa) - caixa / 2;
      arr[i * 3 + 2] = c.z + ((((bz - c.z) % caixa) + caixa) % caixa) - caixa / 2;
    }
    attr.needsUpdate = true;
  });

  return <primitive object={pontos} />;
}
