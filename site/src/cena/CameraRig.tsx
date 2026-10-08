import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CatmullRomCurve3, PerspectiveCamera, Vector3 } from 'three';
import { cena, leitura } from '../estado';
import { CHAVES } from '../roteiro';
import { amortecer, clamp, mix } from './util';

const pos = new Vector3();
const alvo = new Vector3();
const frente = new Vector3();
const direita = new Vector3();
const cima = new Vector3();
const Y = new Vector3(0, 1, 0);

/**
 * Câmera guiada pela rolagem: percorre uma curva suave (Catmull-Rom centrípeta) pelos quadros
 * do roteiro. O mouse dá um leve paralaxe e há uma "respiração" sutil.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const curvas = useMemo(() => ({
    pos: new CatmullRomCurve3(CHAVES.map((q) => new Vector3(...q.pos)), false, 'centripetal'),
    alvo: new CatmullRomCurve3(CHAVES.map((q) => new Vector3(...q.alvo)), false, 'centripetal'),
  }), []);
  const ponteiro = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const reduzido = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    const mover = (e: PointerEvent) => {
      ponteiro.current.x = (e.clientX / innerWidth) * 2 - 1;
      ponteiro.current.y = (e.clientY / innerHeight) * 2 - 1;
    };
    addEventListener('pointermove', mover);
    return () => removeEventListener('pointermove', mover);
  }, []);

  useFrame((estado, dt) => {
    const n = CHAVES.length - 1;
    const c = clamp(cena.cam, 0, n);
    curvas.pos.getPoint(c / n, pos);
    curvas.alvo.getPoint(c / n, alvo);
    const i = Math.min(Math.floor(c), n - 1);
    const fov = mix(CHAVES[i].fov ?? 40, CHAVES[i + 1].fov ?? 40, c - i);

    const dist = pos.distanceTo(alvo);
    const p = ponteiro.current;
    if (!reduzido) {
      p.sx = amortecer(p.sx, p.x, 2.2, dt);
      p.sy = amortecer(p.sy, p.y, 2.2, dt);
      const amp = Math.min(dist * 0.018, 45);
      frente.subVectors(alvo, pos).normalize();
      direita.crossVectors(frente, Y).normalize();
      cima.crossVectors(direita, frente).normalize();
      const t = estado.clock.elapsedTime;
      pos.addScaledVector(direita, p.sx * amp + Math.sin(t * 0.21) * amp * 0.08);
      pos.addScaledVector(cima, -p.sy * amp * 0.55 + Math.sin(t * 0.37) * amp * 0.06);
    }

    camera.position.copy(pos);
    camera.lookAt(alvo);
    camera.fov = fov;
    camera.near = clamp(dist * 0.004, 0.15, 25);
    camera.far = 90000;
    camera.updateProjectionMatrix();

    leitura.alvoX = alvo.x;
    leitura.alvoY = alvo.y;
    leitura.camY = pos.y;
  }, -1);

  return null;
}
