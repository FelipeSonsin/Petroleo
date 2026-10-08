import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html } from '@react-three/drei';
import {
  AdditiveBlending, DoubleSide, Mesh, MeshStandardMaterial, Object3D, Plane, PointLight, ShaderMaterial,
  Sprite, SpriteMaterial, Vector3,
} from 'three';
import { cena } from '../estado';
import { GLSL_RUIDO, texturaBrilho } from './util';
import { precarregar, useModelo } from './modelos';


/** Pontos de referência exportados do Blender (Empties "ponto_*"), em coordenadas do mundo. */
export const PONTOS: Record<string, Vector3> = {};

const planoSeparador = new Plane(new Vector3(0, 0, 1), 0);

/** Lê os Empties "ponto_*" de um modelo e guarda as posições no mundo. */
export function registrarPontos(raiz: Object3D) {
  raiz.updateMatrixWorld(true);
  raiz.traverse((o) => {
    if (o.name.startsWith('ponto_')) PONTOS[o.name] = o.getWorldPosition(new Vector3());
  });
}

/** FPSO vinda do Blender + tocha + luzes do convés + corte do separador trifásico. */
export function Plataforma() {
  const { scene } = useModelo('fpso');
  const dados = useMemo(() => {
    registrarPontos(scene);
    const fases: Mesh[] = [];
    let centroSep = new Vector3(17.5, 34.15, -16);
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mat = m.material as MeshStandardMaterial;
      if (m.name.includes('separador_casco')) {
        const novo = mat.clone();
        novo.clippingPlanes = [planoSeparador];
        novo.side = DoubleSide;
        m.material = novo;
      }
      if (m.name.startsWith('sep_')) {
        m.visible = false;
        fases.push(m);
      }
    });
    if (PONTOS.ponto_separador) centroSep = PONTOS.ponto_separador.clone();
    return { fases, centroSep };
  }, [scene]);

  useFrame(() => {
    const s = cena.separador;
    // o plano avança do lado da câmera (z menor) até o eixo do separador
    planoSeparador.constant = -(dados.centroSep.z - 3.2 + 3.35 * s);
    for (const f of dados.fases) {
      f.visible = s > 0.02;
      // opacos e com brilho moderado: com transparência + bloom as três fases viravam um borrão branco
      (f.material as MeshStandardMaterial).emissiveIntensity = 0.85 * s;
    }
  });

  const tocha = PONTOS.ponto_tocha ?? new Vector3(148, 124.5, 0);
  const c = dados.centroSep;

  return (
    <group>
      <primitive object={scene} />
      <Tocha posicao={tocha} />
      {/* luzes de sódio que iluminam os módulos (poucas luzes reais: cada uma pesa em todos os materiais) */}
      {[-45, 70].map((x) => (
        <pointLight key={x} position={[x, 34, 0]} color="#ffb070" intensity={2600} distance={260} decay={2} />
      ))}
      <Halo posicao={[0, 30, 0]} escala={520} cor="#ff9f55" opacidade={0.14} />
      <Halo posicao={[-130, 30, 0]} escala={180} cor="#ffe2c0" opacidade={0.08} />
      <RotulosSeparador centro={c} />
    </group>
  );
}

function RotulosSeparador({ centro }: { centro: Vector3 }) {
  const grupo = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const s = cena.separador;
    if (grupo.current) grupo.current.style.opacity = String(Math.max(0, (s - 0.55) / 0.45));
  });
  const itens = [
    { nome: 'Gás', y: 1.6, cor: '#5fe3ff' },
    { nome: 'Óleo', y: 0.0, cor: '#ffb547' },
    { nome: 'Água', y: -1.65, cor: '#4f8dff' },
  ];
  return (
    // a câmera olha para +Z: o lado -X do separador fica à direita na tela
    <Html position={[centro.x - 10.5, centro.y, centro.z - 2.4]} center zIndexRange={[15, 10]} style={{ pointerEvents: 'none' }}>
      <div ref={grupo} style={{ opacity: 0 }} className="relative h-0 w-0">
        {itens.map((it) => (
          <span
            key={it.nome}
            className="rotulo absolute left-0 flex items-center gap-2 whitespace-nowrap !text-[10px] text-tinta"
            style={{ top: `${-it.y * 26}px` }}
          >
            <span className="inline-block h-px w-6" style={{ background: it.cor }} />
            {it.nome}
          </span>
        ))}
      </div>
    </Html>
  );
}

/** Halo de luz no ar úmido em volta das luzes (lido de longe como "brilho" da plataforma). */
export function Halo({ posicao, escala, cor, opacidade }: {
  posicao: [number, number, number]; escala: number; cor: string; opacidade: number;
}) {
  const sprite = useMemo(() => {
    const s = new Sprite(new SpriteMaterial({
      map: texturaBrilho(), color: cor, transparent: true, opacity: opacidade, blending: AdditiveBlending,
      depthWrite: false, fog: false,
    }));
    s.scale.setScalar(escala);
    return s;
  }, [cor, escala, opacidade]);
  return <primitive object={sprite} position={posicao} />;
}

/** Chama da tocha: shader animado em um plano voltado para a câmera + luz alaranjada tremulante. */
function Tocha({ posicao }: { posicao: Vector3 }) {
  const luz = useRef<PointLight>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { uTempo: { value: 0 }, uForca: { value: 5.5 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTempo;
          uniform float uForca;
          varying vec2 vUv;
          ${GLSL_RUIDO}
          void main() {
            vec2 uv = vUv;
            float n = fbm(vec2(uv.x * 3.2, uv.y * 3.0 - uTempo * 2.6));
            float n2 = fbm(vec2(uv.x * 7.0 + 3.0, uv.y * 6.0 - uTempo * 4.1));
            vec2 p = uv - vec2(0.5, 0.06);
            p.x += (n - 0.5) * 0.42 * uv.y + sin(uTempo * 1.3 + uv.y * 3.0) * 0.04 * uv.y;
            float largura = mix(0.2, 0.035, pow(clamp(uv.y, 0.0, 1.0), 0.8)) * (0.75 + n2 * 0.5);
            float forma = smoothstep(largura, largura * 0.15, abs(p.x));
            forma *= smoothstep(1.0, 0.3, uv.y + (n - 0.5) * 0.35) * smoothstep(0.0, 0.05, uv.y);
            vec3 c = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.2), forma);
            forma = clamp(forma, 0.0, 1.0);
            c = mix(c, vec3(1.0, 0.95, 0.8), pow(forma, 3.5));
            gl_FragColor = vec4(c * forma * uForca, forma);
          }
        `,
      }),
    [],
  );

  useFrame((estado) => {
    const t = estado.clock.elapsedTime;
    material.uniforms.uTempo.value = t;
    if (luz.current) luz.current.intensity = 42000 * (0.86 + 0.1 * Math.sin(t * 9.0) + 0.06 * Math.sin(t * 23.0));
  });

  return (
    <group position={posicao}>
      <Billboard lockX={false} lockZ={false} position={[0, 14, 0]}>
        <mesh material={material}>
          <planeGeometry args={[16, 34]} />
        </mesh>
      </Billboard>
      <pointLight ref={luz} position={[0, 10, 0]} color="#ff7a2c" intensity={42000} decay={2} distance={0} />
      <Halo posicao={[0, 12, 0]} escala={140} cor="#ff6a1f" opacidade={0.5} />
    </group>
  );
}

precarregar('fpso');
