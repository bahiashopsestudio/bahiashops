// Piezas de un pedido que comparten el panel de la tienda y Mis pedidos: el
// chip de la forma de entrega (solo en la franja cerrada), la barra de pasos
// y la flecha que despliega. Los pasos y sus nombres salen de src/lib/pedidos.js.

import { chipMetodo } from '@/lib/metodosEntrega';
import { NOMBRE_PASO, ESTADO_ENTREGADO } from '@/lib/pedidos';

const AZUL = '#4164fe';
const VERDE = '#2e6b4f';
const NEGRO = '#0a0a0a';
const GRIS_CLARO = '#e8e5df';

// Estilos en línea a propósito: los colores son de cada forma de entrega.
export function ChipForma({ metodoEnvio }) {
  const chip = chipMetodo(metodoEnvio);
  if (!chip) return null;
  return (
    <span className="shrink-0 whitespace-nowrap"
      style={{
        fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: '11px', lineHeight: 1.4,
        padding: '2px 8px', borderRadius: '20px', backgroundColor: chip.fondo, color: chip.color,
      }}>
      {chip.texto}
    </span>
  );
}

// Una barra por paso, con el nombre debajo. Hechos en negro, el actual en
// azul, entregado en verde, los que faltan en gris claro. Sin pasos (un
// pedido pendiente o reembolsado), no dibuja nada.
export function BarraPasos({ pasos, estado }) {
  if (!pasos || pasos.length === 0) return null;
  const actual = pasos.indexOf(estado);
  const entregado = estado === ESTADO_ENTREGADO;
  return (
    <ol className="flex gap-1.5 list-none p-0 m-0" aria-label="Pasos del pedido">
      {pasos.map((paso, i) => {
        const esActual = i === actual;
        const hecho = i < actual;
        const color = entregado ? VERDE : esActual ? AZUL : hecho ? NEGRO : GRIS_CLARO;
        const colorNombre = entregado && esActual ? VERDE : esActual ? AZUL : hecho ? NEGRO : 'rgba(10,10,10,0.35)';
        return (
          <li key={paso} className="flex-1 min-w-0" aria-current={esActual ? 'step' : undefined}>
            <div style={{ height: '4px', borderRadius: '2px', backgroundColor: color }} />
            <p className="m-0 mt-1.5 leading-tight"
              style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: esActual ? 600 : 400, color: colorNombre }}>
              {NOMBRE_PASO[paso] || paso}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

// La flecha de la franja: gira 180° al desplegar (sin animación si la persona
// pidió menos movimiento).
export function FlechaDesplegar({ abierto }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`shrink-0 text-[#0a0a0a]/35 motion-safe:transition-transform motion-safe:duration-200 ${abierto ? 'rotate-180' : ''}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// "16 oct 2026" en hora de Argentina. '' si la fecha no se puede leer.
export function fechaDia(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires',
  });
}

// "16 oct 2026, 14:32" en hora de Argentina. '' si la fecha no se puede leer.
export function fechaYHora(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}
