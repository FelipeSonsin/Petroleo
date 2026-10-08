import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { cena, leitura } from './estado';
import {
  CHAVES, DURACAO, MARCAS, PARADAS, camNoTempo, capituloNoTempo, padraoEntrada, padraoSaida,
} from './roteiro';

gsap.registerPlugin(ScrollTrigger, SplitText);

let lenis: Lenis | null = null;
let gatilho: ScrollTrigger | null = null;

/**
 * Rolagem suave (Lenis) sincronizada com o ScrollTrigger. A suavização fica só aqui: a linha do
 * tempo segue a posição da rolagem 1:1 (scrub: true), sem um segundo atraso por cima.
 */
export function iniciarRolagemSuave(movimentoReduzido: boolean) {
  if (movimentoReduzido) return () => {};
  // lerp mais alto = resposta mais rápida à roda do mouse (menos sensação de atraso), ainda suave
  lenis = new Lenis({ lerp: 0.15, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.3 });
  lenis.on('scroll', ScrollTrigger.update);
  const tique = (tempo: number) => lenis?.raf(tempo * 1000);
  gsap.ticker.add(tique);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tique);
    lenis?.destroy();
    lenis = null;
  };
}

/**
 * Monta a linha do tempo mestra: câmera, efeitos da cena 3D e textos, tudo preso à rolagem.
 * `raiz` contém os blocos de texto ([data-texto="cena-texto"]); `trilha` é o elemento alto que rola.
 */
export function construirLinhaDoTempo(
  raiz: HTMLElement,
  trilha: HTMLElement,
  aoMudarCapitulo: (id: string) => void,
) {
  const tl = gsap.timeline({ defaults: { ease: 'none' } });

  // câmera: um único movimento pelo roteiro inteiro, com velocidade contínua (camNoTempo):
  // sem acelerar e frear até parar a cada cena
  const ultima = CHAVES.length - 1;
  tl.fromTo(cena, { cam: 0 }, {
    cam: ultima, duration: DURACAO, ease: (p: number) => camNoTempo(p * DURACAO) / ultima, immediateRender: false,
  }, 0);

  // efeitos da cena 3D
  for (const m of MARCAS) {
    for (const e of m.cena.efeitos ?? []) {
      tl.fromTo(cena, { [e.parametro]: e.de }, {
        [e.parametro]: e.para, duration: e.fim - e.inicio, ease: e.ease ?? 'power1.inOut',
        immediateRender: false,
      }, m.inicio + e.inicio);
    }
  }

  // textos: entram com desfoque e letras em ordem aleatória, saem subindo
  MARCAS.forEach((m, ci) => {
    m.cena.textos?.forEach((tx, ti) => {
      const el = raiz.querySelector<HTMLElement>(`[data-texto="${ci}-${ti}"]`);
      if (!el) return;
      const titulo = el.querySelector<HTMLElement>('[data-titulo]');
      let letras: Element[] = [];
      if (titulo) {
        letras = SplitText.create(titulo, { type: 'words,chars', charsClass: 'letra', wordsClass: 'palavra' }).chars;
      }
      const entra = tx.entra ?? padraoEntrada(m.cena);
      const sai = tx.sai === undefined ? padraoSaida(m.cena) : tx.sai;
      if (entra >= 0) {
        tl.fromTo(el, { autoAlpha: 0, y: 28, filter: 'blur(10px)' }, {
          autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.36, ease: 'power2.out', immediateRender: false,
        }, m.inicio + entra);
        if (letras.length) {
          tl.fromTo(letras, { opacity: 0 }, {
            opacity: 1, duration: 0.12, ease: 'none', immediateRender: false,
            stagger: { each: 0.3 / letras.length, from: 'random' },
          }, m.inicio + entra + 0.02);
        }
      }
      if (sai !== null) {
        tl.to(el, { autoAlpha: 0, y: -22, filter: 'blur(8px)', duration: 0.3, ease: 'power2.in' }, m.inicio + sai);
      }
    });
  });

  tl.set({}, {}, DURACAO);

  let capitulo = '';
  gatilho = ScrollTrigger.create({
    trigger: trilha,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    animation: tl,
    onUpdate: (self) => {
      const tempo = self.progress * DURACAO;
      leitura.tempo = tempo;
      const c = capituloNoTempo(tempo);
      if (c !== capitulo) {
        capitulo = c;
        aoMudarCapitulo(c);
      }
    },
  });
  aoMudarCapitulo(capituloNoTempo(0));
  return tl;
}

/** Leva a rolagem até um instante do roteiro (em unidades). */
export function irParaTempo(tempo: number, duracao = 2.2) {
  if (!gatilho) return;
  const alvo = gatilho.start + (gatilho.end - gatilho.start) * Math.min(1, Math.max(0, tempo / DURACAO));
  if (lenis) {
    if (duracao <= 0) lenis.scrollTo(alvo, { immediate: true, force: true });
    else lenis.scrollTo(alvo, { duration: duracao, easing: (t) => 1 - Math.pow(1 - t, 3), force: true });
  } else {
    window.scrollTo({ top: alvo, behavior: duracao <= 0 ? 'instant' : 'smooth' });
  }
}

export function tempoAtual() {
  return gatilho ? gatilho.progress * DURACAO : 0;
}

/** Próxima (ou anterior) parada com texto inteiro na tela. */
export function irParaParada(direcao: 1 | -1) {
  const agora = tempoAtual();
  const lista = direcao > 0 ? PARADAS.filter((p) => p > agora + 0.08) : PARADAS.filter((p) => p < agora - 0.08);
  if (!lista.length) {
    irParaTempo(direcao > 0 ? DURACAO : 0);
    return;
  }
  irParaTempo(direcao > 0 ? lista[0] : lista[lista.length - 1]);
}
