import { useEffect, useRef, useState } from 'react';
import { leitura, type Qualidade } from '../estado';
import { CAPITULOS, DURACAO, inicioDoCapitulo } from '../roteiro';
import { irParaTempo } from '../rolagem';

type Props = {
  capitulo: string;
  qualidade: Qualidade;
  aoTrocarQualidade: (q: Qualidade) => void;
};

const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Moldura fina, marca, etapas, profundidade e progresso — sem caixas de texto fixas. */
export function Hud({ capitulo, qualidade, aoTrocarQualidade }: Props) {
  const valor = useRef<HTMLSpanElement>(null);
  const rotulo = useRef<HTMLSpanElement>(null);
  const barra = useRef<HTMLSpanElement>(null);
  const etapas = useRef<HTMLElement>(null);
  const [telaCheia, setTelaCheia] = useState(false);

  // leituras atualizadas direto no DOM, sem re-render
  useEffect(() => {
    let id = 0;
    let ultimo = '';
    let herois: HTMLElement[] = [];
    let ultimaOpacidade = -1;
    const passo = () => {
      // a lista de etapas some enquanto o título grande (abertura e final) está na tela
      if (!herois.length) herois = [...document.querySelectorAll<HTMLElement>('[data-heroi]')];
      let heroi = 0;
      for (const el of herois) if (el.style.visibility !== 'hidden') heroi = Math.max(heroi, Number(el.style.opacity || 1));
      if (etapas.current && Math.abs(1 - heroi - ultimaOpacidade) > 0.01) {
        ultimaOpacidade = 1 - heroi;
        etapas.current.style.opacity = String(ultimaOpacidade);
        etapas.current.style.visibility = ultimaOpacidade < 0.02 ? 'hidden' : '';
      }
      // altura da câmera: no corte geológico ela fica na mesma profundidade do que mostra
      const y = leitura.camY;
      const texto = y < -8 ? `${fmt.format(-y)} m` : y > 30 ? `+${fmt.format(y)} m` : '0 m';
      const nome = y < -8 ? 'Profundidade' : y > 30 ? 'Altitude' : 'Nível do mar';
      if (texto !== ultimo && valor.current && rotulo.current) {
        valor.current.textContent = texto;
        rotulo.current.textContent = nome;
        ultimo = texto;
      }
      if (barra.current) barra.current.style.transform = `scaleX(${Math.min(1, leitura.tempo / DURACAO)})`;
      id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const aoMudar = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);

  const alternarTelaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  const ativo = CAPITULOS.findIndex((c) => c.id === capitulo);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 text-tinta">
      {/* moldura com cantos chanfrados */}
      <svg className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)] md:inset-5 md:h-[calc(100%-40px)] md:w-[calc(100%-40px)]" preserveAspectRatio="none" viewBox="0 0 1000 1000" aria-hidden="true">
        <path
          d="M0 0 H955 L1000 30 V1000 H45 L0 970 Z"
          fill="none"
          stroke="rgb(150 180 255 / 0.14)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* marca */}
      <div className="absolute left-7 top-7 md:left-11 md:top-10">
        <p className="titulo text-[13px] tracking-[0.42em] [font-stretch:125%] [text-shadow:none]">Petróleo</p>
        <p className="rotulo mt-1 !text-[9.5px] text-apagado">da rocha ao mundo</p>
      </div>

      {/* ações */}
      <div className="pointer-events-auto absolute right-7 top-7 flex md:right-11 md:top-9">
        <button
          type="button"
          onClick={() => aoTrocarQualidade(qualidade === 'alta' ? 'leve' : 'alta')}
          className="botao-hud flex items-center gap-2 border border-linha bg-noite/40 px-4 py-2.5 text-nevoa backdrop-blur-sm hover:border-brilho/50 hover:text-tinta"
          title="Use “leve” se o computador ficar lento"
        >
          <span className={`inline-block size-[5px] ${qualidade === 'alta' ? 'bg-brilho' : 'bg-oleo'}`} />
          Gráficos {qualidade === 'alta' ? 'alto' : 'leve'}
        </button>
        <button
          type="button"
          onClick={alternarTelaCheia}
          className="botao-hud hidden border border-l-0 border-linha bg-tinta/90 px-4 py-2.5 text-noite [clip-path:polygon(0_0,calc(100%-12px)_0,100%_12px,100%_100%,0_100%)] hover:bg-white md:block"
        >
          {telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      </div>

      {/* etapas */}
      <nav ref={etapas} aria-label="Etapas" className="pointer-events-auto absolute left-11 top-1/2 hidden -translate-y-1/2 xl:block">
        <ol className="space-y-[10px]">
          {CAPITULOS.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => irParaTempo(inicioDoCapitulo(c.id) + 0.02)}
                className={`rotulo flex items-center gap-3 !text-[9.5px] transition-colors duration-500 [text-shadow:0_1px_8px_rgb(0_0_0/0.95)] ${
                  i === ativo ? 'text-tinta' : i < ativo ? 'text-apagado/90 hover:text-nevoa' : 'text-apagado/50 hover:text-nevoa'
                }`}
                aria-current={i === ativo ? 'step' : undefined}
              >
                <span
                  className={`inline-block size-[5px] transition-all duration-500 ${
                    i === ativo ? 'bg-tinta shadow-[0_0_8px_#e2eaff]' : 'bg-transparent'
                  }`}
                />
                {c.nome}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* rodapé: profundidade, progresso e teclas */}
      <div className="absolute inset-x-3 bottom-3 flex h-12 items-stretch border-t border-linha md:inset-x-5 md:bottom-5 md:h-14">
        <div className="flex min-w-[170px] items-center gap-3 border-r border-linha px-4 md:px-6">
          <span className="inline-block h-3 w-px bg-brilho/70" />
          <div className="leading-tight">
            <span ref={rotulo} className="rotulo block !text-[9px] text-apagado">Nível do mar</span>
            <span ref={valor} className="font-mono text-[13px] tracking-[0.12em] text-tinta tabular-nums">0 m</span>
          </div>
        </div>
        <div className="flex flex-1 items-center px-4 md:px-6">
          <span className="relative block h-px w-full overflow-hidden bg-linha">
            <span ref={barra} className="absolute inset-0 origin-left scale-x-0 bg-gradient-to-r from-brilho/40 to-brilho" />
          </span>
        </div>
        <div className="hidden items-center border-l border-linha px-6 md:flex">
          <span className="rotulo !text-[9px] text-apagado">← → etapas · role para avançar</span>
        </div>
      </div>
    </div>
  );
}
