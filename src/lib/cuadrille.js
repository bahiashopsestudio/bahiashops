// El cuadrillé de Bahía Shops: una textura de cuadrícula (como una tabla de
// corte o un mantel a cuadros), siempre con dos colores de la paleta: uno de
// fondo y otro para las líneas.
//
// Devuelve el objeto de `style` para cualquier elemento (una sección, una
// tarjeta). Si el elemento ya tiene otros estilos en línea, se suman:
//
//   <section style={{ ...estiloCuadrille({ fondo: FONDO_BAHIA, linea: 'rgba(244,233,225,0.45)' }), color: BEIGE }}>
//
// (así está la sección «Cuánto cuesta» de /vender: verde footer con líneas
// beige al 45 %).
//
//   fondo   el color de fondo
//   linea   el color de las líneas, ya con su transparencia (rgba): la
//           intensidad la decide cada uso
//   celda   el lado de cada cuadro, en px (48 por defecto)
//   grosor  el grosor de las líneas, en px (1,5 por defecto)
//
// La cuadrícula son dos linear-gradient (las líneas verticales y las
// horizontales), con la línea en el medio de cada celda y el dibujo centrado
// arriba (`center top`): así hay una línea justo en el centro del elemento y
// los dos costados quedan iguales, con los cuadros cortados de la misma
// manera.

export function estiloCuadrille({ fondo, linea, celda = 48, grosor = 1.5 }) {
  const desde = `calc(50% - ${grosor / 2}px)`
  const hasta = `calc(50% + ${grosor / 2}px)`
  const raya = (direccion) =>
    `linear-gradient(${direccion}, transparent ${desde}, ${linea} ${desde}, ${linea} ${hasta}, transparent ${hasta})`

  return {
    backgroundColor: fondo,
    backgroundImage: `${raya('to right')}, ${raya('to bottom')}`,
    backgroundSize: `${celda}px ${celda}px`,
    backgroundPosition: 'center top',
  }
}
