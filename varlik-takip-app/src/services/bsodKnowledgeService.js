// LAKESIDE "BSOD" raporu için gömülü çözüm bilgi tabanı (madde: kullanıcı isteği).
//
// Amaç: BSOD (mavi ekran) raporundaki her "stop code" için, IT ekibinin ayrıca araştırma
// yapmadan lokasyona/kullanıcıya gönderebileceği; olası neden + sıralı çözüm adımlarını
// içeren bir metin üretmek. İçerik **Lenovo ThinkPad + kurumsal Windows imajı** senaryosuna
// göre uyarlanmıştır (Intel Wi-Fi/ME firmware, ThinkPad dock, Modern Standby, VBS/Credential
// Guard, Lenovo System Update / Commercial Vantage vb.).
//
// Kaynaklar (araştırma): Microsoft Learn "Bug Check Code Reference", Lenovo Support/Forums,
// yaygın alan deneyimi. Bkz. konuşma — kullanıcı örnek stop code listesi iletti.

const norm = (v) => String(v ?? "").trim().toUpperCase();

// Bazı raporlarda kod sonuna "_M" (minidump) eklenir; "0x..." ondalık/başında sıfır farkları olur.
function canonicalName(raw) {
  let s = norm(raw)
    .replace(/^BSOD\s*:?\s*/i, "")
    .replace(/[()]/g, "")
    .trim();
  // "SYSTEM_THREAD_EXCEPTION_NOT_HANDLED_M" -> "..._NOT_HANDLED"
  s = s.replace(/_M$/, "");
  return s;
}

// Hex kod -> sembolik ad. Rapor bazen sadece "0x00000139" yazıyor.
const HEX_TO_NAME = {
  "0X0000000A": "IRQL_NOT_LESS_OR_EQUAL",
  "0XA": "IRQL_NOT_LESS_OR_EQUAL",
  "0X0000001E": "KMODE_EXCEPTION_NOT_HANDLED",
  "0X00000020": "HYPERVISOR_ERROR", // 0x20001 kısaltması olarak da görülür
  "0X00020001": "HYPERVISOR_ERROR",
  "0X0000003B": "SYSTEM_SERVICE_EXCEPTION",
  "0X0000007E": "SYSTEM_THREAD_EXCEPTION_NOT_HANDLED",
  "0X0000009F": "DRIVER_POWER_STATE_FAILURE",
  "0X000000A0": "INTERNAL_POWER_ERROR",
  "0X000000D1": "DRIVER_IRQL_NOT_LESS_OR_EQUAL",
  "0X000000EF": "CRITICAL_PROCESS_DIED",
  "0X000000F4": "CRITICAL_OBJECT_TERMINATION",
  "0X00000109": "CRITICAL_STRUCTURE_CORRUPTION",
  "0X0000010E": "VIDEO_MEMORY_MANAGEMENT_INTERNAL",
  "0X00000116": "VIDEO_TDR_FAILURE",
  "0X00000124": "WHEA_UNCORRECTABLE_ERROR",
  "0X0000012B": "FAULTY_HARDWARE_CORRUPTED_PAGE",
  "0X00000133": "DPC_WATCHDOG_VIOLATION",
  "0X00000139": "KERNEL_SECURITY_CHECK_FAILURE",
  "0X0000013A": "KERNEL_MODE_HEAP_CORRUPTION",
  "0X0000014F": "PDC_WATCHDOG_TIMEOUT",
  "0X0000019C": "WIN32K_POWER_WATCHDOG_TIMEOUT",
};

