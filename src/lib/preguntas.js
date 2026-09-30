// Preguntas "¿te gustaría…?" para ir testeando funciones con la gente.
//
// Es la lista permitida: /api/votos sólo guarda votos de los ids que están
// acá, y el panel de admin las muestra en este orden. Para sumar una
// pregunta, agregala; para retirarla, sacala (los votos quedan en la base).

export const PREGUNTAS = [
  { id: 'foto_perfil', texto: '¿Te gustaría poder poner una foto de perfil?' },
]

export function preguntaPorId(id) {
  return PREGUNTAS.find((p) => p.id === id) || null
}
