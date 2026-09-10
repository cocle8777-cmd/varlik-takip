import { useMemo } from "react";
import { combinedPeriodSummary, waterfallSegments, pctChange } from "../services/dashboardOverviewService";

const PERIOD_LABELS = { month: "Aylık", week: "Haftalık", raw: "Her Yükleme" };
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("tr-TR"));

// Her kartın kendi renk ailesi (bkz. konuşma / referans dashboardlar).
const C = {
  blue: "#2563EB",
  purple: "#7C3AED",
  slate: "#64748B",
  navy: "#1E3A5F",
  emerald: "#10B981",
  amber: "#D97706",
  coral: "#EF6C6C",
};

function Delta({ value, unit = "%", goodWhenNegative = true, pal }) {
  if (value == null) return <span style={{ color: pal.inkSoft }}>—</span>;
  const good = value === 0 ? null : goodWhenNegative ? value < 0 : value > 0;
  const color = good == null ? pal.inkSoft : good ? pal.ok : pal.bad;
  return (
    <span style={{ color, fontWeight: 700 }}>
      {value > 0 ? "▲ +" : value < 0 ? "▼ " : "▬ "}
      {value}
      {unit}
    </span>
  );
}

export default function OverviewPanel({ snapshots, period, setPeriod, live, styles, pal }) {
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
  const acikBulgu = live.inaktif + live.zimmetHatali + live.kritikDisk + live.kullanilmayan;
  const acikBulguLive = acikBulgu;

  const trendRows = useMemo(() => series.slice(1), [series]); // ilk dönemin öncesi yok
  const latestTrend = trendRows[trendRows.length - 1] || null;
  const prevTrend = trendRows[trendRows.length - 2] || null;

  const okColor = (v) => (v == null ? pal.inkSoft : v >= 50 ? C.emerald : v >= 25 ? C.amber : C.coral);
  const healthColor = saglikPct >= 80 ? C.emerald : saglikPct >= 60 ? C.amber : C.coral;
  const zimmetColor = zimmetUyumPct >= 90 ? C.emerald : zimmetUyumPct >= 75 ? C.amber : C.coral;

  // ---- kart + tablo yardımcıları ----
  const Card = ({ title, accent, span, children }) => (
    <div
      style={{
        gridColumn: `span ${span}`,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${pal.line}`,
        borderRadius: 14,
        background: pal.panelSolid || pal.panel,
        boxShadow: pal.shadow,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <span style={{ width: 24, height: 3, borderRadius: 2, background: accent }} />
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: pal.ink }}>{title}</span>
      </div>
      {children}
    </div>
  );

  const th = { textAlign: "left", padding: "7px 8px", fontWeight: 600, fontSize: 11, color: pal.inkSoft, borderBottom: `1px solid ${pal.line}` };
  const thR = { ...th, textAlign: "right" };
  const td = { padding: "8px 8px", fontSize: 12.5 };
  const tdR = { ...td, textAlign: "right", fontFamily: "monospace" };
  const tableStyle = { width: "100%", borderCollapse: "collapse" };
  const rowLine = { borderTop: `1px solid ${pal.line}` };

  // Mini oran çubuğu (tablo hücresi içinde — grafik değil)
  const Bar = ({ frac, color }) => (
    <div style={{ height: 7, borderRadius: 4, background: pal.fieldBg }}>
      <div style={{ height: "100%", width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`, background: color, borderRadius: 4 }} />
    </div>
  );

  // --- Genel Özet satırları ---
  const ozet = [
    { k: "Toplam Cihaz", v: fmt(live.toplamCihaz), extra: "SCCM envanteri" },
    { k: "Temiz (Sağlıklı) Cihaz", v: fmt(temiz), extra: <span style={{ color: healthColor, fontWeight: 700 }}>%{saglikPct}</span> },
    {
      k: "Açık Bulgu",
      v: <span style={{ color: C.coral, fontWeight: 800 }}>{fmt(acikBulgu)}</span>,
      extra: <Delta value={latest && prev ? pctChange(latest.acikBulgu, prev.acikBulgu) : null} unit="%" pal={pal} />,
    },
    {
      k: "Zimmet Uyumu",
      v: <span style={{ color: zimmetColor, fontWeight: 800 }}>%{zimmetUyumPct}</span>,
      extra: `${fmt(live.zimmetDogru)} doğru · ${fmt(live.zimmetHatali)} hatalı`,
    },
    {
      k: "Çözüm Oranı (bu dönem)",
      v: latestTrend && latestTrend.cozumOrani != null ? <span style={{ color: okColor(latestTrend.cozumOrani), fontWeight: 800 }}>%{latestTrend.cozumOrani}</span> : "—",
      extra:
        prevTrend && prevTrend.cozumOrani != null && latestTrend && latestTrend.cozumOrani != null ? (
          <>
            önceki %{prevTrend.cozumOrani}{" "}
            <Delta value={Math.round((latestTrend.cozumOrani - prevTrend.cozumOrani) * 10) / 10} unit=" pp" goodWhenNegative={false} pal={pal} />
          </>
        ) : (
          "—"
        ),
    },
  ];

  // --- Açık Bulgu Dağılımı satırları ---
  const cats = [
    { key: "İnaktif Cihaz", value: live.inaktif },
    { key: "Zimmet Hatalı", value: live.zimmetHatali },
    { key: "Kritik Disk", value: live.kritikDisk },
    { key: "Kullanılmayan", value: live.kullanilmayan },
  ];
  const catTotal = cats.reduce((s, c) => s + c.value, 0) || 1;
  const catMax = Math.max(...cats.map((c) => c.value), 1);

  // --- Cihaz Sağlık Şelalesi (çıkarma tablosu) ---
  const healthRows = [
    { key: "Toplam Cihaz", value: live.toplamCihaz, sign: "", bold: true, color: pal.ink },
    { key: "İnaktif Cihaz", value: live.inaktif, sign: "−", color: C.coral },
    { key: "Zimmet Hatalı", value: live.zimmetHatali, sign: "−", color: C.coral },
    { key: "Kritik Disk", value: live.kritikDisk, sign: "−", color: C.coral },
    { key: "Kullanılmayan", value: live.kullanilmayan, sign: "−", color: C.coral },
    { key: "Temiz Cihaz", value: temiz, sign: "=", bold: true, color: C.emerald },
  ];

  return (
    <div style={{ ...styles.panel, padding: "22px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div>
          <p style={styles.settingsSectionTitle}>Genel Durum</p>
          <p style={{ ...styles.pageSub, margin: 0 }}>Cihaz envanteri sağlık özeti ve IT operasyon performansı — tablolarla</p>
        </div>
        <div style={styles.segmented}>
          {Object.entries(PERIOD_LABELS).map(([id, l]) => (
            <div key={id} onClick={() => setPeriod(id)} style={{ ...styles.seg, ...(period === id ? styles.segActive : {}) }}>
              {l}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 16 }}>
        {/* Genel Özet */}
        <Card title="Genel Özet" accent={C.blue} span={6}>
          <table style={tableStyle}>
            <tbody>
              {ozet.map((r, i) => (
                <tr key={r.k} style={i === 0 ? undefined : rowLine}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.k}</td>
                  <td style={{ ...tdR, fontSize: 15, fontWeight: 800 }}>{r.v}</td>
                  <td style={{ ...td, textAlign: "right", color: pal.inkSoft, fontSize: 11.5 }}>{r.extra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Açık Bulgu Dağılımı */}
        <Card title="Açık Bulgu Dağılımı" accent={C.purple} span={6}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Kategori</th>
                <th style={thR}>Adet</th>
                <th style={thR}>Pay</th>
                <th style={{ ...th, width: "30%" }} />
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.key} style={rowLine}>
                  <td style={{ ...td, fontWeight: 600 }}>{c.key}</td>
                  <td style={{ ...tdR, fontWeight: 800 }}>{fmt(c.value)}</td>
                  <td style={{ ...tdR, color: pal.inkSoft }}>%{Math.round((c.value / catTotal) * 100)}</td>
                  <td style={td}>
                    <Bar frac={c.value / catMax} color={C.purple} />
                  </td>
                </tr>
              ))}
              <tr style={{ ...rowLine, background: pal.fieldBg }}>
                <td style={{ ...td, fontWeight: 800 }}>Toplam Açık Bulgu</td>
                <td style={{ ...tdR, fontWeight: 800, color: C.coral }}>{fmt(acikBulguLive)}</td>
                <td style={{ ...tdR, color: pal.inkSoft }}>%100</td>
                <td style={td} />
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Cihaz Sağlık Şelalesi — çıkarma tablosu */}
        <Card title="Cihaz Sağlık Şelalesi" accent={C.slate} span={6}>
          <p style={{ ...styles.pageSub, margin: "0 0 8px", fontSize: 11.5 }}>
            Toplam cihazdan problem kategorileri çıkarılınca "temiz" cihaz kalır (bir cihaz birden çok kategoride olabilir)
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...th, width: 24 }} />
                <th style={th}>Kalem</th>
                <th style={thR}>Cihaz</th>
                <th style={thR}>Toplama Oranı</th>
              </tr>
            </thead>
            <tbody>
              {healthRows.map((r, i) => (
                <tr key={r.key} style={{ ...(i === 0 ? undefined : rowLine), background: r.bold ? pal.fieldBg : "transparent" }}>
                  <td style={{ ...td, textAlign: "center", color: r.color, fontWeight: 800 }}>{r.sign}</td>
                  <td style={{ ...td, fontWeight: r.bold ? 800 : 600 }}>{r.key}</td>
                  <td style={{ ...tdR, fontWeight: r.bold ? 800 : 600, color: r.bold ? r.color : pal.ink }}>{fmt(r.value)}</td>
                  <td style={{ ...tdR, color: pal.inkSoft }}>%{Math.round((r.value / (live.toplamCihaz || 1)) * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ ...styles.pageSub, margin: "10px 0 0", fontSize: 11.5 }}>
            Sağlıklı cihaz oranı: <strong style={{ color: healthColor }}>%{saglikPct}</strong>
          </p>
        </Card>

        {/* Dönemsel Çözüm Performansı — tablo */}
        <Card title={`${PERIOD_LABELS[period]} Çözüm Performansı`} accent={C.navy} span={6}>
          {enough && latestTrend ? (
            <>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Dönem</th>
                    <th style={thR}>Açık Bulgu</th>
                    <th style={{ ...thR, color: C.emerald }}>Çözülen</th>
                    <th style={thR}>Devam</th>
                    <th style={{ ...thR, color: C.coral }}>Yeni</th>
                    <th style={thR}>Çözüm Oranı</th>
                  </tr>
                </thead>
                <tbody>
                  {trendRows.map((p, i) => (
                    <tr key={p.label} style={{ ...rowLine, background: i === trendRows.length - 1 ? pal.fieldBg : "transparent" }}>
                      <td style={{ ...td, fontWeight: 700 }}>{p.label}</td>
                      <td style={tdR}>{fmt(p.acikBulgu)}</td>
                      <td style={{ ...tdR, color: C.emerald, fontWeight: 700 }}>{fmt(p.cozulen)}</td>
                      <td style={tdR}>{fmt(p.devam)}</td>
                      <td style={{ ...tdR, color: C.coral, fontWeight: 700 }}>{fmt(p.yeni)}</td>
                      <td style={{ ...tdR, fontWeight: 800, color: okColor(p.cozumOrani) }}>{p.cozumOrani != null ? `%${p.cozumOrani}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ ...styles.pageSub, margin: "10px 0 0", fontSize: 11 }}>
                Çözüm Oranı = Çözülen ÷ (Çözülen + Devam) — önceki dönemdeki problemli cihazların yüzde kaçı listeden düştü.
                {prevTrend && prevTrend.cozumOrani != null && latestTrend.cozumOrani != null && (
                  <>
                    {" "}Bu dönem <strong style={{ color: okColor(latestTrend.cozumOrani) }}>%{latestTrend.cozumOrani}</strong>,{" "}
                    <Delta value={Math.round((latestTrend.cozumOrani - prevTrend.cozumOrani) * 10) / 10} unit=" pp" goodWhenNegative={false} pal={pal} /> (önceki döneme göre).
                  </>
                )}
              </p>
            </>
          ) : (
            <p style={{ ...styles.pageSub, margin: 0 }}>En az 2 dönem verisi gerekli — snapshot geçmişi biriktikçe dolacak.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
