# Kural İşlemleri JavaScript Modülü — Yüksek Seviyeli Dokümantasyon

Bu dosya (`kuralIslemleri.js`), "özel gün" ve "hafta sonu" olarak adlandırılan kredi kurallarının yönetimini sağlayan bir istemci tarafı JavaScript modülüdür. Kullanıcı arayüzü üzerinden kredi kuralı ekleme, listeme, güncelleme ve silme işlevlerini sağlar ve doğrudan sunucu ile API üzerinden haberleşir.

---

## Temel Fonksiyonlar ve Sorumlulukları

### 1. handleOzelGunKuralEkle
- **Amaç:** Yeni bir "özel gün" kuralı ekleme formunun gönderimini yönetir.
- **Süreç:**
  - Formdan girilen kredi miktarı, açıklama ve tarih alanlarının doğruluğunu kontrol eder.
  - Bilgileri POST isteği ile `/api/kurallar` endpoint'ine gönderir.
  - İşlem sonucu kullanıcının arayüzünü günceller ve hata/success mesajları gösterir.

### 2. kurallariYukle
- **Amaç:** Tüm kredi kurallarını (hafta sonu ve özel günler) API'dan alıp tabloya yükler.
- **Süreç:**
  - Tüm kuralları çeker, tabloya temiz ve güncel şekilde yerleştirir.
  - Hafta sonu kuralını ayırır, diğer özel gün kurallarını ise tarihe göre sıralayarak gösterir.
  - Her kural için ilgili arayüz butonlarını (silme, güncelleme vb.) ekler.
  - Hata durumlarında kullanıcıya anlamlı bildirimde bulunur.

### 3. haftaSonuKrediKaydet (Global)
- **Amaç:** Arayüzde gösterilen hafta sonu kredi miktarını günceller.
- **Süreç:**
  - Yeni miktarı doğrular ve `/api/kurallar` endpoint'ine PUT isteğiyle güncellemeyi gönderir.
  - İşlem sonucu hakkında kullanıcıya bilgi verir.

### 4. kuralSil (Global)
- **Amaç:** Belirli bir özel gün kuralını siler.
- **Süreç:**
  - Kullanıcıdan onay alır.
  - ID’ye göre ilgili kuralı `/api/kurallar/:id` endpoint’ine DELETE isteği atarak siler.
  - Sonrasında kuralları yeniden yükler ve kullanıcıya bilgilendirme yapılır.

---

## Diğer Detaylar

- **Kimlik Doğrulama:** API isteklerinde, istemci tarafında saklanan JWT token’ı (`localStorage.getItem('token')`) Authorization header’a ekleniyor.
- **Form/Bilgi Doğrulama:** Gerekli alanlar girilmeden herhangi bir işlem başlatılmıyor; kullanıcı bilgilendiriliyor.
- **Tarih/Sıralama:** Özel günler, belirtilen tarihe göre artan şekilde sıralanıyor.
- **UI Güncellemeleri:** Her işlemden sonra tablo tekrar yüklenerek arayüz anlık güncelleniyor.
- **Global Fonksiyonlar:** Bazı fonksiyonlar pencere nesnesine atanıyor, böylece HTML içinde doğrudan çağrılabiliyor.

---

## Kapsam
- **Kredi kuralı**; kredi miktarı, açıklama (adı) ve tarih bilgileriyle birlikte bir nesne olarak yönetiliyor.
- **Hafta sonu kuralları** özel olarak işleniyor, özel günlerden ayrıştırılıyor.
- **Hata yönetimi** ve kullanıcıya anlamlı bilgilendirme var.

---

## Kullanım Alanları
- Kural ekleme/güncelleme/silme işlemlerinin açık ve hızlı bir şekilde web arayüzünde yapılmasını sağlar.
- Esnek ve ölçeklenebilir bir biçimde yeni özel günlerin sisteme tanımlanmasına ve düzenlenmesine olanak verir.
- Kredi kuralı yönetiminin ön yüz mantığını sadeleştirir.

---

**Sonuç:**  
Bu modül, özel gün ve hafta sonu kredi kurallarının yönetimi için eksiksiz bir istemci tarafı mantığı sağlar; kullanıcı arayüzü ile sunucu tarafı API arasında iletişimi ve UI güncellemelerini pratik şekilde gerçekleştirir.