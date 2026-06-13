import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import GrainientBackground from "./components/GrainientBackground";
import travels from "./data/travels.json";

const CHINA_GEOJSON_URL = `${import.meta.env.BASE_URL}china.geojson`;
const UPLOAD_STORAGE_KEY = "travel-map-local-uploads";
const PROVINCE_META = {
  湖北省: {
    code: "420000",
    color: "#f7b267",
  },
  安徽省: {
    code: "340000",
    color: "#79c7c5",
  },
  山东省: {
    code: "370000",
    color: "#8fb8ed",
  },
};

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

function buildCitySeries(items, provinceName) {
  const filteredItems = provinceName
    ? items.filter((item) => item.province === provinceName)
    : items;

  return filteredItems.map((item) => ({
    name: item.city,
    value: [...item.coords, item.photos.length || 1],
    tripId: item.id,
  }));
}

function buildProvinceRegions(geoJson, items) {
  const visitedProvinces = new Set(items.map((item) => item.province));

  return (geoJson.features || []).map((feature) => {
    const provinceName = feature.properties?.name;
    const provinceMeta = PROVINCE_META[provinceName];
    const isVisited = visitedProvinces.has(provinceName);

    return {
      name: provinceName,
      itemStyle: {
        areaColor: isVisited ? provinceMeta?.color || "#f6c177" : "#dedbd3",
        borderColor: isVisited ? "#fff8ec" : "#c8c4bd",
        borderWidth: isVisited ? 1.4 : 0.8,
        shadowBlur: isVisited ? 18 : 0,
        shadowColor: isVisited ? `${provinceMeta?.color || "#f6c177"}99` : "transparent",
      },
      emphasis: {
        itemStyle: {
          areaColor: isVisited ? provinceMeta?.color || "#f6c177" : "#cfcac1",
          borderColor: "#fffaf1",
          shadowBlur: isVisited ? 26 : 4,
          shadowColor: isVisited ? `${provinceMeta?.color || "#f6c177"}bb` : "rgba(0,0,0,0.08)",
        },
        label: {
          color: isVisited ? "#4f3d2d" : "#837b70",
        },
      },
    };
  });
}

function buildProvinceCityRegions(geoJson) {
  return (geoJson.features || []).map((feature, index) => ({
    name: feature.properties?.name,
    itemStyle: {
      areaColor: index % 2 === 0 ? "#eef0e8" : "#e7ebe2",
      borderColor: "#d0c8b8",
    },
    emphasis: {
      itemStyle: {
        areaColor: "#f8dfbc",
      },
      label: {
        color: "#594331",
      },
    },
  }));
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

function fileToPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        src: reader.result,
        caption: file.name.replace(/\.[^.]+$/, ""),
        takenAt: "本地上传",
      });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function findLatestTripInProvince(provinceName) {
  return sortedTravels.find((item) => item.province === provinceName);
}

function getTripPhotos(trip, uploadedPhotosByCity) {
  if (!trip) return [];
  return [...trip.photos, ...(uploadedPhotosByCity[trip.city] || [])];
}

function buildMapSubtitle(mapMode, selectedProvinceName) {
  if (mapMode === "province") return `${selectedProvinceName} 城市足迹`;
  return "双击已点亮省份，进入省内足迹";
}

function buildPhotoAlt(photo, city) {
  return `${city} - ${photo.caption}`;
}

function buildProvinceMapUrl(provinceName) {
  const provinceMeta = PROVINCE_META[provinceName];
  if (!provinceMeta) return null;
  return `${import.meta.env.BASE_URL}maps/${provinceMeta.code}_full.json`;
}

function normalizeCityName(cityName) {
  return cityName.replace(/市$/, "");
}

