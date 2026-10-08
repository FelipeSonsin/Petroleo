import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, ConeGeometry, DoubleSide, Euler,
  Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Plane, PointLight, Points,
  PointsMaterial, Quaternion, ShaderMaterial, Sprite, SpriteMaterial, TubeGeometry, Vector3,
} from 'three';
import { cena, type Qualidade } from '../estado';
import { CORTE_Z, POCOS, POCO_PRINCIPAL, SONDA } from '../mundo';
import { precarregar, useModelo } from './modelos';
import { DUTOS, alturaFundo, fbm2, ruido2 } from './trajetos';
import { GLSL_RUIDO, semReflexo, texturaBrilho } from './util';
import { sanear } from './Fluxos';

/** Plano que esconde o lado da câmera durante o corte geológico (o fundo some até a face do corte). */
export const planoCorte = new Plane(new Vector3(0, 0, 1), 1e6);

/** Atualiza o plano de corte conforme cena.corte (0 = nada cortado; 1 = corte em CORTE_Z). */
export function AtualizarCorte() {
  useFrame(() => {
    const k = cena.corte;
    // a varredura vem de trás da câmera até a face do corte
    const z = k <= 0.001 ? -1e6 : CORTE_Z - (1 - k) ** 2 * 14000;
    planoCorte.constant = -z;
  });
  return null;
}

const corFundo = new Color();
const farol = new Vector3();
const frente = new Vector3();
const acima = new Vector3();

