import { useProgress } from '@react-three/drei';

/** Tela de entrada enquanto os modelos 3D carregam. */
export function Carregamento({ pronto }: { pronto: boolean }) {
  const { progress } = useProgress();
  const pct = Math.round(pronto ? 100 : Math.min(progress, 99));
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-noite transition-[opacity,visibility] duration-[1400ms] ${
        pronto ? 'invisible opacity-0' : 'visible opacity-100'
      }`}
      role="status"
      aria-live="polite"
    >
      <p className="titulo text-[15px] tracking-[0.5em] [font-stretch:125%]">Petróleo</p>
      <div className="mt-8 h-px w-48 overflow-hidden bg-linha">
        <div className="h-full bg-brilho transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="rotulo mt-4 !text-[10px] text-apagado tabular-nums">Carregando cena 3D · {pct}%</p>
    </div>
  );
}
