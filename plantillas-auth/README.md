# Mails de Supabase Auth con el diseño de Bahía Shops

Las plantillas de esta carpeta reemplazan a las genéricas de Supabase. Tienen el
mismo diseño que los mails del sitio (`src/lib/mailBase.js`). **No están
publicadas**: se copian a mano en el panel de Supabase, en el orden de abajo.

Se generan con:

```bash
npm run plantillas-auth
```

No hay que editar los `.html` a mano: se cambia `scripts/armar-plantillas-auth.mjs`
y se vuelven a generar. `npm run probar:plantillas-auth` las revisa.

| Archivo | Plantilla en Supabase | Asunto | Título (imagen) | type |
|---|---|---|---|---|
| `confirmar-registro.html` | Confirm signup | Confirmá tu cuenta en Bahía Shops | `titulo-bienvenida.png` · «Te damos la bienvenida a Bahía Shops» | `email` |
| `recuperar-contrasena.html` | Reset Password | Cambiá tu contraseña de Bahía Shops | `titulo-contrasena.png` · «Elegí una contraseña nueva» | `recovery` |
| `cambio-de-email.html` | Change Email Address | Confirmá tu nuevo email en Bahía Shops | `titulo-cambio-email.png` · «Confirmá tu nuevo email» | `email_change` |
| `invitacion.html` | Invite user | Te invitaron a Bahía Shops | `titulo-invitacion.png` · «Te invitaron a Bahía Shops» | `invite` |

Los `.txt` son la versión en texto de cada mail, para leerla o para usarla en otro
programa. Supabase manda solo el HTML.

## El enlace: funciona desde cualquier navegador

El enlace de cada mail no es `{{ .ConfirmationURL }}`. Ese vuelve a
`/auth/callback` con un «code» que solo se puede canjear en el navegador donde se
hizo el registro: el flujo PKCE guarda una clave en una cookie
(`sb-…-code-verifier`) de ese navegador. Abierto en otro navegador, o en la app
de Gmail del celular, fallaba.

Ahora el enlace es:

```
{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=<type>
```

El de registro suma `&redirect_to={{ .RedirectTo }}`, para volver adonde estaba la
persona. `/auth/confirmar` muestra un botón, y al apretarlo
`/auth/confirmar/verificar` confirma del lado del servidor con `verifyOtp`. No
necesita nada del navegador original. La página no confirma sola al abrirse: así,
un programa de mail que abre los enlaces para revisarlos no gasta el enlace, que
sirve una sola vez. La regla está en `src/lib/confirmacionAuth.js`
(`npm run probar:confirmar`).

`/auth/callback` sigue igual para entrar con Google.

## Las imágenes

Están en `public/email/` y se sirven desde `https://bahiashops.com.ar/email/`:

- `logo.png`: el logo para fondo claro (`public/images/logo-negro-bahia-shops.png`).
- `titulo-bienvenida.png`, `titulo-contrasena.png`, `titulo-cambio-email.png`,
  `titulo-invitacion.png`: 1000×80, Fraunces 500 a 54 px, #0a0a0a sobre #faf9f7,
  alineados a la izquierda. Es el mismo estilo que los de `public/mail/`. Se
  muestran a 500×40.

Si el programa de mail bloquea las imágenes, se ve el texto alternativo con el
estilo del título: `alt` es el mismo texto, y el logo dice «Bahía Shops».
Además, cada mail explica qué pasa con texto común y trae el enlace escrito
debajo del botón.

## Variables de Supabase que usan

- `{{ .SiteURL }}`: la Site URL del proyecto (Authentication → URL
  Configuration). Tiene que ser `https://bahiashops.com.ar`.
- `{{ .TokenHash }}`: el token del enlace, que se verifica con `verifyOtp` (todas).
- `{{ .RedirectTo }}`: adónde volver después del registro (solo el de registro).
- `{{ .Email }}`: el email de la cuenta (recuperar contraseña y cambio de email).
- `{{ .NewEmail }}`: el email nuevo (cambio de email).

Hoy el sitio no tiene una pantalla para cambiar el email ni manda invitaciones.
Esas dos plantillas sirven si algún día se usan desde el panel de Supabase.

## El orden (no saltear pasos)

### 1. Publicar el sitio primero

Las plantillas nuevas apuntan a `/auth/confirmar` y a las imágenes de
`/email/`. Si se pegan antes de publicar, los enlaces de los mails dan 404.

1. Publicá el sitio con `public/email/` y la ruta `/auth/confirmar`.
2. Abrí en el navegador estas cinco URLs y confirmá que cargan:
   - https://bahiashops.com.ar/email/logo.png
   - https://bahiashops.com.ar/email/titulo-bienvenida.png
   - https://bahiashops.com.ar/email/titulo-contrasena.png
   - https://bahiashops.com.ar/email/titulo-cambio-email.png
   - https://bahiashops.com.ar/email/titulo-invitacion.png
3. Abrí https://bahiashops.com.ar/auth/confirmar?error=vencido: tiene que mostrar
   «Este enlace ya no sirve».

