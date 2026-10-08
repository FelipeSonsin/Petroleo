import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import type { Qualidade } from '../estado';

/** Pós-processamento: brilho das luzes (bloom), curva de tons de cinema, vinheta e grão. */
export function Efeitos({ qualidade }: { qualidade: Qualidade }) {
  const alta = qualidade === 'alta';
  return (
    <EffectComposer multisampling={alta ? 4 : 0} stencilBuffer={false}>
      <Bloom mipmapBlur intensity={alta ? 1.15 : 0.9} luminanceThreshold={0.9} luminanceSmoothing={0.25} radius={0.74} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.24} darkness={0.7} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.32} />
    </EffectComposer>
  );
}
