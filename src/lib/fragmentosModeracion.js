// Dónde está, en el texto de un producto, lo que encontró el filtro de
// moderación. Para la pestaña "Revisar después" de /admin/moderacion.
//
// moderacion_avisos guarda [{ tipo, texto }]: texto es lo que matcheó, en
// minúscula y, en algunos tipos, sin tildes (revisarPublicacion lo busca sobre
// el texto normalizado). No guarda ni la posición ni el campo. Acá se busca en
// el nombre, la descripción y la marca sin distinguir mayúsculas ni tildes:
// sacar las tildes no cambia el largo de un texto en castellano, así que la
// posición encontrada sirve en el original.

const CONTEXTO = 60

function normalizar(texto) {
  return String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Si normalizar cambió el largo (algún carácter raro), no se puede confiar en
// la posición: se busca solo sin distinguir mayúsculas.
function buscar(original, aguja) {
  const normal = normalizar(original)
  if (normal.length === original.length) return normal.indexOf(normalizar(aguja))
  return original.toLowerCase().indexOf(String(aguja).toLowerCase())
}

// avisos: [{ tipo, texto }]. Devuelve [{ tipo, campo, antes, resaltado, despues }]
// o, si no lo encuentra en ningún campo, { tipo, campo: null } (se muestra
// solo la etiqueta). Un fragmento por aviso.
export function fragmentosDeAvisos(producto, avisos) {
  const campos = [['nombre', producto?.nombre], ['descripcion', producto?.descripcion], ['marca', producto?.marca]]
  return (Array.isArray(avisos) ? avisos : [])
    .filter((a) => a && typeof a.texto === 'string' && a.texto.trim())
    .map((aviso) => {
      const aguja = aviso.texto.trim()
      for (const [campo, valor] of campos) {
        if (typeof valor !== 'string' || !valor) continue
        const i = buscar(valor, aguja)
        if (i === -1) continue
        const fin = i + aguja.length
        const desde = Math.max(0, i - CONTEXTO)
        const hasta = Math.min(valor.length, fin + CONTEXTO)
        return {
          tipo: aviso.tipo,
          campo,
          antes: (desde > 0 ? '…' : '') + valor.slice(desde, i),
          resaltado: valor.slice(i, fin),
          despues: valor.slice(fin, hasta) + (hasta < valor.length ? '…' : ''),
        }
      }
      return { tipo: aviso.tipo, campo: null, antes: '', resaltado: '', despues: '' }
    })
}
