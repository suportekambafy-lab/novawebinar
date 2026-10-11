/**
 * Imagens leves: o público da sala está em Angola, com dados móveis caros. Cada imagem carregada é
 * reduzida no navegador antes do envio, ao tamanho em que aparece.
 */

export type ShrinkPreset = {
  /** Caixa máxima; a imagem nunca cresce. Com `square`, corta o quadrado do centro. */
  width: number;
  height: number;
  square?: boolean;
  /** Formatos por ordem de preferência: o navegador que não codifica um (o Safari e o WebP) passa ao seguinte. */
  types: string[];
  quality: number;
};

export const IMAGE_PRESETS = {
  /** Foto do apresentador ou do perfil: mostrada a 28–48 px, 160 px chega para ecrãs de densidade 3. */
  avatar: {
    width: 160,
    height: 160,
    square: true,
    types: ["image/webp", "image/jpeg"],
    quality: 0.85,
  },
  /** Imagem de partilha: JPEG, porque o WhatsApp não mostra pré-visualizações WebP nem acima de ~300 KB. */
  cover: { width: 1200, height: 630, types: ["image/jpeg"], quality: 0.8 },
  /** Capa da página de inscrição (por cima do formulário) e do webinar na lista: 16:9. */
  pageCover: { width: 1600, height: 900, types: ["image/webp", "image/jpeg"], quality: 0.8 },
  /** Imagem da oferta: WebP (ou PNG) para não perder a transparência de um produto recortado. */
  offer: { width: 1200, height: 1200, types: ["image/webp", "image/png"], quality: 0.8 },
} satisfies Record<string, ShrinkPreset>;

/** Recorte e tamanho final: só reduz, nunca aumenta. */
export function shrinkBox(
  width: number,
  height: number,
  preset: Pick<ShrinkPreset, "width" | "height" | "square">,
) {
  const side = Math.min(width, height);
  const sw = preset.square ? side : width;
  const sh = preset.square ? side : height;
  const scale = Math.min(1, preset.width / sw, preset.height / sh);
  return {
    sx: (width - sw) / 2,
    sy: (height - sh) / 2,
    sw,
    sh,
    width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)),
  };
}

/**
 * A imagem reduzida, ou o ficheiro original quando o navegador não a consegue ler (HEIC fora do
 * Safari), quando é um GIF (perdia a animação) ou SVG, ou quando a versão reduzida não fica mais pequena.
 */
export async function shrinkImage(file: File, preset: ShrinkPreset): Promise<File> {
  if (!/^image\/(jpeg|png|webp|avif|bmp|heic|heif)$/.test(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const box = shrinkBox(bitmap.width, bitmap.height, preset);
  const canvas = document.createElement("canvas");
  canvas.width = box.width;
  canvas.height = box.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, box.sx, box.sy, box.sw, box.sh, 0, 0, box.width, box.height);
  bitmap.close();

  for (const type of preset.types) {
    if (type === "image/jpeg") {
      // O JPEG não tem transparência: fundo branco por trás, em vez de preto.
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, box.width, box.height);
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, preset.quality),
    );
    if (blob?.type !== type) continue;
    if (blob.size >= file.size) return file;
    const ext = type === "image/jpeg" ? "jpg" : type.split("/")[1];
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type });
  }
  return file;
}

/** A extensão do ficheiro a enviar (o reduzido muda de formato). */
export const imageExtension = (file: File) => file.name.split(".").pop()?.toLowerCase() || "jpg";

/**
 * As imagens carregadas antes da redução (até 2,5 MB) servidas pequenas pelo optimizador de imagens
 * da Vercel (`images` no vercel.json), sem as reescrever no Storage nem na base. As novas, já
 * reduzidas (nome a acabar em `-160`), seguem como estão.
 */
export function smallImage(url: string): string {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/sign\//.test(url)) return url;
  if (/-160\.(webp|jpg|png)\?/.test(url)) return url;
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=160&q=75`;
}
