import { MARCAS, type Posicao, type Texto } from '../roteiro';
import { irParaTempo } from '../rolagem';

/**
 * Lugar de cada bloco na tela. No celular, todos descem para a faixa de baixo.
 * A partir de `xl` a lista de etapas aparece na esquerda (até ~150px): o texto da esquerda começa depois dela.
 */
const LUGAR: Record<Posicao, string> = {
  centro: 'inset-0 flex flex-col items-center justify-center px-6 text-center',
  esquerda:
    'left-0 right-0 bottom-[9vh] px-6 md:right-auto md:bottom-auto md:left-[clamp(64px,9vw,170px)] xl:left-[clamp(196px,12vw,240px)] md:top-1/2 md:-translate-y-1/2 md:max-w-[440px] md:px-0',
  direita:
    'left-0 right-0 bottom-[9vh] px-6 md:left-auto md:bottom-auto md:right-[clamp(48px,8vw,150px)] md:top-1/2 md:-translate-y-1/2 md:max-w-[440px] md:px-0',
  base: 'left-0 right-0 bottom-[11vh] mx-auto max-w-[680px] px-6 text-center',
};

function Bloco({ id, tx, visivel }: { id: string; tx: Texto; visivel: boolean }) {
  const heroi = tx.posicao === 'centro';
  return (
    <section
      data-texto={id}
      data-heroi={heroi ? '' : undefined}
      className={`absolute isolate ${LUGAR[tx.posicao]}`}
      style={visivel ? undefined : { opacity: 0, visibility: 'hidden' }}
    >
      {/* sombra suave atrás do texto: garante leitura sobre partes claras da cena, sem caixa */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -z-10 ${
          heroi
            ? 'inset-[-12vh_-10vw] bg-[radial-gradient(closest-side,rgb(2_6_15/0.45),transparent)]'
            : 'inset-[-56px_-90px] bg-[radial-gradient(closest-side,rgb(2_6_15/0.66),rgb(2_6_15/0.3)_60%,transparent)]'
        }`}
      />
      {tx.rotulo && (
        <p className={`rotulo mb-4 flex items-center gap-3 text-brilho/80 ${heroi || tx.posicao === 'base' ? 'justify-center' : ''}`}>
          <span className="inline-block size-[5px] bg-brilho shadow-[0_0_10px_#59c8ff]" />
          {tx.rotulo}
        </p>
      )}
      {tx.titulo && (
        <h2
          data-titulo
          className={`titulo text-tinta ${
            heroi
              ? 'text-[clamp(36px,10.5vw,164px)] tracking-[0.05em] [font-stretch:125%] md:tracking-[0.14em]'
              : 'text-[clamp(26px,2.7vw,44px)]'
          }`}
        >
          {tx.titulo}
        </h2>
      )}
      {tx.texto && (
        <p
          className={`corpo mt-5 text-[15.5px] leading-[1.65] text-nevoa md:text-[16.5px] ${
            heroi ? 'mx-auto max-w-[520px]' : tx.posicao === 'base' ? 'mx-auto max-w-[560px]' : ''
          }`}
        >
          {tx.texto}
        </p>
      )}
      {tx.dado && (
        <div className={`mt-7 flex items-end gap-4 border-t border-linha pt-5 ${tx.posicao === 'base' ? 'justify-center' : ''}`}>
          <span className="whitespace-nowrap text-[clamp(34px,3.3vw,54px)] font-[620] leading-none tracking-[0.02em] text-oleo [font-stretch:112%] [text-shadow:0_0_26px_rgb(255_181_71/0.35)]">
            {tx.dado.valor}
          </span>
          <span className="rotulo max-w-[30ch] pb-1 !text-[10.5px] !tracking-[0.14em] leading-[1.5] text-nevoa/80 normal-case">
            {tx.dado.legenda}
          </span>
        </div>
      )}
      {tx.creditos && (
        <div className="rotulo mt-10 space-y-2 !tracking-[0.18em] text-nevoa/70">
          {tx.creditos.map((c) => (
            <p key={c}>{c}</p>
          ))}
          <button
            type="button"
            onClick={() => irParaTempo(0, 3.2)}
            className="botao-hud pointer-events-auto mt-6 border border-linha px-5 py-3 text-tinta hover:border-brilho/60 hover:bg-brilho/10"
          >
            ↑ Voltar ao início
          </button>
        </div>
      )}
      {tx.dica && (
        <div className="rotulo absolute bottom-[12vh] left-1/2 flex -translate-x-1/2 flex-col items-center gap-4 text-nevoa/70">
          {tx.dica}
          <span className="relative block h-12 w-px overflow-hidden bg-linha">
            <span className="absolute left-0 top-0 block h-1/2 w-px animate-[descer_1.8s_ease-in-out_infinite] bg-brilho" />
          </span>
        </div>
      )}
    </section>
  );
}

/** Camada fixa com todos os textos; a linha do tempo controla quando cada um aparece. */
export function Textos() {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none" aria-hidden="true">
      <div className="absolute inset-x-0 bottom-0 h-[46vh] bg-gradient-to-t from-noite/80 to-transparent md:hidden" />
      {MARCAS.map((m, ci) =>
        m.cena.textos?.map((tx, ti) => (
          <Bloco key={`${ci}-${ti}`} id={`${ci}-${ti}`} tx={tx} visivel={tx.entra === -1} />
        )),
      )}
    </div>
  );
}

/** Versão em texto corrido para leitores de tela (a camada animada fica oculta para eles). */
export function TextoAcessivel() {
  return (
    <article className="sr-only">
      <h1>Petróleo: da rocha ao mundo</h1>
      {MARCAS.map((m) =>
        m.cena.textos?.map((tx, i) => (
          <section key={`${m.cena.id}-${i}`}>
            {tx.titulo && <h2>{tx.titulo}</h2>}
            {tx.texto && <p>{tx.texto}</p>}
            {tx.dado && <p>{`${tx.dado.valor}: ${tx.dado.legenda}`}</p>}
            {tx.creditos?.map((c) => <p key={c}>{c}</p>)}
          </section>
        )),
      )}
    </article>
  );
}
