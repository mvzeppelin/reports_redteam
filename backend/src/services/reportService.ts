import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import unzipper from 'unzipper';

export const REPORTS_DIR = path.resolve(process.env.REPORTS_DIR || '/app/reports');

const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_FILE_COUNT = 500;

const ALLOWED_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot',
  '.pdf', '.txt', '.xml', '.map',
  '.mp4', '.webm',
]);

function isSafePath(entryPath: string): boolean {
  if (!entryPath) return false;
  // Rejeitar caminhos absolutos, null bytes e componentes ".."
  if (entryPath.startsWith('/')) return false;
  if (entryPath.includes('\0')) return false;
  const parts = entryPath.split(/[\\/]/);
  if (parts.some((p) => p === '..')) return false;
  return true;
}

function isAllowedExtension(entryPath: string): boolean {
  // Diretórios (terminam em /) são sempre permitidos
  if (entryPath.endsWith('/')) return true;
  const ext = path.extname(entryPath).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

export interface ExtractionResult {
  fileCount: number;
  sizeBytes: number;
}

export async function extractReport(zipPath: string, destDir: string): Promise<ExtractionResult> {
  await fsp.mkdir(destDir, { recursive: true });

  // Primeira passagem: coletar entradas para detectar diretório raiz único e validar
  const directory = await unzipper.Open.file(zipPath);
  const entries = directory.files;

  if (entries.length === 0) {
    throw new Error('O arquivo ZIP está vazio.');
  }
  if (entries.length > MAX_FILE_COUNT) {
    throw new Error(`O ZIP contém ${entries.length} entradas (máximo: ${MAX_FILE_COUNT}).`);
  }

  // Validar todos os caminhos
  for (const entry of entries) {
    if (!isSafePath(entry.path)) {
      throw new Error(`Caminho inválido ou perigoso no ZIP: "${entry.path}"`);
    }
    // Rejeitar entradas que não sejam File ou Directory (ex: symlinks)
    if (entry.type !== 'File' && entry.type !== 'Directory') {
      throw new Error(`Tipo de entrada não permitido no ZIP: "${entry.path}"`);
    }
    if (!isAllowedExtension(entry.path)) {
      const ext = path.extname(entry.path).toLowerCase() || '(sem extensão)';
      throw new Error(`Tipo de arquivo não permitido: "${ext}" em "${entry.path}"`);
    }
  }

  // Verificar tamanho total descomprimido
  let totalUncompressed = 0;
  for (const entry of entries) {
    totalUncompressed += entry.uncompressedSize ?? 0;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error(`O conteúdo descomprimido excede o limite de 200 MB.`);
    }
  }

  // Detectar diretório raiz único (strip prefix)
  // Ex: "Relatorio Empresa 1 - Teste 1/index.html" → strip "Relatorio Empresa 1 - Teste 1/"
  const fileEntries = entries.filter((e) => e.type === 'File');
  let stripPrefix = '';
  const topDirs = new Set<string>();
  for (const entry of entries) {
    const firstSlash = entry.path.indexOf('/');
    if (firstSlash !== -1) {
      topDirs.add(entry.path.slice(0, firstSlash + 1));
    }
  }
  if (topDirs.size === 1) {
    stripPrefix = [...topDirs][0];
  }

  // Extrair arquivos
  let fileCount = 0;
  let sizeBytes = 0;

  for (const entry of entries) {
    if (entry.type !== 'File') continue;

    let relativePath = entry.path;
    if (stripPrefix && relativePath.startsWith(stripPrefix)) {
      relativePath = relativePath.slice(stripPrefix.length);
    }
    if (!relativePath) continue; // era o próprio diretório raiz

    // Segurança final: resolver e verificar que fica dentro do destDir
    const targetPath = path.resolve(destDir, relativePath);
    if (!targetPath.startsWith(path.resolve(destDir) + path.sep) && targetPath !== path.resolve(destDir)) {
      throw new Error(`Path traversal detectado: "${entry.path}"`);
    }

    await fsp.mkdir(path.dirname(targetPath), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const stream = entry.stream();
      const out = fs.createWriteStream(targetPath);
      stream.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      stream.pipe(out);
    });

    fileCount++;
    sizeBytes += entry.uncompressedSize ?? 0;
  }

  // Verificar que index.html existe na raiz do destino
  const indexPath = path.join(destDir, 'index.html');
  try {
    await fsp.access(indexPath);
  } catch {
    await fsp.rm(destDir, { recursive: true, force: true });
    throw new Error('O ZIP não contém um arquivo "index.html" na raiz. Certifique-se de que o arquivo principal se chama index.html.');
  }

  if (fileEntries.length === 0) {
    await fsp.rm(destDir, { recursive: true, force: true });
    throw new Error('O ZIP não contém arquivos.');
  }

  return { fileCount, sizeBytes };
}

export async function deleteReportFiles(reportId: string): Promise<void> {
  const dir = path.join(REPORTS_DIR, reportId);
  // Garantia: o path deve começar com REPORTS_DIR
  if (!path.resolve(dir).startsWith(path.resolve(REPORTS_DIR) + path.sep)) {
    throw new Error('Tentativa de deleção fora do diretório de relatórios.');
  }
  await fsp.rm(dir, { recursive: true, force: true });
}