// Kısa ThinkPad/kurumsal ortak adımlar — birçok kayıtta tekrar ettiği için parça parça.
const FW = "Lenovo System Update / Commercial Vantage ile BIOS/UEFI ve Intel Management Engine (ME) firmware'ini en güncel sürüme çıkarın.";
const DRV = "Lenovo Support'tan (makine seri no ile) yonga seti (chipset), Intel Wi-Fi/Bluetooth, ekran kartı ve depolama sürücülerini güncelleyin.";
const SFC = "Yönetici CMD: `DISM /Online /Cleanup-Image /RestoreHealth` ardından `sfc /scannow` çalıştırın (kurumsal imajda bozulan sistem dosyalarını onarır).";
const DUMP = "C:\\Windows\\Minidump altındaki .dmp dosyasını BlueScreenView/WhoCrashed ile açıp kusurlu sürücüyü (.sys) tespit edin — hedefli güncelleme/geri alma için.";
const MEM = "Windows Bellek Tanılama veya MemTest86 ile RAM testi yapın (birden fazla tur).";
const DOCK = "ThinkPad dock kullanılıyorsa: dock firmware'ini güncelleyin, docku çıkarıp deneyin, USB-C/Thunderbolt sürücüsünü güncelleyin.";
const VERIFIER = "Tekrarlıyorsa Driver Verifier (`verifier /standard /all` — tek gecelik) ile kusurlu 3. parti sürücüyü ortaya çıkarın, sonra `verifier /reset`.";

