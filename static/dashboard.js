document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = window.location.origin;

    // --- Sidebar/Nav Elements ---
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const navLinks = document.querySelectorAll('.nav-link');
    const pageSections = document.querySelectorAll('.page-section');
    const academicsNavLinks = document.querySelectorAll('.academics-nav-link');
    const academicsSubsections = document.querySelectorAll('.academics-subsection');
    const academicsToggle = document.querySelector('[data-section="academics"]');
    const academicsSubmenu = academicsToggle.nextElementSibling;
    
    // --- Data-specific Elements ---
    const logoutBtn = document.getElementById('logoutBtn');
    const sidebarUsername = document.getElementById('sidebar-username');
    const sidebarRegNo = document.getElementById('sidebar-regno');
    const timetableContainer = document.getElementById('timetable-container');
    const coursesContainer = document.getElementById('courses-container');
    const contentContainer = document.getElementById('content'); // Main content area
    const todayScheduleContainer = document.getElementById('today-schedule-container'); // Container from dashboard

    // --- Page/Section Navigation ---
    
    function showPageSection(sectionId) {
        pageSections.forEach(section => {
            section.style.display = section.id === sectionId ? 'block' : 'none';
        });
        
        navLinks.forEach(l => {
            l.classList.toggle('active', l.dataset.section === sectionId);
        });
        
        // Special handling for academics parent button
        academicsToggle.classList.toggle('active', sectionId === 'academics');
        if (academicsSubmenu) {
            academicsSubmenu.classList.toggle('hidden', sectionId !== 'academics');
        }
    }

    function showAcademicsSubsection(subsectionId) {
        academicsSubsections.forEach(subsection => {
            subsection.style.display = subsection.id === subsectionId ? 'block' : 'none';
        });

        academicsNavLinks.forEach(l => {
            l.classList.toggle('active-subsection', l.dataset.subsection === subsectionId);
        });
    }

    // Main navigation
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.dataset.section;
            showPageSection(sectionId);

            if (sectionId === 'academics') {
                // Default to the first subsection if main academics is clicked
                showAcademicsSubsection('academics-courses');
            }

            if (window.innerWidth < 768) sidebar.classList.add('-translate-x-full');
            
            // Scroll to top of content area
            contentContainer.scrollTop = 0;
        });
    });

    // Academics subsection navigation
    academicsNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPageSection('academics'); // Ensure main academics section is visible
            showAcademicsSubsection(link.dataset.subsection);
            if (window.innerWidth < 768) sidebar.classList.add('-translate-x-full');
            
            // Scroll to top of content area
            contentContainer.scrollTop = 0;
        });
    });
    
    // Sidebar toggle for mobile
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
    });

    // Dark mode toggle (from index.html)
    const themeToggle = document.getElementById('theme-toggle');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && prefersDark)) {
        document.documentElement.classList.add('dark');
    }

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });


    // --- Data Fetching & Session Logic ---

    /**
     * Checks if the user's session is valid.
     * If yes, populates user info and fetches data.
     * If no, redirects to login.
     */
    async function checkSession() {
        const savedSessionId = localStorage.getItem('vtop_session_id');
        if (!savedSessionId) {
            window.location.href = '/login'; // Redirect to login if no session
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
                // Populate user info
                sidebarUsername.textContent = data.username;
                sidebarRegNo.textContent = data.username; // Use username as placeholder
                
                // Fetch the real data
                fetchTimetableAndCourses(); 
            } else {
                localStorage.removeItem('vtop_session_id');
                window.location.href = '/login';
            }
        } catch (error) {
            localStorage.removeItem('vtop_session_id');
            window.location.href = '/login';
        }
    }

    /**
     * Fetches the rendered HTML for timetable and courses
     * and injects it into the correct placeholders.
     */
    async function fetchTimetableAndCourses() {
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/fetch-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    session_id: currentSessionId, 
                    target: 'academics/common/StudentTimeTableChn' 
                })
            });

            if (!response.ok) {
                if (response.status === 401) { // Session expired
                    localStorage.removeItem('vtop_session_id');
                    window.location.href = '/login';
                }
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            if (data.status === 'success') {
                // --- INJECT RENDERED HTML ---
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.html_content, 'text/html');
                
                const coursesContent = doc.getElementById('registered-courses-content');
                const timetableContent = doc.getElementById('weekly-timetable-content');

                if (coursesContent) {
                    coursesContainer.innerHTML = ''; // Clear spinner
                    coursesContainer.appendChild(coursesContent);
                } else {
                    coursesContainer.innerHTML = '<p class="text-red-500">Could not parse registered courses.</p>';
                }
                
                if (timetableContent) {
                    timetableContainer.innerHTML = ''; // Clear spinner
                    timetableContainer.appendChild(timetableContent);
                } else {
                    timetableContainer.innerHTML = '<p class="text-red-500">Could not parse timetable.</p>';
                }
                
                // --- POPULATE DASHBOARD CARD ---
                // Pass the raw JSON data to the new function
                populateTodaySchedule(data.raw_data.timetable);


            } else {
                 throw new Error(data.message || "Failed to fetch data.");
            }

        } catch (error) {
            const errorMsg = `<p class="text-red-500 text-center">Error: ${error.message}. Please try logging out and back in.</p>`;
            timetableContainer.innerHTML = errorMsg;
            coursesContainer.innerHTML = errorMsg;
            todayScheduleContainer.innerHTML = errorMsg;
        }
    }
    
    /**
     * Finds today's classes from the raw timetable data
     * and builds the HTML for the "Today's Schedule" card.
     */
    function populateTodaySchedule(timetableData) {
        const time_slot_keys = [
            "08:00 - 08:50", "08:55 - 09:45", "09:50 - 10:40", "10:45 - 11:35",
            "11:40 - 12:30", "12:35 - 13:25", "LUNCH", "14:00 - 14:50",
            "14:55 - 15:45", "15:50 - 16:40", "16:45 - 17:35", "17:40 - 18:30",
            "18:35 - 19:25"
        ];
        
        const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const today = new Date();
        const todayDayString = dayMap[today.getDay()];
        
        const todaySchedule = timetableData[todayDayString];
        let classCount = 0;
        let finalHtml = '';

        time_slot_keys.forEach((slotKey, index) => {
            // Check if a class exists at this slot and has a 'rowspan'
            // (meaning it's the start of a class)
            if (todaySchedule && todaySchedule[slotKey] && todaySchedule[slotKey].rowspan) {
                classCount++;
                const course = todaySchedule[slotKey];
                const rowspan = course.rowspan;

                // Calculate start and end times
                const startTime = slotKey.split(' - ')[0];
                const endIndex = index + rowspan - 1;
                const endTime = time_slot_keys[endIndex].split(' - ')[1];

                // Build the HTML card
                finalHtml += `
                    <div class="flex items-center p-3 rounded-lg bg-gray-50 hover:bg-gray-100">
                        <div class="w-16 text-center border-r border-gray-200 pr-3">
                            <p class="font-bold text-indigo-600">${startTime}</p>
                            <p class="text-xs text-gray-500">${endTime}</p>
                        </div>
                        <div class="ml-4 flex-grow">
                            <p class="font-semibold">${course.title}</p>
                            <p class="text-xs text-gray-500">${course.code} (${course.type})</p>
                        </div>
                        <span class="text-sm font-medium text-gray-700">${course.venue}</span>
                    </div>
                `;
            }
        });

        if (classCount === 0) {
            todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500">No classes scheduled for today.</p>';
        } else {
            todayScheduleContainer.innerHTML = finalHtml;
        }
    }
    
    // Logout listener
    logoutBtn.addEventListener('click', async (e) => { 
        e.preventDefault();
        const currentSessionId = localStorage.getItem('vtop_session_id');
        await fetch(`${API_BASE_URL}/logout`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({session_id: currentSessionId}) 
        }); 
        
        localStorage.removeItem('vtop_session_id');
        window.location.href = '/login';
    });

    // --- Initialize Page ---
    lucide.createIcons(); // Create icons
    
    // Initial setup to show Dashboard by default
    showPageSection('dashboard');
    
    // Check session (this also triggers data load)
    checkSession();
});