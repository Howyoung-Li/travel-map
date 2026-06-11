import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import exifr from "exifr";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const importsDir = path.join(rootDir, "imports");
const outputDir = path.join(rootDir, "public", "photos", "imported");
const reviewPath = path.join(importsDir, "review.json");
const supportedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".webp",
]);

const cityFallbacks = [
  { city: "北京", province: "北京", coords: [116.4074, 39.9042] },
  { city: "上海", province: "上海", coords: [121.4737, 31.2304] },
  { city: "广州", province: "广东", coords: [113.2644, 23.1291] },
  { city: "深圳", province: "广东", coords: [114.0579, 22.5431] },
  { city: "杭州", province: "浙江", coords: [120.1551, 30.2741] },
  { city: "南京", province: "江苏", coords: [118.7969, 32.0603] },
  { city: "苏州", province: "江苏", coords: [120.5853, 31.2989] },
  { city: "成都", province: "四川", coords: [104.0665, 30.5728] },
  { city: "重庆", province: "重庆", coords: [106.5516, 29.563] },
  { city: "西安", province: "陕西", coords: [108.9398, 34.3416] },
  { city: "厦门", province: "福建", coords: [118.0894, 24.4798] },
  { city: "长沙", province: "湖南", coords: [112.9388, 28.2282] },
  { city: "青岛", province: "山东", coords: [120.3826, 36.0671] },
  { city: "昆明", province: "云南", coords: [102.8329, 24.8801] },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      return fullPath;
    }),
  );
  return files.flat();
}

function normalizeCoordinate(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number(value.toFixed(6));
}

function toDateString(date) {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function distanceKm([lng1, lat1], [lng2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function nearestCity(coords) {
  let bestMatch = null;

  for (const city of cityFallbacks) {
    const km = distanceKm(coords, city.coords);
    if (!bestMatch || km < bestMatch.km) {
      bestMatch = { ...city, km };
    }
  }

  return bestMatch && bestMatch.km <= 80 ? bestMatch : null;
}

async function reverseGeocode(coords) {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key || key === "你的key") return null;

  const location = `${coords[0]},${coords[1]}`;
  const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
  url.searchParams.set("key", key);
  url.searchParams.set("location", location);
  url.searchParams.set("extensions", "base");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Amap request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== "1" || !payload.regeocode?.addressComponent) {
    return null;
  }

  const address = payload.regeocode.addressComponent;
  return {
    city:
      Array.isArray(address.city) && address.city.length === 0
        ? address.province
        : address.city || address.province,
    province: address.province,
    district: address.district || "",
    formattedAddress: payload.regeocode.formatted_address || "",
    source: "amap",
  };
}

async function classifyLocation(coords) {
  const amap = await reverseGeocode(coords).catch(() => null);
  if (amap) return amap;

  const fallback = nearestCity(coords);
  if (!fallback) return null;

  return {
    city: fallback.city,
    province: fallback.province,
    district: "",
    formattedAddress: "",
    source: "fallback",
  };
}

async function copyPhoto(sourcePath, cityName, timestamp) {
  const ext = path.extname(sourcePath).toLowerCase();
  const monthBucket = timestamp ? timestamp.slice(0, 7) : "unknown-date";
  const folderName = slugify(`${cityName}-${monthBucket}`);
  const targetFolder = path.join(outputDir, folderName);
  await ensureDir(targetFolder);

  const originalName = path.basename(sourcePath, ext);
  const fileName = `${slugify(originalName)}${ext}`;
  const targetPath = path.join(targetFolder, fileName);
  await fs.copyFile(sourcePath, targetPath);

  return `photos/imported/${folderName}/${fileName}`;
}

async function main() {
  await ensureDir(importsDir);
  await ensureDir(outputDir);

  const allFiles = await walk(importsDir);
  const photoFiles = allFiles.filter((file) =>
    supportedExtensions.has(path.extname(file).toLowerCase()),
  );

  const reviewItems = [];

  for (const filePath of photoFiles) {
    const metadata = await exifr.parse(filePath, { gps: true }).catch(() => null);
    const latitude = normalizeCoordinate(metadata?.latitude);
    const longitude = normalizeCoordinate(metadata?.longitude);
    const coords =
      latitude !== null && longitude !== null ? [longitude, latitude] : null;
    const takenAt = metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? null;
    const takenAtText = takenAt ? toDateString(takenAt) : null;
    const location = coords ? await classifyLocation(coords) : null;
    const cityName = location?.city || "待确认城市";
    const copiedSrc = await copyPhoto(filePath, cityName, takenAtText);

    reviewItems.push({
      fileName: path.basename(filePath),
      sourcePath: path.relative(rootDir, filePath),
      takenAt: takenAtText,
      coords,
      city: cityName,
      province: location?.province || "",
      district: location?.district || "",
      formattedAddress: location?.formattedAddress || "",
      locationSource: location?.source || "manual",
      photoSrc: copiedSrc,
      note: "",
      confirmed: false,
    });
  }

  const reviewPayload = {
    generatedAt: new Date().toISOString(),
    total: reviewItems.length,
    items: reviewItems,
  };

  await fs.writeFile(reviewPath, `${JSON.stringify(reviewPayload, null, 2)}\n`, "utf8");

  console.log(`Imported ${reviewItems.length} photo(s).`);
  console.log(`Review file written to ${path.relative(rootDir, reviewPath)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