### 2. Guardar las plantillas actuales (para poder volver atrás)

En Supabase → Authentication → Emails → **Templates**, para cada una de las cuatro
(Confirm signup, Reset Password, Change Email Address, Invite user), copiá el
**asunto** y el **HTML** que tiene hoy y guardalos en un archivo aparte, fuera del
repo. Para volver atrás, se pegan de nuevo.

Las de Supabase usan `{{ .ConfirmationURL }}`: si se vuelve a ellas, vuelve
también el problema de abrir el enlace en otro navegador.

### 3. SMTP propio con Resend (que los mails salgan de bahiashops.com.ar)

**Antes, en Resend:**

1. **Dominio verificado.** En Resend → Domains, `bahiashops.com.ar` tiene que
   figurar como **Verified**. El sitio ya manda mails desde ese dominio, así que
   seguramente lo está. Igual, confirmá que estén en verde:
   - **DKIM**: registro TXT `resend._domainkey`.
   - **SPF**: el MX y el TXT del subdominio `send` (`v=spf1 include:amazonses.com ~all`).
   - **DMARC** (recomendado): TXT `_dmarc` con al menos `v=DMARC1; p=none;`.
2. **Una API key solo para Supabase.** En Resend → API Keys → Create API Key:
   nombre «Supabase SMTP», permiso **Sending access**, dominio
   `bahiashops.com.ar`. No uses la del sitio: así se puede revocar sin tocar nada
   más. Copiala, porque Resend la muestra una sola vez.

**En Supabase:**

1. Authentication → (Notifications) **Emails** → **SMTP Settings** → activá
   **Enable custom SMTP**.
2. Completá:
   - **Sender email**: `no-reply@bahiashops.com.ar`
   - **Sender name**: `Bahía Shops`
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: la API key de Resend
3. **Save**.
4. **Límite de envíos.** Con el servicio de mails que trae Supabase el límite es de
   **2 mails por hora** para todo el proyecto. Con SMTP propio el límite se
   configura en Authentication → **Rate Limits** («emails sent»). Ponelo según
   las altas y recuperaciones que esperes por hora: si se queda corto, los mails
   de más no salen y la persona no recibe la confirmación. Resend además tiene su
   propio límite según el plan.

### 4. Revisar las URL (antes de pegar las plantillas)

En Supabase → Authentication → **URL Configuration**:

1. **Site URL**: exactamente `https://bahiashops.com.ar`, sin barra al final. Las
   plantillas arman el enlace con `{{ .SiteURL }}/auth/confirmar…`. Con otra
   dirección (por ejemplo `http://localhost:3000`, que a veces queda de las
   pruebas), los mails llevarían a otro lado. Con una barra al final, quedaría
   `//auth/confirmar`.
2. **Redirect URLs**: tienen que estar estas dos.
   - `https://bahiashops.com.ar/auth/callback**`. Es lo que viaja en
     `{{ .RedirectTo }}` (el `redirect_to` del enlace de registro). El sitio la
     manda al registrarse (`emailRedirectTo`) y al pedir recuperar la contraseña
     (`redirectTo`), y la usa también el ingreso con Google. Supabase solo acepta
     un `RedirectTo` que esté en esta lista. Si no está, pone la Site URL en su
     lugar y la persona termina en el inicio en vez de volver adonde estaba. El
     `**` hace falta porque lleva `?next=…`.
   - `https://bahiashops.com.ar/auth/confirmar**`. El enlace del mail va directo
     al sitio y no pasa por una redirección de Supabase, así que en rigor no
     hace falta. Se agrega para que la lista tenga todas las rutas que usan los
     mails, y no molesta.
3. Si probás en tu máquina con estas plantillas, agregá también
   `http://localhost:3000/**`. No cambies la Site URL para probar.

### 5. Pegar las plantillas

Authentication → Emails → **Templates**: en cada una de las cuatro pegá el asunto
de la tabla de arriba y el HTML del archivo que le corresponde, y guardá.

### 6. Probar

1. Registrate con un mail tuyo que no tenga cuenta **en la computadora**, y abrí el
   mail **en el celular** (la app de Gmail). Tocá «Confirmar mi email» y después
   «Confirmar mi cuenta»: tiene que quedar confirmada y con la sesión iniciada en
   el celular.
2. Volvé a abrir el mismo enlace: tiene que decir «Este enlace ya no sirve».
3. Revisá que llegue de «Bahía Shops <no-reply@bahiashops.com.ar>», con el
   diseño y el logo.
4. En Gmail: ⋮ → **Mostrar original**. Tienen que decir **PASS** SPF, DKIM (con
   `d=bahiashops.com.ar`) y DMARC.
5. Probá «Olvidé mi contraseña» de la misma forma (pedirlo en un navegador y
   abrirlo en otro): tiene que llevar a elegir la contraseña nueva.
6. Con las imágenes bloqueadas (Gmail → Configuración → Imágenes → «Preguntar
   antes de mostrar»), confirmá que se lee el texto del título y del logo.
