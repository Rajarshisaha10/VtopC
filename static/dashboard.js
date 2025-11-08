document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = window.location.origin;
    
    // --- DOM Elements ---
    const loadingContainer = document.getElementById('loadingContainer');
    const dashboardContainer = document.getElementById('dashboardContainer');
    const dataContainer = document.getElementById('dataContainer');
    const welcomeMessage = document.getElementById('welcomeMessage');
    const logoutBtn = document.getElementById('logoutBtn');
    const fetchTimetableBtn = document.getElementById('fetchTimetableBtn');
    const fetchGradesBtn = document.getElementById('fetchGradesBtn');
    const fetchAttendanceBtn = document.getElementById('fetchAttendanceBtn');
    
    // --- CORE LOGIC ---

    async function checkSession() {
        const savedSessionId = localStorage.getItem('vtop_session_id');
        if (!savedSessionId) {
            // *** No session found. Redirect to login page. ***
            window.location.href = '/login';
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
                // *** Session is valid! Show the dashboard. ***
                loadingContainer.classList.add('hidden');
                dashboardContainer.classList.remove('hidden');
                welcomeMessage.textContent = data.message;
            } else {
                // *** Session is invalid. Redirect to login page. ***
                localStorage.removeItem('vtop_session_id');
                window.location.href = '/login';
            }
        } catch (error) {
            localStorage.removeItem('vtop_session_id');
            window.location.href = '/login';
        }
    }
    
    async function genericDataFetcher(targetEndpoint, button) {
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        button.disabled = true;

        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/fetch-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId, target: targetEndpoint })
            });

            if (!response.ok) {
                const errorData = await response.json();
                if (response.status === 401) {
                    // Session expired, force redirect to login
                    localStorage.removeItem('vtop_session_id');
                    window.location.href = '/login';
                }
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const data = await response.json();
            if (data.status === 'success') {
                dataContainer.innerHTML = data.html_content;
            } else {
                 throw new Error(data.message || "Failed to fetch data.");
            }

        } catch (error) {
            dataContainer.innerHTML = `<p class="text-red-500 text-center">Error: ${error.message}</p>`;
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }
    
    // --- EVENT LISTENERS ---
    
    logoutBtn.addEventListener('click', async () => { 
        const currentSessionId = localStorage.getItem('vtop_session_id');
        // Call logout API to clear server session
        await fetch(`${API_BASE_URL}/logout`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({session_id: currentSessionId}) 
        }); 
        
        // Clear local session
        localStorage.removeItem('vtop_session_id');
        
        // Redirect to login page
        window.location.href = '/login';
    });

    fetchTimetableBtn.addEventListener('click', (e) => { 
        genericDataFetcher('academics/common/StudentTimeTableChn', e.target); 
    });

    fetchGradesBtn.addEventListener('click', (e) => { 
        genericDataFetcher('examinations/examGradeView/doStudentGradeView', e.target); 
    });

    fetchAttendanceBtn.addEventListener('click', (e) => { 
        genericDataFetcher('processViewStudentAttendance', e.target); 
    });

    // Initial check on page load
    checkSession();
});