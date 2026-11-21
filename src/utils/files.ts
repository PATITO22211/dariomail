import type { ComposeAttachment } from '../types/mail';

const MAX_BYTES = 15 * 1024 * 1024;

export function formatByteSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export async function filesToAttachments(files: FileList | File[]): Promise<ComposeAttachment[]> {
  const list = Array.from(files);
  const attachments: ComposeAttachment[] = [];
  for (const file of list) {
    if (file.size > MAX_BYTES) {
      throw new Error('El archivo supera el límite');
    }
    const dataBase64 = await readBase64(file);
    attachments.push({
      id: crypto.randomUUID(),
      name: file.name || 'adjunto',
      sizeLabel: formatByteSize(file.size),
      contentType: file.type || 'application/octet-stream',
      dataBase64,
      size: file.size,
    });
  }
  return attachments;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      const comma = raw.indexOf(',');
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.readAsDataURL(file);
  });
}
