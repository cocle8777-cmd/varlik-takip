import { useEffect, useMemo, useState } from "react";
import { backendClient } from "../services/backendClient";

// "Yeni Kurulum Kaydı" (demo) — formdan kayıt → sistemde saklama → mevcut Excel'e satır ekleme
// → mail hazırlama/gönderme. Bkz. konuşma: 2. adım A seçeneği (mevcut dosyaya ekleme), demoda
// dosya "varmış gibi" (backend YeniKurulumlar-DEMO.xlsx'i okuyup satır ekler).
// Kullanıcının gerçek Excel başlıkları (bkz. konuşma). options = sabit açılır liste;
// options: "LOCATIONS" = App.jsx'ten gelen mevcut lokasyon listesi.
const FIELDS = [
  { k: "serial", label: "SERİ NO" },
  { k: "hostname", label: "HOSTNAME" },
  { k: "model", label: "MODEL" },
  { k: "location", label: "LOKASYON", options: "LOCATIONS" },
  { k: "userInfo", label: "KULLANICI BİLGİSİ" },
  { k: "atoNo", label: "ATO NUMARASI" },
  { k: "date", label: "TARİH", type: "date" },
  { k: "bitlocker", label: "Bitlocker Kontrol", options: ["Enable", "Süreç devam ediyor"] },
  { k: "processedBy", label: "İŞLEM YAPAN" },
  { k: "status", label: "DURUM", options: ["Teslim edildi", "Hazırlandı"] },
  { k: "deliveryDate", label: "TESLİM TARİHİ", type: "date" },
  { k: "reason", label: "NEDENI", wide: true },
  { k: "returns", label: "İADELER", wide: true },
];

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (who) => Object.fromEntries(FIELDS.map((f) => [f.k, f.k === "date" ? today() : f.k === "processedBy" ? who || "" : ""]));

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Mail gövdesi — kullanıcının verdiği şablona birebir (bkz. konuşma).
// Tablo sütunları: Seri Numarası · Barkod · Model · Marka · Varlık Kataloğu · Varlık Transfer Emri
// Barkod/Marka form'da yok → seri no ile TuruncuHat'tan doldurulur. Varlık Transfer Emri = ATO NUMARASI.
function buildMailHtml(recs, thRows = []) {
  const thBySerial = new Map();
  thRows.forEach((t) => {
    const k = String(t.serial || "").trim().toLowerCase();
    if (k) thBySerial.set(k, t);
  });
  const head = ["Seri Numarası", "Barkod", "Model", "Marka", "Varlık Kataloğu", "Varlık Transfer Emri"];
  const body = recs
    .map((r) => {
      const th = thBySerial.get(String(r.serial || "").trim().toLowerCase());
      // Sütun kaynakları (kullanıcı onayı): Seri No/Barkod/Model/Marka/Varlık Kataloğu → TH;
      // Varlık Transfer Emri → form ATO NUMARASI.
      const cells = [
        (th && th.serial) || r.serial || "", // TH → SERİ NO
        (th && th.barkod) || "", // TH → Varlık Barkodu
        (th && th.deviceType) || "", // TH → "Model" sütunu
        (th && th.marka) || "", // TH → Marka
        (th && (th.asset || th.model)) || "", // TH → Asset (Varlık Kataloğu)
        r.atoNo || "", // form → ATO NUMARASI
      ];
      return `<tr>${cells.map((c) => `<td style="border:1px solid #000;padding:6px 10px;">${esc(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<div style="font-family:Calibri,Arial,Helvetica,sans-serif;font-size:14px;color:#000;line-height:1.55;">
    <p>Merhaba,</p>
    <p>Cihazınız hazırlanmıştır. ATO kaydına Turuncuhattan kapatma onayı vermeniz durumunda&nbsp; bizden teslim alabilirsiniz.</p>
    <table style="border-collapse:collapse;margin:10px 0 14px;">
      <thead><tr>${head
        .map((h) => `<th style="border:1px solid #000;padding:6px 10px;text-align:left;color:#C00000;font-weight:bold;white-space:nowrap;">${h}</th>`)
        .join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p>Adres: <strong>EBİ- Corporate Club binası</strong> (Atatürk Uluslararası Havalimanı B Kapısı , (Eğitim Akademisi, Merkez yemekhane yanı))</p>
    <p>Konum : <a href="https://goo.gl/maps/boaRCuAx7Qu">https://goo.gl/maps/boaRCuAx7Qu</a></p>
  </div>`;
}

const norm = (v) => String(v || "").trim().toLowerCase();
// TH satırından "kişiye zimmetli fiziksel cihaz" mı? (User zimmeti + Desktop/Laptop/Notebook/Monitor)
const isPersonDevice = (r) => {
  const at = norm(r.assignmentType);
  const dt = norm(r.deviceType);
  if (at && at !== "user") return false;
  return /desktop|laptop|notebook|monitor|tablet/.test(dt) || !dt;
};

export default function NewInstallScreen({ styles, pal, user, locationOptions = [], thRows = [], mailGroupsText, recordMailHistory, showToast }) {
  const [returnQuery, setReturnQuery] = useState("");
  const [records, setRecords] = useState([]);
  const [excelPath, setExcelPath] = useState("");
  const [form, setForm] = useState(() => emptyForm(user?.username));
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [mailTo, setMailTo] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const reload = () =>
    backendClient
      .getNewInstalls()
      .then((s) => {
        setRecords(Array.isArray(s.records) ? s.records : []);
        setExcelPath(s.excelPath || "");
      })
      .catch(() => {});

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.hostname.trim() && !form.serial.trim()) {
      showToast("En az Hostname veya Seri No girin");
      return;
    }
    setSaving(true);
    try {
      if (editingId) await backendClient.updateNewInstall(editingId, form);
      else await backendClient.addNewInstall(form);
      await reload();
      setForm(emptyForm(user?.username));
      setEditingId(null);
      showToast(editingId ? "Kayıt güncellendi" : "Kayıt eklendi");
    } catch (err) {
      showToast(`Kaydedilemedi — ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const edit = (r) => {
    setEditingId(r.id);
    setForm(Object.fromEntries(FIELDS.map((f) => [f.k, r[f.k] || ""])));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const del = async (r) => {
    if (!window.confirm(`"${r.hostname || r.serial}" kaydı silinsin mi?`)) return;
    await backendClient.deleteNewInstall(r.id).catch(() => {});
    await reload();
    setSelected((s) => {
      const n = new Set(s);
      n.delete(r.id);
      return n;
    });
  };

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allChecked = records.length > 0 && selected.size === records.length;
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(records.map((r) => r.id)));

  const syncExcel = async () => {
    setSyncing(true);
    try {
      const res = await backendClient.syncNewInstallExcel(excelPath || undefined);
      setLastSync(res);
      await reload();
      showToast(`Excel'e işlendi: ${res.file} · ${res.totalRows} satır (${res.newlyMarked} yeni)`);
    } catch (err) {
      showToast(`Excel'e işlenemedi — ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const targetRecs = useMemo(() => (selected.size > 0 ? records.filter((r) => selected.has(r.id)) : records), [records, selected]);

  // SERİ NO yazılınca TuruncuHat'tan otomatik doldurma (boş alanlar) — bkz. konuşma.
  const thBySerial = useMemo(() => {
    const m = new Map();
    thRows.forEach((t) => {
      const k = norm(t.serial);
      if (k) m.set(k, t);
    });
    return m;
  }, [thRows]);
  const [thHit, setThHit] = useState(null); // { found, owner, model }

  useEffect(() => {
    if (editingId) {
      setThHit(null);
      return;
    }
    const s = norm(form.serial);
    if (s.length < 4) {
      setThHit(null);
      return;
    }
    const timer = setTimeout(() => {
      const th = thBySerial.get(s);
      if (!th) {
        setThHit({ found: false });
        return;
      }
      setThHit({ found: true, owner: th.ownerFull || th.owner, model: th.model || th.asset });
      setForm((p) => ({
        ...p,
        model: p.model || th.model || th.asset || [th.marka, th.deviceType].filter(Boolean).join(" "),
        location: p.location || (th.location && th.location !== "—" ? th.location : ""),
        userInfo: p.userInfo || [th.ownerFull || th.owner, th.ownerSicil].filter(Boolean).join(" / "),
      }));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.serial, thBySerial, editingId]);

  // İADELER — girilen kişi adına (SCCM tam ad) göre TH zimmetindeki fiziksel cihazlar.
  const returnMatches = useMemo(() => {
    const q = norm(returnQuery);
    if (q.length < 2 || !thRows.length) return [];
    // Her arama kelimesi, sahibin adında TAM kelime olarak geçmeli ("005" → "0053"e takılmasın).
    const terms = q.split(/\s+/).filter(Boolean);
    const res = terms.map((t) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu"));
    return thRows
      .filter((r) => {
        if (!isPersonDevice(r)) return false;
        const hay = norm(`${r.ownerFull} ${r.owner} ${r.ownerUsername} ${r.ownerSicil}`);
        return res.every((re) => re.test(" " + hay));
      })
      .slice(0, 40);
  }, [returnQuery, thRows]);

  const sendMail = async () => {
    if (targetRecs.length === 0) {
      showToast("Gönderilecek kayıt yok");
      return;
    }
    let recipients = mailTo.split(/[;,\s]+/).map((s) => s.trim()).filter((s) => /@/.test(s));
    if (recipients.length === 0) {
      // lokasyon mail grupları
      const groups = Object.fromEntries(
        (mailGroupsText || "")
          .split("\n")
          .map((l) => l.split(/[\t,;]/).map((x) => x.trim()))
          .filter((p) => p[0] && p[1] && /@/.test(p[1]))
      );
      recipients = [...new Set(targetRecs.map((r) => groups[r.location]).filter(Boolean))];
    }
    if (recipients.length === 0) {
      showToast("Alıcı yok — üstteki kutuya e-posta girin veya Ayarlar > Lokasyon Mailleri'ni doldurun");
      return;
    }
    const to = recipients.join(", ");
    const subject = targetRecs.length === 1 ? "Cihazınız Hazır — ATO Kapatma Onayı" : `Cihazlarınız Hazır — ATO Kapatma Onayı (${targetRecs.length} cihaz)`;
    setMailBusy(true);
    try {
      const r = await backendClient.sendMail({
        to,
        subject,
        text: "Cihazınız hazırlanmıştır. ATO kaydına Turuncuhattan kapatma onayı vermeniz durumunda bizden teslim alabilirsiniz. Adres: EBİ- Corporate Club binası. Konum: https://goo.gl/maps/boaRCuAx7Qu",
        html: buildMailHtml(targetRecs, thRows),
      });
      const ok = !!r.ok;
      if (ok) {
        await backendClient.markNewInstallsMailed(targetRecs.map((x) => x.id)).catch(() => {});
        await reload();
      }
      recordMailHistory &&
        recordMailHistory({
          id: Date.now(),
          date: new Date().toLocaleString("tr-TR"),
          dept: "Yeni Kurulum",
          report: "Yeni Kurulum Kaydı",
          recipients: ok ? targetRecs.length : 0,
          status: ok ? "Başarılı" : "Gönderilemedi",
          details: [{ location: `${targetRecs.length} cihaz`, to, count: targetRecs.length, ok, message: r.message || (ok ? "Gönderildi" : "Gönderilemedi") }],
        });
      showToast(ok ? `✅ Kurulum bildirimi gönderildi (${to})` : `❌ Gönderilemedi — ${r.message || ""}`);
    } catch (err) {
      showToast(`❌ Gönderilemedi — ${err.message}`);
    } finally {
      setMailBusy(false);
    }
  };

  const inp = { ...styles.formInput };

  return (
    <>
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <p style={styles.pageTitle}>Yeni Kurulum Kaydı</p>
        <p style={styles.pageSub}>
          Yeni kurduğun cihazı formdan gir → sistemde saklanır → "Excel'e İşle" ile mevcut kurulum Excel'ine satır eklenir → "Mail Gönder" ile bildirim hazırlanır.
          <em> (Demo: Excel dosyası hazır varsayılıyor.)</em>
        </p>
      </div>

      {/* FORM */}
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <div style={styles.settingsSectionHead}>
          <p style={styles.settingsSectionTitle}>{editingId ? "Kaydı Düzenle" : "Yeni Kayıt"}</p>
          {editingId && (
            <button style={styles.btnGhost} onClick={() => { setEditingId(null); setForm(emptyForm(user?.username)); }}>
              Vazgeç
            </button>
          )}
        </div>
        <form onSubmit={submit} style={styles.formGrid}>
          {FIELDS.map((f) => {
            const isLoc = f.options === "LOCATIONS";
            const fixedOpts = Array.isArray(f.options) ? f.options : null;
            const isTextarea = f.k === "reason" || f.k === "returns";
            return (
              <div key={f.k} style={f.wide ? styles.formFieldWide : styles.formField}>
                <label style={styles.formLabel}>{f.label}</label>
                {isLoc ? (
                  <>
                    <input
                      list="ni-loc-list"
                      value={form[f.k]}
                      onChange={(e) => setF(f.k, e.target.value)}
                      style={inp}
                      placeholder={locationOptions.length ? "yazarak ara veya listeden seç" : "lokasyon"}
                    />
                    <datalist id="ni-loc-list">
                      {locationOptions.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  </>
                ) : fixedOpts ? (
                  <select value={form[f.k]} onChange={(e) => setF(f.k, e.target.value)} style={{ ...inp }}>
                    <option value="">— seçiniz —</option>
                    {fixedOpts.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                    {form[f.k] && !fixedOpts.includes(form[f.k]) && <option value={form[f.k]}>{form[f.k]}</option>}
                  </select>
                ) : isTextarea ? (
                  <textarea
                    rows={2}
                    value={form[f.k]}
                    onChange={(e) => setF(f.k, e.target.value)}
                    style={{ ...inp, resize: "vertical", fontFamily: "inherit" }}
                  />
                ) : (
                  <input
                    type={f.type || "text"}
                    value={form[f.k]}
                    onChange={(e) => setF(f.k, e.target.value)}
                    style={inp}
                    placeholder={f.k === "hostname" ? "THY-LAP-…" : f.k === "serial" ? "PF3… (TH'den otomatik doldurur)" : ""}
                  />
                )}
                {f.k === "serial" && thHit && !editingId && (
                  <p style={{ margin: "3px 0 0", fontSize: 11.5, color: thHit.found ? pal.ok : pal.inkSoft }}>
                    {thHit.found
                      ? `✓ TuruncuHat: ${thHit.owner || "—"}${thHit.model ? ` · ${thHit.model}` : ""} — boş alanlar dolduruldu`
                      : "TuruncuHat'ta bu seri no bulunamadı"}
                  </p>
                )}
              </div>
            );
          })}
          <div style={{ ...styles.formActions, gridColumn: "1 / -1" }}>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>
              {saving ? "Kaydediliyor…" : editingId ? "Güncelle" : "Kaydet"}
            </button>
          </div>
        </form>

        {/* İADELER — kişinin TH zimmetindeki cihazları getir */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${pal.line}` }}>
          <p style={{ ...styles.formLabel, marginBottom: 6 }}>İADELER — kişinin zimmetli cihazlarını getir (TuruncuHat)</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              value={returnQuery}
              onChange={(e) => setReturnQuery(e.target.value)}
              style={{ ...inp, flex: "1 1 280px" }}
              placeholder="Kişi adı yaz (SCCM'deki tam ad) — örn. Ahmet Yılmaz"
            />
          </div>
          {returnQuery.trim().length >= 2 && (
            <div style={{ marginTop: 8, border: `1px solid ${pal.line}`, borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
              {returnMatches.length === 0 ? (
                <p style={{ ...styles.pageSub, margin: 0, padding: "10px 12px" }}>
                  {thRows.length === 0 ? "TuruncuHat verisi henüz yüklenmedi." : "Eşleşen kişi/cihaz bulunamadı."}
                </p>
              ) : (
                returnMatches.map((r) => (
                  <div
                    key={r.rowKey || `${r.serial}-${r.ownerFull}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${pal.line}`, fontSize: 12.5 }}
                  >
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                      <strong>{r.ownerFull || r.owner}</strong> · {r.serial || "—"} · {r.model || r.marka || r.deviceType || "—"}
                      {r.location && r.location !== "—" ? ` · ${r.location}` : ""}
                    </span>
                    <button
                      type="button"
                      style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12, flexShrink: 0 }}
                      onClick={() => {
                        const line = `SN: ${r.serial || "—"} · ${r.model || r.marka || r.deviceType || ""} · sahibi: ${r.ownerFull || r.owner}${r.location && r.location !== "—" ? ` · ${r.location}` : ""}`;
                        setForm((p) => ({ ...p, returns: (p.returns ? p.returns.replace(/\s*$/, "") + "\n" : "") + line }));
                        showToast("İADELER alanına eklendi");
                      }}
                    >
                      + İADELER'e ekle
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          <p style={{ ...styles.formHelper, marginTop: 6 }}>
            Kişi adı SCCM'deki gibi yazılır; TuruncuHat zimmet kayıtlarında eşleşen kişiye ait cihazlar listelenir. "+ İADELER'e ekle" ile aşağıdaki İADELER alanına satır olarak eklenir (elle düzenlenebilir).
          </p>
        </div>
      </div>

      {/* KAYITLAR + AKSİYONLAR */}
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <div style={styles.settingsSectionHead}>
          <p style={styles.settingsSectionTitle}>Kayıtlar ({records.length})</p>
          <span style={{ fontSize: 12.5, color: pal.inkSoft }}>
            {records.filter((r) => r.excelSyncedAt).length} Excel'e işlendi · {records.filter((r) => r.mailSentAt).length} mail gönderildi
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "6px 0 14px" }}>
          <input
            type="text"
            value={excelPath}
            onChange={(e) => setExcelPath(e.target.value)}
            style={{ ...inp, flex: "1 1 340px", fontFamily: "monospace", fontSize: 12 }}
            placeholder="Excel dosya yolu"
          />
          <button style={styles.btnPrimary} onClick={syncExcel} disabled={syncing || records.length === 0}>
            {syncing ? "İşleniyor…" : "📄 Excel'e İşle"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input
            type="text"
            value={mailTo}
            onChange={(e) => setMailTo(e.target.value)}
            style={{ ...inp, flex: "1 1 300px" }}
            placeholder="Mail alıcı(lar) — boşsa lokasyon mail grubu"
          />
          <button style={styles.btnGhost} onClick={sendMail} disabled={mailBusy || records.length === 0}>
            {mailBusy ? "Gönderiliyor…" : `✉️ Mail Gönder (${selected.size > 0 ? selected.size + " seçili" : "tümü"})`}
          </button>
        </div>

        {lastSync && (
          <p style={{ ...styles.formHelper, color: pal.ok, marginTop: 0 }}>
            {lastSync.existed ? "Mevcut dosyaya işlendi" : "Dosya oluşturuldu"} · {lastSync.file} · toplam {lastSync.totalRows} satır
            {lastSync.manualRowsKept ? ` (${lastSync.manualRowsKept} elle eklenen satır korundu)` : ""}
          </p>
        )}

        {records.length === 0 ? (
          <p style={styles.pageSub}>Henüz kayıt yok — yukarıdaki formdan ekleyin.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: 32 }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} style={styles.checkbox} />
                  </th>
                  {FIELDS.map((f) => (
                    <th key={f.k} style={styles.th}>{f.label}</th>
                  ))}
                  <th style={styles.th}>Excel</th>
                  <th style={styles.th}>Mail</th>
                  <th style={styles.th}>Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} style={selected.has(r.id) ? styles.rowSelected : undefined}>
                    <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} style={styles.checkbox} />
                    </td>
                    {FIELDS.map((f) => (
                      <td key={f.k} style={{ ...styles.td, fontSize: 12.5, whiteSpace: f.wide ? "normal" : "nowrap" }}>
                        {r[f.k] || <span style={{ color: pal.inkSoft }}>—</span>}
                      </td>
                    ))}
                    <td style={styles.td}>
                      {r.excelSyncedAt ? (
                        <span style={{ ...styles.badge, ...styles.badgeOk }}>işlendi</span>
                      ) : (
                        <span style={{ ...styles.badge, ...styles.badgeNeutral }}>bekliyor</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      {r.mailSentAt ? (
                        <span style={{ ...styles.badge, ...styles.badgeOk }} title={new Date(r.mailSentAt).toLocaleString("tr-TR")}>gönderildi · 1</span>
                      ) : (
                        <span style={{ ...styles.badge, ...styles.badgeNeutral }}>gönderilmedi · 0</span>
                      )}
                    </td>
                    <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                      <button style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => edit(r)}>Düzenle</button>{" "}
                      <button style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12, color: pal.bad }} onClick={() => del(r)}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
