// "Yeni Kurulum Kaydı" — kullanıcı yeni kurduğu cihazların bilgisini formdan girer; kayıtlar
// burada (şifreli JSON section) tutulur; "Excel'e İşle" mevcut bir Excel dosyasına (excelPath)
// satır ekler; sonrasında mail hazırlanır. Bkz. konuşma — 2. adım A seçeneği (mevcut dosyaya ekleme),
// demoda dosya "varmış gibi" davranır (yoksa başlıklarla oluşturulur).
const express = require("express");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { readSection, writeSection } = require("../store");

const router = express.Router();
const SECTION = "yeniKurulumlar"; // { records: [...], excelPath: "..." }

// Excel sütun sırası = form alanları (kullanıcının gerçek Excel başlıkları — bkz. konuşma)
const COLUMNS = [
  ["serial", "SERİ NO"],
  ["hostname", "HOSTNAME"],
  ["model", "MODEL"],
  ["location", "LOKASYON"],
  ["userInfo", "KULLANICI BİLGİSİ"],
  ["atoNo", "ATO NUMARASI"],
  ["date", "TARİH"],
  ["bitlocker", "Bitlocker Kontrol"],
  ["processedBy", "İŞLEM YAPAN"],
  ["status", "DURUM"],
  ["deliveryDate", "TESLİM TARİHİ"],
  ["reason", "NEDENI"],
  ["returns", "İADELER"],
];
// Türetilmiş Excel sütunu — mail gönderildiyse 1, gönderilmediyse 0.
const MAIL_COL = "Mail Gönderildi";

const DEFAULT_EXCEL = "C:/Users/Lenovo/varlik-test-data-3month/YeniKurulumlar-DEMO.xlsx";

function load() {
  const s = readSection(SECTION) || {};
  return { records: Array.isArray(s.records) ? s.records : [], excelPath: s.excelPath || DEFAULT_EXCEL };
}
function save(state) {
  writeSection(SECTION, state);
}
function clean(body = {}) {
  const out = {};
  COLUMNS.forEach(([k]) => {
    out[k] = String(body[k] ?? "").trim().slice(0, 500);
  });
  return out;
}
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

router.get("/", (req, res) => {
  res.json(load());
});

router.post("/", (req, res) => {
  const state = load();
  const rec = { id: newId(), createdAt: new Date().toISOString(), excelSyncedAt: null, ...clean(req.body) };
  state.records.push(rec);
  save(state);
  res.json(rec);
});

router.put("/:id", (req, res) => {
  const state = load();
  const i = state.records.findIndex((r) => r.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Kayıt bulunamadı" });
  state.records[i] = { ...state.records[i], ...clean(req.body), updatedAt: new Date().toISOString() };
  save(state);
  res.json(state.records[i]);
});

router.delete("/:id", (req, res) => {
  const state = load();
  const before = state.records.length;
  state.records = state.records.filter((r) => r.id !== req.params.id);
  if (state.records.length === before) return res.status(404).json({ error: "Kayıt bulunamadı" });
  save(state);
  res.json({ ok: true });
});

// Mail gönderildi işaretle — frontend başarılı gönderim sonrası çağırır.
router.post("/mark-mailed", (req, res) => {
  const state = load();
  const ids = new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String));
  const now = new Date().toISOString();
  let marked = 0;
  state.records = state.records.map((r) => {
    if (ids.has(String(r.id)) && !r.mailSentAt) {
      marked++;
      return { ...r, mailSentAt: now };
    }
    return r;
  });
  save(state);
  res.json({ ok: true, marked });
});

// Excel yolu ayarı
router.put("/config/excel-path", (req, res) => {
  const state = load();
  const p = String(req.body?.excelPath || "").trim();
  if (!p) return res.status(400).json({ error: "Yol boş olamaz" });
  state.excelPath = p;
  save(state);
  res.json({ excelPath: state.excelPath });
});

// Kayıtları Excel'e işle: dosya varsa okunur, YOKSA başlıklarla oluşturulur; TÜM kayıtlar
// (COLUMNS sırasıyla) tek sayfaya yazılır (idempotent — "eklenmiş gibi" ama mükerrer satır olmaz).
router.post("/sync-excel", (req, res) => {
  const state = load();
  const target = String(req.body?.excelPath || state.excelPath || DEFAULT_EXCEL).trim();
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });

    let existingRows = [];
    let existed = false;
    if (fs.existsSync(target)) {
      existed = true;
      const wb = XLSX.readFile(target);
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (ws) existingRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    }

    // Sistemdeki kayıtları Excel satırına çevir + "Mail Gönderildi" (1/0) sütunu
    const sysRows = state.records.map((r) => {
      const o = {};
      COLUMNS.forEach(([k, label]) => {
        o[label] = r[k] || "";
      });
      o[MAIL_COL] = r.mailSentAt ? 1 : 0;
      return o;
    });

    // Sistemde OLMAYAN (dosyada elle eklenmiş) satırları da koru — seri no + hostname anahtarıyla
    const sysKeys = new Set(state.records.map((r) => `${r.serial}|${r.hostname}`.toLowerCase()));
    const keptManual = existingRows.filter((row) => {
      const key = `${row["SERİ NO"] || row["Seri No"] || ""}|${row["HOSTNAME"] || row["Hostname"] || ""}`.toLowerCase();
      return key !== "|" && !sysKeys.has(key);
    }).map((row) => ({ ...row, [MAIL_COL]: row[MAIL_COL] === 1 || row[MAIL_COL] === "1" ? 1 : 0 }));

    const allRows = [...keptManual, ...sysRows];
    const ws = XLSX.utils.json_to_sheet(allRows, { header: [...COLUMNS.map(([, l]) => l), MAIL_COL] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kurulumlar");
    XLSX.writeFile(wb, target);

    const now = new Date().toISOString();
    let added = 0;
    state.records = state.records.map((r) => {
      if (!r.excelSyncedAt) added++;
      return { ...r, excelSyncedAt: r.excelSyncedAt || now };
    });
    state.excelPath = target;
    save(state);

    res.json({
      ok: true,
      file: target,
      existed,
      totalRows: allRows.length,
      systemRows: sysRows.length,
      manualRowsKept: keptManual.length,
      newlyMarked: added,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
