import { useEffect, useMemo, useRef } from "react";
import { Chart, BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import Donut from "./Donut";
import { combinedPeriodSummary, waterfallSegments, pctChange } from "../services/dashboardOverviewService";

Chart.register(BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const PERIOD_LABELS = { month: "Aylık", week: "Haftalık", raw: "Her Yükleme" };

// Minik sparkline (satır içi SVG). values: sayı dizisi.
function Spark({ values, color, width = 96, height = 26 }) {
  const nums = (values || []).filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (nums.length < 2) return <div style={{ height, width }} />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums
    .map((v, i) => {
      const x = (i / (nums.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Δ rozeti — pp (yüzde puan) ya da % değişim.
function Delta({ value, unit = "%", goodWhenNegative = true, pal }) {
  if (value == null) return <span style={{ fontSize: 12, color: pal.inkSoft }}>—</span>;
  const positive = value > 0;
  const good = goodWhenNegative ? value < 0 : value > 0;
  const color = value === 0 ? pal.inkSoft : good ? pal.ok : pal.bad;
  return (
    <span style={{ fontSize: 12.5, fontWeight: 600, color }}>
      {positive ? "▲" : value < 0 ? "▼" : "•"} {value > 0 ? "+" : ""}
      {value}
      {unit} <span style={{ color: pal.inkSoft, fontWeight: 400 }}>önceki döneme göre</span>
    </span>
  );
}

// Ana Sayfa "Genel Durum" paneli (finans dashboard'u referansına göre — bkz. konuşma):
//  - Cihaz Sağlık Şelalesi (waterfall): Toplam Cihaz → problem kategorileri → Temiz Cihaz
//  - İki gösterge halkası: Sağlıklı Cihaz Oranı % · Zimmet Uyumu %
//  - Aylık Bulgu/Çözüm trendi (bar + çizgi)
//  - KPI kartları: büyük sayı + sparkline + önceki döneme göre değişim
export default function OverviewPanel({ snapshots, period, setPeriod, live, styles, pal }) {
  const wfRef = useRef(null);
  const wfChart = useRef(null);
  const trendRef = useRef(null);
  const trendChart = useRef(null);

  const summary = useMemo(() => combinedPeriodSummary(snapshots, period), [snapshots, period]);
  const { series, latest, prev, enough } = summary;

  const wf = useMemo(
    () =>
      waterfallSegments({
        toplamCihaz: live.toplamCihaz,
        inaktif: live.inaktif,
        zimmetHatali: live.zimmetHatali,
        kritikDisk: live.kritikDisk,
        kullanilmayan: live.kullanilmayan,
      }),
    [live]
  );
  const temiz = wf[wf.length - 1].value;
  const saglikPct = live.toplamCihaz ? Math.round((temiz / live.toplamCihaz) * 100) : 0;
  const zimmetToplam = live.zimmetDogru + live.zimmetHatali;
  const zimmetUyumPct = zimmetToplam ? Math.round((live.zimmetDogru / zimmetToplam) * 100) : 0;

  // ---- Waterfall grafiği (Chart.js floating bar) ----
  useEffect(() => {
    if (!wfRef.current) return;
    if (wfChart.current) wfChart.current.destroy();
    let running = wf[0].value;
    const bars = wf.map((s, i) => {
      if (s.kind === "total") return [0, s.value];
      if (s.kind === "result") return [0, s.value];
      const bottom = Math.max(0, running - s.value);
      const range = [bottom, running];
      running = bottom;
      return range;
    });
    const colors = wf.map((s) => (s.kind === "total" ? pal.inkSoft : s.kind === "result" ? pal.ok : pal.bad));
    wfChart.current = new Chart(wfRef.current, {
      type: "bar",
      data: {
        labels: wf.map((s) => s.key),
        datasets: [{ data: bars, backgroundColor: colors, borderRadius: 4, barPercentage: 0.62 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.label}: ${wf[c.dataIndex].value.toLocaleString("tr-TR")}` } },
        },
        scales: {
          x: { ticks: { color: pal.inkSoft, font: { size: 10 }, maxRotation: 20, minRotation: 0 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: pal.inkSoft, font: { size: 10 } }, grid: { color: pal.line } },
        },
      },
    });
    return () => wfChart.current && wfChart.current.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(wf), pal]);

  // ---- Aylık trend grafiği (Yeni Tespit + Çözülen bar, Çözüm Oranı çizgi) ----
  useEffect(() => {
    if (!trendRef.current || !enough) return;
    if (trendChart.current) trendChart.current.destroy();
    const pts = series.slice(1); // ilk dönemde önceki yok → karşılaştırma boş
    trendChart.current = new Chart(trendRef.current, {
      data: {
        labels: pts.map((p) => p.label),
        datasets: [
          { type: "bar", label: "Yeni Tespit", data: pts.map((p) => p.yeni), backgroundColor: pal.bad, borderRadius: 3, yAxisID: "y" },
          { type: "bar", label: "Çözülen", data: pts.map((p) => p.cozulen), backgroundColor: pal.ok, borderRadius: 3, yAxisID: "y" },
          { type: "line", label: "Çözüm Oranı %", data: pts.map((p) => p.cozumOrani), borderColor: pal.accent, backgroundColor: pal.accent, tension: 0.35, pointRadius: 3, yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", labels: { color: pal.ink, boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: pal.inkSoft, font: { size: 10 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: pal.inkSoft, font: { size: 10 } }, grid: { color: pal.line } },
          y1: { position: "right", beginAtZero: true, max: 100, ticks: { color: pal.inkSoft, font: { size: 10 }, callback: (v) => `${v}%` }, grid: { display: false } },
        },
      },
    });
    return () => trendChart.current && trendChart.current.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(series), enough, pal]);

  const card = (label, value, { spark, sparkColor, delta, deltaUnit, deltaGoodNeg = true, valueColor } = {}) => (
    <div style={{ ...styles.kpiCard, gap: 4 }}>
      <span style={styles.kpiLabel}>{label}</span>
      <span style={{ ...styles.kpiValue, color: valueColor || pal.ink }}>{value}</span>
      {spark && spark.length >= 2 && <Spark values={spark} color={sparkColor || pal.accent} />}
      {delta !== undefined && <Delta value={delta} unit={deltaUnit} goodWhenNegative={deltaGoodNeg} pal={pal} />}
    </div>
  );

  return (
    <div style={{ ...styles.panel, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <p style={styles.settingsSectionTitle}>Genel Durum</p>
          <p style={{ ...styles.pageSub, margin: 0 }}>
            Toplam cihazdan problem kategorileri düşülünce kalan "temiz" cihaz oranı, zimmet uyumu ve dönemsel bulgu/çözüm trendi
          </p>
        </div>
        <div style={styles.segmented}>
          {Object.entries(PERIOD_LABELS).map(([id, l]) => (
            <div key={id} onClick={() => setPeriod(id)} style={{ ...styles.seg, ...(period === id ? styles.segActive : {}) }}>
              {l}
            </div>
          ))}
        </div>
      </div>

      {/* Satır A: waterfall + iki gösterge halkası */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)", gap: 16, marginTop: 16, alignItems: "center" }}>
        <div>
          <p style={{ ...styles.pageSub, margin: "0 0 6px", fontWeight: 600, color: pal.ink }}>Cihaz Sağlık Şelalesi</p>
          <div style={{ height: 220 }}>
            <canvas ref={wfRef} />
          </div>
          <p style={{ ...styles.pageSub, margin: "6px 0 0", fontSize: 11.5 }}>
            Toplam {live.toplamCihaz.toLocaleString("tr-TR")} cihaz · problem kategorileri çakışabilir, "Temiz" = toplam − kategoriler toplamı
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Donut
            size={132}
            thickness={16}
            segments={[
              { value: temiz, color: pal.ok, label: "Temiz" },
              { value: Math.max(0, live.toplamCihaz - temiz), color: pal.bad, label: "Problemli" },
            ]}
            trackColor={pal.fieldBg}
            centerLabel={`%${saglikPct}`}
          />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Sağlıklı Cihaz Oranı</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Donut
            size={132}
            thickness={16}
            segments={[
              { value: live.zimmetDogru, color: pal.ok, label: "Doğru" },
              { value: live.zimmetHatali, color: pal.bad, label: "Hatalı" },
            ]}
            trackColor={pal.fieldBg}
            centerLabel={`%${zimmetUyumPct}`}
          />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Zimmet Uyumu</span>
        </div>
      </div>

      {/* Satır B: aylık bulgu/çözüm trendi */}
      <div style={{ marginTop: 20 }}>
        <p style={{ ...styles.pageSub, margin: "0 0 6px", fontWeight: 600, color: pal.ink }}>
          {PERIOD_LABELS[period]} Bulgu / Çözüm Trendi
        </p>
        {enough ? (
          <div style={{ height: 230 }}>
            <canvas ref={trendRef} />
          </div>
        ) : (
          <p style={{ ...styles.pageSub, margin: 0 }}>
            Trend için en az 2 dönem verisi gerekli — snapshot geçmişi biriktikçe dolacak.
          </p>
        )}
      </div>

      {/* Satır C: KPI kartları */}
      <div style={{ ...styles.kpiGrid, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 18 }}>
        {card("Açık Bulgu (toplam)", latest ? latest.acikBulgu.toLocaleString("tr-TR") : "—", {
          spark: series.map((s) => s.acikBulgu),
          sparkColor: pal.bad,
          delta: latest && prev ? pctChange(latest.acikBulgu, prev.acikBulgu) : undefined,
          deltaUnit: "%",
          deltaGoodNeg: true,
        })}
        {card("Çözüm Oranı", latest && latest.cozumOrani != null ? `%${latest.cozumOrani}` : "—", {
          spark: series.map((s) => s.cozumOrani).filter((v) => v != null),
          sparkColor: pal.ok,
          delta: latest && prev && latest.cozumOrani != null && prev.cozumOrani != null ? Math.round((latest.cozumOrani - prev.cozumOrani) * 10) / 10 : undefined,
          deltaUnit: " pp",
          deltaGoodNeg: false,
        })}
        {card("Bu Dönem Çözülen", latest ? latest.cozulen : "—", {
          valueColor: pal.ok,
          delta: latest && prev ? latest.cozulen - prev.cozulen : undefined,
          deltaUnit: "",
          deltaGoodNeg: false,
        })}
        {card("Bu Dönem Yeni Tespit", latest ? latest.yeni : "—", {
          valueColor: pal.bad,
          delta: latest && prev ? latest.yeni - prev.yeni : undefined,
          deltaUnit: "",
          deltaGoodNeg: true,
        })}
        {card("Net Değişim", latest ? (latest.netDegisim > 0 ? `+${latest.netDegisim}` : latest.netDegisim) : "—", {
          valueColor: latest && latest.netDegisim > 0 ? pal.bad : pal.ok,
        })}
        {card("Zimmet Uyumu", `%${zimmetUyumPct}`, { valueColor: zimmetUyumPct >= 90 ? pal.ok : zimmetUyumPct >= 75 ? pal.warnFg : pal.bad })}
      </div>
    </div>
  );
}
