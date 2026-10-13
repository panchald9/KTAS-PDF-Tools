export interface ImageResult {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  outputBytes: number;
  extension: string;
}
function numeric(options: Record<string, string>, key: string, fallback: number, minimum: number, maximum: number, integer = true) {
  const raw = options[key];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`${key} must be ${integer ? "an integer" : "a number"} between ${minimum} and ${maximum}.`);
  }
  return value;
}
function safeDimensions(width: number, height: number) {
  if (width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 40_000_000) {
    throw new Error("Use dimensions from 1 to 16,384 pixels, with at most 40 megapixels in total.");
  }
}
async function decode(file: File) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be decoded. Choose a valid still JPEG, PNG, WebP or BMP."));
      image.src = url;
    });
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export async function processImage(file: File, slug: string, options: Record<string, string> = {}): Promise<ImageResult> {
  if (!file.size || file.size > 30 * 1024 * 1024) throw new Error("Choose a nonempty image smaller than 30 MB.");
  if (!/\.(jpe?g|png|webp|bmp)$/i.test(file.name) || (file.type && !/^image\/(jpeg|png|webp|bmp|x-ms-bmp)$/i.test(file.type))) {
    throw new Error("Supported formats are still JPEG, PNG, WebP and BMP. Animated GIF, SVG and HEIC are not supported.");
  }
  const image = await decode(file);
  const iw = image.naturalWidth, ih = image.naturalHeight;
  safeDimensions(iw, ih);
  const format = options.format ?? (slug === "compress-image" ? "jpg" : "png");
  if (!["png", "jpg", "webp"].includes(format)) throw new Error("Choose PNG, JPG or WebP output.");
  const quality = numeric(options, "quality", 85, 1, 100) / 100;
  let width = iw, height = ih;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  const angle = slug === "rotate-image" ? numeric(options, "degrees", 90, 0, 270) : 0;
  if (slug === "rotate-image") {
    if (![0, 90, 180, 270].includes(angle)) throw new Error("Choose a rotation of 90, 180 or 270 degrees.");
    if (angle === 90 || angle === 270) { width = ih; height = iw; }
  }
  if (slug === "resize-image") {
    const targetWidth = numeric(options, "width", 1280, 0, 16384);
    const targetHeight = numeric(options, "height", 0, 0, 16384);
    width = targetWidth || (targetHeight ? Math.max(1, Math.round(iw * targetHeight / ih)) : iw);
    height = targetHeight || Math.max(1, Math.round(ih * width / iw));
    const fit = options.fit ?? "contain";
    if (!["contain", "cover", "stretch"].includes(fit)) throw new Error("Choose a supported resize mode.");
    if (fit !== "contain" && (!targetWidth || !targetHeight)) {
      throw new Error("Fill and crop or stretch requires both width and height greater than zero. Choose Fit inside for automatic dimensions.");
    }
    if (targetWidth && targetHeight && fit === "contain") {
      const scale = Math.min(targetWidth / iw, targetHeight / ih);
      width = Math.max(1, Math.round(iw * scale)); height = Math.max(1, Math.round(ih * scale));
    } else if (targetWidth && targetHeight && fit === "cover") {
      const ratio = width / height;
      if (iw / ih > ratio) { sw = ih * ratio; sx = (iw - sw) / 2; }
      else { sh = iw / ratio; sy = (ih - sh) / 2; }
    }
  } else if (slug === "crop-image") {
    sx = numeric(options, "x", 0, 0, iw - 1); sy = numeric(options, "y", 0, 0, ih - 1);
    width = numeric(options, "width", 0, 0, iw) || iw - sx;
    height = numeric(options, "height", 0, 0, ih) || ih - sy;
    if (sx + width > iw || sy + height > ih) throw new Error(`Crop exceeds the ${iw} × ${ih} source image.`);
    sw = width; sh = height;
  }
  safeDimensions(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: slug === "grayscale-image" || slug === "invert-image" });
  if (!context) throw new Error("Your browser cannot create an image canvas.");
  try {
    if (format === "jpg") { context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); }
    context.save();
    switch (slug) {
      case "rotate-image":
        context.translate(width / 2, height / 2); context.rotate(angle * Math.PI / 180);
        context.drawImage(image, -iw / 2, -ih / 2); break;
      case "flip-image": {
        const direction = options.direction ?? "horizontal";
        if (!["horizontal", "vertical", "both"].includes(direction)) throw new Error("Choose a valid mirror direction.");
        const horizontal = direction !== "vertical", vertical = direction !== "horizontal";
        context.translate(horizontal ? width : 0, vertical ? height : 0);
        context.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
        context.drawImage(image, 0, 0); break;
      }
      case "blur-image":
      case "adjust-image": {
        if (!("filter" in context)) throw new Error("Your browser does not support image filters. Try a current Chrome, Firefox or Edge.");
        context.filter = slug === "blur-image"
          ? `blur(${numeric(options, "radius", 5, 0, 25)}px)`
          : `brightness(${numeric(options, "brightness", 100, 0, 300)}%) contrast(${numeric(options, "contrast", 100, 0, 300)}%) saturate(${numeric(options, "saturation", 100, 0, 300)}%)`;
        context.drawImage(image, 0, 0); break;
      }
      case "resize-image": case "crop-image": case "convert-image": case "compress-image":
      case "grayscale-image": case "invert-image": case "watermark-image": case "strip-image-metadata":
        context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height); break;
      default: throw new Error("This image tool is not implemented.");
    }
    context.restore();
    if (slug === "grayscale-image" || slug === "invert-image") {
      const pixels = context.getImageData(0, 0, width, height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        if (slug === "grayscale-image") {
          const gray = Math.round(pixels.data[index]! * 0.2126 + pixels.data[index + 1]! * 0.7152 + pixels.data[index + 2]! * 0.0722);
          pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = gray;
        } else {
          pixels.data[index] = 255 - pixels.data[index]!;
          pixels.data[index + 1] = 255 - pixels.data[index + 1]!;
          pixels.data[index + 2] = 255 - pixels.data[index + 2]!;
        }
      }
      context.putImageData(pixels, 0, 0);
    }
    if (slug === "watermark-image") {
      const text = (options.text ?? "KTAS Tools").trim();
      if (!text || text.length > 140) throw new Error("Enter a watermark between 1 and 140 characters.");
      const size = numeric(options, "fontSize", 32, 8, 400);
      const opacity = numeric(options, "opacity", 0.5, 0.05, 1, false);
      const position = options.position ?? "center";
      if (!["center", "top-left", "top-right", "bottom-left", "bottom-right"].includes(position)) throw new Error("Choose a valid watermark position.");
      const pad = Math.min(24, Math.max(2, width / 20), Math.max(2, height / 20));
      context.font = `bold ${Math.max(1, Math.min(size, height - pad * 2))}px sans-serif`;
      context.globalAlpha = opacity; context.fillStyle = "#ffffff";
      context.strokeStyle = "#143b3e"; context.lineWidth = Math.max(1, size / 16);
      context.textAlign = position === "center" ? "center" : position.endsWith("right") ? "right" : "left";
      context.textBaseline = position === "center" ? "middle" : position.startsWith("top") ? "top" : "bottom";
      const x = position === "center" ? width / 2 : position.endsWith("right") ? width - pad : pad;
      const y = position === "center" ? height / 2 : position.startsWith("top") ? pad : height - pad;
      context.strokeText(text, x, y, Math.max(1, width - pad * 2));
      context.fillText(text, x, y, Math.max(1, width - pad * 2));
    }
    const mime = format === "jpg" ? "image/jpeg" : `image/${format}`;
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The image could not be encoded at these dimensions.")), mime, quality));
    if (blob.type !== mime) throw new Error(`Your browser cannot encode ${format.toUpperCase()}. Choose PNG or JPG instead.`);
    return { blob, width, height, originalBytes: file.size, outputBytes: blob.size, extension: format };
  } finally {
    // Free the large backing buffer promptly rather than waiting for garbage collection.
    canvas.width = 0; canvas.height = 0;
  }
}