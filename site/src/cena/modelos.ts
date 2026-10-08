import { useEffect, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Group, Material, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import versoesIniciais from 'virtual:versoes-modelos';

/**
 * Modelos 3D exportados pelo Blender (blender/modelos.py -> site/public/modelos/<nome>.glb).
 *
 * Integração automática: a URL leva o hash do arquivo (?v=…), então um modelo reexportado
 * nunca fica preso no cache; e em `npm run dev`, quando o Blender regrava um .glb, o modelo é
 * trocado na cena na hora (sem recarregar a página nem perder o ponto da rolagem).
 */
export const DRACO = './draco/';

export type NomeModelo = 'fpso' | 'navio_sonda' | 'aliviador' | 'sismico' | 'anm' | 'bop' | 'rov' | 'refinaria';
export type Modelo = { scene: Group };

let versoes: Record<string, string> = { ...versoesIniciais };

export function urlModelo(nome: NomeModelo) {
  return `./modelos/${nome}.glb?v=${versoes[nome] ?? '0'}`;
}

let carregador: GLTFLoader | null = null;
function carregar(url: string) {
  if (!carregador) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO);
    carregador = new GLTFLoader();
    carregador.setDRACOLoader(draco);
  }
  return carregador.loadAsync(url);
}

// ------------------------------------------------------------------ acabamento das superfícies

const SEM_DESGASTE = /^(luz_|janela|fr_|sep_|forno_fogo|vidro|marca_|separador_casco|torre_casco|prato)/;
const CASCO = /^casco/;
const CONVES = /^(conves|verde_conves|vermelho_conves|heliponto|asfalto)$/;

const GLSL_DESGASTE = /* glsl */ `
  varying vec3 vDesgPos;
  varying vec3 vDesgNormal;
  float dHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float dRuido(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dHash(i), dHash(i + vec2(1, 0)), u.x), mix(dHash(i + vec2(0, 1)), dHash(i + vec2(1, 1)), u.x), u.y);
  }
  float dFbm(vec2 p) { return dRuido(p) * 0.55 + dRuido(p * 2.1 + 7.3) * 0.3 + dRuido(p * 4.3 + 1.9) * 0.15; }
  // distância (em metros) até a junta mais próxima de uma grade de chapas de tamanho "passo"
  float junta(float v, float passo) { return abs(fract(v / passo + 0.5) - 0.5) * passo; }
`;

/**
 * Desgaste procedural (sem texturas) nos materiais vindos do Blender, em coordenadas do próprio
 * modelo (não "escorrega" quando o navio anda):
 * 1 = casco (juntas das chapas, escorridos de ferrugem, sujeira perto da linha d'água);
 * 2 = convés (juntas e marcas de uso); 3 = equipamento submarino (incrustação perto da base);
 * 0 = o resto (manchas e variação de brilho).
 */
