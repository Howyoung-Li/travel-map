import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import exifr from "exifr";
import GrainientBackground from "./components/GrainientBackground";
import cityOptions from "./data/cityOptions.json";
import travels from "./data/travels.json";

const CHINA_GEOJSON_URL = `${import.meta.env.BASE_URL}china-cities.geojson`;
const UPLOAD_STORAGE_KEY = "travel-map-local-uploads";
const PROVINCE_OPTIONS = cityOptions;

const sortedTravels = [...travels].sort((left, right) =>
  `${right.startDate || ""}${right.endDate || ""}`.localeCompare(
    `${left.startDate || ""}${left.endDate || ""}`,
  ),
);

function formatDateRange(startDate, endDate) {
  if (!startDate) return "待补充";
  if (!endDate || endDate === startDate) return startDate;
  return `${startDate} - ${endDate}`;
}

function formatDisplayDate(dateText) {
  if (!dateText) return "待补充";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return dateText;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function toDateTimeText(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function resolveAssetPath(assetPath) {
  if (!assetPath) return assetPath;
  if (/^(https?:|data:|blob:)/.test(assetPath)) return assetPath;
  return `${import.meta.env.BASE_URL}${assetPath.replace(/^\/+/, "")}`;
}

function collectStats(items) {
  const citySet = new Set(items.map((item) => item.city));
  const provinceSet = new Set(items.map((item) => item.province));
  const totalPhotos = items.reduce((sum, item) => sum + item.photos.length, 0);

  return {
    cities: citySet.size,
    provinces: provinceSet.size,
    totalTrips: items.length,
    totalPhotos,
  };
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbToHex([red, green, blue]) {
  return `#${[red, green, blue]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixColor(color, ratio) {
  const from = hexToRgb(color);
  const to = [255, 244, 219];
  return rgbToHex(from.map((value, index) => value * (1 - ratio) + to[index] * ratio));
}

function getProvinceColor(province, index = 0) {
  const baseColor = PROVINCE_OPTIONS[province]?.color || "#ee8f76";
  return mixColor(baseColor, Math.min(index * 0.18, 0.42));
}

function buildCityRegions(geoJson, items) {
  const visitedCityIndex = new Map();
  const tripsByCity = new Map(items.map((item) => [item.city, item]));

  return (geoJson.features || []).map((feature) => ({
    name: feature.properties?.name,
    itemStyle: (() => {
      const cityName = feature.properties?.name;
      const provinceName = feature.properties?.province;
      const trip = tripsByCity.get(cityName);
      if (!trip) {
        return {
          areaColor: "#dbd8d1",
          borderColor: "#c4bfb6",
          borderWidth: 0.55,
        };
      }

      const index = visitedCityIndex.get(provinceName) || 0;
      visitedCityIndex.set(provinceName, index + 1);
      const color = getProvinceColor(provinceName, index);
      return {
        areaColor: color,
        borderColor: "#fff8ec",
        borderWidth: 1,
        shadowBlur: 16,
        shadowColor: `${color}88`,
      };
    })(),
    emphasis: {
      itemStyle: {
        areaColor: tripsByCity.has(feature.properties?.name) ? "#fff0c9" : "#cec9c0",
      },
    },
  }));
}

function buildCitySeries(items) {
  const provinceCityIndex = new Map();

  return items.map((item) => {
    const index = provinceCityIndex.get(item.province) || 0;
    provinceCityIndex.set(item.province, index + 1);
    const color = getProvinceColor(item.province, index);

    return {
      name: item.city,
      value: [...item.coords, item.photos.length || 1],
      tripId: item.id,
      itemStyle: {
        color,
        shadowBlur: 16,
        shadowColor: `${color}99`,
      },
    };
  });
}

function readStoredUploads() {
  try {
    return JSON.parse(window.localStorage.getItem(UPLOAD_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function storeUploads(nextUploads) {
  try {
    window.localStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(nextUploads));
  } catch {
    return undefined;
  }
  return undefined;
}

async function readPhotoTakenAt(file) {
  const metadata = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]).catch(() => null);
  const exifDate = metadata?.DateTimeOriginal || metadata?.CreateDate;
  if (exifDate instanceof Date) return toDateTimeText(exifDate);
  if (file.lastModified) return toDateTimeText(new Date(file.lastModified));
  return "本地上传";
}

function fileToPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () =>
      resolve({
        src: reader.result,
        caption: file.name.replace(/\.[^.]+$/, ""),
        takenAt: await readPhotoTakenAt(file),
      });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getTripPhotos(trip, uploadedPhotosByCity) {
  if (!trip) return [];
  const payload = uploadedPhotosByCity[trip.city];
  const uploadedPhotos = Array.isArray(payload) ? payload : payload?.photos || [];
  return [...trip.photos, ...uploadedPhotos];
}

function getCityOption(province, city) {
  return PROVINCE_OPTIONS[province]?.cities.find((item) => item.name === city);
}

function createUploadTrip({ province, city, photos }) {
  const cityOption = getCityOption(province, city);
  const firstDate = photos[0]?.takenAt?.slice(0, 10) || "";

  return {
    id: `local-${province}-${city}`,
    city,
    province,
    startDate: firstDate,
    endDate: firstDate,
    coords: cityOption?.coords || [0, 0],
    note: "这是一段本地上传的新照片记录，正式发布时可以再补上旅行故事。",
    tags: ["本地上传"],
    photos,
  };
}

function mergeUploadedTrips(baseTrips, uploadedPhotosByCity) {
  const tripsByCity = new Map(baseTrips.map((trip) => [trip.city, { ...trip }]));

  for (const [city, payload] of Object.entries(uploadedPhotosByCity)) {
    const photos = Array.isArray(payload) ? payload : payload.photos || [];
    const province = Array.isArray(payload) ? null : payload.province;
    if (photos.length === 0) continue;

    const existingTrip = tripsByCity.get(city);
    if (existingTrip) {
      tripsByCity.set(city, {
        ...existingTrip,
        photos: [...existingTrip.photos, ...photos],
      });
      continue;
    }

    if (!province) continue;
    tripsByCity.set(city, createUploadTrip({ province, city, photos }));
  }

  return [...tripsByCity.values()].sort((left, right) =>
    `${right.startDate || ""}${right.endDate || ""}`.localeCompare(
      `${left.startDate || ""}${left.endDate || ""}`,
    ),
  );
}

function buildMapSubtitle() {
  return "全国城市级地图，去过的城市会按省份同色系渐变点亮";
}

function buildPhotoAlt(photo, city) {
  return `${city} - ${photo.caption}`;
}

function normalizeCityName(cityName) {
  return cityName.replace(/市$/, "");
}

function App() {
  const chartRef = useRef(null);
  const provinceNames = Object.keys(PROVINCE_OPTIONS);
  const [uploadedPhotosByCity, setUploadedPhotosByCity] = useState(readStoredUploads);
  const allTrips = useMemo(
    () => mergeUploadedTrips(sortedTravels, uploadedPhotosByCity),
    [uploadedPhotosByCity],
  );
  const [selectedTripId, setSelectedTripId] = useState(allTrips[0]?.id ?? null);
  const [mapStatus, setMapStatus] = useState("loading");
  const [shareState, setShareState] = useState("idle");
  const [selectedUploadProvince, setSelectedUploadProvince] = useState(provinceNames[0] ?? "");
  const [selectedUploadCity, setSelectedUploadCity] = useState(
    PROVINCE_OPTIONS[provinceNames[0]]?.cities[0]?.name ?? "",
  );
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const selectedTrip = allTrips.find((item) => item.id === selectedTripId) ?? allTrips[0] ?? null;
  const selectedTripPhotos = selectedTrip?.photos || [];
  const selectedProvinceCities = PROVINCE_OPTIONS[selectedUploadProvince]?.cities || [];
  const stats = collectStats(allTrips);

  useEffect(() => {
    if (!selectedTripId && allTrips[0]) setSelectedTripId(allTrips[0].id);
  }, [allTrips, selectedTripId]);

  useEffect(() => {
    const firstCity = PROVINCE_OPTIONS[selectedUploadProvince]?.cities[0]?.name;
    if (firstCity) setSelectedUploadCity(firstCity);
  }, [selectedUploadProvince]);

  async function handleShare() {
    const shareUrl = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "For Us",
          text: "我们的旅行地图",
          url: shareUrl,
        });
        setShareState("shared");
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareState("copied");
      }
    } catch (error) {
      setShareState("error");
    } finally {
      window.setTimeout(() => setShareState("idle"), 2200);
    }
  }

  async function handlePhotoUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!selectedUploadProvince || !selectedUploadCity || files.length === 0) return;

    const uploadedPhotos = await Promise.all(files.map(fileToPhoto));
    setUploadedPhotosByCity((currentUploads) => {
      const currentPayload = currentUploads[selectedUploadCity] || {
        province: selectedUploadProvince,
        photos: [],
      };
      const currentPhotos = Array.isArray(currentPayload)
        ? currentPayload
        : currentPayload.photos || [];
      const nextUploads = {
        ...currentUploads,
        [selectedUploadCity]: {
          province: selectedUploadProvince,
          photos: [...currentPhotos, ...uploadedPhotos],
        },
      };
      storeUploads(nextUploads);
      return nextUploads;
    });
    event.target.value = "";
  }

  useEffect(() => {
    const closeLightbox = (event) => {
      if (event.key === "Escape") setLightboxPhoto(null);
    };

    window.addEventListener("keydown", closeLightbox);
    return () => window.removeEventListener("keydown", closeLightbox);
  }, []);

  useEffect(() => {
    if (!chartRef.current) return undefined;

    const chart = echarts.init(chartRef.current);
    let disposed = false;

    async function loadMap() {
      try {
        setMapStatus("loading");
        const response = await fetch(CHINA_GEOJSON_URL);
        const geoJson = await response.json();
        if (disposed) return;

        echarts.registerMap("china-travel", geoJson);
        chart.setOption({
          backgroundColor: "transparent",
          tooltip: {
            trigger: "item",
            formatter: (params) => {
              const trip = allTrips.find((item) => item.id === params.data?.tripId);
              if (!trip) return params.name;
              return `${trip.city}<br/>${trip.province}<br/>${formatDateRange(
                trip.startDate,
                trip.endDate,
              )}`;
            },
          },
          geo: {
            map: "china-travel",
            roam: true,
            zoom: 1.05,
            scaleLimit: {
              min: 1.05,
              max: 4,
            },
            layoutCenter: ["50%", "52%"],
            layoutSize: "92%",
            regions: buildCityRegions(geoJson, allTrips),
            itemStyle: {
              areaColor: "#dbd8d1",
              borderColor: "#c4bfb6",
              borderWidth: 0.8,
            },
            emphasis: {
              itemStyle: {
                areaColor: "#cec9c0",
              },
              label: {
                color: "#665b51",
              },
            },
          },
          series: [
            {
              type: "effectScatter",
              coordinateSystem: "geo",
              data: buildCitySeries(allTrips),
              symbolSize: (value) => Math.max(13, Math.min(24, value[2] * 4)),
              showEffectOn: "render",
              rippleEffect: {
                scale: 3.4,
                brushType: "stroke",
              },
              label: {
                show: true,
                formatter: (params) => normalizeCityName(params.name),
                position: "right",
                color: "#5d4032",
                fontWeight: 700,
              },
            },
          ],
        });

        setMapStatus("ready");
      } catch (error) {
        if (disposed) return;
        setMapStatus("error");
      }
    }

    loadMap();

    chart.on("click", (params) => {
      if (params.data?.tripId) {
        setSelectedTripId(params.data.tripId);
      }
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [allTrips]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">For Us</p>
          <h1>我们的旅行地图</h1>
          <p className="sidebar-copy">
            把一起走过的城市、照片和时间，都留在这一张地图里。
          </p>
        </div>

        <div className="stat-grid">
          <article>
            <strong>{stats.cities}</strong>
            <span>去过城市</span>
          </article>
          <article>
            <strong>{stats.provinces}</strong>
            <span>覆盖省份</span>
          </article>
          <article>
            <strong>{stats.totalTrips}</strong>
            <span>旅行记录</span>
          </article>
          <article>
            <strong>{stats.totalPhotos}</strong>
            <span>照片数量</span>
          </article>
        </div>

        <section className="timeline">
          <div className="section-head">
            <h2>足迹时间线</h2>
            <span>{allTrips.length} 段回忆</span>
          </div>
          <div className="timeline-list">
            {allTrips.map((item) => (
              <button
                key={item.id}
                className={`timeline-item ${selectedTrip?.id === item.id ? "is-active" : ""}`}
                onClick={() => setSelectedTripId(item.id)}
                type="button"
              >
                <span>{item.city}</span>
                <small>{formatDisplayDate(item.startDate)}</small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="main-panel">
        <section className="hero-map">
          <GrainientBackground />
          <div className="hero-map-overlay" />
          <div className="section-head">
            <div>
              <p className="eyebrow">China Journey</p>
              <h2>点亮去过的城市</h2>
              <p className="map-subtitle">{buildMapSubtitle()}</p>
            </div>
            <div className="hero-actions">
              <div className="legend">
                <span className="legend-dot" />
                <span>城市足迹</span>
              </div>
              <button className="share-button" onClick={handleShare} type="button">
                {shareState === "copied"
                  ? "链接已复制"
                  : shareState === "shared"
                    ? "已分享"
                    : shareState === "error"
                      ? "分享失败"
                      : "分享链接"}
              </button>
            </div>
          </div>
          <div ref={chartRef} className="map-canvas" />
          {mapStatus === "loading" && <p className="map-hint">正在加载地图轮廓...</p>}
          {mapStatus === "error" && (
            <p className="map-hint">
              地图轮廓加载失败，稍后刷新页面或改成本地 GeoJSON 文件。
            </p>
          )}
        </section>

        {selectedTrip && (
          <section className="detail-grid">
            <article className="trip-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">{selectedTrip.province}</p>
                  <h2>{selectedTrip.city}</h2>
                </div>
                <span>{formatDateRange(selectedTrip.startDate, selectedTrip.endDate)}</span>
              </div>

              <p className="trip-note">{selectedTrip.note}</p>

              <div className="meta-row">
                <span>照片 {selectedTripPhotos.length}</span>
                <span>
                  时间 {formatDisplayDate(selectedTrip.startDate)}
                  {selectedTrip.endDate && selectedTrip.endDate !== selectedTrip.startDate
                    ? ` 至 ${formatDisplayDate(selectedTrip.endDate)}`
                    : ""}
                </span>
              </div>

              <div className="tag-row">
                {selectedTrip.tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="film-strip" aria-label={`${selectedTrip.city} 照片胶卷`}>
                {selectedTripPhotos.map((photo) => (
                  <figure
                    key={`${selectedTrip.id}-${photo.src}`}
                    className="film-frame"
                    onDoubleClick={() => setLightboxPhoto({ ...photo, city: selectedTrip.city })}
                  >
                    <img
                      src={resolveAssetPath(photo.src)}
                      alt={buildPhotoAlt(photo, selectedTrip.city)}
                    />
                    <figcaption>
                      <strong>{photo.caption}</strong>
                      <span>{photo.takenAt || "待补充"}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </article>

            <article className="upload-card">
              <div className="section-head">
                <h2>添加照片</h2>
                <span>本地预览</span>
              </div>

              <label className="upload-label" htmlFor="province-upload-select">
                选择省份
              </label>
              <select
                id="province-upload-select"
                className="upload-select"
                value={selectedUploadProvince}
                onChange={(event) => setSelectedUploadProvince(event.target.value)}
              >
                {provinceNames.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>

              <label className="upload-label" htmlFor="city-upload-select">
                选择城市
              </label>
              <select
                id="city-upload-select"
                className="upload-select"
                value={selectedUploadCity}
                onChange={(event) => setSelectedUploadCity(event.target.value)}
              >
                {selectedProvinceCities.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>

              <label className="upload-button" htmlFor="photo-upload-input">
                上传照片
              </label>
              <input
                accept="image/*"
                className="upload-file-input"
                id="photo-upload-input"
                multiple
                onChange={handlePhotoUpload}
                type="file"
              />

              <p className="upload-note">
                上传后会读取照片拍摄时间，并在当前浏览器里更新对应城市。
              </p>
            </article>
          </section>
        )}
      </main>
      {lightboxPhoto && (
        <div className="photo-lightbox" onClick={() => setLightboxPhoto(null)}>
          <figure className="lightbox-frame" onClick={(event) => event.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightboxPhoto(null)} type="button">
              关闭
            </button>
            <img
              src={resolveAssetPath(lightboxPhoto.src)}
              alt={buildPhotoAlt(lightboxPhoto, lightboxPhoto.city)}
            />
            <figcaption>
              <strong>{lightboxPhoto.caption}</strong>
              <span>
                {lightboxPhoto.city} · {lightboxPhoto.takenAt || "待补充"}
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

export default App;