// Ana bilgi tabanı — anahtar: sembolik ad (canonicalName çıktısı).
export const BSOD_KB = {
  VIDEO_TDR_FAILURE: {
    code: "0x00000116",
    title: "Ekran kartı sürücüsü yanıt vermeyi durdurdu (TDR) ve kurtarılamadı",
    category: "GPU sürücüsü",
    severity: "orta",
    cause:
      "Windows, ekran kartı sürücüsünün donduğunu algılayıp sıfırlamayı denedi ancak başaramadı. ThinkPad'lerde neredeyse her zaman Intel (igdkmd64.sys) veya NVIDIA (nvlddmkm.sys) ekran sürücüsünün eski/hatalı sürümüdür; kurumsal imaj çoğu zaman GPU sürücüsünü sabit eski bir sürüme kilitler.",
    thinkpad:
      "Harici monitör/dock veya DisplayLink varsa tetikleyici odur. 'Donanım hızlandırmalı GPU zamanlaması' (HAGS) bazı Intel sürücü sürümleriyle bu hatayı üretir.",
    actions: [
      "Aygıt Yöneticisi > Görüntü bağdaştırıcıları > Intel/NVIDIA > sürücüyü güncelleyin (Lenovo veya üretici WHQL sürümü).",
      "Hata bir güncellemeden SONRA başladıysa 'Sürücüyü Geri Al' ile önceki sürüme dönün.",
      "Ayarlar > Ekran > Grafik > 'Donanım hızlandırmalı GPU zamanlaması' kapatın, yeniden başlatın.",
      DOCK,
      FW,
    ],
  },
  VIDEO_MEMORY_MANAGEMENT_INTERNAL: {
    code: "0x0000010E",
    title: "Ekran kartı sürücüsünün video bellek yöneticisi kritik hata verdi",
    category: "GPU sürücüsü",
    severity: "orta",
    cause: "dxgkrnl/GPU sürücüsü video belleğini yönetirken tutarsız duruma düştü. Sebep VIDEO_TDR_FAILURE ile aynıdır: hatalı/eski Intel veya NVIDIA ekran sürücüsü.",
    thinkpad: "Belirli bir Intel/NVIDIA sürücü derlemesi 'bilinen hatalı' olabilir; Lenovo'nun o model için önerdiği sürüme sabitleyin.",
    actions: [
      "Ekran sürücüsünü Lenovo'nun önerdiği sürüme güncelleyin; olmazsa bir önceki sürüme geri alın.",
      "DDU (Display Driver Uninstaller) ile temiz kaldırıp yeniden kurun (kurumsal imajda kalıntı sürücü sık sorun).",
      "'Donanım hızlandırmalı GPU zamanlaması'nı kapatıp test edin.",
      FW,
    ],
  },
  SYSTEM_SERVICE_EXCEPTION: {
    code: "0x0000003B",
    title: "Bir sistem servisi rutininde işlenmeyen özel durum",
    category: "3. parti sürücü / yazılım",
    severity: "orta",
    cause:
      "Çekirdek modunda çalışan bir bileşen (çoğunlukla 3. parti sürücü) beklenmeyen bir istisna üretti. Tipik kaynaklar: ekran/ses (Realtek/Conexant) sürücüsü, VPN istemcisi, uç nokta güvenlik ajanı (EDR/AV), disk filtre sürücüleri.",
    thinkpad: "Kurumsal imajdaki güvenlik ajanı (CrowdStrike/SentinelOne/Defender ATP) veya VPN (GlobalProtect/AnyConnect) sürücüsü eski sürümdeyse sık görülür.",
    actions: [
      DUMP,
      "Dökümde suçlanan .sys'e göre: ekran/ses/ağ sürücüsünü ya da güvenlik/VPN ajanını güncelleyin.",
      SFC,
      DRV,
      VERIFIER,
    ],
  },
  SYSTEM_THREAD_EXCEPTION_NOT_HANDLED: {
    code: "0x0000007E",
    title: "Sistem iş parçacığı, işlenmeyen bir özel durum üretti",
    category: "3. parti sürücü",
    severity: "orta",
    cause: "Bir sistem iş parçacığı istisna üretti ve sürücü bunu yakalamadı. Mavi ekranda genelde kusurlu dosya adı yazar (ör. nvlddmkm.sys, Netwtw*.sys, igdkmd64.sys).",
    thinkpad: "En sık: Intel Wi-Fi (Netwtw04/06/08/10.sys) ve ekran sürücüsü. Ekranda dosya adı görünmüyorsa minidump'a bakın.",
    actions: [
      "Mavi ekranda / minidump'ta adı geçen .sys sürücüsünü tespit edin.",
      "O sürücüyü güncelleyin; güncelleme sonrası başladıysa geri alın.",
      DRV,
      SFC,
    ],
  },
  IRQL_NOT_LESS_OR_EQUAL: {
    code: "0x0000000A",
    title: "Bir sürücü, yüksek IRQL seviyesinde geçersiz bellek adresine erişti",
    category: "3. parti sürücü / RAM",
    severity: "orta",
    cause: "Klasik hatalı sürücü ya da bozuk RAM belirtisi. ThinkPad'lerde sıklıkla Intel Wi-Fi/Bluetooth, dock veya yonga seti sürücüsü.",
    thinkpad: "Yeni bir dock/adaptör veya USB cihazından sonra başladıysa onu çıkarıp test edin.",
    actions: [DUMP, DRV, MEM, VERIFIER, FW],
  },
  DRIVER_IRQL_NOT_LESS_OR_EQUAL: {
    code: "0x000000D1",
    title: "Adı belirtilen sürücü, yüksek IRQL'de geçersiz bellek adresine erişti",
    category: "3. parti sürücü (adı dökümde)",
    severity: "orta",
    cause: "IRQL_NOT_LESS_OR_EQUAL ile aynı, ancak kusurlu sürücü dökümde isimlendirilir (ör. ndis.sys/tcpip.sys → ağ, Netwtw*.sys → Intel Wi-Fi, rt*.sys → Realtek).",
    thinkpad: "ThinkPad filosunda en sık suçlu Intel Wi-Fi sürücüsü ve kurumsal VPN istemcisidir.",
    actions: [
      DUMP,
      "Adı geçen sürücü ağ ile ilgiliyse: Intel Wi-Fi/Ethernet ve VPN istemcisini güncelleyin; değilse ilgili aygıt sürücüsünü güncelleyin.",
      "Geçici çözüm: Aygıt Yöneticisi'nde ilgili adaptör > Güç Yönetimi > 'Bilgisayarın bu aygıtı kapatmasına izin ver' işaretini kaldırın.",
      DRV,
    ],
  },
  WHEA_UNCORRECTABLE_ERROR: {
    code: "0x00000124",
    title: "Donanımın bildirdiği, düzeltilemeyen hata (WHEA)",
    category: "Donanım / firmware",
    severity: "yüksek",
    cause: "İşlemci, önbellek, PCIe, RAM veya ısıl bir sorun donanım seviyesinde 'düzeltilemez hata' bildirdi. Yazılım değil, fiziksel/firmware kaynaklıdır.",
    thinkpad: "ThinkPad'lerde çoğu zaman BIOS/UEFI + Intel ME firmware güncellemesiyle çözülür (Lenovo bu hata için birçok BIOS düzeltmesi yayımladı). Aşırı ısınma, şişmiş batarya veya zayıf güç adaptörü de tetikler.",
    actions: [
      FW,
      "Havalandırmayı/fanı temizleyin, ısıl macun/termal durumu kontrol edin; cihazı dock'suz, orijinal şarj cihazıyla test edin.",
      "Batarya sağlığını kontrol edin (Commercial Vantage). Şişme/aşırı yıpranma varsa değiştirin.",
      MEM,
      "Firmware güncel + ısıl sorun yokken hata sürüyorsa: Lenovo Diagnostics (UEFI) donanım testi çalıştırın, arızalı parça/anakart için servise yönlendirin.",
    ],
  },
  FAULTY_HARDWARE_CORRUPTED_PAGE: {
    code: "0x0000012B",
    title: "Tek bitlik bir bellek hatası bir bellek sayfasını bozdu",
    category: "Donanım (RAM)",
    severity: "yüksek",
    cause: "Fiziksel bellekte (RAM) tek bit hatası tespit edildi. Genellikle arızalı/yanlış oturmuş RAM; nadiren depolama veya sürücü.",
    thinkpad: "RAM soketliyse yeniden oturtun/değiştirin. Lehimli RAM'li ThinkPad modellerinde (X1, bazı T serileri) anakart RMA gerekir.",
    actions: [
      MEM,
      "RAM soketliyse modülleri yeniden oturtun; iki modül varsa teker teker test edin.",
      FW,
      "Hata tek bir modülde sabitse o modülü değiştirin; lehimli RAM ise servise yönlendirin.",
    ],
  },
  DRIVER_POWER_STATE_FAILURE: {
    code: "0x0000009F",
    title: "Bir sürücü, güç durumu geçişini (uyku/uyanma) zamanında tamamlamadı",
    category: "Güç yönetimi / sürücü",
    severity: "orta",
    cause: "Uyku, uyanma veya kapanma sırasında bir aygıt sürücüsü güç geçişine takıldı. ThinkPad'lerde en sık: Thunderbolt/USB-C dock, Intel Wi-Fi, NVMe/depolama ve Intel Rapid Storage (RST).",
    thinkpad: "Dock takılıyken uyku/uyanmada oluyorsa neredeyse kesin dock firmware/Thunderbolt sürücüsüdür.",
    actions: [
      DOCK,
      "Intel Wi-Fi, NVMe/SSD ve Intel RST sürücülerini güncelleyin.",
      "Geçici: sorunlu adaptörde Güç Yönetimi > 'Bilgisayarın bu aygıtı kapatmasına izin ver' kapatın.",
      DUMP,
      FW,
    ],
  },
  INTERNAL_POWER_ERROR: {
    code: "0x000000A0",
    title: "Güç ilkesi yöneticisi kritik hata verdi",
    category: "Güç yönetimi",
    severity: "orta",
    cause: "Genellikle uyku/hazırda bekletme/kapatma sırasında; sıklıkla GPU sürücüsü + Modern Standby etkileşimi veya bozuk hiberfil.sys.",
    thinkpad: "Kurumsal imaj Modern Standby (S0) kullanıyorsa GPU/chipset/ME sürücü sürümlerine çok duyarlıdır.",
    actions: [
      "Yönetici CMD: `powercfg /h off` → yeniden başlat → `powercfg /h on` (hiberfil'i yeniden oluşturur).",
      "Ekran kartı + yonga seti + Intel ME sürücülerini güncelleyin.",
      FW,
      "Sorun yalnızca Modern Standby ile oluşuyorsa, Lenovo o model için S3 uykuyu destekliyorsa imaj ekibiyle S3'e geçmeyi değerlendirin.",
    ],
  },
  HYPERVISOR_ERROR: {
    code: "0x00020001",
    title: "Hiper yönetici (Hyper-V / VBS / Credential Guard) kritik hata verdi",
    category: "Sanallaştırma / firmware",
    severity: "yüksek",
    cause: "Windows hiper yöneticisi ölümcül bir hata ile durdu. Genellikle BIOS sanallaştırma/firmware hatası veya işlemci sorunu; VBS (Virtualization-Based Security) / Credential Guard açıkken belirginleşir.",
    thinkpad: "Lenovo, VBS/Credential Guard ile HYPERVISOR_ERROR için birden çok BIOS düzeltmesi yayımladı. VT-x/VT-d BIOS'ta tutarlı biçimde açık olmalı.",
    actions: [
      FW,
      "BIOS'ta Intel VT-x ve VT-d açık ve tutarlı olsun; 'Kernel DMA Protection' ve güvenlik ayarlarını imaj standardına göre kontrol edin.",
      "Windows'u en güncel kümülatif güncellemeye getirin.",
      "VBS/Credential Guard'ı kurumsal imajda GÜVENLİK EKİBİ ONAYI olmadan kapatmayın; sorunu BIOS güncellemesiyle çözün.",
    ],
  },
  DPC_WATCHDOG_VIOLATION: {
    code: "0x00000133",
    title: "Bir DPC çok uzun sürdü / kesme fırtınası (watchdog)",
    category: "Sürücü / firmware",
    severity: "orta",
    cause: "Bir aygıt sürücüsü kesme seviyesinde çok uzun kaldı. Klasik olarak eski SSD firmware'i veya storahci/iaStorAC uyuşmazlığı; ayrıca yonga seti/USB/ağ sürücüleri.",
    thinkpad: "SSD firmware'ini güncelleyin (Samsung Magician / WD Dashboard / Lenovo). Depolama denetleyicisi sürücüsü kurumsal imajda eskiyse güncel Intel RST ya da inbox 'storahci'ye geçin.",
    actions: [
      "SSD/NVMe firmware'ini güncelleyin.",
      "Yonga seti, USB ve Thunderbolt sürücülerini güncelleyin.",
      FW,
      DUMP,
    ],
  },
  KERNEL_SECURITY_CHECK_FAILURE: {
    code: "0x00000139",
    title: "Bir çekirdek veri yapısı bütünlük kontrolünden geçemedi",
    category: "Sürücü / bellek / sistem dosyası",
    severity: "orta",
    cause: "Windows, çekirdek bir veri yapısının bozulduğunu tespit etti. Sebep genellikle hatalı bir sürücü, bozuk sistem dosyaları veya RAM.",
    thinkpad: "Son eklenen düşük seviyeli yazılım (disk araçları, filtre sürücüleri, eski VPN/AV) sık suçludur; kurumsal imaj güncellemesi sonrası da görülebilir.",
    actions: [SFC, DRV, "Son yüklenen düşük seviyeli yazılımı (disk/şifreleme/AV/VPN) kaldırıp test edin.", MEM, FW],
  },
  KERNEL_MODE_HEAP_CORRUPTION: {
    code: "0x0000013A",
    title: "Çekirdek modu yığın (heap) bozulması tespit edildi",
    category: "3. parti sürücü",
    severity: "orta",
    cause: "Çekirdek bellek yığını bozuldu — neredeyse her zaman sınır dışına yazan bir 3. parti sürücü. Tipik kaynaklar: eski depolama/RAID, VPN, güvenlik filtre sürücüleri, sanal ses sürücüleri.",
    thinkpad: "Kurumsal imajdaki eski depolama denetleyicisi veya güvenlik ajanı filtre sürücüsü sık sebeptir.",
    actions: [VERIFIER, DUMP, "Tespit edilen sürücüyü güncelleyin ya da (gerekmiyorsa) kaldırın.", DRV, MEM],
  },
  CRITICAL_PROCESS_DIED: {
    code: "0x000000EF",
    title: "Zorunlu bir sistem süreci beklenmedik şekilde sonlandı",
    category: "Sistem dosyası / disk / güncelleme",
    severity: "yüksek",
    cause: "Windows'un çalışması için gerekli bir süreç (ör. csrss.exe, wininit.exe) çöktü. Sebep: bozuk sistem dosyaları, hatalı bir güncelleme ya da zayıflayan disk.",
    thinkpad: "İmajlanmış cihazlarda genellikle bozuk bileşen deposu veya sorunlu bir kalite güncellemesidir; disk SMART değerlerini de kontrol edin.",
    actions: [
      SFC,
      "Yönetici CMD: `chkdsk C: /scan`; SSD SMART/sağlık durumunu (Commercial Vantage) kontrol edin.",
      "Son yüklenen Windows kalite/özellik güncellemesini kaldırıp test edin (Ayarlar > Windows Update > Güncelleştirme geçmişi).",
      "Sorun sürüyorsa cihazı standart imaj ile yeniden kurun.",
    ],
  },
  CRITICAL_OBJECT_TERMINATION: {
    code: "0x000000F4",
    title: "Kritik bir sistem nesnesi/süreci sonlandı",
    category: "Disk / sistem dosyası",
    severity: "yüksek",
    cause: "CRITICAL_PROCESS_DIED ile benzer; çoğunlukla depolama erişimi kesildiği (SSD/NVMe bağlantısı, kablo, firmware) veya sistem dosyaları bozulduğu için.",
    thinkpad: "NVMe SSD firmware + Intel RST/NVMe sürücüsünü güncelleyin; SSD sağlığını kontrol edin.",
    actions: ["SSD/NVMe firmware ve sürücüsünü güncelleyin, SMART/sağlık kontrolü yapın.", SFC, "`chkdsk C: /scan` çalıştırın.", FW],
  },
  CRITICAL_STRUCTURE_CORRUPTION: {
    code: "0x00000109",
    title: "Korunan bir çekirdek yapısı izinsiz değiştirildi",
    category: "Sürücü / RAM / (nadiren) kötü amaçlı yazılım",
    severity: "yüksek",
    cause: "Kernel Patch Protection, korunan bir yapının bozulduğunu gördü. Hatalı sürücü, bozuk RAM ya da uyumsuz düşük seviyeli yazılım.",
    thinkpad: "Eski sanal sürücüler (VPN, sanal makine, disk şifreleme) ve RAM en olası sebepler.",
    actions: [MEM, DRV, "Düşük seviyeli 3. parti yazılımları (VPN/şifreleme/sanallaştırma) güncelleyin veya kaldırın.", SFC, FW],
  },
  KMODE_EXCEPTION_NOT_HANDLED: {
    code: "0x0000001E",
    title: "Çekirdek modu programı işlenmeyen bir özel durum üretti",
    category: "3. parti sürücü",
    severity: "orta",
    cause: "Bir çekirdek modu bileşeni yakalanmayan bir istisna üretti; genellikle hatalı/eski sürücü, bazen RAM.",
    thinkpad: "Mavi ekranda genelde kusurlu .sys adı görünür; görünmüyorsa minidump'a bakın.",
    actions: [DUMP, DRV, MEM, VERIFIER],
  },
  PDC_WATCHDOG_TIMEOUT: {
    code: "0x0000014F",
    title: "Bir bileşen yanıt vermediği için sistem Modern Standby'den çıkamadı",
    category: "Güç yönetimi (Modern Standby)",
    severity: "orta",
    cause: "Power Dependency Coordinator (Modern Standby), bir bileşenin ayrılan sürede yanıt vermediğini gördü. Genellikle S0 düşük güç yolundaki bir sürücü (Wi-Fi, depolama, GPU, yonga seti).",
    thinkpad: "Kurumsal imaj Modern Standby kullanıyorsa: Wi-Fi, depolama, yonga seti ve Intel ME sürücüleri + BIOS güncel olmalı.",
    actions: [
      DRV,
      FW,
      DUMP,
      "Lenovo o model için S3 uyku destekliyorsa, sorun devam ederse imaj ekibiyle S3'e geçişi değerlendirin.",
    ],
  },
  WIN32K_POWER_WATCHDOG_TIMEOUT: {
    code: "0x0000019C",
    title: "Win32k, ekranı zamanında açamadı (uyanma sırasında)",
    category: "Güç yönetimi / ekran",
    severity: "orta",
    cause: "Sistem uyanırken Win32k bileşeni ekranı zamanında güç veremedi. Genellikle GPU/ekran sürücüsü veya güç geçiş yolundaki bir sürücü; nadiren fiziksel panel/kablo.",
    thinkpad: "Ekran sürücüsü + yonga seti + BIOS güncelleyin. Harici monitör/dock varsa onu çıkarıp test edin. Katlanabilir modelde panel şerit kablosu fiziksel olarak kontrol edilmeli.",
    actions: ["Ekran kartı ve yonga seti sürücülerini güncelleyin.", DOCK, FW, DUMP],
  },
};

