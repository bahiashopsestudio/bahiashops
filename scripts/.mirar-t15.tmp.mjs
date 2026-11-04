// Solo lecturas: las suscripciones de la tienda 15 en la base y en Mercado Pago.
// No imprime mails ni tokens.
import { createClient } from '@supabase/supabase-js'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const token = process.env.MP_ACCESS_TOKEN_PLATAFORMA
const mp = async (ruta) => {
  const r = await fetch(`https://api.mercadopago.com${ruta}`, { headers: { Authorization: `Bearer ${token}` } })
  return { status: r.status, datos: await r.json().catch(() => null) }
}

const { data: subs } = await admin.from('vendedor_suscripciones')
  .select('id, plan_clave, monto, estado, mp_preapproval_id, external_reference, proximo_cobro_en, ultimo_cobro_en, ultimo_cobro_monto, pagado_hasta, creada_en, cancelada_en')
  .eq('vendedor_id', 15).order('id')
console.log('SUSCRIPCIONES', subs)
const ids = (subs || []).map((s) => s.id)
const { data: cobros } = await admin.from('suscripcion_cobros').select('*').in('suscripcion_id', ids.length ? ids : [0])
console.log('COBROS', cobros)
const { data: difs } = await admin.from('suscripcion_diferencias')
  .select('id, suscripcion_id, precio_nuevo, monto_anterior, monto, estado, mp_pago_id, pagada_en, monto_mp_actualizado_en, cubre_hasta')
  .eq('vendedor_id', 15)
console.log('DIFERENCIAS', difs)
const { data: plan } = await admin.rpc('rpc_plan_de_tienda', { p_vendedor_id: 15 })
console.log('PLAN', { plan: plan?.plan, origen: plan?.origen, tope: plan?.tope_productos, especial_pendiente: plan?.especial_pendiente })

for (const s of subs || []) {
  if (!s.mp_preapproval_id) continue
  const pre = await mp(`/preapproval/${s.mp_preapproval_id}`)
  console.log('MP PREAPPROVAL', s.id, pre.status, {
    status: pre.datos?.status, monto: pre.datos?.auto_recurring?.transaction_amount, summarized: pre.datos?.summarized,
    application_id_coincide: String(pre.datos?.application_id) === String(process.env.MP_CLIENT_ID).trim(),
  })
  const cob = await mp(`/authorized_payments/search?preapproval_id=${s.mp_preapproval_id}`)
  for (const c of cob.datos?.results || []) {
    console.log('  MP COBRO', c.id, c.status, c.payment)
    if (c.payment?.id) {
      const p = await mp(`/v1/payments/${c.payment.id}`)
      console.log('    MP PAGO', p.status, { status: p.datos?.status, status_detail: p.datos?.status_detail, refunds: (p.datos?.refunds || []).length, ref: p.datos?.external_reference, notification_url: p.datos?.notification_url ?? null })
    }
  }
}
for (const d of difs || []) {
  if (!d.mp_pago_id) continue
  const p = await mp(`/v1/payments/${d.mp_pago_id}`)
  console.log('MP PAGO DIFERENCIA', d.id, p.status, { status: p.datos?.status, notification_url: p.datos?.notification_url ?? null })
}
