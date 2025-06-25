document.addEventListener('DOMContentLoaded', () => {

  const loginForm = document.getElementById('loginForm');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  const messageArea = document.getElementById('login-message-area');

  // Mesaj alanını gizlemek için yardımcı fonksiyon
  const hideMessage = () => {
    messageArea.style.display = 'none';
    messageArea.textContent = '';
    messageArea.className = 'message-area';
  };

  // Mesaj göstermek için yardımcı fonksiyon
  const showMessage = (message, isError = true) => {
    messageArea.textContent = message;
    messageArea.className = isError ? 'message-area error-message' : 'message-area success-message';
    messageArea.style.display = 'block';
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
          body: JSON.stringify({username, password})
        });
        const data = await response.json();
        if (response.ok && data.token) {
          localStorage.setItem('token', data.token);
          window.location.href = "index.html";
        } else {
          showMessage(data.message || data.error || 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
        }
      } catch (error) {
        console.error('Login fetch error:', error);
        showMessage('Bir ağ hatası oluştu. Lütfen tekrar deneyin.');
      }
    });
  }

  // DÜZELTME: Şifre sıfırlama işlemi artık doğrudan admin için çalışıyor.
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async function(e) {
      e.preventDefault();
      hideMessage();

      // Kullanıcıya onay sorusu soruluyor.
      const userConfirmed = confirm("Yalnızca 'admin' kullanıcısının şifresi sıfırlanacaktır. Onaylıyor musunuz?");

      if (userConfirmed) {
        try {
          // Sadece admin şifresini sıfırlayan yeni backend endpoint'ini çağırıyoruz.
          const response = await fetch('/api/nobetciler/reset-admin-password', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'}
          });
          const data = await response.json();

          if (response.ok && data.success) {
            // Yeni şifreyi kullanıcıya bir uyarı kutusunda gösteriyoruz.
            alert(`Admin şifresi sıfırlandı!\n\nYeni Şifre: ${data.newPassword}\n\nLütfen bu şifreyi not alın ve güvenli bir yerde saklayın.`);
            showMessage('Admin şifresi başarıyla sıfırlandı.', false);
          } else {
            showMessage(data.message || data.error || 'Şifre sıfırlama isteği gönderilemedi.');
          }
        } catch (error) {
          console.error('Password reset request error:', error);
          showMessage('Şifre sıfırlama sırasında bir ağ hatası oluştu.');
        }
      }
    });
  }
});
