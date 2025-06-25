// public/login.js

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink'); // HTML'deki ID ile eşleştiğinden emin olun
    const messageArea = document.getElementById('login-message-area'); // HTML'deki ID ile eşleştiğinden emin olun

    // Mesaj alanını gizlemek için yardımcı fonksiyon
    const hideMessage = () => {
        if (messageArea) {
            messageArea.style.display = 'none';
            messageArea.textContent = '';
            messageArea.className = 'message-area';
        }
    };

    // Mesaj göstermek için yardımcı fonksiyon
    const showMessage = (message, isError = true) => {
        if (messageArea) {
            messageArea.textContent = message;
            messageArea.className = isError ? 'message-area error-message' : 'message-area success-message';
            messageArea.style.display = 'block';
        }
    };

    // Giriş yapma işlemi
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            hideMessage();

            const username = this.elements.username.value;
            const password = this.elements.password.value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json();

                if (response.ok && data.token) {
                    localStorage.setItem('token', data.token);
                    window.location.href = "index.html";
                } else {
                    showMessage(data.message || data.error || 'Giriş başarısız. Bilgilerinizi kontrol edin.');
                }
            } catch (error) {
                console.error('Login fetch error:', error);
                showMessage('Bir ağ hatası oluştu. Lütfen tekrar deneyin.');
            }
        });
    }

    // Şifre sıfırlama işlemi (DÜZELTİLMİŞ KISIM)
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async function(e) {
            e.preventDefault();
            hideMessage();

            // Admin panelinden şifre sıfırlama işlemi, genellikle belirli bir kullanıcı için yapılır.
            // Bu buton "admin" kullanıcısının şifresini sıfırlamak için ayarlandı.
            // NOT: Sunucu tarafı `id` beklediği için, burada `admin` kullanıcısının ID'sinin "1" olduğunu varsayıyoruz.
            // Eğer admin ID'si farklıysa, bu sayıyı değiştirmeniz gerekir.
            const adminUserId = 1; 

            const userConfirmed = confirm("Admin kullanıcısının şifresi sıfırlanacak ve yeni şifre kayıtlı yönetici e-posta adresine gönderilecektir. Onaylıyor musunuz?");

            if (userConfirmed) {
                showMessage('İstek işleniyor, lütfen bekleyin...', false);
                try {
                    // Sunucudaki doğru adresi çağırıyoruz: /api/nobetci/reset-password/:id
                    const response = await fetch(`/api/nobetci/reset-password/${adminUserId}`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'}
                        // Body göndermemize gerek yok, ID URL'de belirtiliyor.
                    });

                    const data = await response.json();

                    if (response.ok) {
                        showMessage(data.message || 'Şifre sıfırlama talebi başarıyla işlendi. Lütfen e-posta kutunuzu kontrol edin.', false);
                    } else {
                        showMessage(data.error || 'İstek gönderilemedi. Lütfen sunucu loglarını kontrol edin.');
                    }
                } catch (error) {
                    console.error('Password reset request error:', error);
                    showMessage('Şifre sıfırlama sırasında bir ağ hatası oluştu.');
                }
            }
        });
    }
});
