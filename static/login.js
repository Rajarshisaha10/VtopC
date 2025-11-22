// --- Import the solver ---
import { solveCaptchaClient } from './solver.js';

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = window.location.origin;
    
    // --- DOM Elements ---
    const loadingContainer = document.getElementById('loadingContainer');
    const loginContainer = document.getElementById('loginContainer');
    const loadingText = document.querySelector('#loadingContainer p'); // To update text
    const loginForm = document.getElementById('loginForm');
    const captchaGroup = document.getElementById('captchaGroup');
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
        statusMessage.textContent = message;
        statusMessage.className = `mt-6 text-center text-sm ${isError ? 'text-red-600' : 'text-green-600'}`;
    }

    function setButtonLoading(isLoading) {
        loginButtonText.textContent = isLoading ? 'Processing...' : 'Login';
        loginButton.disabled = isLoading;
        loginButtonSpinner.classList.toggle('hidden', !isLoading);
    }
    
    function showLoginScreen() {
        loadingContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
    }
    
    function updateLoadingText(text) {
        if (loadingText) loadingText.textContent = text;
    }

    // --- CORE LOGIC ---
    
    /**
     * Fetches a new CAPTCHA and session from the server.
     * @param {boolean} isRetry - If true, auto-submits the form after solving (for manual login retries).
     * @param {boolean} isAutoLoginCheck - If true, attempts to use stored cookies to login before showing form.
     */
    async function preFetchCaptcha(isRetry = false, isAutoLoginCheck = false) {
        captchaGroup.classList.remove('hidden');
        captchaImageContainer.innerHTML = '<i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>';
        
        if (isRetry && !isAutoLoginCheck) {
             setStatus('Fetching new CAPTCHA...', false);
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/start-login`, { method: 'POST' });
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();

            if (data.status === 'captcha_ready') {
                sessionIdInput.value = data.session_id;
                captchaImageContainer.innerHTML = `<img src="${data.captcha_image_data}" alt="CAPTCHA"/>`;
                
                if (!isAutoLoginCheck) setStatus('Solving CAPTCHA...', false);
                
                try {
                    const solvedText = await solveCaptchaClient(data.captcha_image_data);
                    captchaInput.value = solvedText;
                    
                    if (isAutoLoginCheck && data.has_saved_creds) {
                        // --- AUTO LOGIN FLOW ---
                        // Keep showing the loading screen, update text
                        updateLoadingText("Verifying saved credentials...");
                        await handleAutoLogin(solvedText);
                    } else {
                        // --- STANDARD FLOW ---
                        if (isAutoLoginCheck) {
                            // We were checking for auto-login, but no creds found. Show form now.
                            showLoginScreen();
                        }
                        
                        if (isRetry) {
                            setStatus('New CAPTCHA solved. Auto-retrying...', false);
                            handleLoginAttempt(); 
                        } else {
                            setStatus('New CAPTCHA solved. Please enter credentials.', false);
                            // Focus logic
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
                    setStatus('Failed to auto-solve. Please enter manually.', true);
                    captchaInput.focus();
                }

            } else {
                throw new Error(data.message || 'Failed to get CAPTCHA.');
            }
        } catch (error) {
            if (isAutoLoginCheck) showLoginScreen();
            setStatus(error.message, true);
            captchaImageContainer.innerHTML = '<p class="text-xs text-red-500">Could not load CAPTCHA</p>';
        }
    }

    async function checkSession() {
        const savedSessionId = localStorage.getItem('vtop_session_id');
        
        // If we don't have a session ID, start the login flow (which includes auto-login check)
        if (!savedSessionId) {
            updateLoadingText("Initializing secure session...");
            preFetchCaptcha(false, true); // Start Auto-Login Check
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
                preFetchCaptcha(false, true); // Start Auto-Login Check
            }
        } catch (error) {
            localStorage.removeItem('vtop_session_id');
            updateLoadingText("Connection error. Retrying...");
            preFetchCaptcha(false, true); // Start Auto-Login Check
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
            } else {
                // Auto login failed (bad creds or captcha).
                // Show form and get a FRESH captcha because the previous one is now invalid/used.
                showLoginScreen();
                setStatus(data.message + " Please log in manually.", true);
                preFetchCaptcha(false, false); // Fetch new captcha for manual entry
            }
        } catch (e) {
            showLoginScreen();
            setStatus("Auto-login failed. Please log in manually.", true);
            preFetchCaptcha(false, false);
        }
    }

    async function handleLoginAttempt() {
        setButtonLoading(true);
        setStatus('Attempting login...', false);
        
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
                setStatus('Success! Redirecting...', false);
                localStorage.setItem('vtop_session_id', data.session_id);
                window.location.href = '/';
            
            } else if (data.status === 'invalid_captcha') {
                setStatus(data.message + " Auto-retrying...", true);
                preFetchCaptcha(true); 
            
            } else {
                setStatus(data.message, true); 
                setButtonLoading(false); 
                preFetchCaptcha(false); // Get new captcha for next try
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

    // Initial check on page load
    checkSession();
});