function App() {
  const chartRef = useRef(null);
  const [selectedTripId, setSelectedTripId] = useState(sortedTravels[0]?.id ?? null);
  const [mapStatus, setMapStatus] = useState("loading");
  const [shareState, setShareState] = useState("idle");
  const [mapMode, setMapMode] = useState("country");
  const [selectedProvinceName, setSelectedProvinceName] = useState(null);
  const [uploadedPhotosByCity, setUploadedPhotosByCity] = useState(readStoredUploads);
  const [selectedUploadCity, setSelectedUploadCity] = useState(sortedTravels[0]?.city ?? "");
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const selectedTrip =
    sortedTravels.find((item) => item.id === selectedTripId) ?? sortedTravels[0] ?? null;
  const selectedTripPhotos = useMemo(
    () => getTripPhotos(selectedTrip, uploadedPhotosByCity),
    [selectedTrip, uploadedPhotosByCity],
  );
  const stats = collectStats(sortedTravels);

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

  function returnToCountryMap() {
    setMapMode("country");
    setSelectedProvinceName(null);
  }

  async function handlePhotoUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!selectedUploadCity || files.length === 0) return;

    const uploadedPhotos = await Promise.all(files.map(fileToPhoto));
    setUploadedPhotosByCity((currentUploads) => {
      const nextUploads = {
        ...currentUploads,
        [selectedUploadCity]: [
          ...(currentUploads[selectedUploadCity] || []),
          ...uploadedPhotos,
        ],
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
        const mapUrl =
          mapMode === "country" ? CHINA_GEOJSON_URL : buildProvinceMapUrl(selectedProvinceName);
        if (!mapUrl) throw new Error("Missing province map");

        const response = await fetch(mapUrl);
        const geoJson = await response.json();
        if (disposed) return;

        const mapName =
          mapMode === "country" ? "china-travel" : `province-${selectedProvinceName}`;
        const provinceTrips = selectedProvinceName
          ? sortedTravels.filter((item) => item.province === selectedProvinceName)
          : [];

        echarts.registerMap(mapName, geoJson);

        chart.setOption({
          backgroundColor: "transparent",
          tooltip: {
            trigger: "item",
            formatter: (params) => {
              const trip = sortedTravels.find((item) => item.id === params.data?.tripId);
              if (trip) return `${trip.city}<br/>${formatDateRange(trip.startDate, trip.endDate)}`;

              if (mapMode === "country") {
                const count = sortedTravels.filter((item) => item.province === params.name).length;
                return count > 0 ? `${params.name}<br/>${count} 座城市` : params.name;
              }

              return params.name;
            },
          },
          geo: {
            map: mapName,
            roam: false,
            zoom: mapMode === "country" ? 1.05 : 1.1,
            layoutCenter: ["50%", "52%"],
            layoutSize: mapMode === "country" ? "92%" : "88%",
            regions:
              mapMode === "country"
                ? buildProvinceRegions(geoJson, sortedTravels)
                : buildProvinceCityRegions(geoJson),
            itemStyle: {
              areaColor: "#dedbd3",
              borderColor: "#c8c4bd",
              borderWidth: 0.8,
            },
            emphasis: {
              itemStyle: {
                areaColor: mapMode === "country" ? "#cfcac1" : "#f8dfbc",
              },
              label: {
                color: "#5f4a33",
              },
            },
          },
          series: [
            ...(mapMode === "province"
              ? [
                  {
                    type: "effectScatter",
                    coordinateSystem: "geo",
                    data: buildCitySeries(provinceTrips, selectedProvinceName),
                    symbolSize: (value) => Math.max(12, Math.min(22, value[2] * 4)),
                    showEffectOn: "render",
                    rippleEffect: {
                      scale: 3.6,
                      brushType: "stroke",
                    },
                    itemStyle: {
                      color: "#f07f6e",
                      shadowBlur: 12,
                      shadowColor: "rgba(240, 127, 110, 0.5)",
                    },
                    label: {
                      show: true,
                      formatter: (params) => normalizeCityName(params.name),
                      position: "right",
                      color: "#5d4032",
                      fontWeight: 600,
                    },
                  },
                ]
              : []),
          ],
        });

        setMapStatus("ready");
      } catch (error) {
        if (disposed) return;
        setMapStatus("error");
      }
    }

    loadMap();

    chart.on("dblclick", (params) => {
      if (mapMode !== "country") return;
      if (!PROVINCE_META[params.name]) return;

      const latestTrip = findLatestTripInProvince(params.name);
      setSelectedProvinceName(params.name);
      setMapMode("province");
      if (latestTrip) {
        setSelectedTripId(latestTrip.id);
        setSelectedUploadCity(latestTrip.city);
      }
    });

    chart.on("click", (params) => {
      if (mapMode === "province" && params.data?.tripId) {
        const nextTrip = sortedTravels.find((item) => item.id === params.data.tripId);
        setSelectedTripId(params.data.tripId);
        if (nextTrip) setSelectedUploadCity(nextTrip.city);
      }
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [mapMode, selectedProvinceName]);

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
            <span>{sortedTravels.length} 段回忆</span>
          </div>
          <div className="timeline-list">
            {sortedTravels.map((item) => (
              <button
                key={item.id}
                className={`timeline-item ${selectedTrip?.id === item.id ? "is-active" : ""}`}
                onClick={() => {
                  setSelectedTripId(item.id);
                  setSelectedUploadCity(item.city);
                  if (mapMode === "province") setSelectedProvinceName(item.province);
                }}
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
              <h2>
                {mapMode === "province"
                  ? `${selectedProvinceName} 城市地图`
                  : "已去过的省份会被点亮"}
              </h2>
              <p className="map-subtitle">{buildMapSubtitle(mapMode, selectedProvinceName)}</p>
            </div>
            <div className="hero-actions">
              <div className="legend">
                <span className="legend-dot" />
                <span>{mapMode === "province" ? "城市足迹" : "已解锁省份"}</span>
              </div>
              {mapMode === "province" && (
                <button className="share-button" onClick={returnToCountryMap} type="button">
                  返回中国地图
                </button>
              )}
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

              <label className="upload-label" htmlFor="city-upload-select">
                选择城市
              </label>
              <select
                id="city-upload-select"
                className="upload-select"
                value={selectedUploadCity}
                onChange={(event) => setSelectedUploadCity(event.target.value)}
              >
                {sortedTravels.map((item) => (
                  <option key={item.id} value={item.city}>
                    {item.city}
                  </option>
                ))}
              </select>

              <label className="upload-button">
                上传照片
                <input accept="image/*" multiple onChange={handlePhotoUpload} type="file" />
              </label>

              <p className="upload-note">
                上传后会立刻出现在对应城市的胶卷里，并保存在当前浏览器。
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
              <span>{lightboxPhoto.city} · {lightboxPhoto.takenAt || "待补充"}</span>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

export default App;
