import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Experiencia } from './cena/Experiencia';
import { Textos, TextoAcessivel } from './ui/Textos';
import { Hud } from './ui/Hud';
import { Carregamento } from './ui/Carregamento';
import { construirLinhaDoTempo, iniciarRolagemSuave, irParaParada, irParaTempo } from './rolagem';
import { DURACAO, MARCAS, PARADAS, VH_POR_UNIDADE } from './roteiro';
import { cena, leitura, type Qualidade } from './estado';

gsap.registerPlugin(useGSAP);

const CHAVE_QUALIDADE = 'petroleo3d:qualidade';

function qualidadeInicial(): Qualidade {
  try {
    const salva = localStorage.getItem(CHAVE_QUALIDADE);
    if (salva === 'alta' || salva === 'leve') return salva;
  } catch {
    /* sem armazenamento: segue o padrão */
  }
  const celular = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 768;
  const poucosNucleos = (navigator.hardwareConcurrency ?? 8) <= 4;
  return celular || poucosNucleos ? 'leve' : 'alta';
}

export default function App() {
  const raiz = useRef<HTMLDivElement>(null);
  const trilha = useRef<HTMLDivElement>(null);
  const [pronto, setPronto] = useState(false);
  const [capitulo, setCapitulo] = useState('inicio');
  const [qualidade, setQualidade] = useState<Qualidade>(qualidadeInicial);

  const aoFicarPronto = useCallback(() => {
    if (import.meta.env.DEV) console.info(`cena pronta em ${Math.round(performance.now())} ms`);
    setPronto(true);
  }, []);

  const trocarQualidade = useCallback((q: Qualidade) => {
    setQualidade(q);
    try {
      localStorage.setItem(CHAVE_QUALIDADE, q);
    } catch {
      /* ignora */
    }
  }, []);

  // rolagem suave + linha do tempo mestra (câmera, efeitos e textos)
  useGSAP(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const parar = iniciarRolagemSuave(reduzido);
    construirLinhaDoTempo(raiz.current!, trilha.current!, setCapitulo);
    return () => parar();
  }, { scope: raiz });

  // entrada do título quando a cena fica pronta; #id-da-cena no endereço pula direto para ela
  useGSAP(() => {
    if (!pronto) return;
    const letras = raiz.current!.querySelectorAll('[data-texto="0-0"] .letra');
    gsap.fromTo(letras, { opacity: 0 }, { opacity: 1, duration: 0.6, stagger: { each: 0.07, from: 'random' }, delay: 0.4 });
    const id = decodeURIComponent(location.hash.slice(1));
    const i = MARCAS.findIndex((m) => m.cena.id === id);
    if (i > 0) {
      const parada = PARADAS.find((p) => p >= MARCAS[i].inicio) ?? MARCAS[i].inicio;
      requestAnimationFrame(() => irParaTempo(parada, 0));
    }
  }, { dependencies: [pronto], scope: raiz });

  // atalho para testes no console do navegador (só em desenvolvimento)
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__jornada = { irParaTempo, MARCAS, PARADAS, DURACAO, cena, leitura };
    }
  }, []);

  // aviso quando um modelo chega atualizado do Blender (integração automática, em `npm run dev`)
  const [aviso, setAviso] = useState('');
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const aoAtualizar = (e: Event) => {
      const { nomes } = (e as CustomEvent<{ nomes: string[] }>).detail;
      setAviso(`Blender → site: ${nomes.join(', ')} atualizado`);
      clearTimeout(t);
      t = setTimeout(() => setAviso(''), 4000);
    };
    addEventListener('blender:modelos', aoAtualizar);
    return () => {
      clearTimeout(t);
      removeEventListener('blender:modelos', aoAtualizar);
    };
  }, []);

  // teclado: → / ← pulam de etapa em etapa; Home / End vão ao início e ao fim
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        irParaParada(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        irParaParada(-1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        irParaTempo(0, 3);
      } else if (e.key === 'End') {
        e.preventDefault();
        irParaTempo(DURACAO, 3);
      }
    };
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, []);

  return (
    <div ref={raiz}>
      <div className="fixed inset-0 z-0" aria-hidden="true">
        <Experiencia qualidade={qualidade} aoFicarPronto={aoFicarPronto} />
      </div>
      <Textos />
      <Hud capitulo={capitulo} qualidade={qualidade} aoTrocarQualidade={trocarQualidade} />
      <Carregamento pronto={pronto} />
      <div
        role="status"
        aria-live="polite"
        className={`rotulo pointer-events-none fixed bottom-20 right-7 z-40 border border-brilho/40 bg-noite/80 px-4 py-2.5 !text-[10px] text-brilho backdrop-blur-sm transition-opacity duration-500 md:right-11 ${
          aviso ? 'opacity-100' : 'opacity-0'
        }`}
      >
        ↻ {aviso}
      </div>
      <TextoAcessivel />
      <div ref={trilha} style={{ height: `${DURACAO * VH_POR_UNIDADE + 100}vh` }} />
    </div>
  );
}
