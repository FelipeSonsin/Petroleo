import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import {
  Color, DoubleSide, Mesh, PlaneGeometry, RepeatWrapping, ShaderMaterial, UniformsLib, UniformsUtils, Vector3,
} from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { cena, type Qualidade } from '../estado';
import { CORTE_Z } from '../mundo';
import { GLSL_RUIDO, foraDoReflexo } from './util';

const TAMANHO = 90000;

/**
 * Superfície do mar com reflexo (Water do three.js) e, para quem está submerso,
 * a "face de baixo" do mar: um teto ondulado que clareia ao olhar para cima.
 */
export function Oceano({ qualidade }: { qualidade: Qualidade }) {
  const camera = useThree((s) => s.camera);
  const normais = useTexture('./texturas/agua_normal.png');

  const agua = useMemo(() => {
    normais.wrapS = normais.wrapT = RepeatWrapping;
    // o reflexo é distorcido pelas ondas: resolução menor quase não muda a imagem e alivia a placa de vídeo
    const res = qualidade === 'alta' ? 512 : 256;
    const w = new Water(new PlaneGeometry(TAMANHO, TAMANHO), {
      textureWidth: res,
      textureHeight: res,
      waterNormals: normais,
      sunDirection: new Vector3(-0.55, 0.5, 0.67).normalize(),
      sunColor: new Color('#7f96d6'),
      waterColor: new Color('#03131f'),
      distortionScale: 2.6,
      fog: true,
    });
    w.rotation.x = -Math.PI / 2;
    w.material.uniforms.size.value = 0.55;
    // o reflexo redesenha a cena: esconde nele o que não aparece acima d'água (ver foraDoReflexo)
    const original = w.onBeforeRender;
    w.onBeforeRender = function (...args: Parameters<typeof original>) {
      const escondidos = [];
      for (const o of foraDoReflexo) {
        if (o.visible) {
          o.visible = false;
          escondidos.push(o);
        }
      }
      try {
        original.apply(this, args);
      } finally {
        for (const o of escondidos) o.visible = true;
      }
    };
    return w;
  }, [normais, qualidade]);

  useEffect(() => () => {
    agua.geometry.dispose();
    agua.material.dispose();
    (agua as unknown as { getRenderTarget?: () => { dispose(): void } }).getRenderTarget?.()?.dispose();
  }, [agua]);

  const baixo = useMemo(() => {
    const m = new ShaderMaterial({
      side: DoubleSide,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uTempo: { value: 0 } }]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        varying vec3 vMundo;
        void main() {
          vec4 mundo = modelMatrix * vec4(position, 1.0);
          vMundo = mundo.xyz;
          vec4 mvPosition = viewMatrix * mundo;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uTempo;
        varying vec3 vMundo;
        ${GLSL_RUIDO}
        void main() {
          vec3 v = normalize(vMundo - cameraPosition);
          float olhandoCima = clamp(v.y, 0.0, 1.0);
          // janela de Snell: céu claro dentro de um cone, reflexo escuro fora
          float janela = smoothstep(0.62, 0.8, olhandoCima);
          vec2 p = vMundo.xz * 0.045 + vec2(uTempo * 0.07, uTempo * 0.05);
          float ondas = fbm(p) * 0.7 + fbm(p * 2.7 - uTempo * 0.1) * 0.3;
          vec3 escuro = vec3(0.01, 0.06, 0.09);
          vec3 claro = vec3(0.10, 0.26, 0.36);
          vec3 c = mix(escuro, claro, janela) * (0.65 + ondas * 0.7);
          c += vec3(0.15, 0.3, 0.4) * pow(clamp(ondas, 0.0, 1.0), 6.0) * janela;
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }
      `,
    });
    const malha = new Mesh(new PlaneGeometry(TAMANHO, TAMANHO), m);
    malha.rotation.x = Math.PI / 2;
    malha.position.y = -0.05;
    foraDoReflexo.add(malha);
    return malha;
  }, []);

  useFrame((estado, dt) => {
    const y = camera.position.y;
    const corte = cena.corte > 0.01;
    agua.material.uniforms.time.value += dt * 0.55;
    // o mar acompanha a câmera (o padrão das ondas usa coordenadas do mundo, então não "anda")
    agua.position.set(camera.position.x, 0, camera.position.z);
    baixo.position.set(camera.position.x, -0.05, camera.position.z);
    if (corte) {
      // no corte, o mar só existe atrás do plano do corte
      agua.position.z = CORTE_Z + TAMANHO / 2;
      baixo.position.z = CORTE_Z + TAMANHO / 2;
    }
    agua.visible = y > -0.5 && (!corte || y > 0);
    baixo.visible = y < 0.5 && !corte;
    (baixo.material as ShaderMaterial).uniforms.uTempo.value = estado.clock.elapsedTime;
  });

  return (
    <>
      <primitive object={agua} />
      <primitive object={baixo} />
    </>
  );
}
