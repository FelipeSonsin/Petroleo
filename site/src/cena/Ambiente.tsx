import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Color, DirectionalLight, FogExp2, HemisphereLight } from 'three';
import { cena } from '../estado';
import { mix, suave } from './util';

// Cores do ar à noite, do mar (raso, médio e profundo) e do "raio X" do corte geológico.
// O mar fundo é azul-escuro, não preto: assim as silhuetas (risers, fundo, navios) continuam legíveis.
const AR = new Color('#0a1830');
const RASO = new Color('#104e6c');
const MEIO = new Color('#0c3a58');
const FUNDO = new Color('#0a2f4e');
const CORTE = new Color('#030b18');
const COSTA = new Color('#0b1a33');
// luz que desce da superfície (vista de baixo) e escuro do abismo (olhando para baixo)
const CIMA_RASO = new Color('#45a6cc');
const CIMA_FUNDO = new Color('#1a5f8c');
const BAIXO = new Color('#04172a');
// cor do "céu" da luz hemisférica: noite acima d'água, verde-azulado embaixo
const CEU_AR = new Color('#3b5d96');
const CEU_AGUA = new Color('#3d8db0');
const CHAO_AR = new Color('#06080b');
const CHAO_AGUA = new Color('#0b1d29');

const cor = new Color();
const tmp = new Color();

/** Cores do fundo debaixo d'água, calculadas aqui e lidas pelo céu (Ceu.tsx) a cada quadro. */
export const luzDaAgua = {
  horizonte: new Color(FUNDO),
  cima: new Color(CIMA_FUNDO),
  baixo: new Color(BAIXO),
  /** 0 = fora d'água ou no corte; 1 = submerso */
  submerso: 0,
  /** intensidade dos raios de luz vindos da superfície (fortes perto dela, somem no fundo) */
  raios: 0,
};

/**
 * Neblina, fundo e luzes que mudam com a profundidade da câmera:
 * acima do mar, noite com luar; abaixo, a água vai do azul-esverdeado ao azul-escuro; no corte,
 * tudo fica legível.
 */
export function Ambiente() {
  const { scene, camera } = useThree();
  const neblina = useMemo(() => new FogExp2(AR.getHex(), 0.00011), []);
  const hemi = useRef<HemisphereLight>(null);
  const lua = useRef<DirectionalLight>(null);

  useEffect(() => {
    scene.fog = neblina;
    scene.background = new Color(AR);
    return () => {
      scene.fog = null;
    };
  }, [scene, neblina]);

  useFrame(() => {
    const y = camera.position.y;
    const x = camera.position.x;
    const submerso = suave(1.5, -4, y);
    const meio = suave(-20, -350, y);
    const fundo = suave(-350, -1600, y);
    const costa = suave(-3000, -15000, x);

    // ar -> mar raso -> mar médio -> mar profundo
    cor.copy(AR).lerp(COSTA, costa);
    tmp.copy(RASO).lerp(MEIO, meio).lerp(FUNDO, fundo);
    cor.lerp(tmp, submerso);
    let densidade = mix(mix(0.000105, 0.00007, costa), mix(0.0021, 0.0026, fundo), submerso);

    // corte geológico: neblina quase nula para enxergar quilômetros
    const k = cena.corte;
    cor.lerp(CORTE, k);
    densidade = mix(densidade, 0.000012, Math.min(1, k * 1.4));

    neblina.color.copy(cor);
    neblina.density = densidade;
    if (scene.fog !== neblina) scene.fog = neblina;
    if (!(scene.background instanceof Color)) scene.background = new Color();
    scene.background.copy(cor);

    // fundo da água para o céu (Ceu.tsx)
    luzDaAgua.horizonte.copy(cor);
    luzDaAgua.cima.copy(CIMA_RASO).lerp(CIMA_FUNDO, suave(-15, -900, y));
    luzDaAgua.baixo.copy(BAIXO);
    luzDaAgua.submerso = submerso * (1 - k);
    // fortes perto da superfície; no fundo fica um brilho azul fraco (a água escura, mas viva)
    luzDaAgua.raios = submerso * (1 - k) * mix(1, 0.32, suave(-40, -800, y));

    // a luz do céu enfraquece com a profundidade, mas não zera (menos no corte, que é todo legível)
    const naAgua = submerso * (1 - k);
    const luz = mix(1, mix(1.05, 0.5, suave(0, -900, y)), naAgua);
    if (hemi.current) {
      hemi.current.intensity = 0.75 * luz;
      hemi.current.color.copy(CEU_AR).lerp(CEU_AGUA, naAgua);
      hemi.current.groundColor.copy(CHAO_AR).lerp(CHAO_AGUA, naAgua);
    }
    if (lua.current) lua.current.intensity = 1.1 * mix(1, mix(0.45, 0.16, suave(0, -600, y)), naAgua);
    scene.environmentIntensity = mix(0.55, 0.32, naAgua);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#3b5d96', '#06080b', 0.75]} />
      <directionalLight ref={lua} position={[-3500, 4200, 2600]} intensity={1.1} color="#a9c0ff" />
      <Environment resolution={64} frames={1}>
        <color attach="background" args={['#040a16']} />
        <Lightformer form="rect" intensity={0.9} color="#3d5f9e" position={[0, 6, -10]} scale={[30, 6, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#22385f" position={[0, -4, 10]} scale={[30, 4, 1]} />
        <Lightformer form="circle" intensity={2.2} color="#ff9a4a" position={[9, 6, 2]} scale={2} />
        <Lightformer form="circle" intensity={1.2} color="#bcd0ff" position={[-8, 9, 5]} scale={1.6} />
      </Environment>
    </>
  );
}
