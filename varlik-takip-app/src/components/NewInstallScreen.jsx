import { useEffect, useMemo, useState } from "react";
import { backendClient } from "../services/backendClient";

// "Yeni Kurulum Kaydı" (demo) — formdan kayıt → sistemde saklama → mevcut Excel'e satır ekleme
// → mail hazırlama/gönderme. Bkz. konuşma: 2. adım A seçeneği (mevcut dosyaya ekleme), demoda
// dosya "varmış gibi" (backend YeniKurulumlar-DEMO.xlsx'i okuyup satır ekler).
const FIELDS = [
  { k: "installDate", label: "Kurulum Tarihi", type: "date" },
  { k: "hostname", label: "Hostname" },
  { k: "serial", label: "Seri No" },
  { k: "model", label: "Cihaz Modeli" },
  { k: "user", label: "Kullanıcı" },
  { k: "userMail", label: "Kullanıcı E-posta", type: "email" },
  { k: "location", label: "Lokasyon" },
  { k: "installer", label: "Kuran Kişi" },
  { k: "notes", label: "Notlar", wide: true },
];

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (installer) => Object.fromEntries(FIELDS.map((f) => [f.k, f.k === "installDate" ? today() : f.k === "installer" ? installer || "" : ""]));

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function buildMailHtml(recs) {
  const head = ["Kurulum Tarihi", "Hostname", "Seri No", "Cihaz Modeli", "Kullanıcı", "Lokasyon", "Kuran Kişi"];
  const keys = ["installDate", "hostname", "serial", "model", "user", "location", "installer"];
  const body = recs
    .map((r) => `<tr>${keys.map((k) => `<td style="border:1px solid #ccc;padding:6px 8px;">${esc(r[k])}</td>`).join("")}</tr>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;">
    <p>Merhabalar,</p>
    <p>Aşağıdaki cihaz(lar)ın kurulumu tamamlanmış ve kullanıcı(lar)ına teslim edilmiştir:</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin:6px 0 14px;">
      <thead><tr style="background:#f0f0f0;">${head.map((h) => `<th style="border:1px solid #ccc;padding:6px 8px;text-align:left;">${h}</th>`).join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p>Cihaz zimmet ve envanter kayıtlarının güncellenmesi için bilginize sunulur.</p>
  </div>`;
}

export default function NewInstallScreen({ styles, pal, user, mailGroupsText, recordMailHistory, showToast }) {
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
    const subject = `Yeni Kurulum Bildirimi — ${targetRecs.length} cihaz`;
    setMailBusy(true);
    try {
      const r = await backendClient.sendMail({
        to,
        subject,
        text: `${targetRecs.length} cihazın kurulumu tamamlandı. Ayrıntı HTML gövdededir.`,
        html: buildMailHtml(targetRecs),
      });
      const ok = !!r.ok;
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
          {FIELDS.map((f) => (
            <div key={f.k} style={f.wide ? styles.formFieldWide : styles.formField}>
              <label style={styles.formLabel}>{f.label}</label>
              <input
                type={f.type || "text"}
                value={form[f.k]}
                onChange={(e) => setF(f.k, e.target.value)}
                style={inp}
                placeholder={f.k === "hostname" ? "THY-LAP-…" : f.k === "serial" ? "PF3…" : ""}
              />
            </div>
          ))}
          <div style={{ ...styles.formActions, gridColumn: "1 / -1" }}>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>
              {saving ? "Kaydediliyor…" : editingId ? "Güncelle" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>

      {/* KAYITLAR + AKSİYONLAR */}
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <div style={styles.settingsSectionHead}>
          <p style={styles.settingsSectionTitle}>Kayıtlar ({records.length})</p>
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
                      <td key={f.k} style={{ ...styles.td, fontSize: 12.5, whiteSpace: f.k === "notes" ? "normal" : "nowrap" }}>
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
