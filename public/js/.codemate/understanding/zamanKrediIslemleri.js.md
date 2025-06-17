# Zaman Bazlı Kredi Tablosu Yönetimi (zamanKrediIslemleri.js) - Yüksek Seviyeli Dokümantasyon

Bu script, nöbet (örneğin sağlık/iş nöbeti) gibi uygulamalarda vardiyalara (zaman aralıklarına) özel kredi bilgilerini tablo üzerinde yönetmek için ön uçta (Javascript ile) kullanılan fonksiyonları içerir. Temel işlevler arayüzde kullanıcı etkileşimlerini, validasyonu ve zaman bazlı kredi bilgilerinin sunucu ile entegrasyonunu yönetir.

---

## Temel Fonksiyonlar ve Amaçları

### 1. Tablo Buton ve Kontrollerini Güncelleme (`updateTimeRowControls`)
- Tablodaki mevcut zaman aralıklarına göre, satır ekle ve sil butonlarının aktiflik/durumunu günceller.
- Örneğin; sadece bir satır kaldığında silme butonunu gizler ve devre dışı bırakır, iki satır varsa sadece ikinci satırın silinebilmesine izin verir.
- "Ekle" butonunu, maksimum 2 satır kuralına göre etkin/pasif hale getirir.

### 2. Yeni Zaman Satırı Ekleme (`addNewTimeRow`)
- "Ekle" butonuna basıldığında, tabloya yeni (boş veya varsayılan dolu) bir satır ekler.
- Satır varsayılan zamanlarını önceki satırlara göre ayarlar (ör: ikinci satır ekleniyorsa başladığı zamanı, ilk satırın bitişinden başlatır).
- Maksimum 2 satır limiti uygular.
- Yeni satırda kredi ve saat aralığı giriş alanları ile "sil" butonu bulunur.

### 3. Zaman Satırını Silme (`removeTimeRow`)
- Bir zaman aralığı satırını kullanıcı tarafından silmek için kullanılır.
- Sildikten sonra tek satır kalmışsa, kalan satırı tüm günü kapsayacak şekilde saatlerini otomatik olarak 00:00 - 23:59 olarak ayarlar.
- Tüm satırlar silinirse, tabloya "veri yok" mesajı ekler.

### 4. Zaman Kredi Tablosunu API'den Doldurma (`zamanKrediTablosunuDoldur`)
- Sunucudan (API'den) mevcut zaman bazlı kredit bilgilerini çeker.
- Gelen verilerle tabloyu oluşturur ve uygun şekilde buton ve kontrolleri ayarlar.
- Hata durumunda kullanıcıya bilgilendirme mesajları gösterir.

### 5. Tabloyu Kaydetme (`kredileriKaydet`)
- Kullanıcının tablo üzerindeki değişikliklerini API’ye göndererek kaydeder.
- Tüm satırlardaki alanların (kredi, başlama/bitiş saatleri) doğruluğunu kontrol eder (alanlar boş olamaz, kredi değeri negatif olamaz).
- Hiç satır yoksa veya hatalı giriş varsa kullanıcıyı uyarır.
- Başarılı kayıttan sonra tabloyu yeniler.

---

## Genel Özellikler

- Maksimum iki zaman aralığı/vardiya yönetilir.
- Her vardiya, "kredi" dakikası ve başlama-bitiş saatlerinden oluşur.
- Kredi aralıkları boş/hatalı girilmişse kayda izin verilmez.
- Silme işlemlerinde ve tablo boşken kullanıcıya anlamlı mesajlar gösterilir.
- Yetkilendirme, API çağrılarında localStorage’daki JWT Token ile sağlanır.
- Zaman aralıkları ve kredi bilgileri bir dizi obje şeklinde sunucuya gönderilir.

---

## Kısmi Kullanıcı Arayüzü Akışı

1. **Tablo API’den yüklenir**
2. Kullanıcı yeni aralık ekleyebilir (max. 2 satır)
3. Satırları düzenleyebilir veya kaldırabilir
4. Tüm değişiklikleri "Kaydet"le sunucuya gönderebilir
5. Tablo güncel verilerle tekrar yüklenir

---

## Hedeflenen Kullanıcılar

- Vardiyalı sistem kullanan kurumlar (ör. hastane, fabrika)
- Zaman dilimi bazlı özel kredi/puan yönetimi ihtiyacı olan uygulamalar

---

## Notlar

- Fonksiyonlar, "zaman kredi tablosunda" sadece belirli kullanım senaryolarına izin vermek üzere sınırlandırılmıştır (örn. max iki vardiya).
- Yeni fonksiyonlar veya validation eklenmek istenirse fonksiyonlar, mevcut DOM ve veri modeline uygun olarak geliştirilebilir.
- Back-end'de bununla uyumlu API uç noktaları tanımlı olmalıdır (`/api/nobet-kredileri`).