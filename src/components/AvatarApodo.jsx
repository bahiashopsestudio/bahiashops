// Avatar de una persona a partir de su apodo: un círculo pastel con la
// inicial del animal. Es un marcador de lugar hasta que haya ilustraciones:
// el color depende del animal, así que el mismo animal se ve siempre igual.

import { inicialDeApodo, colorDeApodo } from '@/lib/apodos'

// `bloque`: se dibuja como bloque en vez de en línea. Hace falta cuando
// reemplaza a un ícono SVG (que es un bloque): en línea, el renglón de texto
// le agrega alto y lo corre unos píxeles.
export default function AvatarApodo({ apodo, tamano = 40, className = '', bloque = false }) {
  return (
    <span
      aria-hidden="true"
      className={`${bloque ? 'flex' : 'inline-flex'} items-center justify-center rounded-full shrink-0 select-none ${className}`}
      style={{
        width: `${tamano}px`,
        height: `${tamano}px`,
        backgroundColor: colorDeApodo(apodo),
        color: 'rgba(10,10,10,0.75)',
        fontFamily: 'Fraunces, serif',
        fontWeight: 500,
        fontSize: `${Math.round(tamano * 0.46)}px`,
        lineHeight: 1,
      }}
    >
      {inicialDeApodo(apodo)}
    </span>
  )
}
