/** Validatie van geüploade importbestanden. */

export interface UploadLimits {
  maxBytes: number;
}

export interface UploadCheck {
  ok: boolean;
  error?: string;
  text?: string;
  encoding?: "utf-8" | "windows-1252";
}

const ALLOWED_EXTENSIONS = [".csv", ".txt"];
const ALLOWED_MIME = new Set(["", "text/csv", "text/plain", "application/csv", "application/vnd.ms-excel", "text/x-csv"]);

export function defaultUploadLimits(): UploadLimits {
  const mb = Number(process.env.NOBLENEST_MAX_UPLOAD_MB ?? 5);
  return { maxBytes: (Number.isFinite(mb) && mb > 0 ? mb : 5) * 1024 * 1024 };
}

/**
 * Controleert naam, type, grootte en inhoud. Decodeert UTF-8; valt terug op Windows-1252
 * (veelgebruikt door Excel in Nederland). Binaire bestanden worden geweigerd.
 */
export function checkCsvUpload(
  file: { name: string; size: number; type: string },
  bytes: Uint8Array,
  limits: UploadLimits = defaultUploadLimits(),
): UploadCheck {
  const name = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return { ok: false, error: "Alleen .csv-bestanden zijn toegestaan." };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `Bestandstype "${file.type}" wordt niet ondersteund.` };
  }
  if (file.size === 0 || bytes.length === 0) return { ok: false, error: "Het bestand is leeg." };
  if (file.size > limits.maxBytes || bytes.length > limits.maxBytes) {
    return { ok: false, error: `Het bestand is groter dan ${Math.round(limits.maxBytes / 1024 / 1024)} MB.` };
  }
  if (bytes.includes(0)) return { ok: false, error: "Het bestand lijkt binair en is geen geldig CSV-bestand." };

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text, encoding: "utf-8" };
  } catch {
    const text = new TextDecoder("windows-1252").decode(bytes);
    return { ok: true, text, encoding: "windows-1252" };
  }
}
