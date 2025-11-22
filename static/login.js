// --- Import the solver ---
import { solveCaptchaClient } from './solver.js';

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = window.location.origin;
    
    // --- DOM Elements ---
    const loadingContainer = document.getElementById('loadingContainer');
    const loginContainer = document.getElementById('loginContainer');
    const loadingText = document.querySelector('#loadingContainer p'); 
    const loginForm = document.getElementById('loginForm');
    const captchaGroup = document.getElementById('captchaGroup'); // Will remain hidden
    const captchaImageContainer = document.getElementById('captchaImageContainer');
    const sessionIdInput = document.getElementById('sessionId');
    const statusMessage = document.getElementById('statusMessage');
    const loginButton = document.getElementById('loginButton');
    const loginButtonText = document.getElementById('loginButtonText');
    const loginButtonSpinner = document.getElementById('loginButtonSpinner');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const captchaInput = document.getElementById('captcha');
    
    // --- UI HELPER FUNCTIONS ---
    function setStatus(message, isError = false) {
        if (isError) {
            statusMessage.textContent = message;
            statusMessage.className = `mt-6 text-center text-sm text-red-600`;
        } else {
            statusMessage.textContent = ""; 
        }
    }

    function setButtonLoading(isLoading) {
        loginButtonText.textContent = isLoading ? 'Processing...' : 'Login';
        loginButton.disabled = isLoading;
        loginButtonSpinner.classList.toggle('hidden', !isLoading);
    }
    
    function showLoginScreen() {
        loadingContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
        captchaGroup.classList.add('hidden'); 
    }
    
    function updateLoadingText(text) {
        if (loadingText) loadingText.textContent = text;
    }

    // --- CORE LOGIC ---
    
    async function preFetchCaptcha(isRetry = false, isAutoLoginCheck = false) {
        try {
            const response = await fetch(`${API_BASE_URL}/start-login`, { method: 'POST' });
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();

            if (data.status === 'captcha_ready') {
                sessionIdInput.value = data.session_id;
                captchaImageContainer.innerHTML = `<img src="${data.captcha_image_data}" alt="CAPTCHA"/>`;
                
                try {
                    const solvedText = await solveCaptchaClient(data.captcha_image_data);
                    captchaInput.value = solvedText;
                    console.log("Captcha solved in background:", solvedText);
                    
                    if (isAutoLoginCheck && data.has_saved_creds) {
                        updateLoadingText("Verifying saved credentials...");
                        await handleAutoLogin(solvedText);
                    } else {
                        if (isAutoLoginCheck) showLoginScreen();
                        
                        if (isRetry) {
                            handleLoginAttempt(); 
                        } else {
                            if(!document.getElementById('username').value) {
                                document.getElementById('username').focus();
                            } else {
                                passwordInput.focus();
                            }
                        }
                    }
                    
                } catch (solveError) {
                    console.error('CAPTCHA solve error:', solveError);
                    if (isAutoLoginCheck) showLoginScreen();
                    if (!isRetry) preFetchCaptcha(true, false);
                }

            } else {
                throw new Error(data.message || 'Failed to get CAPTCHA.');
            }
        } catch (error) {
            if (isAutoLoginCheck) showLoginScreen();
            console.error(error);
            setStatus("Network error initializing session.", true);
        }
    }

    async function checkSession() {
        const savedSessionId = localStorage.getItem('vtop_session_id');
        
        if (!savedSessionId) {
            updateLoadingText("Initializing secure session...");
            preFetchCaptcha(false, true); 
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/check-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: savedSessionId })
            });

            if (!response.ok) throw new Error('Session validation failed.');
            const data = await response.json();

            if (data.status === 'success') {
                window.location.href = '/'; 
            } else {
                localStorage.removeItem('vtop_session_id');
                updateLoadingText("Session expired. Re-initializing...");
                preFetchCaptcha(false, true); 
            }
        } catch (error) {
            if (!navigator.onLine) {
                 window.location.href = '/'; 
                 return;
            }
            localStorage.removeItem('vtop_session_id');
            updateLoadingText("Connection error. Retrying...");
            preFetchCaptcha(false, true); 
        }
    }
    
    async function handleAutoLogin(captchaText) {
        try {
            const response = await fetch(`${API_BASE_URL}/auto-login`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ 
                    session_id: sessionIdInput.value,
                    captcha: captchaText 
                }) 
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                updateLoadingText("Success! Entering dashboard...");
                localStorage.setItem('vtop_session_id', data.session_id);
                window.location.href = '/';
            } else if (data.status === 'invalid_captcha') {
                 console.log("Auto-login captcha failed, retrying...");
                 preFetchCaptcha(true, true);
            } else {
                showLoginScreen();
                setStatus(data.message, true); 
                preFetchCaptcha(false, false); 
            }
        } catch (e) {
            showLoginScreen();
            setStatus("Auto-login failed. Please log in manually.", true);
            preFetchCaptcha(false, false);
        }
    }

    async function handleLoginAttempt() {
        setButtonLoading(true);
        statusMessage.textContent = "";
        
        const payload = { 
            session_id: sessionIdInput.value,
            username: document.getElementById('username').value, 
            password: passwordInput.value, 
            captcha: captchaInput.value
        };

        try {
            const response = await fetch(`${API_BASE_URL}/login-attempt`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(payload) 
            });
            
            const data = await response.json();

            if (data.status === 'success') {
                localStorage.setItem('vtop_session_id', data.session_id);
                window.location.href = '/';
            
            } else if (data.status === 'invalid_captcha') {
                console.log("Manual login captcha failed. Retrying silently...");
                preFetchCaptcha(true); 
            
            } else {
                setStatus(data.message, true); 
                setButtonLoading(false); 
                preFetchCaptcha(false);
            }

        } catch (error) {
            setStatus(error.message, true);
            setButtonLoading(false);
        }
    }
    
    // --- EVENT LISTENERS ---
    
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLoginAttempt();
    });

    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        const icon = togglePasswordBtn.querySelector('i');
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    });

    captchaInput.addEventListener('input', () => {
        captchaInput.value = captchaInput.value.toUpperCase();
    });

    checkSession();

    // --- PWA SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
        .register('/sw.js')
        .then(() => { console.log('Service Worker Registered at root scope (Login)'); })
        .catch(err => console.error('SW Registration failed:', err));
    }
});