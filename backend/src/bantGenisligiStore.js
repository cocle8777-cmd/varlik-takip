// Ofis Bant Genişliği CSV'sini KALICI olarak diske yazar — kullanıcı isteği: "bir kez yükleyeyim
// bir daha yüklemekle uğraşmayayım" (bkz. konuşma). Dosya kendine özgü/tekil bir isimle geldiği
// (monitoring aracının export adı, klasör senkronuna uygun sabit bir prefix yok) için diğer
// raporlar gibi otomatik klasör senkronu yerine Ayarlar > Veri Input'tan TEK SEFERLİK yükleme +
// backend'de saklama modeli kullanılıyor.
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { getDataDir } = require("./crypto");
const { readSection, writeSection } = require("./store");

const SECTION = "bantGenisligiUpload";

function uploadDir() {
  const dir = path.join(getDataDir(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function filePath() {
  return path.join(uploadDir(), "bant-genisligi.csv");
}

function save(fileName, buffer) {
  fs.writeFileSync(filePath(), buffer);
  const meta = { fileName: fileName || "bant-genisligi.csv", uploadedAt: new Date().toISOString() };
  writeSection(SECTION, meta);
  return meta;
}

function parse() {
  const buf = fs.readFileSync(filePath());
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function load() {
  const meta = readSection(SECTION);
  if (!meta || !fs.existsSync(filePath())) return null;
  return { fileName: meta.fileName, modifiedAt: meta.uploadedAt, rows: parse() };
}

module.exports = { save, load };
