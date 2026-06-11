import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import travels from "./data/travels.json";

const CHINA_GEOJSON_URL = `${import.meta.env.BASE_URL}china.geojson`;

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
  if (/^https?:\/\//.test(assetPath)) return assetPath;
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

function buildMapSeries(items) {
  return items.map((item) => ({
    name: item.city,
    value: [...item.coords, item.photos.length || 1],
    tripId: item.id,
  }));
}

function buildWatercolorRegions(geoJson) {
  const palette = ["#f7dfb6", "#f6c9c1", "#cfe8d8", "#c8e3ee", "#e6d4f3", "#f8e7b2"];

  return (geoJson.features || []).map((feature, index) => ({
    name: feature.properties?.name,
    itemStyle: {
      areaColor: palette[index % palette.length],
      borderColor: "#d8bf86",
    },
  }));
}

function App() {
  const chartRef = useRef(null);
  const [selectedTripId, setSelectedTripId] = useState(sortedTravels[0]?.id ?? null);
  const [mapStatus, setMapStatus] = useState("loading");
  const [shareState, setShareState] = useState("idle");
  const selectedTrip =
    sortedTravels.find((item) => item.id === selectedTripId) ?? sortedTravels[0] ?? null;
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

  useEffect(() => {
    if (!chartRef.current) return undefined;

    const chart = echarts.init(chartRef.current);
    let disposed = false;

    async function loadMap() {
      try {
        const response = await fetch(CHINA_GEOJSON_URL);
        const geoJson = await response.json();
        if (disposed) return;

        echarts.registerMap("china-travel", geoJson);
        const scatterData = buildMapSeries(sortedTravels);
        const watercolorRegions = buildWatercolorRegions(geoJson);

        chart.setOption({
          backgroundColor: "transparent",
          tooltip: {
            trigger: "item",
            formatter: (params) => {
              const trip = sortedTravels.find((item) => item.id === params.data?.tripId);
              if (!trip) return params.name;
              return `${trip.city}<br/>${formatDateRange(trip.startDate, trip.endDate)}`;
            },
          },
          geo: {
            map: "china-travel",
            roam: true,
            zoom: 1.08,
            regions: watercolorRegions,
            itemStyle: {
              areaColor: "#f9e6b8",
              borderColor: "#d8bf86",
              shadowColor: "rgba(244, 162, 97, 0.15)",
              shadowBlur: 8,
            },
            emphasis: {
              itemStyle: {
                areaColor: "#f7c9a6",
              },
              label: {
                color: "#5f4a33",
              },
            },
          },
          series: [
            {
              type: "effectScatter",
              coordinateSystem: "geo",
              data: scatterData,
              symbolSize: (value) => Math.max(12, Math.min(22, value[2] * 3)),
              showEffectOn: "render",
              rippleEffect: {
                scale: 4,
                brushType: "stroke",
              },
              itemStyle: {
                color: "#f07f6e",
                shadowBlur: 10,
                shadowColor: "rgba(240, 127, 110, 0.45)",
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
  }, []);

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
          <div className="section-head">
            <div>
              <p className="eyebrow">China Journey</p>
              <h2>点开一座城市，看那次旅行的照片</h2>
            </div>
            <div className="hero-actions">
              <div className="legend">
                <span className="legend-dot" />
                <span>已解锁城市</span>
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
                <span>照片 {selectedTrip.photos.length}</span>
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

              <div className="photo-grid">
                {selectedTrip.photos.map((photo) => (
                  <figure key={photo.src} className="photo-card">
                    <img src={resolveAssetPath(photo.src)} alt={photo.caption} />
                    <figcaption>
                      <strong>{photo.caption}</strong>
                      <span>{photo.takenAt || "待补充"}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </article>

            <article className="memory-card">
              <div className="section-head">
                <h2>美食板块</h2>
                <span>即将更新</span>
              </div>

              <div className="coming-soon">
                <p>开发中。。。</p>
                <span>后面这里会放城市限定菜单、好吃的店，还有每次旅行最想再去一次的那一口。</span>
              </div>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