// Kısa sembolik ad eşanlamlıları / kısaltmaları
const SYNONYMS = {
  SYSTEM_THREAD_EXCEPTION_NOT_HANDLED_M: "SYSTEM_THREAD_EXCEPTION_NOT_HANDLED",
  KERNEL_SECURITY_CHECK_FAILURE_M: "KERNEL_SECURITY_CHECK_FAILURE",
  BAD_POOL_CALLER: "KERNEL_MODE_HEAP_CORRUPTION", // yığın bozulmasıyla birlikte sık görülür
  BAD_POOL_HEADER: "KERNEL_MODE_HEAP_CORRUPTION",
};

// Bilinmeyen kod için genel şablon — uygulama hata vermez (madde 14 mantığı).
function genericEntry(rawLabel) {
  return {
    code: /^0X/i.test(rawLabel) ? rawLabel : "",
    title: `${rawLabel} — mavi ekran (stop code)`,
    category: "Genel",
    severity: "orta",
    cause:
      "Bu stop code için özel bir kayıt tanımlı değil. Mavi ekranların büyük çoğunluğu eski/hatalı bir aygıt sürücüsünden, bozuk sistem dosyalarından veya donanımdan (RAM/depolama/ısıl) kaynaklanır.",
    thinkpad: "ThinkPad + kurumsal imaj için standart yaklaşım: firmware + sürücü güncelle, sistem dosyalarını onar, RAM testi yap.",
    actions: [FW, DRV, SFC, DUMP, MEM],
  };
}

