// Ofis Bant Genişliği raporu — monitoring aracının CSV export'u (bkz. konuşma). Dosya UTF-16 +
// TAB ayraçlı; SheetJS bunu otomatik algılıyor, tek özel nokta "Uyarı Durumu" sütununun "-%15"
// gibi metinleri sayı gibi yorumlamaması için sheet_to_json'a { raw: false } geçilmesi (App.jsx'te
// dosya okuma tarafında yapılıyor).
function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return String(row[name]).trim();
  }
  return "";
}

// "83.3 Mb/s" -> 83.3 (Mb/s birimini varsayıyoruz — export'ta gerçek veride hep bu birim).
function parseMbps(v) {
  const m = String(v || "").match(/([\d.,]+)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function mapBantRow(raw) {
  const durum = col(raw, "Uyarı Durumu");
  // "Ortalama Dahilinde" = normal; "-%15" gibi bir sapma yüzdesi = uyarı (ortalamanın altında).
  const isWarning = durum !== "" && durum !== "Ortalama Dahilinde";
  return {
    rowKey: `bant|${col(raw, "Lokasyon")}|${col(raw, "Hat")}`,
    location: col(raw, "Lokasyon"),
    hat: col(raw, "Hat"),
    bandwidth: col(raw, "Bant Genişliği"),
    bandwidthMbps: parseMbps(col(raw, "Bant Genişliği")),
    avgBandwidth: col(raw, "Averaj Bant Genişliği"),
    avgBandwidthMbps: parseMbps(col(raw, "Averaj Bant Genişliği")),
    seviye: col(raw, "Seviye"),
    seviyeMbps: parseMbps(col(raw, "Seviye")),
    tarih: col(raw, "Tarih"),
    durum,
    isWarning,
    statusTag: isWarning ? `Uyarı (${durum})` : "Ortalama Dahilinde",
    _raw: raw,
  };
}

export function mapBantRows(rawRows) {
  return (rawRows || []).map(mapBantRow);
}