function desgastar(m: MeshStandardMaterial, tipo: number) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDesgPos;\nvarying vec3 vDesgNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDesgPos = position;\nvDesgNormal = normal;');
    sh.fragmentShader = `#define DESGASTE_TIPO ${tipo}\n` + sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_DESGASTE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dManchas = 0.5;
        {
          vec3 an = abs(vDesgNormal);
          vec2 uvA = (an.x > an.y && an.x > an.z) ? vDesgPos.zy : ((an.y > an.z) ? vDesgPos.xz : vDesgPos.xy);
          dManchas = dFbm(uvA * 0.16);
          float grao = dRuido(uvA * 2.6);
          float escorrido = dRuido(vec2((vDesgPos.x + vDesgPos.z) * 1.1, vDesgPos.y * 0.07));
          vec3 ferrugem = vec3(0.3, 0.13, 0.05);
          float px = fwidth(vDesgPos.y) + fwidth(vDesgPos.x) * 0.5;
          float perto = 1.0 - smoothstep(0.15, 0.6, px);
          vec3 c = diffuseColor.rgb;
          #if DESGASTE_TIPO == 1
            float costura = (1.0 - smoothstep(0.0, 0.06 + px, junta(vDesgPos.y, 2.8))) * perto;
            float costuraV = (1.0 - smoothstep(0.0, 0.06 + px, junta(vDesgPos.x, 9.5))) * perto;
            float ferr = smoothstep(0.55, 0.9, escorrido) * 0.55 + smoothstep(0.6, 0.95, dManchas) * 0.25;
            c = mix(c, ferrugem, clamp(ferr, 0.0, 1.0) * 0.45);
            c *= (0.84 + 0.3 * dManchas) * (1.0 - max(costura, costuraV) * 0.28) * (0.94 + 0.12 * grao * perto);
          #elif DESGASTE_TIPO == 2
            float j = min(junta(vDesgPos.x, 3.0), junta(vDesgPos.z, 2.0));
            c *= (0.8 + 0.34 * dManchas) * (1.0 - (1.0 - smoothstep(0.0, 0.05 + px, j)) * 0.22 * perto);
            c = mix(c, ferrugem * 0.8, smoothstep(0.75, 0.95, dFbm(uvA * 0.5)) * 0.3);
          #elif DESGASTE_TIPO == 3
            float crosta = (1.0 - smoothstep(0.0, 2.2, vDesgPos.y)) * smoothstep(0.38, 0.75, dFbm(uvA * 0.9));
            c = mix(c, vec3(0.11, 0.12, 0.07), crosta * 0.75);
            c *= 0.86 + 0.26 * dManchas;
          #else
            c *= 0.86 + 0.26 * dManchas;
            c = mix(c, ferrugem, smoothstep(0.62, 0.95, escorrido) * 0.16);
          #endif
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.82 + 0.36 * dManchas), 0.04, 1.0);`);
  };
  m.customProgramCacheKey = () => `desgaste-${tipo}`;
  m.needsUpdate = true;
}

const preparados = new WeakSet<Object3D>();
const materiaisPreparados = new WeakSet<Material>();

/** Aplica o acabamento a um modelo recém-carregado (uma vez só por cena e por material). */
function preparar(raiz: Object3D, nome: NomeModelo) {
  if (preparados.has(raiz)) return raiz;
  preparados.add(raiz);
  const submarino = nome === 'anm' || nome === 'bop';
  raiz.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (!m || Array.isArray(m) || !m.isMeshStandardMaterial || materiaisPreparados.has(m)) return;
    materiaisPreparados.add(m);
    if (SEM_DESGASTE.test(m.name)) return;
    desgastar(m, CASCO.test(m.name) ? 1 : CONVES.test(m.name) ? 2 : submarino ? 3 : 0);
  });
  return raiz;
}

/** Versão de cada modelo que está na cena agora. */
const vigentes = new Map<NomeModelo, Group>();
/** Download da versão nova: um só por modelo, mesmo que ele apareça em vários componentes. */
const recargas = new Map<NomeModelo, { url: string; cena: Promise<Group> }>();

/** Baixa a versão nova; `null` se uma versão ainda mais nova chegou enquanto esta baixava. */
function recarregar(nome: NomeModelo): Promise<Group | null> {
  const url = urlModelo(nome);
  let recarga = recargas.get(nome);
  if (!recarga || recarga.url !== url) {
    recarga = { url, cena: carregar(url).then((gltf) => preparar(gltf.scene, nome) as Group) };
    recargas.set(nome, recarga);
  }
  return recarga.cena.then((cena) => {
    if (urlModelo(nome) !== url) return null;
    const anterior = vigentes.get(nome);
    if (anterior !== cena) {
      vigentes.set(nome, cena);
      // libera a versão antiga depois que a nova já está na tela
      if (anterior) setTimeout(() => descartar(anterior), 2000);
    }
    return cena;
  });
}

/**
 * Libera as geometrias (o grosso da memória de vídeo). Os materiais ficam: descartá-los liberaria
 * programas de shader que a versão nova ainda vai usar, e recompilar no Direct3D trava a página.
 */
function descartar(raiz: Object3D) {
  raiz.traverse((o) => (o as Mesh).geometry?.dispose());
}

/** Modelo do Blender: carrega com Suspense na primeira vez e se atualiza sozinho quando o Blender reexporta. */
export function useModelo(nome: NomeModelo): Modelo {
  // a URL do primeiro carregamento fica fixa: se mudasse com a versão nova, o useGLTF suspenderia
  // a cena inteira (piscada) e o modelo seria trocado duas vezes
  const [urlInicial] = useState(() => urlModelo(nome));
  const inicial = useGLTF(urlInicial, DRACO) as unknown as Modelo;
  preparar(inicial.scene, nome); // idempotente: só a primeira chamada mexe nos materiais
  const [atual, setAtual] = useState<Modelo>(inicial);
  // registro para conferir a integração no console (só em desenvolvimento): window.__modelos
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __modelos?: Record<string, { uuid: string; versao: string; trocas: number }> };
    const reg = (w.__modelos ??= {});
    const antes = reg[nome];
    const trocou = antes !== undefined && antes.uuid !== atual.scene.uuid;
    reg[nome] = { uuid: atual.scene.uuid, versao: versoes[nome] ?? '0', trocas: (antes?.trocas ?? 0) + (trocou ? 1 : 0) };
  }, [atual, nome]);
  useEffect(() => {
    if (!import.meta.hot) return;
    if (!vigentes.has(nome)) vigentes.set(nome, inicial.scene);
    let montado = true;
    const aoAtualizar = (e: Event) => {
      const { nomes } = (e as CustomEvent<{ nomes: string[] }>).detail;
      if (!nomes.includes(nome)) return;
      recarregar(nome)
        .then((cena) => {
          if (montado && cena) setAtual({ scene: cena });
        })
        .catch((erro) => console.warn(`[blender] não deu para recarregar ${nome}`, erro));
    };
    addEventListener('blender:modelos', aoAtualizar);
    return () => {
      montado = false;
      removeEventListener('blender:modelos', aoAtualizar);
    };
  }, [nome, inicial]);
  return atual;
}

/** Começa a baixar os modelos antes de a cena montar. */
export function precarregar(...nomes: NomeModelo[]) {
  for (const n of nomes) useGLTF.preload(urlModelo(n), DRACO);
}

if (import.meta.hot) {
  import.meta.hot.on('blender:modelos', (dados: { nomes: string[]; versoes: Record<string, string> }) => {
    versoes = dados.versoes;
    dispatchEvent(new CustomEvent('blender:modelos', { detail: dados }));
  });
}
