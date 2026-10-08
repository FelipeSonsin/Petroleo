import { memo, Suspense, useCallback, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { HalfFloatType, WebGLRenderTarget, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three';
import type { Qualidade } from '../estado';
import { QUADROS } from '../roteiro';
import { Ambiente } from './Ambiente';
import { CameraRig } from './CameraRig';
import { CampoSubmarino } from './CampoSubmarino';
import { Ceu } from './Ceu';
import { Corte } from './Corte';
import { Costa } from './Costa';
import { Efeitos } from './Efeitos';
import { FluxoDoOleo, SaidasDoSeparador } from './Fluxos';
import { Navios } from './Navios';
import { Oceano } from './Oceano';
import { Plataforma } from './Plataforma';
import { Bokeh, Plancton, RaiosDeLuz } from './Submerso';

/**
 * Desenha a cena INTEIRA uma vez (inclusive o que está escondido ou fora da câmera) num alvo igual
 * ao do pós-processamento, atrás da tela de carregamento. No Windows (ANGLE/Direct3D) a montagem
 * final de cada shader e o envio das malhas para a placa de vídeo só acontecem no primeiro desenho
 * de verdade: sem isto a rolagem congelava por até 1 s quando o corte geológico, o fundo do mar ou
 * a costa apareciam pela primeira vez.
 */
function aquecer(gl: WebGLRenderer, scene: Scene, camera: Camera) {
  const ocultos: Object3D[] = [];
  const cortados: Object3D[] = [];
  scene.traverse((o) => {
    if (!o.visible) {
      ocultos.push(o);
      o.visible = true;
    }
    if (o.frustumCulled) {
      cortados.push(o);
      o.frustumCulled = false;
    }
  });
  const alvo = new WebGLRenderTarget(256, 144, { type: HalfFloatType, samples: 4 });
  const anterior = gl.getRenderTarget();
  try {
    gl.setRenderTarget(alvo);
    gl.render(scene, camera);
    gl.setRenderTarget(anterior);
    gl.render(scene, camera);
  } finally {
    gl.setRenderTarget(anterior);
    alvo.dispose();
    for (const o of ocultos) o.visible = false;
    for (const o of cortados) o.frustumCulled = true;
  }
}

/**
 * Compila de uma vez os shaders de TODOS os objetos (inclusive os que ainda estão escondidos),
 * sem travar a página, depois desenha tudo uma vez (aquecer) e só então avisa que a cena está
 * pronta. Assim a rolagem não engasga quando uma etapa nova aparece.
 */
function Pronto({ aoFicarPronto }: { aoFicarPronto: () => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let vivo = true;
    const ocultos: Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible) {
        ocultos.push(o);
        o.visible = true;
      }
    });
    const t0 = performance.now();
    const compilando = gl.compileAsync(scene, camera);
    for (const o of ocultos) o.visible = false;
    // medições para depuração (window.__tempos no console)
    const tempos: Record<string, number> = { modelos: Math.round(t0) };
    if (import.meta.env.DEV) Object.assign(window, { __tempos: tempos, __cena3d: { gl, scene, camera } });
    compilando
      .catch(() => undefined)
      .finally(() => {
        tempos.shaders = Math.round(performance.now() - t0);
        tempos.programas = gl.info.programs?.length ?? -1;
        if (!vivo) return;
        const t1 = performance.now();
        aquecer(gl, scene, camera);
        tempos.aquecimento = Math.round(performance.now() - t1);
        // setTimeout (e não requestAnimationFrame): funciona mesmo com a aba em segundo plano
        setTimeout(() => vivo && aoFicarPronto(), 60);
      });
    return () => {
      vivo = false;
    };
  }, [gl, scene, camera, aoFicarPronto]);
  return null;
}

/** O mundo 3D inteiro. Memorizado: trocar a resolução (dpr) não redesenha a árvore da cena. */
const Mundo = memo(function Mundo({ qualidade, aoFicarPronto }: { qualidade: Qualidade; aoFicarPronto: () => void }) {
  // depuração: ?sem=costa,campo,corte,navios,fluxos desliga partes da cena (só em desenvolvimento)
  const sem = import.meta.env.DEV ? (new URLSearchParams(location.search).get('sem') ?? '').split(',') : [];
  const tem = (parte: string) => !sem.includes(parte);
  return (
    <Suspense fallback={null}>
      <Ambiente />
      <Ceu />
      <Oceano qualidade={qualidade} />
      <RaiosDeLuz qualidade={qualidade} />
      <Bokeh qualidade={qualidade} />
      <Plancton qualidade={qualidade} />
      <Plataforma />
      {tem('navios') && <Navios />}
      {tem('campo') && <CampoSubmarino qualidade={qualidade} />}
      {tem('corte') && <Corte />}
      {tem('fluxos') && <FluxoDoOleo qualidade={qualidade} />}
      {tem('fluxos') && <SaidasDoSeparador />}
      {tem('costa') && <Costa qualidade={qualidade} />}
      <Pronto aoFicarPronto={aoFicarPronto} />
    </Suspense>
  );
});

const EfeitosFixos = memo(Efeitos);
const CameraFixa = memo(CameraRig);

/** Canvas 3D com o mundo inteiro: mar, plataforma, fundo do mar, corte geológico, navios e costa. */
export const Experiencia = memo(function Experiencia({
  qualidade,
  aoFicarPronto,
}: {
  qualidade: Qualidade;
  aoFicarPronto: () => void;
}) {
  const q0 = QUADROS[0];

  // resolução adaptativa: começa no máximo do modo escolhido e, se os quadros por segundo ficarem
  // baixos por uns segundos seguidos (computador mais fraco), desce um degrau por vez. Não sobe de
  // volta: subindo e descendo alternadamente, a nitidez da imagem ficaria oscilando durante a rolagem.
  const telaDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const dprMax = qualidade === 'alta' ? Math.min(telaDpr, 1.5) : Math.min(telaDpr, 1) * 0.85;
  const dprMin = qualidade === 'alta' ? 0.75 : 0.6;
  const [dpr, setDpr] = useState(dprMax);
  const [medir, setMedir] = useState(false);
  useEffect(() => setDpr(dprMax), [dprMax]);
  const baixar = useCallback(
    () => setDpr((d) => Math.max(dprMin, Math.round((d - 0.15) * 100) / 100)),
    [dprMin],
  );
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __baixarResolucao: baixar });
  }, [baixar]);
  // só mede depois da tela de carregamento (o aquecimento derruba os quadros de propósito)
  const ficouPronto = useCallback(() => {
    aoFicarPronto();
    setTimeout(() => setMedir(true), 1500);
  }, [aoFicarPronto]);

  return (
    <Canvas
      flat
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: q0.fov ?? 40, near: 1, far: 90000, position: q0.pos }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
      <Mundo qualidade={qualidade} aoFicarPronto={ficouPronto} />
      {medir && <PerformanceMonitor bounds={(hz) => (hz > 100 ? [62, hz * 0.9] : [56, 59])} onDecline={baixar} />}
      <CameraFixa />
      <EfeitosFixos qualidade={qualidade} />
    </Canvas>
  );
});