// Ham etiketi (ör. "BSOD :  VIDEO_TDR_FAILURE" veya "0x00000139") çözüp KB kaydı döndürür.
export function lookupBsod(rawLabel) {
  const label = canonicalName(rawLabel);
  let name = label;
  if (/^0X[0-9A-F]+$/i.test(label)) {
    // hex — baştaki sıfırları 8 haneye tamamla
    const hex = "0X" + label.slice(2).replace(/^0+/, "").padStart(8, "0");
    name = HEX_TO_NAME[hex] || HEX_TO_NAME[label] || label;
  }
  name = SYNONYMS[name] || name;
  const entry = BSOD_KB[name];
  return {
    key: name,
    raw: String(rawLabel || "").trim(),
    resolved: Boolean(entry),
    ...(entry || genericEntry(label)),
    name,
  };
}

// Raporda görülen tüm farklı stop code'lar için (varsa) kapsam bilgisi — Ayarlar/QA amaçlı.
export function bsodCoverage(labels = []) {
  const seen = new Map();
  labels.forEach((l) => {
    const e = lookupBsod(l);
    const cur = seen.get(e.key) || { key: e.key, resolved: e.resolved, count: 0 };
    cur.count += 1;
    seen.set(e.key, cur);
  });
  return [...seen.values()].sort((a, b) => b.count - a.count);
}

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SEV_COLOR = { orta: "#B4780A", "yüksek": "#B84A3E", kritik: "#7A1F16" };

