export async function compressImage(
  dataUrl: string,
  maxWidth = 860,
  quality = 0.8,
): Promise<string> {
  const image = new Image();
  image.src = dataUrl;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to load image for compression"));
  });

  const ratio = image.width > maxWidth ? maxWidth / image.width : 1;
  const width = Math.round(image.width * ratio);
  const height = Math.round(image.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function nowMs() {
  return performance.now();
}

export function elapsedMs(start: number) {
  return Math.round(performance.now() - start);
}
