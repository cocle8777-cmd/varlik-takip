// Açık tema — önceki sürümde bg (#F5F5F3) ile panel (yarı saydam %70 beyaz)
// neredeyse aynı tonda olduğu için kartlar sayfadan hiç ayrışmıyor, gölgeler
// görünmeyecek kadar hafifti ("sönük" görünüm şikayeti — bkz. konuşma). Aynı
// sıcak/turuncu kimlik korunarak: zemin biraz daha koyu/sıcak, kartlar tam
// opak beyaz (gerçekten "kalkıyor"), aksan daha doygun, gölgeler katmanlı ve
// belirgin hale getirildi.
export const LIGHT_PALETTE = {
  bg: "#F2EADD",
  bgGradient: "radial-gradient(1200px 600px at 15% -10%, #FBF3E6 0%, transparent 60%)",
  panel: "#FFFFFF",
  panelSolid: "#FFFFFF",
  line: "rgba(37,27,16,0.10)",
  ink: "#221A10",
  inkSoft: "#8C7C69",
  accent: "#D9631F",
  accentGrad: "linear-gradient(135deg, #D9631F, #F4A052)",
  accentSoft: "rgba(217,99,31,0.12)",
  accentSoftStrong: "rgba(217,99,31,0.09)",
  ok: "#2E8B57",
  okBg: "rgba(46,139,87,0.11)",
  bad: "#D6483C",
  badBg: "rgba(214,72,60,0.10)",
  neutralFg: "#8C7C69",
  neutralBg: "rgba(37,27,16,0.06)",
  neutralDot: "#DED2C1",
  fieldBg: "rgba(37,27,16,0.05)",
  white: "#FFFFFF",
  overlay: "rgba(30,21,12,0.45)",
  toastBg: "#221A10",
  toastFg: "#fff",
  shadow: "0 1px 2px rgba(37,27,16,0.05), 0 10px 26px rgba(37,27,16,0.09)",
  modalShadow: "0 24px 60px rgba(30,21,12,0.35)",
  fieldBorder: "1px solid rgba(37,27,16,0.13)",
  scrollbarThumb: "rgba(37,27,16,0.2)",
  warnFg: "#C67C0A",
  warnBg: "rgba(198,124,10,0.11)",
};

// Koyu tema — aynı "sönük" sorunu buradaydı: panel (%70 saydam, rgba(40,40,37,.7))
// zeminle (#1A1A18) neredeyse aynı tona karışıyor, gölge yok denecek kadar hafifti.
// Koyu temada derinlik gölgeden çok "kat açıklığından" gelir, o yüzden panel artık
// zeminden belirgin şekilde açık ve tam opak; aksan/durum renkleri de koyu zeminde
// daha iyi okunsun diye biraz daha doygun. Aksan tonu açık temayla aynı aile
// (turuncu) — marka kimliği iki temada da tutarlı.
export const DARK_PALETTE = {
  bg: "#181410",
  bgGradient: "radial-gradient(1200px 600px at 15% -10%, rgba(239,143,63,0.10) 0%, transparent 60%)",
  panel: "#26201A",
  panelSolid: "#26201A",
  line: "rgba(255,247,238,0.10)",
  ink: "#F5EFE6",
  inkSoft: "#B0A493",
  accent: "#EF8F3F",
  accentGrad: "linear-gradient(135deg, #EF8F3F, #D9631F)",
  accentSoft: "rgba(239,143,63,0.18)",
  accentSoftStrong: "rgba(239,143,63,0.14)",
  ok: "#4FD38A",
  okBg: "rgba(79,211,138,0.16)",
  bad: "#F0685C",
  badBg: "rgba(240,104,92,0.16)",
  neutralFg: "#B0A493",
  neutralBg: "rgba(255,247,238,0.08)",
  neutralDot: "#6B5F50",
  fieldBg: "rgba(255,247,238,0.07)",
  white: "#302A22",
  overlay: "rgba(10,7,4,0.65)",
  toastBg: "#F5EFE6",
  toastFg: "#181410",
  shadow: "0 1px 2px rgba(0,0,0,0.3), 0 12px 30px rgba(0,0,0,0.45)",
  modalShadow: "0 24px 70px rgba(0,0,0,0.65)",
  fieldBorder: "1px solid rgba(255,247,238,0.14)",
  scrollbarThumb: "rgba(255,247,238,0.22)",
  warnFg: "#F0AC4E",
  warnBg: "rgba(240,172,78,0.16)",
};
