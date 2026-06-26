// src/lib/moderacion.js
// ─────────────────────────────────────────────────────────────────────────
// Capa 1 de moderación automática de Bahía Shops.
//
// Revisa el texto de una publicación (nombre + descripción juntos) y devuelve
// QUÉ se detectó y con QUÉ severidad. Es la única fuente de verdad de este
// criterio: hoy se usa al guardar un producto, y más adelante la misma función
// va a servir para filtrar preguntas y respuestas.
//
// No reemplaza tu panel de moderación: lo alivia. La máquina caza lo que tiene
// forma fija (un mail, un teléfono, una palabra de una lista). Lo que pide
// criterio (¿la foto es real?, ¿está bien categorizado?) sigue siendo tuyo.
//
// Severidades:
//   'bloqueo' → no se puede guardar hasta sacarlo.
//   'aviso'   → se guarda, pero entra a tu panel marcado para revisar.
//   'limpio'  → nada detectado.
// ─────────────────────────────────────────────────────────────────────────


// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  LISTAS EDITABLES — ESTE es el único lugar para tocarlas.              ║
// ║  Las dos van a ir creciendo con el uso real. Sumá o sacá tranquila.    ║
// ╚═══════════════════════════════════════════════════════════════════════╝

// Lenguaje ofensivo → BLOQUEA.
// Lista semilla con insultos comunes, términos vulgares y discriminatorios
// que moderan plataformas como MercadoLibre. Está pensada para crecer.
//
// OJO con los falsos positivos: algunas de estas palabras tienen un uso
// legítimo en otro contexto (el caso típico es "concha", que también es una
// concha de mar o un nombre). Si una palabra te frena cosas honestas seguido,
// sacala de acá. Las comparo sin tildes y en minúscula, así que no hace falta
// que las escribas con acento.
const PALABRAS_OFENSIVAS = [
  // insultos generales
  'puto', 'puta', 'pelotudo', 'boludo', 'forro', 'imbecil', 'idiota',
  'estupido', 'tarado', 'subnormal', 'infeliz', 'sorete', 'garca',
  // vulgar
  'concha', 'verga', 'pija', 'choto', 'culiado', 'culiao', 'trolo', 'trola',
  // discriminatorios (frases enteras incluidas)
  'mogolico', 'retardado', 'negro de mierda', 'negro cabeza',
  'cabecita negra', 'villero de mierda', 'muerto de hambre',
];

// Animales vivos → AVISA (va a tu panel para revisar).
// A propósito NO bloquea: se confunde con peluches, llaveros, stickers,
// almohadones, etc. La idea es que te llegue marcado y vos mires.
const PALABRAS_ANIMALES = [
  'perro', 'perra', 'cachorro', 'cachorra', 'gato', 'gata', 'gatito', 'michi',
  'loro', 'cotorra', 'canario', 'jilguero', 'periquito', 'cobayo', 'cuis',
  'conejo', 'coneja', 'hamster', 'huron', 'tortuga', 'pez', 'peces',
  'gallina', 'pollito', 'caballo', 'pony', 'cerdo', 'chancho', 'iguana',
];


// ─────────────────────────────────────────────────────────────────────────
//  Utilidades internas
// ─────────────────────────────────────────────────────────────────────────

