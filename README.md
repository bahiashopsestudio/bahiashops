# Bahía Shops

El mercado online de Bahía Blanca: reúne en un solo lugar a los comercios, emprendedores y
productores de la ciudad para que la gente descubra, compre y conecte con lo que se hace acá.

Cada vendedor se da de alta, arma su tienda con sus productos y cobra con su propia cuenta de
MercadoPago; la plataforma se queda con una comisión del 5% sobre los productos.

---

## Levantar el proyecto

Hace falta Node 20 o más nuevo (se está usando 24) y un proyecto de Supabase.

```bash
npm install
```

Después creá un archivo `.env.local` en la raíz con las variables de la sección siguiente, y:

```bash
npm run dev
```

Queda en http://localhost:3000. Los otros comandos son `npm run build`, `npm start` (sirve el
build) y `npm run lint`.

> El repo ya tiene una configuración de arranque en `.claude/launch.json` para las herramientas
> que la usan. No hace falta tocarla.

---

## Variables de entorno

Todas van en `.env.local`, que **no** se versiona (está en el `.gitignore`). En producción se
cargan desde el panel de Vercel.

La diferencia importante: **las que empiezan con `NEXT_PUBLIC_` viajan al navegador**, dentro del
JavaScript que se le manda a cualquier visitante. Cualquiera puede leerlas. Las demás se quedan en
el servidor y no salen nunca de ahí — si alguna de esas aparece en el bundle del navegador, es un
incidente de seguridad, no un detalle.

### Van al navegador (públicas)

| Variable | Qué es |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | La dirección del proyecto de Supabase (`https://xxxx.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | La llave anónima de Supabase. Es pública a propósito: lo que protege los datos no es esta llave sino las políticas de RLS de la base. |

### Se quedan en el servidor (secretas)

| Variable | Qué es |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave de administración de Supabase. **Se saltea RLS por completo**: quien la tenga lee y escribe cualquier fila de cualquier tabla. Sólo la usan las rutas de `/api` que ya verificaron que quien llama es admin, o que necesitan escribir cosas que el navegador no tiene permitido tocar. Nunca importarla desde un componente. |
| `RESEND_API_KEY` | Llave de [Resend](https://resend.com), el servicio que manda los mails: avisos de validación y bloqueo al vendedor, notificaciones de despacho al comprador, y los formularios de contacto. |
| `MP_CLIENT_ID` | Identificador de la aplicación de MercadoPago, para el OAuth con el que cada vendedor conecta su cuenta. |
| `MP_CLIENT_SECRET` | El secreto de esa misma aplicación. |
| `MP_REDIRECT_URI` | A dónde vuelve MercadoPago después del OAuth. Tiene que coincidir *exactamente* con la que está cargada en el panel de MercadoPago, incluido el dominio: en desarrollo apunta a localhost, en producción al dominio real. |
| `MP_WEBHOOK_SECRET` | Clave con la que se verifica la firma de los webhooks de pago. Si falta, el webhook **deja pasar todo** y sólo avisa por consola — cómodo en desarrollo, inaceptable en producción. |

---

## La base de datos

El esquema vive en Supabase (PostgreSQL). Esto es lo que conviene saber antes de tocarlo:

**Las migraciones de `sql/migrations/` se corren a mano.** No hay herramienta de migraciones ni
nada automático: se abre el SQL Editor del panel de Supabase, se pega el archivo entero y se
ejecuta. **En orden numérico**, y cada una una sola vez.

```
001_productos_variantes.sql              variantes de producto + bucket 'productos'
002_colecciones_storage.sql              lectura pública del bucket 'colecciones'
003_tesoros.sql                          la vitrina curada de /tesoros
004_vendedores_bloqueado.sql             la columna 'bloqueado'
005_ideas_admin.sql                      la lista de ideas de /admin/ideas
006_vendedores_vuelta_a_revision.sql     disparador: editar los datos reabre la revisión
007_vendedores_publicacion_automatica.sql  alta publicada sola + el bloqueo pasa a ser efectivo
008_categorias_al_dia.sql                abre las categorías que ya tenían vendedores
009_pedidos_franja_y_tienda.sql          franja de despacho + nombre de tienda congelado
```

Algunas piden un paso manual antes (crear un bucket de Storage desde el panel, por ejemplo). Está
aclarado en el encabezado de cada archivo — vale la pena leerlos, tienen escrito el *por qué* de
cada decisión, no sólo el *qué*.

**El esquema no está versionado del todo.** Esos archivos son el historial *desde que se empezó a
anotar*: las tablas base (`vendedores`, `productos`, `categorias`, `subcategorias`, `sellos`,
`barrios`, `localidades`, `pedidos`, `perfiles`, `usuarios`, `favoritos`, `direcciones`,
`colecciones`…), sus políticas de RLS originales y las funciones de PostgreSQL que usa la app
(`calcular_zona_envio`, `barrio_en_punto`, `barrios_con_poligono`) se crearon a mano desde el
panel y **no están en el repo**. Para verlas hay que mirar Supabase.

En la práctica: si algo no cierra entre el código y la base, la base tiene la razón. Y si vas a
cambiar el esquema, agregá una migración nueva aunque el cambio sea de una línea — es lo único que
deja rastro.

**Buckets de Storage** (se crean a mano desde el panel, públicos): `productos`, `colecciones`,
`logos`, `portadas`.

---

## Cómo está armado

Next.js 16 con App Router, React 19 y Tailwind 4. Todo en JavaScript, sin TypeScript.

```
src/app/            las rutas (App Router)
  (home)/           la home. El grupo entre paréntesis no sale en la URL: está para
                    que su loading.jsx no abra un límite de Suspense sobre el resto
                    del sitio, porque eso rompía los 404 de verdad
  api/              rutas de servidor: admin, pagos, mails
  admin/            panel de administración (requiere usuarios.es_admin)
  vendedor/         panel del vendedor
src/components/     componentes compartidos
src/lib/            clientes de Supabase, MercadoPago, mails y reglas de negocio
src/middleware.js   refresco de sesión + modo "próximamente"
sql/migrations/     ver más arriba
```

Dos reglas que conviene no romper:

- **Qué se muestra en público** se decide en un solo lugar, `src/lib/vendedoresPublicos.js`: una
  tienda se ve si está publicada (`estado_validacion = 'aprobado'`) y no está bloqueada. Toda
  consulta pública la usa. La base lo hace cumplir también por RLS, pero eso sólo cubre lo que
  pasa por RLS — las lecturas con `service_role` la esquivan.
- **Nada de lo que decide el navegador es un control.** El panel de admin y el checkout vuelven a
  verificar del lado del servidor.

---

## Modo "próximamente"

`src/middleware.js` tiene una constante `COMING_SOON`. En `true`, todo el sitio redirige a
`/proximamente` salvo para quien tenga sesión iniciada. Hoy está en `false`.
