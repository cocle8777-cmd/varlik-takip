// LAKESIDE "Battery Health" Excel'i — TuruncuHat/Monitor/BSOD ile aynı desen: kullanıcı dosyayı
// elle seçer, tarayıcıda okunur (klasör yolu / native diyalog YOK — uygulama tamamen web).
//
// Gerçek kolon adları LakeSide export'una göre değişebildiğinden esnek eşleme yapılır; kolon
// bulunamazsa alan boş kalır ("Veri Yok"), uygulama hata vermez. Gerçek dosya gelince
// COL_* listelerine tam başlık eklenebilir.
import { shortHost } from "./bsodKnowledgeService";

const norm = (v) => String(v ?? "").trim();

function col(row, ...names) {
  for (const name of names) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === name.toLowerCase() && row[key] !== "") return row[key];
    }
  }
  return "";
}
// "%87", "87.0", "0.87" -> 87
function pct(v) {
  if (v === "" || v == null) return null;
  let n = parseFloat(String(v).replace("%", "").replace(",", "."));
  if (!isFinite(n)) return null;
  if (n > 0 && n <= 1) n *= 100;
  return Math.round(n);
}
function num(v) {
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return isFinite(n) ? n : null;
}

export function mapBatteryRow(raw) {
  const machine = norm(
    col(raw, "Machine Name", "MachineName", "Device Name", "DeviceName", "Computer Name", "ComputerName", "Hostname", "Host", "Cihaz", "Cihaz Adı")
  );
  const design = num(col(raw, "Design Capacity", "DesignCapacity", "Design Capacity (mWh)", "Tasarım Kapasitesi"));
  const full = num(col(raw, "Full Charge Capacity", "FullChargeCapacity", "Full Charge Capacity (mWh)", "Tam Şarj Kapasitesi", "Current Capacity"));
  let health = pct(col(raw, "Battery Health", "BatteryHealth", "Health", "Health (%)", "Battery Health (%)", "SoH", "State of Health", "Sağlık", "Pil Sağlığı"));
  if (health == null && design && full) health = Math.round((full / design) * 100);
  const cycles = num(col(raw, "Cycle Count", "CycleCount", "Cycles", "Şarj Döngüsü", "Döngü Sayısı"));
  const status = norm(col(raw, "Battery Status", "Status", "Condition", "Durum", "Pil Durumu"));
  const manufacturer = norm(col(raw, "Manufacturer", "Battery Manufacturer", "Üretici", "Marka"));
  const serial = norm(col(raw, "Battery Serial", "Serial Number", "SerialNumber", "Seri No"));

  return {
    hostname: machine,
    hostShort: shortHost(machine),
    batteryHealth: health, // 0-100 veya null
    cycleCount: cycles,
    designCapacity: design,
    fullChargeCapacity: full,
    batteryStatus: status,
    manufacturer,
    serial,
    _raw: raw,
  };
}

export function mapBatteryRows(rawRows) {
  return (rawRows || [])
    .map(mapBatteryRow)
    .filter((r) => r.hostname);
}

// Cihaz Genel Görünüm için: hostname (veya kısa adı) ile eşleşen batarya kaydını bulur.
export function findBattery(batteryRows, query) {
  const q = norm(query).toLowerCase();
  if (!q || !batteryRows?.length) return null;
  const qShort = shortHost(q);
  return (
    batteryRows.find((r) => r.hostname.toLowerCase() === q) ||
    batteryRows.find((r) => r.hostShort.toLowerCase() === qShort) ||
    batteryRows.find((r) => r.hostShort.toLowerCase().includes(qShort) || qShort.includes(r.hostShort.toLowerCase())) ||
    null
  );
}

// health -> {value, state}  (ok / warn / crit / none) — kurumsal eşik: <60 kritik, <80 uyarı
export function batteryHealthState(r) {
  if (!r || r.batteryHealth == null) return { value: "Veri Yok", state: "none" };
  const h = r.batteryHealth;
  const extra = [r.cycleCount != null ? `${r.cycleCount} döngü` : "", r.batteryStatus].filter(Boolean).join(" · ");
  return {
    value: `%${h}${extra ? ` (${extra})` : ""}`,
    state: h < 60 ? "crit" : h < 80 ? "warn" : "ok",
  };
}
