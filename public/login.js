// public/login.js

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const messageArea = document.getElementById('login-message-area');

    const hideMessage = () => {
        if (messageArea) {
            messageArea.style.display = 'none';
            messageArea.textContent = '';
            messageArea.className = 'message-area';
        }
    };

    const showMessage = (message, isError = true) => {
        if (messageArea) {
            messageArea.textContent = message;
            messageArea.className = isError ? 'message-area error-message' : 'message-area success-message';
            messageArea.style.display = 'block';
        }
    };

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
                    showMessage(data.message || data.error || 'Giriş başarısız.');
                }
            } catch (error) {
                showMessage('Bir ağ hatası oluştu.');
            }
        });
    }

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async function(e) {
            e.preventDefault();
            hideMessage();
            const userConfirmed = confirm("Admin kullanıcısının şifresi sıfırlanacak ve yeni şifre kayıtlı yönetici e-posta adresine gönderilecektir. Onaylıyor musunuz?");
            if (userConfirmed) {
                showMessage('İstek işleniyor, lütfen bekleyin...', false);
                try {
                    // ID göndermek yerine doğrudan admin şifre sıfırlama rotasını çağırıyoruz.
                    const response = await fetch(`/api/nobetci/reset-admin-password`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'}
                    });
                    const data = await response.json();
                    if (response.ok) {
                        showMessage(data.message, false);
                    } else {
                        showMessage(data.error || 'İstek başarısız oldu.');
                    }
                } catch (error) {
                    showMessage('Şifre sıfırlama sırasında bir ağ hatası oluştu.');
                }
            }
        });
    }
});
