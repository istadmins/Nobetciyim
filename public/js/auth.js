// public/js/auth.js

// Bu dosya, token kontrolü ve logout işlemleri gibi
// kimlik doğrulama ile ilgili istemci tarafı fonksiyonlarını içerir.

// DOMContentLoaded içinde çağrılacak ana fonksiyonlar bu dosyada olmayacak,
// main.js içinde event listener'lar atanacak.

/**
 * Token varlığını kontrol eder, yoksa login sayfasına yönlendirir.
 */
function checkToken() {
    if (!localStorage.getItem('token')) {
        window.location.href = "login.html"; // Login sayfanızın adı buysa
    }
}

/**
 * Logout işlemini gerçekleştirir.
 * Token'ı localStorage'dan siler ve login sayfasına yönlendirir.
 */
function handleLogout() {
    localStorage.removeItem('token');
    window.location.href = "login.html"; // Login sayfanızın adı buysa
}
