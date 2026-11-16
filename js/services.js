import { buildExportArtifact } from './exporters.js';
import { createZipBlob } from './zip.js';
import { getServiceById } from './service-catalog.js';

export { SERVICE_CATALOG, getServiceById } from './service-catalog.js';

export function resolveServiceFormat(serviceId, useAdvanced, advancedFormat) {
  if (useAdvanced && advancedFormat) {
    return { format: advancedFormat, service: null };
  }
  const service = getServiceById(serviceId);
  if (!service) throw new Error(`Unknown service: ${serviceId}`);
  return { format: service.format, service };
}

export function needsIdLookup(format) {
  return format !== 'json' && format !== 'mal-xml';
}

export async function buildServiceArtifact(target, library, username, diaryMode) {
  const { format, service } = target;
  const base = buildExportArtifact(format, library, username, diaryMode);

  if (service?.id === 'trakt') {
    const jsonArtifact = buildExportArtifact('trakt-json', library, username, diaryMode);
    base.extraFiles = [
      { name: base.filename, content: base.content },
      { name: jsonArtifact.filename, content: jsonArtifact.content },
    ];
  }

  if (service?.id === 'tmdb') {
    base.extraFiles = base.extraFiles || [
      { name: base.filename, content: base.content },
    ];
  }

  const files = collectFiles(base);
  const bundle = service?.bundle || (files.length > 1 ? 'zip' : 'single');
  const shouldZip = bundle === 'zip' || (files.length > 1 && bundle !== 'single');

  if (shouldZip) {
    const zipName = `${username}-${(service?.id || format)}-export.zip`;
    const zipBlob = await createZipBlob(files);
    return {
      ...base,
      filename: zipName,
      mime: 'application/zip',
      blob: zipBlob,
      content: null,
      files,
      service: service?.id ?? null,
      serviceMeta: service,
      instructions: service ? { ru: service.instructionKey, en: service.instructionKey } : null,
      importUrl: service?.importUrl ?? '',
      docUrl: service?.docUrl ?? '',
      diaryMode,
    };
  }

  const primary = files[0];
  return {
    ...base,
    filename: primary.name,
    mime: guessMime(primary.name),
    content: primary.content,
    blob: null,
    files,
    service: service?.id ?? null,
    serviceMeta: service,
    importUrl: service?.importUrl ?? '',
    docUrl: service?.docUrl ?? '',
    diaryMode,
  };
}

function collectFiles(base) {
  if (base.extraFiles?.length) {
    return base.extraFiles.map((f) => ({ name: f.name, content: f.content }));
  }
  return [{ name: base.filename, content: base.content }];
}

function guessMime(name) {
  if (name.endsWith('.json')) return 'application/json;charset=utf-8';
  if (name.endsWith('.md')) return 'text/markdown;charset=utf-8';
  if (name.endsWith('.txt')) return 'text/plain;charset=utf-8';
  return 'text/csv;charset=utf-8';
}