import { useEffect, useMemo, useState } from "react";
import { LIGHT_PALETTE } from "../theme/palette";
import { buildStyles } from "../theme/buildStyles";
import { backendClient } from "../services/backendClient";

// Kurumsal Login ekranı — gereksinim #6: THY logosu, Domain Name, Username, Password, Giriş Yap.
// Gerçek bir THY logo dosyası projede yok (bkz. konuşma) — marka görseli yeniden üretilmeden
// sade, stilize bir "THY" rozeti kullanılıyor; gerçek logo eklenmek istenirse buradaki
// <div style={styles.loginLogoMark}> bloğu bir <img> ile değiştirilebilir.
export default function LoginScreen({ onLoginSuccess }) {
  const pal = LIGHT_PALETTE;
  const styles = useMemo(() => buildStyles(pal), []);

  const [domain, setDomain] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Domain kaynak kodda hard-code edilmez — Ayarlar > Kimlik Doğrulama'da tanımlı varsayılan
  // domain buradan çekilir (gereksinim #6.1). Kullanıcı yine de alanı değiştirebilir.
  useEffect(() => {
    backendClient
      .getAuthDomain()
      .then((res) => setDomain((prev) => prev || res.defaultDomain || ""))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await backendClient.login({ domain: domain.trim(), username: username.trim(), password });
      onLoginSuccess(res);
    } catch (err) {
      // Gereksinim #9: hata mesajı genel/anlaşılır olmalı, şifre asla bu mesaja dahil edilmez
      setError(err.message || "Kullanıcı adı, şifre veya domain hatalı");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ ...styles.body, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...styles.panel, padding: "40px 36px", width: "min(400px, 100%)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: pal.accentGrad,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: "0.02em",
              boxShadow: pal.shadow,
            }}
          >
            THY
          </div>
          <p style={{ ...styles.pageTitle, fontSize: 21, textAlign: "center" }}>Varlık Takip</p>
          <p style={{ ...styles.pageSub, textAlign: "center" }}>Devam etmek için kurumsal bilgilerinizle giriş yapın</p>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Domain Name</label>
            <input
              type="text"
              placeholder="DOMAIN"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              style={styles.formInput}
            />
          </div>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Username</label>
            <input
              type="text"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.formInput}
            />
          </div>
          <div style={styles.formField}>
            <label style={styles.formLabel}>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.formInput}
            />
          </div>
          {error && <p style={{ ...styles.formHelper, color: pal.bad, margin: 0 }}>{error}</p>}
          <button
            type="submit"
            style={{ ...styles.btnPrimary, justifyContent: "center", padding: "11px 16px", fontSize: 14.5, marginTop: 4 }}
            disabled={loading || !username.trim() || !password}
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </div>
    </div>
  );
}
