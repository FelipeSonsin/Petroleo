import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BackSide, Color, Mesh, ShaderMaterial, Vector3 } from 'three';
import { cena } from '../estado';
import { CORTE_Z } from '../mundo';
import { luzDaAgua } from './Ambiente';
import { GLSL_RUIDO } from './util';

/**
 * Fundo de tudo: acima d'água, céu noturno (degradê azul-marinho, estrelas, brilho do luar);
 * debaixo d'água, o "céu" vira a própria água: clara olhando para cima, com raios de luz vindos
 * da superfície, e escura olhando para o abismo.
 */
export function Ceu() {
  const malha = useRef<Mesh>(null);
  const camera = useThree((s) => s.camera);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTempo: { value: 0 }, uLua: { value: [-0.55, 0.5, 0.67] }, uCorte: { value: 0 },
          uSubmerso: { value: 0 }, uRaios: { value: 0 },
          uAguaHorizonte: { value: new Color() }, uAguaCima: { value: new Color() }, uAguaBaixo: { value: new Color() },
          uCidade: { value: 0 }, uDirCidade: { value: new Vector3(-1, 0, 0) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTempo;
          uniform vec3 uLua;
          uniform float uCorte;
          uniform float uSubmerso;
          uniform float uRaios;
          uniform vec3 uAguaHorizonte;
          uniform vec3 uAguaCima;
          uniform vec3 uAguaBaixo;
          uniform float uCidade;
          uniform vec3 uDirCidade;
          varying vec3 vDir;
          ${GLSL_RUIDO}
          float hash(vec3 p) {
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
          }
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 horizonte = vec3(0.035, 0.075, 0.15);
            vec3 zenite = vec3(0.002, 0.005, 0.014);
            vec3 c = mix(horizonte, zenite, pow(clamp(h, 0.0, 1.0), 0.42));
            c += vec3(0.07, 0.15, 0.3) * exp(-abs(h) * 16.0) * 0.55;
            if (h < 0.0) c = mix(horizonte * 0.55, vec3(0.004, 0.009, 0.018), clamp(-h * 5.0, 0.0, 1.0));
            // estrelas em células 3D
            vec3 q = d * 380.0;
            vec3 cel = floor(q);
            float r = hash(cel);
            vec3 f = fract(q) - 0.5;
            float estrela = step(0.9955, r) * smoothstep(0.11, 0.0, length(f)) * smoothstep(0.03, 0.3, h);
            c += estrela * (0.55 + 0.45 * sin(uTempo * 1.7 + r * 90.0)) * vec3(0.8, 0.88, 1.0) * 1.6;
            // brilho do luar (sem o disco: o reflexo dele no mar virava uma "bolha")
            float lua = max(dot(d, normalize(uLua)), 0.0);
            c += vec3(0.12, 0.17, 0.3) * pow(lua, 60.0) * 0.8;
            // perto da costa, a luz das cidades tinge de laranja o céu baixo na direção delas
            if (uCidade > 0.0) {
              float l = length(d.xz);
              vec2 hz = l > 1e-4 ? d.xz / l : vec2(1.0, 0.0);
              float lobo = max(dot(hz, normalize(uDirCidade.xz + vec2(1e-5))), 0.0);
              c += vec3(0.1, 0.05, 0.016) * uCidade * lobo * lobo * lobo * exp(-max(h, 0.0) * 11.0) * smoothstep(-0.03, 0.01, h);
            }

            // debaixo d'água: degradê da água e raios de luz convergindo para a superfície
            if (uSubmerso > 0.0) {
              vec3 agua;
              if (h > 0.0) {
                float k = smoothstep(-0.05, 0.95, h);
                agua = mix(uAguaHorizonte, uAguaCima, k * (2.0 - k) * 0.85);
                // direção no plano horizontal sem a costura do atan (amostra o ruído num círculo)
                float l = length(d.xz);
                vec2 dir = l > 1e-4 ? d.xz / l : vec2(1.0, 0.0);
                float r1 = ruido(dir * 7.0 + vec2(uTempo * 0.05, 0.0));
                float r2 = ruido(dir * 19.0 + vec2(3.1, uTempo * 0.09));
                float feixes = smoothstep(0.5, 0.95, r1 * 0.6 + r2 * 0.4);
                agua += uAguaCima * feixes * smoothstep(0.12, 0.85, h) * uRaios * 0.7;
                // a "janela" clara bem no alto (luz do luar atravessando a superfície)
                agua += uAguaCima * smoothstep(0.86, 1.0, h) * uRaios * 0.5;
              } else {
                agua = mix(uAguaHorizonte, uAguaBaixo, smoothstep(0.0, 0.65, -h));
              }
              c = mix(c, agua, uSubmerso);
            }

            // no corte geológico a câmera fica "dentro da terra": o céu só aparece acima da linha do mar
            if (uCorte > 0.0 && d.z > 0.0001) {
              float t = (${CORTE_Z.toFixed(1)} - cameraPosition.z) / d.z;
              float yNoPlano = cameraPosition.y + d.y * t;
              float abaixo = smoothstep(60.0, -60.0, yNoPlano);
              c = mix(c, vec3(0.001, 0.0035, 0.009), abaixo * uCorte);
            }
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    [],
  );

  useFrame((estado) => {
    const u = material.uniforms;
    u.uTempo.value = estado.clock.elapsedTime;
    u.uCorte.value = cena.corte;
    u.uSubmerso.value = luzDaAgua.submerso;
    u.uRaios.value = luzDaAgua.raios;
    u.uAguaHorizonte.value.copy(luzDaAgua.horizonte);
    u.uAguaCima.value.copy(luzDaAgua.cima);
    u.uAguaBaixo.value.copy(luzDaAgua.baixo);
    // brilho das cidades: aparece ao se aproximar da costa, na direção do centro urbano
    const p = camera.position;
    u.uCidade.value = Math.min(1, Math.max(0, (-p.x - 9000) / 13000)) * (1 - luzDaAgua.submerso);
    u.uDirCidade.value.set(-29500 - p.x, 0, 0 - p.z);
    if (malha.current) malha.current.position.copy(camera.position);
  });

  return (
    <mesh ref={malha} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[60000, 48, 24]} />
    </mesh>
  );
}