/** Fundo do mar: relevo suave em lodo, mais detalhado perto do poço principal. */
function Relevo() {
  const geo = useMemo(() => {
    // grade mais fina perto do campo (x ~ -850) e mais espaçada nas bordas
    const nx = 260;
    const nz = 120;
    const xs = Array.from({ length: nx + 1 }, (_, i) => {
      const u = (i / nx) * 2 - 1;
      return POCO_PRINCIPAL.x + Math.sign(u) * Math.abs(u) ** 2.2 * 9500;
    });
    const zs = Array.from({ length: nz + 1 }, (_, j) => {
      const u = (j / nz) * 2 - 1;
      return POCO_PRINCIPAL.z + Math.sign(u) * Math.abs(u) ** 2.2 * 7000;
    });
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    const cor = new Float32Array((nx + 1) * (nz + 1) * 3);
    let k = 0;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = xs[i];
        const z = zs[j];
        pos[k] = x;
        pos[k + 1] = alturaFundo(x, z);
        pos[k + 2] = z;
        // lodo cinza-amarronzado, com manchas grandes mais claras e mais escuras
        const v = fbm2(x / 160, z / 160);
        const w = fbm2(x / 900 + 7, z / 900);
        corFundo.setRGB(0.15 + v * 0.07 + w * 0.03, 0.14 + v * 0.06 + w * 0.025, 0.12 + v * 0.045);
        corFundo.toArray(cor, k);
        k += 3;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const c = a + nx + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('color', new BufferAttribute(cor, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => materialFundoDoMar(), []);
  return <mesh geometry={geo} material={mat} />;
}

/**
 * Lodo do fundo do mar com detalhe procedural (sem textura): manchas, marcas de corrente,
 * pedrinhas e um relevo fino que aparece sob o farol do ROV.
 */
function materialFundoDoMar() {
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, clippingPlanes: [planoCorte] });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFundo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFundo = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFundo;
        ${GLSL_RUIDO}
        float marcas(vec2 p) {
          // marcas de corrente no lodo: ondas longas, tortas pelo ruído
          return sin(dot(p, vec2(0.55, 0.83)) * 1.7 + fbm(p * 0.07) * 6.0) * 0.5 + 0.5;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vFundo.xz;
          float mancha = fbm(p * 0.035);
          float pedras = smoothstep(0.8, 0.93, ruido(p * 1.4)) * smoothstep(0.35, 0.6, ruido(p * 0.11));
          float conchas = smoothstep(0.93, 0.985, ruido(p * 3.1 + 7.0));
          diffuseColor.rgb *= 0.72 + 0.42 * mancha + 0.1 * marcas(p) - 0.3 * pedras;
          diffuseColor.rgb += vec3(0.05, 0.048, 0.04) * conchas;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // relevo fino por derivadas de tela (mesma ideia do bump do three.js, sem textura)
          float hf = marcas(vFundo.xz) * 0.09 + ruido(vFundo.xz * 1.4) * 0.05;
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          float lx = length(sx);
          float ly = length(sy);
          if (lx > 1e-6 && ly > 1e-6) {
            sx /= lx;
            sy /= ly;
            vec3 r1 = cross(sy, normal);
            vec3 r2 = cross(normal, sx);
            float det = dot(sx, r1);
            float forca = 1.0 - smoothstep(25.0, 90.0, length(vViewPosition));
            vec3 grad = sign(det) * (dFdx(hf) * r1 + dFdy(hf) * r2) * forca * 3.0;
            vec3 nb = abs(det) * normal - grad;
            float lb = length(nb);
            if (lb > 1e-6) normal = nb / lb;
          }
        }`);
  };
  mat.customProgramCacheKey = () => 'fundo-do-mar';
  return mat;
}

/** Pedras espalhadas pelo fundo, mais densas perto dos poços (dão escala e textura à cena). */
function Pedras() {
  const malha = useMemo(() => {
    const geo = new IcosahedronGeometry(1, 0);
    const mat = new MeshStandardMaterial({ color: '#4a463f', roughness: 0.95, flatShading: true, clippingPlanes: [planoCorte] });
    const n = 900;
    const inst = new InstancedMesh(geo, mat, n);
    const m = new Matrix4();
    const qq = new Quaternion();
    const e = new Euler();
    const sc = new Vector3();
    const pp = new Vector3();
    let semente = 11;
    const rnd = () => {
      semente = (semente * 16807) % 2147483647;
      return semente / 2147483647;
    };
    for (let i = 0; i < n; i++) {
      // metade num raio de 160 m do campo, metade espalhada até ~900 m
      const raio = i < n / 2 ? 160 * Math.sqrt(rnd()) : 900 * Math.sqrt(rnd());
      const ang = rnd() * Math.PI * 2;
      const x = POCO_PRINCIPAL.x + Math.cos(ang) * raio;
      const z = POCO_PRINCIPAL.z + Math.sin(ang) * raio * 0.8;
      const t = 0.25 + rnd() ** 3 * 1.6 * (0.6 + ruido2(x / 40, z / 40));
      sc.set(t * (0.8 + rnd() * 0.6), t * (0.45 + rnd() * 0.4), t * (0.8 + rnd() * 0.6));
      pp.set(x, alturaFundo(x, z) - sc.y * 0.35, z);
      qq.setFromEuler(e.set(rnd() * 0.6, rnd() * Math.PI * 2, rnd() * 0.6));
      m.compose(pp, qq, sc);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }, []);
  return <primitive object={malha} />;
}

/**
 * Lâmpadas de trabalho em cada árvore de natal: um brilho suave na água (com neblina, então
 * some com a distância) para o campo de produção ser lido de longe, no escuro.
 */
function LuzesDoCampo() {
  const sprites = useMemo(
    () =>
      POCOS.flatMap((p) => {
        const y = alturaFundo(p.x, p.z);
        const fazer = (dx: number, dy: number, dz: number, escala: number, cor: string, op: number) => {
          const s = new Sprite(new SpriteMaterial({
            map: texturaBrilho(), color: cor, transparent: true, opacity: op, blending: AdditiveBlending,
            depthWrite: false, fog: true,
          }));
          s.position.set(p.x + dx, y + dy, p.z + dz);
          s.scale.setScalar(escala);
          return s;
        };
        return [fazer(0, 5.2, 0, 26, '#9fdcff', 0.22), fazer(0, 5.2, 0, 3.2, '#e6f6ff', 0.9),
          fazer(2.6, 1.2, -2.6, 9, '#7fffb0', 0.18)];
      }),
    [],
  );
  useFrame(() => {
    const vis = cena.corte < 0.5;
    for (const s of sprites) s.visible = vis;
  });
  return (
    <group>
      {sprites.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
    </group>
  );
}

// risers e amarras em tons um pouco mais claros: no mar azul-escuro viram silhuetas legíveis
const materialRiser = new MeshStandardMaterial({ color: '#2b3136', roughness: 0.42, metalness: 0.3 });
const materialFlutuador = new MeshStandardMaterial({ color: '#e07a1e', roughness: 0.5 });
const materialAmarra = new MeshStandardMaterial({ color: '#30353a', roughness: 0.6, metalness: 0.35 });

/** Risers (lazy wave), dutos no fundo, flutuadores e linhas de ancoragem. */
function Dutos() {
  const { tubos, flutuadores } = useMemo(() => {
    const tubos: TubeGeometry[] = [];
    const mats: Matrix4[] = [];
    const q = new Quaternion();
    const Y = new Vector3(0, 1, 0);
    for (const d of DUTOS) {
      tubos.push(sanear(new TubeGeometry(d.riser, 420, 0.42, 8, false)));
      tubos.push(sanear(new TubeGeometry(d.fundo, 60, 0.36, 6, false)));
      const [a, b] = d.flutuadores;
      for (let t = a; t <= b; t += 0.0045) {
        const p = d.riser.getPointAt(t);
        const tg = d.riser.getTangentAt(t);
        q.setFromUnitVectors(Y, tg);
        mats.push(new Matrix4().compose(p, q, new Vector3(1, 1, 1)));
      }
    }
    const geoF = new TubeGeometry(new CatmullRomCurve3([new Vector3(0, -1.1, 0), new Vector3(0, 1.1, 0)]), 1, 1.25, 10, false);
    const inst = new InstancedMesh(geoF, materialFlutuador, mats.length);
    mats.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    return { tubos, flutuadores: inst };
  }, []);

  const amarras = useMemo(() => {
    const saidas = [
      new Vector3(135, -1, -20.5), new Vector3(135, -1, 20.5), new Vector3(-138, -1, -22), new Vector3(-138, -1, 22),
    ];
    const geos: TubeGeometry[] = [];
    saidas.forEach((s) => {
      for (let k = -1; k <= 1; k++) {
        const ang = Math.atan2(s.z, s.x) + k * 0.12;
        const ax = s.x + Math.cos(ang) * 2100;
        const az = s.z + Math.sin(ang) * 2100;
        const ancora = new Vector3(ax, alturaFundo(ax, az) + 0.5, az);
        const meio = s.clone().lerp(ancora, 0.55);
        meio.y -= 60;
        const curva = new CatmullRomCurve3([s, meio, ancora], false, 'centripetal');
        geos.push(sanear(new TubeGeometry(curva, 120, 0.22, 5, false)));
      }
    });
    return geos;
  }, []);

  return (
    <group>
      {tubos.map((g, i) => (
        <mesh key={i} geometry={g} material={materialRiser} />
      ))}
      <primitive object={flutuadores} />
      {amarras.map((g, i) => (
        <mesh key={`a${i}`} geometry={g} material={materialAmarra} />
      ))}
    </group>
  );
}

/** Árvores de natal molhadas sobre cada poço. */
function Arvores() {
  const { scene } = useModelo('anm');
  const copias = useMemo(
    () =>
      POCOS.map((p) => {
        const c = scene.clone(true);
        c.position.set(p.x, alturaFundo(p.x, p.z), p.z);
        c.rotation.y = p.x < 0 ? 0 : Math.PI;
        return c;
      }),
    [scene],
  );
  return (
    <group>
      {copias.map((c, i) => (
        <primitive key={i} object={c} />
      ))}
    </group>
  );
}

/** Feixe de luz visível na água (cone aditivo com degradê). */
function Feixe({ comprimento = 46, abertura = 0.42 }: { comprimento?: number; abertura?: number }) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { uCor: { value: new Color('#bfe6ff') } },
        vertexShader: /* glsl */ `
          varying float vT;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            vT = uv.y;
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uCor;
          varying float vT;
          varying vec3 vN;
          varying vec3 vV;
          void main() {
            float borda = pow(abs(dot(vN, vV)), 1.6);
            float a = pow(clamp(vT, 0.0, 1.0), 2.2) * borda * 0.16;
            gl_FragColor = vec4(uCor * a, a);
          }
        `,
      }),
    [],
  );
  const geo = useMemo(() => {
    const g = new ConeGeometry(Math.tan(abertura) * comprimento, comprimento, 24, 1, true);
    g.translate(0, -comprimento / 2, 0);
    g.rotateZ(Math.PI / 2);
    return g;
  }, [abertura, comprimento]);
  return <mesh geometry={geo} material={mat} />;
}

/** ROV iluminando a árvore de natal principal, com cabo umbilical subindo para o escuro. */
function Rov() {
  const { scene } = useModelo('rov');
  const grupo = useRef<Group>(null);
  const corpo = useRef<Group>(null);
  const luz = useRef<PointLight>(null);
  const alvo = useMemo(() => new Object3D(), []);
  const p = POCO_PRINCIPAL;
  const base = useMemo(() => new Vector3(p.x - 7.5, alturaFundo(p.x, p.z) + 3.2, p.z - 6.5), [p]);
  const cabo = useMemo(() => {
    // sai da terminação do umbilical no topo do ROV (ponto_cabo do modelo do Blender)
    const pts = [new Vector3(0.35, 2.05, 0), new Vector3(-2, 40, -3), new Vector3(6, 160, -20), new Vector3(30, 600, -40)];
    return new TubeGeometry(new CatmullRomCurve3(pts), 60, 0.05, 4, false);
  }, []);

  useLayoutEffect(() => {
    alvo.position.set(p.x, alturaFundo(p.x, p.z) + 2.2, p.z);
  }, [alvo, p]);
  // o corpo do ROV sai do reflexo do mar (a luz dele fica, ver CampoSubmarino)
  useLayoutEffect(() => semReflexo(grupo.current), []);

  useFrame((estado) => {
    const t = estado.clock.elapsedTime;
    const g = grupo.current;
    if (!g) return;
    g.position.set(base.x + Math.sin(t * 0.4) * 0.3, base.y + Math.sin(t * 0.7) * 0.25, base.z + Math.cos(t * 0.3) * 0.25);
    g.lookAt(alvo.position);
    g.rotateY(-Math.PI / 2);
    // A luz fica sempre na cena (mudar o número de luzes recompila todos os materiais).
    // Perto do poço ela é o farol do ROV; no resto do mar fundo vira a "lanterna" da câmera,
    // que revela risers e dutos por perto; acima d'água ou no corte, apaga.
    const cam = estado.camera.position;
    const dist = cam.distanceTo(base);
    const perto = dist < 900 && cena.corte < 0.5;
    if (corpo.current) corpo.current.visible = perto;
    const l = luz.current;
    if (!l) return;
    if (perto && dist < 55) {
      l.position.copy(g.localToWorld(farol.set(4.5, 1.6, 0)));
      l.intensity = 230;
      l.distance = 110;
    } else if (cam.y < -40 && cena.corte < 0.5) {
      estado.camera.getWorldDirection(frente);
      l.position.copy(cam).addScaledVector(frente, 40).add(acima.set(0, 25, 0));
      l.intensity = 2600;
      l.distance = 420;
    } else {
      l.intensity = 0;
    }
  });

  return (
    <>
      <primitive object={alvo} />
      <group ref={grupo}>
        <group ref={corpo}>
          <primitive object={scene} />
          <mesh geometry={cabo} material={materialAmarra} />
          <group position={[1.75, 0.75, -0.7]} rotation={[0, 0.2, -0.12]}>
            <Feixe />
          </group>
          <group position={[1.75, 0.75, 0.7]} rotation={[0, -0.2, -0.12]}>
            <Feixe />
          </group>
        </group>
      </group>
      {/* uma luz pontual só (holofotes "spot" deixam todos os shaders bem mais pesados) */}
      <pointLight ref={luz} color="#d6ecff" intensity={0} distance={70} decay={2} />
    </>
  );
}

/** BOP no fundo e riser de perfuração subindo até o navio-sonda. */
function Perfuracao() {
  const { scene } = useModelo('bop');
  const yBop = alturaFundo(SONDA.x, SONDA.z);
  const riser = useMemo(() => {
    const g = new TubeGeometry(
      new CatmullRomCurve3([new Vector3(SONDA.x, yBop + 15.5, SONDA.z), new Vector3(SONDA.x, -12, SONDA.z)]),
      2, 0.55, 10, false,
    );
    return g;
  }, [yBop]);
  return (
    <group>
      <primitive object={scene} position={[SONDA.x, yBop, SONDA.z]} />
      <mesh geometry={riser} material={materialRiser} />
    </group>
  );
}

/** "Neve marinha": partículas em volta da câmera quando ela está submersa. */
function NeveMarinha({ qualidade }: { qualidade: Qualidade }) {
  const camera = useThree((s) => s.camera);
  const n = qualidade === 'alta' ? 3400 : 1300;
  const caixa = 140;
  const { pontos, base } = useMemo(() => {
    const base = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) base[i] = Math.random() * caixa;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    const m = new PointsMaterial({
      size: 0.32, map: texturaBrilho(), color: '#cde9ff', transparent: true, opacity: 0.75,
      depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true, fog: true,
    });
    const pts = new Points(g, m);
    pts.frustumCulled = false;
    return { pontos: pts, base };
  }, [n]);

  useFrame((estado) => {
    const c = camera.position;
    const t = estado.clock.elapsedTime;
    const attr = pontos.geometry.getAttribute('position') as BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1] + t * 0.35;
      const bz = base[i * 3 + 2];
      // envolve a câmera numa caixa que se repete (as partículas parecem infinitas)
      arr[i * 3] = c.x + (((bx - c.x) % caixa) + caixa) % caixa - caixa / 2;
      arr[i * 3 + 1] = c.y + (((by - c.y) % caixa) + caixa) % caixa - caixa / 2;
      arr[i * 3 + 2] = c.z + (((bz - c.z) % caixa) + caixa) % caixa - caixa / 2;
    }
    attr.needsUpdate = true;
    pontos.visible = c.y < -3 && cena.corte < 0.3;
  });

  return <primitive object={pontos} />;
}

/** Conjunto submarino: relevo, dutos, árvores, ROV, BOP e partículas. Só o relevo é cortado no "raio X". */
export function CampoSubmarino({ qualidade }: { qualidade: Qualidade }) {
  return (
    <group>
      <AtualizarCorte />
      {/* tudo isto fica debaixo d'água: fora do reflexo do mar (a luz do ROV não: tirar uma luz
          de um desenho muda a contagem de luzes e obriga a recompilar os materiais) */}
      <group ref={semReflexo}>
        <Relevo />
        <Pedras />
        <LuzesDoCampo />
        <Dutos />
        <Arvores />
        <Perfuracao />
        <NeveMarinha qualidade={qualidade} />
      </group>
      <Rov />
    </group>
  );
}

precarregar('anm', 'rov', 'bop');
