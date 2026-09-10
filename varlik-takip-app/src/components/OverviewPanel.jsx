import { useEffect, useMemo, useRef } from "react";
import { Chart, BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import Donut from "./Donut";
import Gauge from "./Gauge";
import { combinedPeriodSummary, waterfallSegments, pctChange } from "../services/dashboardOverviewService";

Chart.register(BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const PERIOD_LABELS = { month: "Aylık", week: "Haftalık", raw: "Her Yükleme" };
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("tr-TR"));

// Her kart kendi renk ailesinde — ilk bakışta ayırt edilebilsin (bkz. konuşma, referans dashboardlar).
const C = {
  blue: "#2563EB",
  teal: "#0D9488",
  indigo: "#6366F1",
  amber: "#D97706",
  navy: "#1E3A5F",
  slate: "#64748B",
  emerald: "#10B981",
  coral: "#F87171",
  purple: ["#6D28D9", "#8B5CF6", "#A78BFA", "#C4B5FD", "#DDD6FE"],
};

// Dolgulu mini alan grafiği (Semrush tarzı).
function Spark({ values, color, width = 118, height = 34 }) {
  const nums = (values || []).filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (nums.length < 2) return <div style={{ height, width }} />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const xs = (i) => (i / (nums.length - 1)) * (width - 2) + 1;
  const ys = (v) => height - 3 - ((v - min) / span) * (height - 6);
  const line = nums.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
  const area = `${xs(0).toFixed(1)},${height} ${line} ${xs(nums.length - 1).toFixed(1)},${height}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polygon points={area} fill={color} opacity="0.14" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DeltaTag({ value, unit = "%", goodWhenNegative = true, pal }) {
  if (value == null) return null;
  const good = value === 0 ? null : goodWhenNegative ? value < 0 : value > 0;
  const color = good == null ? pal.inkSoft : good ? pal.ok : pal.bad;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, marginLeft: 6 }}>
      {value > 0 ? "▲ +" : value < 0 ? "▼ " : "▬ "}
      {value}
      {unit}
    </span>
  );
}

export default function OverviewPanel({ snapshots, period, setPeriod, live, styles, pal }) {
  const wfRef = useRef(null);
  const wfChart = useRef(null);

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
  const cozumOrani = latest && latest.cozumOrani != null ? latest.cozumOrani : null;
  const acikBulguLive = live.inaktif + live.zimmetHatali + live.kritikDisk + live.kullanilmayan;

  const cats = [
    { key: "İnaktif", value: live.inaktif, color: C.purple[0] },
    { key: "Zimmet Hatalı", value: live.zimmetHatali, color: C.purple[1] },
    { key: "Kritik Disk", value: live.kritikDisk, color: C.purple[2] },
    { key: "Kullanılmayan", value: live.kullanilmayan, color: C.purple[3] },
  ];
  const catTotal = cats.reduce((s, c) => s + c.value, 0) || 1;
  const catMax = Math.max(...cats.map((c) => c.value), 1);

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
    const colors = wf.map((s) => (s.kind === "total" ? C.slate : s.kind === "result" ? C.emerald : C.coral));
    wfChart.current = new Chart(wfRef.current, {
      type: "bar",
      data: { labels: wf.map((s) => s.key), datasets: [{ data: bars, backgroundColor: colors, borderRadius: 5, barPercentage: 0.62 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${fmt(wf[c.dataIndex].value)}` } } },
        scales: {
          x: { ticks: { color: pal.inkSoft, font: { size: 10 }, maxRotation: 20, minRotation: 0 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: pal.inkSoft, font: { size: 10 } }, grid: { color: pal.line } },
        },
      },
    });
    return () => wfChart.current && wfChart.current.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(wf), pal]);

  // Aylık trend artık grafik değil, dönem dönem OKUNAKLI satırlar (bkz. konuşma: "çok büyük,
  // anlaşılır değil"). Her satır: dönem etiketi + Çözülen/Devam/Yeni oranlı yatay çubuk + Çözüm Oranı %.
  const trendRows = useMemo(() => {
    const pts = series.slice(1); // ilk dönemin öncesi yok
    const maxTotal = Math.max(1, ...pts.map((p) => p.cozulen + p.devam + p.yeni));
    return pts.map((p) => ({ ...p, maxTotal }));
  }, [series]);

  const Card = ({ title, accent, minW = 300, grow = 1, children }) => (
    <div style={{ flex: `${grow} 1 ${minW}px`, minWidth: 0, border: `1px solid ${pal.line}`, borderRadius: 14, background: pal.panelSolid || pal.panel, padding: "14px 16px", boxShadow: pal.shadow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 22, height: 3, borderRadius: 2, background: accent }} />
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: pal.ink }}>{title}</span>
      </div>
      {children}
    </div>
  );

  const NumBlock = ({ label, value, color, spark, sparkColor, delta, deltaUnit, deltaGoodNeg = true, sub }) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: pal.inkSoft, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: color || pal.ink, fontFamily: "monospace" }}>{value}</span>
        <DeltaTag value={delta} unit={deltaUnit} goodWhenNegative={deltaGoodNeg} pal={pal} />
      </div>
      {spark ? <Spark values={spark} color={sparkColor || color || C.blue} /> : sub ? <div style={{ fontSize: 11, color: pal.inkSoft }}>{sub}</div> : null}
    </div>
  );

  return (
    <div style={{ ...styles.panel, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <p style={styles.settingsSectionTitle}>Genel Durum</p>
          <p style={{ ...styles.pageSub, margin: 0 }}>Cihaz envanteri sağlık özeti ve IT operasyon performansı — her kart kendi grafiği ve renginde</p>
        </div>
        <div style={styles.segmented}>
          {Object.entries(PERIOD_LABELS).map(([id, l]) => (
            <div key={id} onClick={() => setPeriod(id)} style={{ ...styles.seg, ...(period === id ? styles.segActive : {}) }}>
              {l}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {/* Envanter Özeti — MAVİ */}
        <Card title="Envanter Özeti" accent={C.blue} minW={280} grow={1.4}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            <NumBlock label="Toplam Cihaz" value={fmt(live.toplamCihaz)} color={C.blue} sub="SCCM envanteri" />
            <NumBlock
              label="Açık Bulgu"
              value={fmt(latest ? latest.acikBulgu : acikBulguLive)}
              color={C.coral}
              spark={series.map((s) => s.acikBulgu)}
              sparkColor={C.coral}
              delta={latest && prev ? pctChange(latest.acikBulgu, prev.acikBulgu) : null}
              deltaUnit="%"
            />
            <NumBlock
              label="Sağlıklı Cihaz"
              value={`%${saglikPct}`}
              color={saglikPct >= 80 ? C.emerald : saglikPct >= 60 ? C.amber : C.coral}
              spark={series.map((s) => (live.toplamCihaz ? Math.round(((live.toplamCihaz - s.acikBulgu) / live.toplamCihaz) * 100) : 0))}
              sparkColor={C.emerald}
            />
          </div>
        </Card>

        {/* Çözüm Oranı — TURKUAZ gösterge */}
        <Card title="Çözüm Oranı" accent={C.teal} minW={210} grow={0.7}>
          <Gauge value={cozumOrani ?? 0} centerLabel={cozumOrani != null ? `%${cozumOrani}` : "veri yok"} centerSub={latest ? `${fmt(latest.cozulen)} / ${fmt(latest.cozulen + latest.devam)}` : ""} pal={pal} size={200} />
        </Card>

        {/* Zimmet Uyumu — İNDİGO gösterge */}
        <Card title="Zimmet Uyumu" accent={C.indigo} minW={210} grow={0.7}>
          <Gauge
            value={zimmetUyumPct}
            bands={[
              { upTo: 75, color: C.coral },
              { upTo: 90, color: "#F2C037" },
              { upTo: 100, color: C.indigo },
            ]}
            centerLabel={`%${zimmetUyumPct}`}
            centerSub={`${fmt(live.zimmetDogru)} doğru / ${fmt(live.zimmetHatali)} hatalı`}
            pal={pal}
            size={200}
          />
        </Card>

        {/* Açık Bulgu Dağılımı — MOR donut + lejant */}
        <Card title="Açık Bulgu Dağılımı" accent={C.purple[1]} minW={300} grow={1}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <Donut
              size={140}
              thickness={18}
              segments={cats.map((c) => ({ value: c.value, color: c.color, label: c.key }))}
              trackColor={pal.fieldBg}
              centerLabel={fmt(acikBulguLive)}
              centerSub="açık bulgu"
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 150, flex: 1 }}>
              {cats.map((c) => (
                <div key={c.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
                    {c.key}
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {fmt(c.value)} <span style={{ color: pal.inkSoft, fontWeight: 400 }}>%{Math.round((c.value / catTotal) * 100)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Kategori Kırılımı — KEHRIBAR yatay bar */}
        <Card title="Kategori Kırılımı" accent={C.amber} minW={300} grow={1}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {cats.map((c) => (
              <div key={c.key}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                  <span>{c.key}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(c.value)}</span>
                </div>
                <div style={{ height: 9, borderRadius: 5, background: pal.fieldBg, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round((c.value / catMax) * 100)}%`, background: C.amber, borderRadius: 5 }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Dönemsel Çözüm Performansı — dönem başına PASTA (donut) dilimi (LACİVERT) */}
        <div style={{ flex: "1 1 100%", minWidth: 0 }}>
          <Card title={`${PERIOD_LABELS[period]} Çözüm Performansı`} accent={C.navy}>
            {enough ? (
              <>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: pal.inkSoft, marginBottom: 12 }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: C.emerald, marginRight: 5 }} />Çözülen</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: C.slate, marginRight: 5 }} />Devam Eden</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: C.coral, marginRight: 5 }} />Yeni Tespit</span>
                  <span style={{ marginLeft: "auto" }}>Ortadaki % = çözüm oranı (çözülen ÷ önceki dönemin problemli cihazı)</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 26, justifyContent: "flex-start" }}>
                  {trendRows.map((p) => {
                    const okColor = p.cozumOrani == null ? pal.inkSoft : p.cozumOrani >= 50 ? C.emerald : p.cozumOrani >= 25 ? C.amber : C.coral;
                    return (
                      <div key={p.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 150 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: pal.ink }}>{p.label}</span>
                        <Donut
                          size={150}
                          thickness={22}
                          segments={[
                            { value: p.cozulen, color: C.emerald, label: "Çözülen" },
                            { value: p.devam, color: C.slate, label: "Devam Eden" },
                            { value: p.yeni, color: C.coral, label: "Yeni Tespit" },
                          ]}
                          trackColor={pal.fieldBg}
                          centerLabel={p.cozumOrani != null ? `%${p.cozumOrani}` : "—"}
                          centerSub="çözüm oranı"
                        />
                        <span style={{ fontSize: 11.5, color: pal.inkSoft, textAlign: "center" }}>
                          <strong style={{ color: C.emerald }}>{fmt(p.cozulen)}</strong> çöz&nbsp;·&nbsp;
                          <strong style={{ color: pal.ink }}>{fmt(p.devam)}</strong> devam&nbsp;·&nbsp;
                          <strong style={{ color: C.coral }}>{fmt(p.yeni)}</strong> yeni
                        </span>
                        <span style={{ fontSize: 11, color: okColor, fontWeight: 700 }}>
                          toplam {fmt(p.acikBulgu)} açık bulgu
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p style={{ ...styles.pageSub, margin: 0 }}>En az 2 dönem verisi gerekli — snapshot geçmişi biriktikçe dolacak.</p>
            )}
          </Card>
        </div>

        {/* Cihaz Sağlık Şelalesi — ARDUVAZ / MERCAN / ZÜMRÜT (tam satır) */}
        <div style={{ flex: "1 1 100%", minWidth: 0 }}>
          <Card title="Cihaz Sağlık Şelalesi" accent={C.slate}>
            <p style={{ ...styles.pageSub, margin: "0 0 8px", fontSize: 11.5 }}>
              Toplam {fmt(live.toplamCihaz)} → problem kategorileri çıkınca kalan "temiz" cihaz (kategoriler çakışabilir)
            </p>
            <div style={{ height: 240, minWidth: 0 }}>
              <canvas ref={wfRef} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