// rows: BSOD raporundan cihaz bazlı kayıtlar. Esnek alan adları:
//   hostname/host/computer, user/kullanıcı, bsodCode/code/stopCode/bugcheck, date/timestamp/tarih, count/adet
function rowLabel(r) {
  return r.bsodCode || r.code || r.stopCode || r.bugcheck || r.bsod || r.stopKodu || "";
}
function rowHost(r) {
  return r.hostname || r.host || r.computer || r.computerName || r.cihaz || "";
}
function rowUser(r) {
  return r.user || r.username || r.kullanici || r.owner || "";
}
function rowWhen(r) {
  return r.date || r.timestamp || r.tarih || r.eventTime || "";
}

// Bir BSOD raporu satır kümesi için, çözüm önerileri GÖMÜLÜ e-posta gövdesi üretir.
export function buildBsodMailHtml(rows = [], { locationLabel = "" } = {}) {
  // stop code -> { entry, hits: [{host,user,when}] }
  const groups = new Map();
  rows.forEach((r) => {
    const e = lookupBsod(rowLabel(r));
    const g = groups.get(e.key) || { entry: e, hits: [] };
    const c = Math.max(1, Number(r.count || r.adet) || 1);
    for (let i = 0; i < c; i++) g.hits.push({ host: rowHost(r), user: rowUser(r), when: rowWhen(r) });
    groups.set(e.key, g);
  });
  const ordered = [...groups.values()].sort((a, b) => b.hits.length - a.hits.length);
  const totalHits = ordered.reduce((s, g) => s + g.hits.length, 0);
  const hostCount = new Set(rows.map(rowHost).filter(Boolean)).size;

  const blocks = ordered
    .map((g) => {
      const e = g.entry;
      const sev = SEV_COLOR[e.severity] || SEV_COLOR.orta;
      const hostList = [...new Set(g.hits.map((h) => h.host).filter(Boolean))];
      const steps = e.actions.map((a) => `<li style="margin:3px 0;">${esc(a)}</li>`).join("");
      return `
      <div style="border:1px solid #ddd;border-left:4px solid ${sev};border-radius:6px;padding:12px 14px;margin:12px 0;">
        <div style="font-size:15px;font-weight:700;">${esc(e.name)}${e.code ? ` <span style="color:#888;font-weight:400;">(${esc(e.code)})</span>` : ""}
          <span style="float:right;font-weight:400;color:${sev};">${g.hits.length} olay${hostList.length ? ` · ${hostList.length} cihaz` : ""}</span>
        </div>
        <div style="font-size:13px;color:#333;margin:4px 0 8px;">${esc(e.title)}</div>
        <div style="font-size:13px;margin:6px 0;"><strong>Olası neden:</strong> ${esc(e.cause)}</div>
        <div style="font-size:13px;margin:6px 0;"><strong>ThinkPad / kurumsal imaj notu:</strong> ${esc(e.thinkpad)}</div>
        <div style="font-size:13px;margin:6px 0 2px;"><strong>Önerilen adımlar (sırayla):</strong></div>
        <ol style="font-size:13px;margin:2px 0 0;padding-left:20px;">${steps}</ol>
        ${hostList.length ? `<div style="font-size:12px;color:#666;margin-top:8px;">Etkilenen cihazlar: ${esc(hostList.join(", "))}</div>` : ""}
        ${e.resolved ? "" : `<div style="font-size:12px;color:#B4780A;margin-top:6px;">Not: bu stop code için özel kayıt yok, genel yaklaşım verildi.</div>`}
      </div>`;
    })
    .join("");

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;">
    <p>Merhabalar,</p>
    <p>${locationLabel ? `<strong>${esc(locationLabel)}</strong> lokasyonunda ` : ""}LakeSide BSOD raporunda <strong>${totalHits}</strong> mavi ekran olayı${hostCount ? ` (<strong>${hostCount}</strong> cihaz)` : ""} tespit edildi. Aşağıda her hata tipi için olası neden ve ThinkPad + kurumsal Windows imajımıza göre uygulanması gereken çözüm adımları yer alıyor.</p>
    <p style="font-size:13px;color:#555;">Genel ön koşul: cihazlarda <strong>Lenovo Commercial Vantage / System Update</strong> ile <strong>BIOS/UEFI + Intel ME firmware + tüm sürücüler</strong> güncellenmeli. Tekrarlayan cihazlarda <code>C:\\Windows\\Minidump</code> dökümleri toplanıp IT'ye iletilmeli.</p>
    ${blocks}
    <p style="font-size:13px;color:#555;">Adımlar uygulandıktan sonra tekrar mavi ekran alan cihazların listesini ve minidump dosyalarını tarafımıza iletmenizi rica ederiz.</p>
  </div>`;
}

export function bsodMailSubject(rows = []) {
  const n = new Set(rows.map(rowHost).filter(Boolean)).size;
  return n ? `LakeSide BSOD — ${n} cihaz için neden ve çözüm adımları` : "LakeSide BSOD — neden ve çözüm adımları";
}
