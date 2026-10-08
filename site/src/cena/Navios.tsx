import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending, BufferGeometry, CatmullRomCurve3, Group, Line, LineBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, ShaderMaterial, TubeGeometry, Vector3,
} from 'three';
import { cena, leitura } from '../estado';
import { ALIVIADOR, SISMICO, SONDA } from '../mundo';
import { precarregar, useModelo } from './modelos';
import { GLSL_RUIDO, semReflexo } from './util';
import { sanear } from './Fluxos';

/** Rota do aliviador que já partiu carregado rumo à costa (a câmera o acompanha). */
export function posicaoAliviadorEmViagem(t: number) {
  return new Vector3(-1400 - 19000 * t, 0, -300);
}

function Balanco({ children, fase = 0, amp = 1 }: { children: React.ReactNode; fase?: number; amp?: number }) {
  const g = useRef<Group>(null);
  useFrame((e) => {
    const t = e.clock.elapsedTime + fase;
    if (!g.current) return;
    g.current.position.y = Math.sin(t * 0.5) * 0.35 * amp;
    g.current.rotation.x = Math.sin(t * 0.37) * 0.006 * amp;
    g.current.rotation.z = Math.sin(t * 0.43) * 0.004 * amp;
  });
  return <group ref={g}>{children}</group>;
}

/** Esteira de espuma atrás de um navio em movimento. */
function Esteira({ comprimento = 900, largura = 70 }: { comprimento?: number; largura?: number }) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uTempo: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTempo;
          varying vec2 vUv;
          ${GLSL_RUIDO}
          void main() {
            // pow() com base negativa vira NaN no Direct3D e o bloom espalha a tela preta: sempre limitar
            float ao_longo = clamp(vUv.x, 0.0, 1.0);   // 0 = popa, 1 = fim da esteira
            float lado = abs(vUv.y - 0.5) * 2.0;
            float largura = mix(0.25, 1.0, ao_longo);
            float centro = smoothstep(largura, 0.0, lado);
            float n = fbm(vec2(ao_longo * 40.0 - uTempo * 0.6, vUv.y * 9.0));
            float espuma = centro * smoothstep(0.35, 0.8, n) * pow(max(1.0 - ao_longo, 0.0), 1.6);
            float bordas = smoothstep(0.08, 0.0, abs(lado - largura * 0.92)) * (1.0 - ao_longo) * 0.5;
            float a = (espuma + bordas) * 0.22;
            gl_FragColor = vec4(vec3(0.75, 0.85, 0.95) * a, a);
          }
        `,
      }),
    [],
  );
  const geo = useMemo(() => {
    const g = new PlaneGeometry(comprimento, largura, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(comprimento / 2, 0.4, 0);
    return g;
  }, [comprimento, largura]);
  useFrame((e) => {
    mat.uniforms.uTempo.value = e.clock.elapsedTime;
  });
  return <mesh geometry={geo} material={mat} />;
}

/** Cabos sísmicos (streamers) arrastados pelo navio de pesquisa, com boias de cauda piscando. */
function Streamers() {
  const { linhas, material, boias } = useMemo(() => {
    const material = new LineBasicMaterial({
      color: '#ffb35a', transparent: true, opacity: 0.0, blending: AdditiveBlending, depthWrite: false,
    });
    const linhas: Line[] = [];
    const boias: Vector3[] = [];
    const popa = new Vector3(SISMICO.x - 48.5, -4, SISMICO.z);
    for (let k = 0; k < 6; k++) {
      const z = SISMICO.z + (k - 2.5) * 100;
      const pts = [popa, new Vector3(popa.x - 300, -8, z * 0.6 + popa.z * 0.4), new Vector3(popa.x - 500, -8, z),
        new Vector3(popa.x - 3400, -8, z + (k - 2.5) * 18)];
      const curva = new CatmullRomCurve3(pts, false, 'centripetal');
      const g = new BufferGeometry().setFromPoints(curva.getPoints(80));
      linhas.push(new Line(g, material));
      boias.push(pts[pts.length - 1].clone().setY(0.6));
    }
    return { linhas, material, boias };
  }, []);
  const luzes = useRef<Group>(null);
  const grupo = useRef<Group>(null);
  // os cabos ficam debaixo d'água e só aparecem no corte: fora do reflexo do mar
  useLayoutEffect(() => semReflexo(grupo.current), []);
  useFrame((e) => {
    const s = cena.sismica;
    material.opacity = Math.min(1, s * 6) * 0.55 + 0.08;
    if (luzes.current) luzes.current.visible = Math.sin(e.clock.elapsedTime * 3) > 0.2;
    // só no corte geológico: fora dele as boias apareciam como bolhas no caminho do aliviador
    if (grupo.current) grupo.current.visible = cena.corte > 0.3;
  });
  return (
    <group ref={grupo}>
      {linhas.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
      <group ref={luzes}>
        {boias.map((b, i) => (
          <mesh key={i} position={b}>
            <sphereGeometry args={[1.2, 8, 6]} />
            <meshBasicMaterial color="#ffd27a" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const materialMangote = new MeshStandardMaterial({ color: '#3a1712', roughness: 0.6 });

/** Navio-sonda, navio sísmico e os aliviadores (um encostado na FPSO e outro viajando). */
export function Navios() {
  const sonda = useModelo('navio_sonda');
  const sismico = useModelo('sismico');
  const aliviador = useModelo('aliviador');
  const viajante = useMemo(() => aliviador.scene.clone(true), [aliviador.scene]);
  const grupoViajante = useRef<Group>(null);

  const mangote = useMemo(() => {
    const proa = new Vector3(ALIVIADOR.x + 136.5, 6, ALIVIADOR.z);
    const pts = [new Vector3(-152.5, 10, 0), new Vector3(-163, 1.5, 3), new Vector3(-190, 0.35, 8),
      new Vector3(-260, 0.35, 9), new Vector3(-318, 1.2, 3), proa];
    return sanear(new TubeGeometry(new CatmullRomCurve3(pts, false, 'centripetal'), 120, 0.45, 8, false));
  }, []);

  useFrame(() => {
    const g = grupoViajante.current;
    if (!g) return;
    const a = cena.aliviador;
    g.position.copy(posicaoAliviadorEmViagem(Math.min(1, Math.max(0, a))));
    // durante a viagem o navio fica exatamente no alvo da câmera (a curva da câmera não é linear)
    if (a > 0.001 && a < 0.999) g.position.x = leitura.alvoX;
  });

  return (
    <group>
      <group position={[SONDA.x, 0, SONDA.z]}>
        <Balanco fase={1.3}>
          <primitive object={sonda.scene} />
        </Balanco>
      </group>
      <group position={[SISMICO.x, 0, SISMICO.z]}>
        <Balanco fase={2.1} amp={1.4}>
          <primitive object={sismico.scene} />
        </Balanco>
      </group>
      <Streamers />
      <group position={[ALIVIADOR.x, 0, ALIVIADOR.z]}>
        <Balanco fase={0.7}>
          <primitive object={aliviador.scene} />
        </Balanco>
      </group>
      <mesh geometry={mangote} material={materialMangote} />
      <group ref={grupoViajante} rotation={[0, Math.PI, 0]}>
        <Balanco fase={3.3}>
          <primitive object={viajante} />
        </Balanco>
        <group position={[-138, 0, 0]} rotation={[0, Math.PI, 0]}>
          <Esteira />
        </group>
      </group>
    </group>
  );
}

precarregar('navio_sonda', 'sismico', 'aliviador');
