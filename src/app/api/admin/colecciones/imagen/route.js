import { NextResponse } from 'next/server';
import { getServiceRoleClient, verificarAdmin } from '@/lib/supabase/admin';

export async function POST(request) {
  const admin_user = await verificarAdmin();
  if (!admin_user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) {
    return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
  }

  const extension = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const nombreArchivo = `${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;

  const admin = getServiceRoleClient();
  const { error } = await admin.storage.from('colecciones').upload(nombreArchivo, file);

  if (error) {
    return NextResponse.json({ error: 'Error al subir la imagen: ' + error.message }, { status: 500 });
  }

  const { data: urlData } = admin.storage.from('colecciones').getPublicUrl(nombreArchivo);

  return NextResponse.json({ url: urlData.publicUrl });
}
