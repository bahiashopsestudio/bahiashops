'use client';

// Quienes se anotaron en /servicios para sumarse cuando abra la sección: el
// conteo por rubro (para saber por dónde empezar) y la lista, con la más nueva
// arriba. Se borra una anotación cuando la persona lo pide; también se borra
// sola si elimina la cuenta con ese email (migración 053).

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import { contarPorRubro } from '@/lib/serviciosInteresados';
import { FONDO_BAHIA } from '@/lib/coloresBahia';

const FECHA = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires',
});

const BEIGE = '#f4e9e1';
const TENUE = 'rgba(10,10,10,0.42)';
const SUAVE = 'rgba(10,10,10,0.62)';
const ROJO = '#b3261e';
const LINEA = 'rgba(10,10,10,0.10)';

const estiloRotulo = { fontSize: '11px', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: TENUE };
const estiloBotonTexto = { background: 'none', border: 'none', padding: 0, fontSize: '12.5px', textDecoration: 'underline', textUnderlineOffset: '3px', cursor: 'pointer' };

export default function ServiciosAnotadosPage() {
  const supabase = createClient();

  const [esAdmin, setEsAdmin] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [anotaciones, setAnotaciones] = useState([]);
  const [error, setError] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [borrando, setBorrando] = useState(null);
  const [aviso, setAviso] = useState('');
  const reloj = useRef(null);

  function avisar(texto) {
    setAviso(texto);
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setAviso(''), 3000);
  }
  useEffect(() => () => clearTimeout(reloj.current), []);

  useEffect(() => {
    async function iniciar() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setEsAdmin(false); setCargando(false); return; }

      const { data: perfil } = await supabase
        .from('usuarios')
        .select('es_admin')
        .eq('id', user.id)
        .single();

      if (!perfil?.es_admin) { setEsAdmin(false); setCargando(false); return; }

      setEsAdmin(true);
      try {
        const res = await fetch('/api/admin/servicios');
        const cuerpo = await res.json().catch(() => ({}));
        if (res.ok) setAnotaciones(cuerpo.anotaciones || []);
        else setError(cuerpo.error || 'No pudimos cargar las anotaciones.');
      } catch {
        setError('No pudimos cargar las anotaciones.');
      }
      setCargando(false);
    }
    iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copiarMails() {
    const mails = anotaciones.map((a) => a.email);
    try {
      await navigator.clipboard.writeText(mails.join(', '));
      avisar(`${mails.length} ${mails.length === 1 ? 'mail copiado' : 'mails copiados'}.`);
    } catch {
      avisar('No se pudo copiar.');
    }
  }

  async function borrar(id) {
    setBorrando(id);
    try {
      const res = await fetch(`/api/admin/servicios/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setAnotaciones((lista) => lista.filter((a) => a.id !== id));
      avisar('Anotación borrada.');
    } catch {
      avisar('No pudimos borrar la anotación.');
    }
    setConfirmando(null);
    setBorrando(null);
  }

  if (cargando) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center text-gray-400">Cargando...</main>
      </>
    );
  }

  if (!esAdmin) {
    return (
      <>
        <Navbar variant="solid" />
        <main className="pt-28 px-6 text-center">
          <h1 className="text-2xl font-semibold text-[#0a0a0a]">Acceso restringido</h1>
          <p className="text-gray-500">Esta página es solo para administradores.</p>
        </main>
      </>
    );
  }

  const total = anotaciones.length;
  const porRubro = contarPorRubro(anotaciones);
  const maximo = porRubro.length ? porRubro[0].cantidad : 1;

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&family=Poppins:wght@300;400;500&display=swap" />
      <Navbar variant="solid" />

      <main className="pt-28 pb-12 px-6 max-w-[1000px] w-full mx-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="m-0" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '32px', lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0a0a0a' }}>
              Servicios: anotados
            </h1>
            {!error && (
              <p className="mt-1 mb-0" style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 300, fontSize: '14px', color: SUAVE }}>
                {total} {total === 1 ? 'persona quiere sumarse' : 'personas quieren sumarse'}. Cuando abras Servicios, son las primeras a quienes avisar.
              </p>
            )}
          </div>
          {total > 0 && (
            <div className="flex flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={copiarMails}
                className="cursor-pointer"
                style={{ fontSize: '13.5px', fontWeight: 600, padding: '10px 16px', borderRadius: '4px', border: '1px solid #0a0a0a', background: '#0a0a0a', color: '#ffffff' }}
              >
                Copiar todos los mails
              </button>
            </div>
          )}
        </div>

        <p role="status" className="m-0 mt-2 text-right" style={{ fontSize: '12.5px', fontWeight: 500, color: FONDO_BAHIA, minHeight: '18px' }}>
          {aviso}
        </p>

        {error && (
          <p className="mt-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</p>
        )}

        {!error && total === 0 && (
          <p className="mt-6 text-sm text-gray-400">Todavía no se anotó nadie.</p>
        )}

        {!error && total > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-7 items-start">
            <aside className="bg-white rounded-2xl p-[18px] flex flex-col gap-3" style={{ border: `1px solid ${LINEA}` }}>
              <h2 className="m-0" style={estiloRotulo}>Por rubro</h2>
              <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
                {porRubro.map((r) => (
                  <li key={r.rubro} className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1" style={{ fontSize: '13.5px' }}>
                    <span className="break-words min-w-0">{r.rubro}</span>
                    <b style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.cantidad}</b>
                    <span className="col-span-2 block rounded-sm overflow-hidden" style={{ height: '4px', background: BEIGE }}>
                      <span className="block h-full rounded-sm" style={{ width: `${(r.cantidad / maximo) * 100}%`, background: FONDO_BAHIA }} />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="m-0" style={{ fontSize: '12px', color: TENUE }}>Agrupados sin mayúsculas, tildes ni espacios de más.</p>
            </aside>

            <div className="bg-white rounded-2xl overflow-x-auto min-w-0" style={{ border: `1px solid ${LINEA}` }}>
              <table className="w-full border-collapse" style={{ fontSize: '13.5px', minWidth: '520px' }}>
                <thead>
                  <tr>
                    {['Email', 'Rubro', 'Fecha', ''].map((t, i) => (
                      <th key={i} className="text-left" style={{ ...estiloRotulo, padding: '12px 16px', borderBottom: `1px solid ${LINEA}` }}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {anotaciones.map((a, i) => {
                    const ultima = i === anotaciones.length - 1;
                    const celda = { padding: '12px 16px', borderBottom: ultima ? 'none' : `1px solid ${LINEA}`, verticalAlign: 'middle' };
                    return (
                      <tr key={a.id}>
                        <td className="break-all" style={celda}>{a.email}</td>
                        <td className="break-words" style={celda}>{a.rubro}</td>
                        <td className="whitespace-nowrap" style={{ ...celda, color: SUAVE, fontVariantNumeric: 'tabular-nums' }}>{FECHA.format(new Date(a.creado_en))}</td>
                        <td className="text-right whitespace-nowrap" style={celda}>
                          {confirmando === a.id ? (
                            <span className="inline-flex items-center gap-2.5" style={{ fontSize: '12.5px' }}>
                              ¿Borrar?
                              <button type="button" disabled={borrando === a.id} onClick={() => borrar(a.id)}
                                style={{ ...estiloBotonTexto, color: ROJO, fontWeight: 600 }}>
                                {borrando === a.id ? 'Borrando…' : 'Sí, borrar'}
                              </button>
                              <span style={{ color: TENUE }}>·</span>
                              <button type="button" disabled={borrando === a.id} onClick={() => setConfirmando(null)}
                                style={{ ...estiloBotonTexto, color: SUAVE }}>
                                No
                              </button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setConfirmando(a.id)} style={{ ...estiloBotonTexto, color: SUAVE }}>
                              Borrar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
