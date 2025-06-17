## High-Level Documentation: Nöbetçi Kredi Hesaplama ve Dağıtım Sistemi (hesaplama.js)

---

### Genel Amaç

Bu dosya, bir yılın sonunda nöbetçilere adaletli şekilde kredi (örneğin ödül veya puan birimi) dağıtımı işlemlerini otomatikleştirir. Yılsonuna kadar kazanılabilecek toplam potansiyel krediyi hesaplar, kişilere pay eder, veritabanını günceller ve arayüzü güncel tutar.

---

### Temel İşlevler

#### 1. Kredi Sıfırlama ve Güncelleme
Fonksiyon sürecin başında mevcut "Kazanılan Kredi"leri sıfırlar ve veritabanı ile UI'ı günceller.

#### 2. Toplam Potansiyel Kredi Hesabı
- Yılın kalan süresi dakika bazında hesaplanır.
- Her bir dakika için geçerli olan kredi türü belirlenir:
  - **Özel Günler**: Tanımlı ise, o gün için özel kredi değeri alınır.
  - **Hafta Sonu**: Hafta sonlarında belirlenen kredi değeri kullanılır.
  - **Normal Günler**: Saat aralığına göre farklı kredi değerleri uygulanabilir (dönemsel farklılıklar desteklenir).

#### 3. Kredinin Nöbetçilere Dağıtılması
- Toplam potansiyel kredi, aktif tüm nöbetçilere olabildiğince eşit paylaştırılır.
- Tam bölünemeyen artan kredi, listesinin sonundaki nöbetçilere birer birer eklenir.

#### 4. Kredilerin Kaydı ve Arayüz Güncellemesi
- Hesaplanan "Pay Edilen Kredi"ler veritabanına gönderilir ve kaydedilir.
- Tablo yeniden alınarak "Kazanılan", "Pay Edilen" ve "Kalan Kredi" bilgilerinin arayüzde güncel ve tutarlı gösterilmesi sağlanır.

---

### Öne Çıkan Detaylar

- **Özel Gün Tanımları**: Kullanıcı özel günler ve ilgili kredi değerlerini girebilir.
- **Saatlik Kural Tanımları**: Günün farklı saat aralıklarına farklı kredi değerleri atanabilir.
- **UI ve DB Senkronizasyonu**: Her adımda hem kullanıcı arayüzü hem veritabanı güncelliği korunur.
- **Hata Yönetimi**: Kritik adımlarda hatalar kullanıcıya bildiriliyor ve süreç sağlıklı şekilde sonlandırılıyor.
- **Genişletilebilirlik**: Yeni özel gün, saat kuralı, kredi türü eklemek kolaydır.

---

### Fonksiyonlar

#### `hesaplaToplamKrediVeDagit()`
Tüm süreci (kredi sıfırlama, toplam kredi hesaplama, dağıtım ve UI/DB güncellemesi) başlatan ana fonksiyondur.

#### `dagitVePayEdilenKredileriKaydet(toplamDagitilacakKredi)`
Toplam krediyi mevcut nöbetçiler arasında pay eder, kaydeder ve arayüzü günceller.

---

### Kullanım Senaryosu Özet

Yıl sonuna kadar dağıtılacak kredi miktarı, kurallara ve güncel tarihe göre hesaplanır. Kredi, o anda aktif olan tüm nöbetçilere dağıtılır ve bu bilgiler veritabanında ve kullanıcıya sunulan tabloda anlık olarak güncellenir.

---

**Not:** Kodda hata kontrolleri, veri tabanı bağlantıları ve arayüz güncellemeleri gibi kritik noktalar sağlam şekilde uygulanmıştır. Özel gün ve saat aralığı tanımlamalarıyla çok farklı puanlama ihtiyaçları karşılanabilir.