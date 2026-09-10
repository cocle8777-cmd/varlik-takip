import { useEffect, useMemo, useRef } from "react";
import { Chart, BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import Donut from "./Donut";
import { combinedPeriodSummary, waterfallSegments, pctChange } from "../services/dashboardOverviewService";

Chart.register(BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const PERIOD_LABELS = { month: "Aylık", week: "Haftalık", raw: "Her Yükleme" };
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("tr-TR"));

// Çubukların üstüne/içine değer yazan hafif Chart.js eklentisi (datalabels bağımlılığı yok).
function valueLabelPlugin(pal, pick) {
  return {
    id: "vlabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      chart.data.datasets.forEach((ds, di) => {
        if (ds.type === "line") return;
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((el, i) => {
          const raw = pick(di, i);
          if (raw == null || raw === 0) return;
          ctx.fillStyle = pal.inkSoft;
          const y = el.y - 4;
          ctx.fillText(fmt(raw), el.x, y < 12 ? el.y + 12 : y);
        });
      });
      ctx.restore();
    },
  };
}

function Spark({ values, color, width = 108, height = 30 }) {
  const nums = (values || []).filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (nums.length < 2) return <div style={{ height, width }} />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pts = nums
    .map((v, i) => {
      const x = (i / (nums.length - 1)) * (width - 2) + 1;
      const y = height - 3 - ((v - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = pts.split(" ").pop().split(",");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}

function Delta({ value, unit = "%", goodWhenNegative = true, pal }) {
  if (value == null) return <span style={{ fontSize: 11.5, color: pal.inkSoft }}>ilk dönem</span>;
  const good = value === 0 ? null : goodWhenNegative ? value < 0 : value > 0;
  const color = good == null ? pal.inkSoft : good ? pal.ok : pal.bad;
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "▬";
  return (
    <span style={{ fontSize: 11.5, color: pal.inkSoft }}>
      <span style={{ color, fontWeight: 700 }}>
        {arrow} {value > 0 ? "+" : ""}
        {value}
        {unit}
      </span>{" "}
      önceki döneme göre
    </span>
  );
}

// Ana Sayfa "Genel Durum" — özet KPI kartları (üstte) + Cihaz Sağlık Şelalesi + Sağlıklı Cihaz
// göstergesi + dönemsel Bulgu/Çözüm trendi. Finans dashboard referansına uyarlandı (bkz. konuşma).
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
  const zToplam = live.zimmetDogru + live.zimmetHatali;
  const zimmetUyumPct = zToplam ? Math.round((live.zimmetDogru / zToplam) * 100) : 0;
  const acikBulguLive = live.inaktif + live.zimmetHatali + live.kritikDisk + live.kullanilmayan;

  // ---- Waterfall ----
  useEffect(() => {
    if (!wfRef.current) return;
    if (wfChart.current) wfChart.current.destroy();
    let running = wf[0].value;
    const bars = wf.map((s) => {
      if (s.kind === "total" || s.kind === "result") return [0, s.value];
      const bottom = Math.max(0, running - s.value);
      const r = [bottom, running];
      running = bottom;
      return r;
    });
    const colors = wf.map((s) => (s.kind === "total" ? pal.inkSoft : s.kind === "result" ? pal.ok : pal.bad));
    wfChart.current = new Chart(wfRef.current, {
      type: "bar",
      data: { labels: wf.map((s) => s.key), datasets: [{ data: bars, backgroundColor: colors, borderRadius: 5, barPercentage: 0.6 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.label}: ${fmt(wf[c.dataIndex].value)}` } },
        },
        scales: {
          x: { ticks: { color: pal.inkSoft, font: { size: 10 }, maxRotation: 18, minRotation: 0 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: pal.inkSoft, font: { size: 10 } }, grid: { color: pal.line } },
        },
      },
      plugins: [valueLabelPlugin(pal, (_di, i) => wf[i].value)],
    });
    return () => wfChart.current && wfChart.current.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(wf), pal]);

  // ---- Aylık trend ----
  useEffect(() => {
    if (!trendRef.current || !enough) return;
    if (trendChart.current) trendChart.current.destroy();
    const pts = series.slice(1);
    trendChart.current = new Chart(trendRef.current, {
      data: {
        labels: pts.map((p) => p.label),
        datasets: [
          { type: "bar", label: "Yeni Tespit", data: pts.map((p) => p.yeni), backgroundColor: pal.bad, borderRadius: 4, yAxisID: "y" },
          { type: "bar", label: "Çözülen", data: pts.map((p) => p.cozulen), backgroundColor: pal.ok, borderRadius: 4, yAxisID: "y" },
          { type: "line", label: "Çözüm Oranı %", data: pts.map((p) => p.cozumOrani), borderColor: pal.accent, backgroundColor: pal.accent, borderWidth: 2, tension: 0.35, pointRadius: 3, yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 16 } },
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", labels: { color: pal.ink, boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: pal.inkSoft, font: { size: 10 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: pal.inkSoft, font: { size: 10 } }, grid: { color: pal.line } },
          y1: { position: "right", beginAtZero: true, max: 100, ticks: { color: pal.inkSoft, font: { size: 10 }, callback: (v) => `${v}%` }, grid: { display: false } },
        },
      },
      plugins: [valueLabelPlugin(pal, (di, i) => (di < 2 ? pts[i][di === 0 ? "yeni" : "cozulen"] : null))],
    });
    return () => trendChart.current && trendChart.current.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(series), enough, pal]);

  const Kpi = ({ label, value, valueColor, spark, sparkColor, delta, deltaUnit, deltaGoodNeg = true, note }) => (
    <div style={{ ...styles.kpiCard, gap: 6, minHeight: 108 }}>
      <span style={{ ...styles.kpiLabel, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10.5 }}>{label}</span>
      <span style={{ ...styles.kpiValue, color: valueColor || pal.ink, fontSize: 26 }}>{value}</span>
      {spark && spark.length >= 2 ? <Spark values={spark} color={sparkColor || pal.accent} /> : <div style={{ height: 30 }} />}
      {note ? <span style={{ fontSize: 11.5, color: pal.inkSoft }}>{note}</span> : <Delta value={delta} unit={deltaUnit} goodWhenNegative={deltaGoodNeg} pal={pal} />}
    </div>
  );

  return (
    <div style={{ ...styles.panel, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <p style={styles.settingsSectionTitle}>Genel Durum</p>
          <p style={{ ...styles.pageSub, margin: 0 }}>
            Cihaz envanterinin sağlık özeti ve IT operasyonlarının dönemsel bulgu/çözüm performansı
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

      {/* Özet KPI şeridi */}
      <div style={{ ...styles.kpiGrid, gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))", marginTop: 16 }}>
        <Kpi label="Toplam Cihaz" value={fmt(live.toplamCihaz)} note="SCCM envanteri" />
        <Kpi label="Açık Bulgu" value={fmt(latest ? latest.acikBulgu : acikBulguLive)} valueColor={pal.bad}
          spark={series.map((s) => s.acikBulgu)} sparkColor={pal.bad}
          delta={latest && prev ? pctChange(latest.acikBulgu, prev.acikBulgu) : null} deltaUnit="%" deltaGoodNeg />
        <Kpi label="Çözüm Oranı" value={latest && latest.cozumOrani != null ? `%${latest.cozumOrani}` : "—"}
          valueColor={pal.ok} spark={series.map((s) => s.cozumOrani).filter((v) => v != null)} sparkColor={pal.ok}
          delta={latest && prev && latest.cozumOrani != null && prev.cozumOrani != null ? Math.round((latest.cozumOrani - prev.cozumOrani) * 10) / 10 : null}
          deltaUnit=" pp" deltaGoodNeg={false} />
        <Kpi label="Sağlıklı Cihaz" value={`%${saglikPct}`} valueColor={saglikPct >= 80 ? pal.ok : saglikPct >= 60 ? pal.warnFg : pal.bad}
          spark={series.map((s) => (live.toplamCihaz ? Math.round(((live.toplamCihaz - s.acikBulgu) / live.toplamCihaz) * 100) : 0))}
          sparkColor={pal.ok} note="temiz / toplam" />
        <Kpi label="Zimmet Uyumu" value={`%${zimmetUyumPct}`} valueColor={zimmetUyumPct >= 90 ? pal.ok : zimmetUyumPct >= 75 ? pal.warnFg : pal.bad}
          note={`${fmt(live.zimmetDogru)} doğru / ${fmt(live.zimmetHatali)} hatalı`} />
        <Kpi label="Bu Dönem Net" value={latest ? (latest.netDegisim > 0 ? `+${latest.netDegisim}` : latest.netDegisim) : "—"}
          valueColor={latest && latest.netDegisim > 0 ? pal.bad : pal.ok} note="yeni − çözülen" />
      </div>

      {/* Şelale + Sağlıklı Cihaz göstergesi */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.9fr) minmax(0, 1fr)", gap: 18, marginTop: 22, alignItems: "stretch" }}>
        <div>
          <p style={{ ...styles.pageSub, margin: "0 0 4px", fontWeight: 600, color: pal.ink }}>Cihaz Sağlık Şelalesi</p>
          <p style={{ ...styles.pageSub, margin: "0 0 8px", fontSize: 11.5 }}>
            Toplam {fmt(live.toplamCihaz)} cihaz → problem kategorileri çıkarılınca kalan "temiz" cihaz (kategoriler çakışabilir)
          </p>
          <div style={{ height: 250 }}>
            <canvas ref={wfRef} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, border: `1px solid ${pal.line}`, borderRadius: 12, padding: 16 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: pal.inkSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>Sağlıklı Cihaz Oranı</span>
          <Donut
            size={168}
            thickness={20}
            segments={[
              { value: temiz, color: pal.ok, label: "Temiz" },
              { value: Math.max(0, live.toplamCihaz - temiz), color: pal.bad, label: "Problemli" },
            ]}
            trackColor={pal.fieldBg}
            centerLabel={`%${saglikPct}`}
            centerSub={`${fmt(temiz)} / ${fmt(live.toplamCihaz)}`}
          />
          <span style={{ fontSize: 12.5 }}>
            Zimmet uyumu: <strong style={{ color: zimmetUyumPct >= 90 ? pal.ok : pal.warnFg }}>%{zimmetUyumPct}</strong>
          </span>
        </div>
      </div>

      {/* Aylık bulgu/çözüm trendi */}
      <div style={{ marginTop: 22 }}>
        <p style={{ ...styles.pageSub, margin: "0 0 8px", fontWeight: 600, color: pal.ink }}>
          {PERIOD_LABELS[period]} Bulgu / Çözüm Trendi
        </p>
        {enough ? (
          <div style={{ height: 240 }}>
            <canvas ref={trendRef} />
          </div>
        ) : (
          <p style={{ ...styles.pageSub, margin: 0 }}>Trend için en az 2 dönem verisi gerekli — snapshot geçmişi biriktikçe dolacak.</p>
        )}
      </div>
    </div>
  );
}
