import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
export async function fingerprint(bytes) {
  const pixels = await sharp(bytes, {
    limitInputPixels: 40000000,
    failOn: "warning",
  })
    .rotate()
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  let hash = 0n;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      hash =
        (hash << 1n) |
        BigInt(pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1 : 0);
  return hash.toString(16).padStart(16, "0");
}
export async function optimize(bytes) {
  const image = sharp(bytes, {
    limitInputPixels: 40000000,
    failOn: "warning",
    animated: false,
  });
  const m = await image.metadata();
  if (!["jpeg", "png", "webp", "tiff"].includes(m.format) || (m.pages ?? 1) > 1)
    throw new Error("Unsupported or animated image");
  if (
    Math.max(m.width, m.height) < 1000 ||
    Math.min(m.width, m.height) < 600 ||
    m.width / m.height < 0.55 ||
    m.width / m.height > 2.3
  )
    throw new Error("Image dimensions or aspect ratio fail quality policy");
  const stats = await image.stats();
  if (stats.channels.every((c) => c.stdev < 8))
    throw new Error("Nearly blank image");
  const { data, info } = await image
    .rotate()
    .resize({
      width: 1600,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 83, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  // Full decode has succeeded before this record can reach review.
  const digest = createHash("sha256").update(data).digest("hex");
  const hash = await fingerprint(data);
  const directory = ".photo-library/assets";
  await mkdir(directory, { recursive: true });
  const derivatives = {
    main: `${digest}.webp`,
    mobile: `${digest}-800.webp`,
    thumb: `${digest}-320.webp`,
  };
  await writeFile(`${directory}/${derivatives.main}`, data);
  for (const [name, width] of [
    ["mobile", 800],
    ["thumb", 320],
  ])
    await sharp(data)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: name === "thumb" ? 76 : 81 })
      .toFile(`${directory}/${derivatives[name]}`);
  return {
    sha256: digest,
    originalSha256: createHash("sha256").update(bytes).digest("hex"),
    perceptualHash: hash,
    width: info.width,
    height: info.height,
    sourceWidth: m.width,
    sourceHeight: m.height,
    bytes: data.length,
    derivatives,
    modifications:
      "Resized without cropping; converted to WebP. Original license retained.",
  };
}
