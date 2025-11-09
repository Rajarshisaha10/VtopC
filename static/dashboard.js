document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = window.location.origin;

    // --- API Targets ---
    const TIMETABLE_TARGET = 'academics/common/StudentTimeTableChn';
    const GRADES_TARGET = 'examinations/examGradeView/StudentGradeView';
    const ATTENDANCE_TARGET = 'processViewStudentAttendance';
    const CALENDAR_TARGET = 'academics/common/CalendarPreview';
    const CURRICULUM_TARGET = 'student/viewMyCurriculum'; 
    const PROJECTS_TARGET = 'student/studentProjectView'; 
    const ENROLLMENT_TARGET = 'courseManagement/studentCourseRegister'; 
    const HOSTEL_TARGET = 'hostels/student/leave/1';
    const PROFILE_TARGET = 'student/studentProfileView';

    // --- State ---
    let currentSemesterId = null;

    // --- Sidebar/Nav Elements ---
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const navLinks = document.querySelectorAll('.nav-link');
    const pageSections = document.querySelectorAll('.page-section');
    const academicsNavLinks = document.querySelectorAll('.academics-nav-link');
    const academicsSubsections = document.querySelectorAll('.academics-subsection');
    const academicsToggle = document.querySelector('[data-section="academics"]');
    const academicsSubmenu = academicsToggle.nextElementSibling;
    const semesterSelect = document.getElementById('semester-select');
    
    // --- Data-specific Elements ---
    const logoutBtn = document.getElementById('logoutBtn');
    const sidebarUsername = document.getElementById('sidebar-username');
    const sidebarRegNo = document.getElementById('sidebar-regno');
    const contentContainer = document.getElementById('content'); 
    
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
    
    // Store all containers for easy clearing
    const allDataContainers = [
        todayScheduleContainer, timetableContainer, coursesContainer,
        attendanceContainer, gradesContainer, curriculumContainer,
        projectsContainer, calendarContainer, enrollmentContainer,
        hostelContainer, profileContainer
    ];

    // --- Modal Elements ---
    const modal = document.getElementById('detail-modal');
    const modalContent = modal.querySelector('.modal-content');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    
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

    function getActivePage() {
        const activeNav = document.querySelector('.nav-link.active');
        const activeSubNav = document.querySelector('.academics-nav-link.active-subsection');
        
        if (activeNav && activeNav.dataset.section !== 'academics') {
            return { type: 'section', id: activeNav.dataset.section };
        }
        if (activeSubNav) {
            return { type: 'subsection', id: activeSubNav.dataset.subsection };
        }
        return { type: 'section', id: 'dashboard' }; // Default
    }

    function clearAllDataContainers() {
        allDataContainers.forEach(container => {
            if (container) {
                container.innerHTML = ''; // Clear content
            }
        });
        // Add a loader to the dashboard card specifically
        if (todayScheduleContainer) {
            todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500">Loading today\'s schedule...</p>';
        }
    }

    function refreshCurrentPage() {
        clearAllDataContainers();
        const activePage = getActivePage();

        if (activePage.type === 'section') {
            switch (activePage.id) {
                case 'dashboard':
                    fetchTimetableAndCourses(); // This reloads dashboard card + courses
                    break;
                case 'enrollment':
                    fetchAndDisplay(ENROLLMENT_TARGET, enrollmentContainer, "Course Enrollment");
                    break;
                case 'hostel':
                    fetchAndDisplay(HOSTEL_TARGET, hostelContainer, "Hostel");
                    break;
                case 'profile':
                    fetchAndDisplay(PROFILE_TARGET, profileContainer, "Profile");
                    break;
            }
        } else if (activePage.type === 'subsection') {
            switch (activePage.id) {
                case 'academics-courses':
                    fetchTimetableAndCourses(); // This reloads courses
                    break;
                case 'academics-timetable':
                    fetchTimetableAndCourses(); // This reloads timetable
                    break;
                case 'academics-grades':
                    fetchAndDisplay(GRADES_TARGET, gradesContainer, "Grades");
                    break;
                case 'academics-attendance':
                    fetchAndDisplay(ATTENDANCE_TARGET, attendanceContainer, "Attendance");
                    break;
                case 'academics-calendar':
                    fetchAndDisplay(CALENDAR_TARGET, calendarContainer, "Academic Calendar");
                    break;
                case 'academics-curriculum':
                    fetchAndDisplay(CURRICULUM_TARGET, curriculumContainer, "My Curriculum");
                    break;
                case 'academics-projects':
                    fetchAndDisplay(PROJECTS_TARGET, projectsContainer, "Projects");
                    break;
            }
        }
    }

    // Main navigation
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.dataset.section;
            showPageSection(sectionId);

            if (sectionId === 'academics') {
                showAcademicsSubsection('academics-courses');
                fetchAndDisplay(TIMETABLE_TARGET, coursesContainer, "My Courses"); // Already loaded, but good to be explicit
            } else if (sectionId === 'enrollment') {
                fetchAndDisplay(ENROLLMENT_TARGET, enrollmentContainer, "Course Enrollment");
            } else if (sectionId === 'hostel') {
                fetchAndDisplay(HOSTEL_TARGET, hostelContainer, "Hostel");
            } else if (sectionId === 'profile') {
                fetchAndDisplay(PROFILE_TARGET, profileContainer, "Profile");
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
            showPageSection('academics'); 
            showAcademicsSubsection(subsectionId);

            if (subsectionId === 'academics-grades') {
                fetchAndDisplay(GRADES_TARGET, gradesContainer, "Grades");
            } else if (subsectionId === 'academics-attendance') {
                fetchAndDisplay(ATTENDANCE_TARGET, attendanceContainer, "Attendance");
            } else if (subsectionId === 'academics-calendar') {
                fetchAndDisplay(CALENDAR_TARGET, calendarContainer, "Academic Calendar");
            } else if (subsectionId === 'academics-curriculum') {
                fetchAndDisplay(CURRICULUM_TARGET, curriculumContainer, "My Curriculum");
            } else if (subsectionId === 'academics-projects') {
                fetchAndDisplay(PROJECTS_TARGET, projectsContainer, "Projects");
            }
            // No fetch needed for courses/timetable, they are loaded by default

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

    async function fetchAndDisplay(target, containerElement, title) {
        // Don't re-fetch if content is already there and not just a loader
        if (containerElement.querySelector('.card') || containerElement.querySelector('section')) {
            console.log(`Content for ${title} already loaded.`);
            return;
        }
        
        containerElement.innerHTML = `<p class="text-sm text-gray-500 flex items-center">
            <i data-lucide="loader" class="animate-spin h-5 w-5 mr-2 text-indigo-600"></i>
            Loading ${title || 'content'}...
        </p>`;
        lucide.createIcons(); 

        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            if (!currentSessionId) throw new Error("No session ID");

            const response = await fetch(`${API_BASE_URL}/fetch-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    session_id: currentSessionId, 
                    target: target,
                    semesterSubId: currentSemesterId // Send selected semester
                })
            });

            if (!response.ok) {
                if (response.status === 401) { 
                    throw new Error("Session expired. Redirecting to login.");
                }
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            if (data.status === 'success') {
                containerElement.innerHTML = data.html_content;
                lucide.createIcons(); 
            } else {
                 throw new Error(data.message || "Failed to fetch data.");
            }

        } catch (error) {
            handleFetchError(error, containerElement);
        }
    }


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
                // First, populate the semester dropdown
                populateSemesterDropdown(); 
            } else {
                localStorage.removeItem('vtop_session_id');
                window.location.href = '/login';
            }
        } catch (error) {
            localStorage.removeItem('vtop_session_id');
            window.location.href = '/login';
        }
    }

    async function populateSemesterDropdown() {
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/get-semesters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId })
            });

            if (!response.ok) throw new Error('Failed to fetch semesters');
            
            const data = await response.json();
            
            if (data.status === 'success' && data.semesters.length > 0) {
                semesterSelect.innerHTML = ''; // Clear "Loading..."
                data.semesters.forEach(semester => {
                    const option = document.createElement('option');
                    option.value = semester.id;
                    option.textContent = semester.name;
                    semesterSelect.appendChild(option);
                });
                
                // Set the current semester to the first one (default)
                currentSemesterId = data.semesters[0].id;
                
                // Now that we have the semester, load the default page content
                fetchTimetableAndCourses();
            } else {
                throw new Error(data.message || 'Could not load semesters');
            }
        } catch (error) {
            semesterSelect.innerHTML = '<option>Error loading</option>';
            console.error("Failed to populate semesters:", error);
        }
    }


    async function fetchTimetableAndCourses() {
        if (!currentSemesterId) {
            console.log("Waiting for semester ID...");
            return;
        }
        
        // This function now only loads the timetable, courses, and dashboard card
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/fetch-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    session_id: currentSessionId, 
                    target: TIMETABLE_TARGET,
                    semesterSubId: currentSemesterId // Send selected semester
                })
            });

            if (!response.ok) {
                if (response.status === 401) { 
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
                lucide.createIcons(); 

            } else {
                 throw new Error(data.message || "Failed to fetch data.");
            }

        } catch (error) {
            handleFetchError(error, timetableContainer);
            if (coursesContainer) handleFetchError(error, coursesContainer);
            if (todayScheduleContainer) handleFetchError(error, todayScheduleContainer);
        }
    }
    
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
                // Handle cases where class might run past the end of the array
                const endTime = (time_slot_keys[endIndex] || "N/A").split(' - ')[1];

                finalHtml += `
                    <div class="flex items-center p-3 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600">
                        <div class="w-16 text-center border-r border-gray-200 dark:border-gray-600 pr-3">
                            <p class="font-bold text-indigo-600 dark:text-indigo-400">${startTime}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">${endTime}</p>
                        </div>
                        <div class="ml-4 flex-grow">
                            <p class="font-semibold">${course.title}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">${course.code} (${course.type})</p>
                        </div>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">${course.venue}</span>
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
    
    // --- MODAL & ATTENDANCE DETAIL LOGIC ---

    function showModal(title, body) {
        modalTitle.textContent = title;
        modalBody.innerHTML = body;
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95', 'opacity-0');
        }, 10);
    }

    function closeModal() {
        modal.classList.add('opacity-0');
        modalContent.classList.add('scale-95', 'opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 250);
    }

    modalCloseBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    async function fetchAttendanceDetail(classId, slot, courseTitle, buttonElement) {
        buttonElement.innerHTML = '<i data-lucide="loader" class="animate-spin h-4 w-4"></i>';
        lucide.createIcons();
        
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/fetch-attendance-detail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    session_id: currentSessionId, 
                    class_id: classId,
                    slot: slot,
                    semesterSubId: currentSemesterId // Send selected semester
                })
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            
            const data = await response.json();
            if (data.status === 'success') {
                showModal(`Attendance: ${courseTitle}`, data.html_content);
            } else {
                throw new Error(data.message || "Failed to get details.");
            }

        } catch (error) {
            alert(error.message);
            if (error.message.includes("Session expired")) {
                handleFetchError(error, contentContainer);
            }
        } finally {
            buttonElement.innerHTML = 'View';
        }
    }

    // Event delegation for attendance detail buttons
    contentContainer.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.view-attendance-detail');
        if (targetButton) {
            e.preventDefault();
            const classId = targetButton.dataset.classId;
            const slot = targetButton.dataset.slot;
            const courseTitle = targetButton.dataset.courseTitle;
            fetchAttendanceDetail(classId, slot, courseTitle, targetButton);
        }
    });


    // --- EVENT LISTENERS ---

    // Semester change listener
    semesterSelect.addEventListener('change', () => {
        currentSemesterId = semesterSelect.value;
        console.log(`Semester changed to: ${currentSemesterId}`);
        refreshCurrentPage();
    });

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
    checkSession(); // This will now trigger populateSemesterDropdown, which then triggers fetchTimetableAndCourses
});