import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const reviewPath = path.join(rootDir, "imports", "review.json");
const travelsPath = path.join(rootDir, "src", "data", "travels.json");

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

function groupByTrip(reviewItems) {
  const groups = new Map();

  for (const item of reviewItems.filter((entry) => entry.confirmed)) {
    const dateKey = item.takenAt ? item.takenAt.slice(0, 10) : "unknown-date";
    const key = `${item.city}-${dateKey}`;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  return groups;
}

async function main() {
  const review = await readJson(reviewPath);
  const travels = await readJson(travelsPath);
  const grouped = groupByTrip(review.items || []);

  for (const [groupKey, items] of grouped.entries()) {
    const first = items[0];
    const existing = travels.find((trip) => trip.id === slugify(groupKey));

    const photos = items.map((item) => ({
      src: item.photoSrc,
      caption: item.note || item.fileName,
      takenAt: item.takenAt || "",
    }));

    if (existing) {
      existing.photos.push(...photos);
      continue;
    }

    travels.push({
      id: slugify(groupKey),
      city: first.city,
      province: first.province || "待确认",
      startDate: first.takenAt?.slice(0, 10) || "",
      endDate: first.takenAt?.slice(0, 10) || "",
      coords: first.coords || [0, 0],
      note: first.note || "待补充这次旅行的小故事。",
      tags: ["待补充"],
      photos,
    });
  }

  await fs.writeFile(travelsPath, `${JSON.stringify(travels, null, 2)}\n`, "utf8");
  console.log("Merged confirmed review items into src/data/travels.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

