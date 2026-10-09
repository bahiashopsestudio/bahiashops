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

### Solo para desarrollo (opcional)

| Variable | Qué es |
| --- | --- |
| `VENCIMIENTO_PAGO_MINUTOS` | Baja el plazo del LINK de pago de un pedido (2 horas, `src/lib/vencimientoPago.js`) a esa cantidad de minutos, para probar el vencimiento en tu máquina con `npm run dev`. El cupón en efectivo (3 días) no cambia. **Solo se respeta fuera de producción**: con `npm run build` / `npm start` y en Vercel el plazo son siempre 2 horas, aunque la variable esté cargada. Nunca alarga el plazo. |
| `URL_PUBLICA_DESARROLLO` | Para probar pagos en tu máquina: la dirección https de un túnel hacia `localhost:3000` (por ejemplo `cloudflared tunnel --url http://localhost:3000`). MercadoPago manda el aviso del pago (`notification_url`) y la vuelta después de pagar (`back_urls`) a esa dirección, y no al sitio publicado (`src/lib/sitio.js`). Hay que recorrer la compra por la dirección del túnel; su dominio se habilita en `allowedDevOrigins` (`next.config.mjs`), sin eso la página carga pero no responde. **Solo se respeta fuera de producción.** Probarlo: `npm run probar:url-mp`. |

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
010_cerrar_lectura_usuarios.sql          cada persona lee solo su propia fila de usuarios
011_registro_apodos_datos.sql            apodos, nombre y apellido por separado, copias de contacto en el pedido
012                                      PENDIENTE DE SUBIR AL REPO (ya corrida en Supabase)
013                                      PENDIENTE DE SUBIR AL REPO (ya corrida en Supabase)
014                                      PENDIENTE DE SUBIR AL REPO (ya corrida en Supabase)
015_avisos_pago.sql                      marca de "mail ya enviado" al vendedor y a quien compró
016_eliminar_cuenta.sql                  eliminar mi cuenta: cerrada_en, disparadores y las funciones del proceso
017_localidades_activa.sql               localidades.activa: Cerri y White fuera de los selectores, la base rechaza altas ahí
018_vendedores_zona.sql                  dirección exacta o zona aproximada; la ubicación la escribe solo el servidor
019_envio_zona.sql                       zona del pedido y registro de zonas que no se pudieron calcular
020_metodos_entrega.sql                  los cuatro métodos de entrega
021_correo_ciudades.sql                  correo a cualquier ciudad y seguimiento del envío
022_pedidos_vencimiento.sql              los links de pago vencen (pedidos.vence_en) y se cancelan los vencidos
023_pedidos_link_de_pago.sql             pedidos.link_de_pago (el modelo nuevo no lo usa; lo borra la 026)
024_mp_cuenta_de_cobro.sql               pedidos.mp_user_id_cobro: qué cuenta de MercadoPago cobra cada pedido
025_pago_en_efectivo.sql                 pedidos.efectivo_vence_en (el cupón en efectivo vive por su cuenta), vencidos con margen de 6 horas, pagos_dobles
026_limpieza_modelo_pagos.sql            borra link_de_pago y las funciones de cancelar por tienda; SE CORRE DESPUÉS de publicar el código nuevo
027_endurecer_permisos.sql               sin TRUNCATE, REFERENCES ni TRIGGER para el navegador; anon solo inserta en mensajes_contacto (corrida en producción)
```

Las pruebas de la 016 (contra una base local, sin tocar Supabase): `npm run probar:sql`.
Las de la 018 (estado a medias y de cero, redondeo, permisos): `npm run probar:018`.
Las de la 022 (cancelar vencidos, filtro por tienda, permisos): `npm run probar:022`. Las funciones de JavaScript
del vencimiento (plazo, qué está vencido, fechas para MercadoPago): `npm run probar:vencimiento`.
Las de la 024 (cancelar pendientes por tienda y por cuenta, permisos): `npm run probar:024`. Las de la 025 y la 026:
`npm run probar:025`, `npm run probar:026`. Cambiar o desconectar la cuenta de MercadoPago y el `state` del OAuth, de punta
a punta con las rutas reales y todo de mentira: `npm run probar:cuenta-mp`. El webhook (cupón en efectivo, pago tardío que
revive un pedido, pago doble): `npm run probar:webhook`. «Pagar ahora»: `npm run probar:pagar-ahora`. El carrito al pagar:
`npm run probar:carrito`. Qué pedidos ve la tienda y en qué pestaña del panel cae cada uno (el cupón vencido no es una venta):
`npm run probar:pestanas` y `npm run probar:datos-pedido`.
Que los mails internos de los formularios públicos escapen lo que escribe la persona: `npm run probar:lead-gastronomia`.
Que el formulario de contacto no quede con el email de una sesión anterior: `npm run probar:contacto`. Las plantillas de
los mails de Supabase Auth (ver plantillas-auth/README.md): `npm run plantillas-auth` y `npm run probar:plantillas-auth`. La confirmación de los
enlaces de esos mails desde cualquier navegador: `npm run probar:confirmar`. Que al cerrar sesión no quede nada de la persona
en el navegador: `npm run probar:limpieza-sesion`.

Contra MercadoPago de verdad (con el token de una cuenta de PRUEBA vendedora): `scripts/probar-mp.mjs` y, para comprobar que el
cupón en efectivo sobrevive al vencimiento del link, `scripts/probar-mp-efectivo.mjs` (`npm run probar:mp-efectivo`).

En el modelo de pagos una venta existe solo cuando se paga. Un pedido sin pagar es un carrito abandonado: no se muestra a la
tienda ni en Mis pedidos. Un cupón en efectivo generado sí es una venta en curso («Pago en efectivo pendiente»).

Algunas piden un paso manual antes (crear un bucket de Storage desde el panel, por ejemplo). Está
aclarado en el encabezado de cada archivo — vale la pena leerlos, tienen escrito el *por qué* de
cada decisión, no sólo el *qué*.

**El esquema no está versionado del todo.** Esos archivos son el historial *desde que se empezó a
anotar*: las tablas base (`vendedores`, `productos`, `categorias`, `subcategorias`, `sellos`,
`barrios`, `localidades`, `pedidos`, `usuarios`, `favoritos`, `direcciones`,
`colecciones`…) y sus políticas de RLS originales se crearon a mano desde el panel y **no están
en el repo**. Para verlas hay que mirar Supabase. Las funciones de barrios (`barrio_en_punto`,
`barrios_con_poligono`) también nacieron así; desde la migración 019 están en el repo.
`calcular_zona_envio` se borró en la 020: la zona del envío la calcula el servidor
(`src/lib/zonaEnvio.js`).

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
src/middleware.js   refresco de la cookie de sesión
sql/migrations/     ver más arriba
```

Dos reglas que conviene no romper:

- **Qué se muestra en público** se decide en un solo lugar, `src/lib/vendedoresPublicos.js`: una
  tienda se ve si está publicada (`estado_validacion = 'aprobado'`) y no está bloqueada. Toda
  consulta pública la usa. La base lo hace cumplir también por RLS, pero eso sólo cubre lo que
  pasa por RLS — las lecturas con `service_role` la esquivan.
- **Nada de lo que decide el navegador es un control.** El panel de admin y el checkout vuelven a
  verificar del lado del servidor.

