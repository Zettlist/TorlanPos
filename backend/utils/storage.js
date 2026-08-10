
import { Storage } from '@google-cloud/storage';
import path from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Initialize storage
// On App Engine, no credentials needed if using default service account
const storage = new Storage();

// Default bucket for App Engine projects is usually [project-id].appspot.com
const BUCKET_NAME = process.env.GCLOUD_STORAGE_BUCKET || 'pos-torlan.appspot.com';
const bucket = storage.bucket(BUCKET_NAME);

// ─── Almacenamiento local para desarrollo ───────────────────────────────────
//
// Sin credenciales de GCS toda alta de producto falla con "Error al subir la
// imagen", porque la imagen es obligatoria. En una maquina de desarrollo eso
// deja el formulario entero imposible de probar.
//
// Se activa con LOCAL_UPLOADS=1 y nada mas: es explicito a proposito. Detectar
// "parece desarrollo" y cambiar de almacen solo por eso es como se acaba
// escribiendo imagenes de produccion en el disco de un contenedor efimero.
const LOCAL = process.env.LOCAL_UPLOADS === '1';
const CARPETA_LOCAL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');

function guardarEnDisco(file, destinationFolder) {
    const carpeta = path.join(CARPETA_LOCAL, destinationFolder);
    mkdirSync(carpeta, { recursive: true });
    const nombre = `${Date.now()}_${path.basename(file.originalname).replace(/\s+/g, '_')}`;
    writeFileSync(path.join(carpeta, nombre), file.buffer);
    // Ruta relativa: la sirve server.js en /uploads.
    return `/uploads/${destinationFolder}/${nombre}`;
}

export async function uploadFileToGCS(file, destinationFolder = 'products') {
    if (!file) return null;

    if (LOCAL) return guardarEnDisco(file, destinationFolder);

    try {
        const uniqueFilename = `${destinationFolder}/${Date.now()}_${path.basename(file.originalname).replace(/\s+/g, '_')}`;
        const blob = bucket.file(uniqueFilename);

        const blobStream = blob.createWriteStream({
            resumable: false,
            contentType: file.mimetype,
        });

        return new Promise((resolve, reject) => {
            blobStream.on('error', (err) => {
                console.error('GCS Upload Error:', err);
                reject(err);
            });

            blobStream.on('finish', () => {
                // Determine public URL
                // If the bucket is public or we use signed URLs. 
                // For simplicity/App Engine, we can often use the public link if made public,
                // BUT better to keep it secure-ish. However, for a POS product image, public read is fine.
                // We will assume the bucket objects are readable or we make them readable.

                // Make the file public (optional, might need permissions)
                // For now, let's try to make it public.
                blob.makePublic().then(() => {
                    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${uniqueFilename}`;
                    resolve(publicUrl);
                }).catch(err => {
                    // If we can't make it public programmatically (IAM roles), request might fail.
                    // Fallback: Just return the URL hoping the bucket config allows it
                    // OR use media link
                    console.warn('Could not make file public automatically:', err.message);
                    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${uniqueFilename}`;
                    resolve(publicUrl);
                });
            });

            blobStream.end(file.buffer);
        });
    } catch (error) {
        console.error('Upload wrapper error:', error);
        throw error;
    }
}
