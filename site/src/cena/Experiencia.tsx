import { memo, Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { Object3D } from 'three';
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
 * Compila de uma vez os shaders de TODOS os objetos (inclusive os que ainda estão escondidos),
 * sem travar a página, e só então avisa que a cena está pronta. Assim a rolagem não engasga
 * quando uma etapa nova aparece.
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
        // setTimeout (e não requestAnimationFrame): funciona mesmo com a aba em segundo plano
        setTimeout(() => vivo && aoFicarPronto(), 60);
      });
    return () => {
      vivo = false;
    };
  }, [gl, scene, camera, aoFicarPronto]);
  return null;
}

/** Canvas 3D com o mundo inteiro: mar, plataforma, fundo do mar, corte geológico, navios e costa. */
export const Experiencia = memo(function Experiencia({
  qualidade,
  aoFicarPronto,
}: {
  qualidade: Qualidade;
  aoFicarPronto: () => void;
}) {
  const q0 = QUADROS[0];
  // depuração: ?sem=costa,campo,corte,navios,fluxos desliga partes da cena (só em desenvolvimento)
  const sem = import.meta.env.DEV ? (new URLSearchParams(location.search).get('sem') ?? '').split(',') : [];
  const tem = (parte: string) => !sem.includes(parte);
  return (
    <Canvas
      flat
      dpr={qualidade === 'alta' ? [1, 1.75] : [0.75, 1]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: q0.fov ?? 40, near: 1, far: 90000, position: q0.pos }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
    >
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
      <CameraRig />
      <Efeitos qualidade={qualidade} />
    </Canvas>
  );
});
