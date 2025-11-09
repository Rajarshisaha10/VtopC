document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = window.location.origin;

    // --- API Targets ---
    const TIMETABLE_TARGET = 'academics/common/StudentTimeTableChn';
    const GRADES_TARGET = 'examinations/examGradeView/StudentGradeView';
    const ATTENDANCE_TARGET = 'processViewStudentAttendance';
    const CALENDAR_TARGET = 'academics/common/CalendarPreview';
    const CURRICULUM_TARGET = 'student/viewMyCurriculum'; // Placeholder
    const PROJECTS_TARGET = 'student/studentProjectView'; // Placeholder
    const ENROLLMENT_TARGET = 'courseManagement/studentCourseRegister'; // Placeholder
    const HOSTEL_TARGET = 'hostels/student/leave/1';
    const PROFILE_TARGET = 'student/studentProfileView'; // Placeholder


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
    const contentContainer = document.getElementById('content'); // Main content area
    
    // --- Containers for dynamic content ---
    const todayScheduleContainer = document.getElementById('today-schedule-container');
    const timetableContainer = document.getElementById('timetable-container');
    const coursesContainer = document.getElementById('courses-container');
    const attendanceContainer = document.getElementById('attendance-container');
    const gradesContainer = document.getElementById('grades-container');
    const curriculumContainer = document.getElementById('curriculum-container');
    const projectsContainer = document.getElementById('projects-container');
    const calendarContainer = document.getElementById('calendar-container');
    const enrollmentContainer = document.getElementById('enrollment-container');
    const hostelContainer = document.getElementById('hostel-container');
    const profileContainer = document.getElementById('profile-container');


    // --- Page/Section Navigation ---
    
    function showPageSection(sectionId) {
        pageSections.forEach(section => {
            section.style.display = section.id === sectionId ? 'block' : 'none';
        });
        
        navLinks.forEach(l => {
            l.classList.toggle('active', l.dataset.section === sectionId);
        });
        
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

            // --- Handle fetching data for main sections ---
            if (sectionId === 'academics') {
                showAcademicsSubsection('academics-courses');
                // Data for 'academics-courses' is loaded by default by fetchTimetableAndCourses
            } else if (sectionId === 'enrollment') {
                fetchAndDisplay(ENROLLMENT_TARGET, enrollmentContainer);
            } else if (sectionId === 'hostel') {
                fetchAndDisplay(HOSTEL_TARGET, hostelContainer);
            } else if (sectionId === 'profile') {
                fetchAndDisplay(PROFILE_TARGET, profileContainer);
            }

            if (window.innerWidth < 768) sidebar.classList.add('-translate-x-full');
            contentContainer.scrollTop = 0;
        });
    });

    // Academics subsection navigation
    academicsNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const subsectionId = link.dataset.subsection;
            showPageSection('academics'); // Ensure main academics section is visible
            showAcademicsSubsection(subsectionId);

            // --- Handle fetching data for subsections ---
            if (subsectionId === 'academics-timetable') {
                // This is already loaded by the initial fetch, but we can re-fetch if needed
                // Or just leave it, since fetchTimetableAndCourses() populates it.
            } else if (subsectionId === 'academics-grades') {
                fetchAndDisplay(GRADES_TARGET, gradesContainer);
            } else if (subsectionId === 'academics-attendance') {
                fetchAndDisplay(ATTENDANCE_TARGET, attendanceContainer);
            } else if (subsectionId === 'academics-calendar') {
                fetchAndDisplay(CALENDAR_TARGET, calendarContainer);
            } else if (subsectionId === 'academics-curriculum') {
                fetchAndDisplay(CURRICULUM_TARGET, curriculumContainer);
            } else if (subsectionId === 'academics-projects') {
                fetchAndDisplay(PROJECTS_TARGET, projectsContainer);
            }

            if (window.innerWidth < 768) sidebar.classList.add('-translate-x-full');
            contentContainer.scrollTop = 0;
        });
    });
    
    // Sidebar toggle for mobile
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
    });

    // Dark mode toggle
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

    function handleFetchError(error, container) {
        console.error('Fetch error:', error);
        localStorage.removeItem('vtop_session_id');
        window.location.href = '/login';
    }

    /**
     * Generic function to fetch data for a target and put it in a container.
     */
    async function fetchAndDisplay(target, containerElement) {
        containerElement.innerHTML = `<p class="text-sm text-gray-500 flex items-center">
            <i data-lucide="loader" class="animate-spin h-5 w-5 mr-2 text-indigo-600"></i>
            Loading...
        </p>`;
        lucide.createIcons(); // Render the loader icon

        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            if (!currentSessionId) throw new Error("No session ID");

            const response = await fetch(`${API_BASE_URL}/fetch-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    session_id: currentSessionId, 
                    target: target 
                })
            });

            if (!response.ok) {
                if (response.status === 401) { // Session expired
                    throw new Error("Session expired. Redirecting to login.");
                }
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            if (data.status === 'success') {
                containerElement.innerHTML = data.html_content;
                lucide.createIcons(); // Re-render icons in the new content
            } else {
                 throw new Error(data.message || "Failed to fetch data.");
            }

        } catch (error) {
            handleFetchError(error, containerElement);
        }
    }


    /**
     * Checks if the user's session is valid.
     */
    async function checkSession() {
        const savedSessionId = localStorage.getItem('vtop_session_id');
        if (!savedSessionId) {
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
                sidebarUsername.textContent = data.username;
                sidebarRegNo.textContent = data.username; 
                
                // Fetch the default data (timetable, courses, dashboard card)
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
                    target: TIMETABLE_TARGET 
                })
            });

            if (!response.ok) {
                if (response.status === 401) { // Session expired
                    throw new Error("Session expired. Redirecting to login.");
                }
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            if (data.status === 'success') {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.html_content, 'text/html');
                
                const coursesContent = doc.getElementById('registered-courses-content');
                const timetableContent = doc.getElementById('weekly-timetable-content');

                if (coursesContent) {
                    coursesContainer.innerHTML = ''; 
                    coursesContainer.appendChild(coursesContent);
                } else {
                    coursesContainer.innerHTML = '<p class="text-red-500">Could not parse registered courses.</p>';
                }
                
                if (timetableContent) {
                    timetableContainer.innerHTML = ''; 
                    timetableContainer.appendChild(timetableContent);
                } else {
                    timetableContainer.innerHTML = '<p class="text-red-500">Could not parse timetable.</p>';
                }
                
                populateTodaySchedule(data.raw_data.timetable);
                lucide.createIcons(); // Re-render icons

            } else {
                 throw new Error(data.message || "Failed to fetch data.");
            }

        } catch (error) {
            handleFetchError(error, timetableContainer);
            if (coursesContainer) handleFetchError(error, coursesContainer);
            if (todayScheduleContainer) handleFetchError(error, todayScheduleContainer);
        }
    }
    
    /**
     * Finds today's classes from the raw timetable data
     * and builds the HTML for the "Today's Schedule" card.
     */
    function populateTodaySchedule(timetableData) {
        if (!timetableData) {
             todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500">Could not load timetable data for dashboard card.</p>';
             return;
        }
        
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
            if (todaySchedule && todaySchedule[slotKey] && todaySchedule[slotKey].rowspan) {
                classCount++;
                const course = todaySchedule[slotKey];
                const rowspan = course.rowspan;
                const startTime = slotKey.split(' - ')[0];
                const endIndex = index + rowspan - 1;
                const endTime = time_slot_keys[endIndex].split(' - ')[1];

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
    lucide.createIcons();
    showPageSection('dashboard');
    checkSession();
});