document.addEventListener('DOMContentLoaded', () => {
<<<<<<< HEAD
    const loginForm = document.getElementById('loginForm');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const messageArea = document.getElementById('loginmessagearea'); // ID'yi kontrol edin, login.js'de bu şekildeydi

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
                    body: JSON.stringify({username, password})
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

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async function(e) {
            e.preventDefault();
            hideMessage();

            const userConfirmed = confirm("Admin kullanıcısının şifresi sıfırlanacak ve yeni şifre kayıtlı e-posta adresine gönderilecektir. Onaylıyor musunuz?");

            if (userConfirmed) {
                showMessage('İstek işleniyor, lütfen bekleyin...', false);
                try {
                    // SUNUCUDAKİ DOĞRU ADRESİ ÇAĞIRIYORUZ
                    const response = await fetch('/api/nobetci/request-password-reset', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ username: 'admin' }) // Sunucu 'admin' kullanıcı adını bekliyor
                    });
                    
                    const data = await response.json();

                    if (response.ok && data.success) {
                        showMessage('Şifre sıfırlama e-postası başarıyla gönderildi. Lütfen e-posta kutunuzu kontrol edin.', false);
                    } else {
                        showMessage(data.message || data.error || 'İstek gönderilemedi. Lütfen daha sonra tekrar deneyin.');
                    }
                } catch (error) {
                    console.error('Password reset request error:', error);
                    showMessage('Şifre sıfırlama sırasında bir ağ hatası oluştu.');
                }
            }
        });
    }
=======

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

  // Şifre sıfırlama işlemi
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async function(e) {
      e.preventDefault();
      hideMessage();

      const usernameToReset = prompt("Lütfen şifresini sıfırlamak istediğiniz kullanıcı adını girin:");

      if (usernameToReset) {
        try {
          // Backend'de oluşturacağımız yeni endpoint'i çağırıyoruz
          const response = await fetch('/api/nobetciler/request-password-reset', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ username: usernameToReset })
          });
          const data = await response.json();

          if (response.ok && data.success) {
            // Yeni şifreyi kullanıcıya gösteriyoruz
            alert(`Şifre sıfırlama başarılı!\nKullanıcı: ${usernameToReset}\nYeni Şifre: ${data.newPassword}\n\nLütfen bu şifreyi not alın.`);
            showMessage('Yeni şifre oluşturuldu. Lütfen yukarıdaki kutucuktan not alınız.', false);
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
>>>>>>> parent of 29c819a (Move login logic inline and remove external JS file)
});