// Pasa a minúscula y saca tildes. Sirve para comparar contra las listas
// sin que "Boludó" o "BOLUDO" se escapen.
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Arma un regex desde una lista de palabras (con límites de palabra, para no
// cazar "puto" dentro de "disputo"). Acepta plural simple (perro/perros).
function regexDeLista(lista) {
  const partes = lista.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp('\\b(' + partes.join('|') + ')(?:es|s)?\\b', 'i');
}

const RE_OFENSIVAS = regexDeLista(PALABRAS_OFENSIVAS);
const RE_ANIMALES = regexDeLista(PALABRAS_ANIMALES);

// Patrones de datos de contacto (sobre el texto original en minúscula).
const RE_MAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const RE_LINK = /(?:wa\.me|api\.whatsapp|chat\.whatsapp|instagram\.com|facebook\.com|fb\.com|t\.me|m\.me)\/?\S*/i;
const RE_HANDLE = /@[a-z0-9._]{2,}/i;
const RE_ARROBA = /\barroba\b/i;
const RE_INTENCION = /(whats?app|wpp|wsp|watsap|telegram|ll[aá]m[aá](?:me|nos|lo)?|escrib[ií](?:me|nos)?|contact[aá](?:me|nos)?|mand[aá]me|hablame|mi\s+(?:cel|celular|n[uú]mero|tel|tel[eé]fono|insta(?:gram)?|mail|correo))/i;

// Teléfono escrito en palabras: 6 o más números-en-letra seguidos.
// (El único motivo para escribir un número así es esquivar el filtro.)
const RE_NUM_LETRAS = /\b(?:(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b[\s,.;:y-]*){6,}/i;

// Dígitos separados por espacios: "2 9 1 4 4 2 8 6 8 1".
const RE_DIG_ESPACIADOS = /(?:\b\d\b[\s.\-]*){7,}/;

// Plataformas nombradas sin un @ claro → dudoso (aviso).
const RE_PLATAFORMA = /\b(instagram|insta|tik\s?tok|facebook|telegram)\b/i;

// Precio evadido → choca con tu regla de precio siempre obligatorio.
const RE_PRECIO_EVADIDO = /(a\s*consultar|consultar\s*precio|a\s*convenir|precio\s*a\s*(?:convenir|coordinar|charlar|acordar)|consultame\s*(?:el\s*)?precio|preguntar\s*(?:por\s*el\s*)?precio)/i;

// Teléfono "normal" (con o sin separadores). Devuelve todos los candidatos.
const RE_TEL = /(?:\+?54[\s.\-]?)?(?:9[\s.\-]?)?(?:0?2\d{2,3})?[\s.\-]?\d{2,4}[\s.\-]?\d{4}/g;
// Si un número viene pegado a una unidad, NO es teléfono (12 cm, 250 ml...).
const RE_UNIDAD = /^\s?(?:cm|mm|m|ml|l|g|kg|hs?|min|%|x\b|°)/i;


// ─────────────────────────────────────────────────────────────────────────
//  Función principal
// ─────────────────────────────────────────────────────────────────────────

/**
 * Revisa el texto de una publicación.
 * @param {string} texto - nombre + descripción concatenados.
 * @returns {{ nivel: 'bloqueo'|'aviso'|'limpio',
 *             bloqueos: Array<{tipo: string, texto: string}>,
 *             avisos: Array<{tipo: string, texto: string}> }}
 */
export function revisarPublicacion(texto) {
  const bloqueos = [];
  const avisos = [];

  if (!texto || !texto.trim()) {
    return { nivel: 'limpio', bloqueos, avisos };
  }

  const original = texto;
  const enMinuscula = texto.toLowerCase();
  const normalizado = normalizar(texto);

  const agregar = (lista, tipo, match) => {
    if (match) lista.push({ tipo, texto: typeof match === 'string' ? match : match[0] });
  };

  // ── Contacto fuerte → BLOQUEA ──
  agregar(bloqueos, 'contacto_mail', enMinuscula.match(RE_MAIL));
  agregar(bloqueos, 'contacto_link', enMinuscula.match(RE_LINK));
  agregar(bloqueos, 'contacto_arroba', original.match(RE_HANDLE) || enMinuscula.match(RE_ARROBA));
  agregar(bloqueos, 'contacto_intencion', enMinuscula.match(RE_INTENCION));
  agregar(bloqueos, 'contacto_numeros_en_letras', enMinuscula.match(RE_NUM_LETRAS));
  agregar(bloqueos, 'contacto_digitos_espaciados', enMinuscula.match(RE_DIG_ESPACIADOS));

  // ── Teléfonos numéricos (fuerte = bloqueo / dudoso = aviso) ──
  for (const m of enMinuscula.matchAll(RE_TEL)) {
    const crudo = m[0];
    const digitos = crudo.replace(/\D/g, '');
    if (digitos.length < 8) continue;
    const despues = enMinuscula.slice(m.index + crudo.length);
    if (RE_UNIDAD.test(despues)) continue; // era una medida
    const fuerte = digitos.length >= 10 || /^(?:54|0?29)/.test(digitos) || /\+?54/.test(crudo);
    if (fuerte) bloqueos.push({ tipo: 'contacto_telefono', texto: crudo.trim() });
    else avisos.push({ tipo: 'telefono_dudoso', texto: crudo.trim() });
  }

  // ── Precio evadido → BLOQUEA ──
  agregar(bloqueos, 'precio_evadido', enMinuscula.match(RE_PRECIO_EVADIDO));

  // ── Lenguaje ofensivo → BLOQUEA ──
  agregar(bloqueos, 'lenguaje_ofensivo', normalizado.match(RE_OFENSIVAS));

  // ── Plataformas nombradas → AVISA ──
  agregar(avisos, 'mencion_redes', enMinuscula.match(RE_PLATAFORMA));

  // ── Animales vivos → AVISA ──
  agregar(avisos, 'venta_animales', normalizado.match(RE_ANIMALES));

  const nivel = bloqueos.length ? 'bloqueo' : avisos.length ? 'aviso' : 'limpio';
  return { nivel, bloqueos, avisos };
}

// Etiquetas legibles para mostrar en el formulario o en el panel.
export const ETIQUETAS_MODERACION = {
  contacto_mail: 'mail',
  contacto_link: 'enlace externo',
  contacto_arroba: 'usuario de red',
  contacto_intencion: 'pedido de contacto',
  contacto_numeros_en_letras: 'teléfono escrito en palabras',
  contacto_digitos_espaciados: 'teléfono con dígitos separados',
  contacto_telefono: 'teléfono',
  telefono_dudoso: 'posible teléfono',
  precio_evadido: 'precio "a consultar"',
  lenguaje_ofensivo: 'lenguaje ofensivo',
  mencion_redes: 'mención de red social',
  venta_animales: 'posible venta de animales',
};