document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = window.location.origin;

    // --- API Targets ---
    const TIMETABLE_TARGET = 'academics/common/StudentTimeTableChn';
    const MARKS_TARGET = 'examinations/doStudentMarkView';
    const EXAM_SCHEDULE_TARGET = 'examinations/doSearchExamScheduleForStudent';
    const ATTENDANCE_TARGET = 'processViewStudentAttendance';
    const CALENDAR_TARGET = 'academics/common/CalendarPreview';
    const CURRICULUM_TARGET = 'student/viewMyCurriculum'; 
    const PROJECTS_TARGET = 'student/studentProjectView'; 
    const ENROLLMENT_TARGET = 'courseManagement/studentCourseRegister'; 
    const HOSTEL_TARGET = 'hostels/student/leave/1';
    const PROFILE_TARGET = 'student/studentProfileView';

    // --- State ---
    let currentSemesterId = null;

    // --- Elements ---
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const navLinks = document.querySelectorAll('.nav-link');
    const navLinkChildren = document.querySelectorAll('.nav-link-child'); // Combined selector
    const pageSections = document.querySelectorAll('.page-section');
    const academicsToggle = document.querySelector('[data-section="academics"]');
    const examinationsToggle = document.querySelector('[data-section="examinations"]');
    
    const semesterSelect = document.getElementById('semester-select');
    const logoutBtn = document.getElementById('logoutBtn');
    const sidebarUsername = document.getElementById('sidebar-username');
    const sidebarRegNo = document.getElementById('sidebar-regno');
    const contentContainer = document.getElementById('content'); 
    
    // Containers
    const todayScheduleContainer = document.getElementById('today-schedule-container');
    const timetableContainer = document.getElementById('timetable-container');
    const coursesContainer = document.getElementById('courses-container');
    const attendanceContainer = document.getElementById('attendance-container');
    const marksContainer = document.getElementById('marks-container');
    const examScheduleContainer = document.getElementById('exam-schedule-container');
    const curriculumContainer = document.getElementById('curriculum-container');
    const projectsContainer = document.getElementById('projects-container');
    const calendarContainer = document.getElementById('calendar-container');
    const enrollmentContainer = document.getElementById('enrollment-container');
    const hostelContainer = document.getElementById('hostel-container');
    const profileContainer = document.getElementById('profile-container');
    
    // Snapshot Elements
    const snapshotAttPerc = document.getElementById('snapshot-attendance-perc');
    const snapshotAttBar = document.getElementById('snapshot-attendance-bar');
    const snapshotOdCount = document.getElementById('snapshot-od-count');
    const snapshotOdBar = document.getElementById('snapshot-od-bar');

    const allDataContainers = [
        todayScheduleContainer, timetableContainer, coursesContainer,
        attendanceContainer, marksContainer, examScheduleContainer, curriculumContainer,
        projectsContainer, calendarContainer, enrollmentContainer,
        hostelContainer, profileContainer
    ];

    // Modal
    const modal = document.getElementById('detail-modal');
    const modalContent = modal.querySelector('.modal-content');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    
    // --- Navigation ---
    function showPageSection(sectionId) {
        pageSections.forEach(section => {
            section.style.display = section.id === sectionId ? 'block' : 'none';
        });
        // Toggle active state for main nav links
        navLinks.forEach(l => l.classList.toggle('active', l.dataset.section === sectionId));
        
        // Keep dropdown parents active if a child is active
        if (sectionId === 'academics' && academicsToggle) academicsToggle.classList.add('active');
        if (sectionId === 'examinations' && examinationsToggle) examinationsToggle.classList.add('active');
    }

    function showSubsection(parentId, subsectionId) {
        // Find the parent section (e.g., #academics)
        const parentSection = document.getElementById(parentId);
        if (!parentSection) return;

        // Hide all subsections inside this parent
        const subsections = parentSection.querySelectorAll(`.${parentId}-subsection`);
        subsections.forEach(sub => sub.style.display = 'none');
        
        // Show the target subsection
        const targetSub = document.getElementById(subsectionId);
        if (targetSub) targetSub.style.display = 'block';

        // Update nav link states
        navLinkChildren.forEach(l => {
            l.classList.toggle('active-subsection', l.dataset.subsection === subsectionId);
        });
    }

    function getActivePage() {
        const activeNav = document.querySelector('.nav-link.active');
        const activeSubNav = document.querySelector('.nav-link-child.active-subsection');
        
        // If it's a direct main link (not a dropdown parent)
        if (activeNav && !['academics', 'examinations'].includes(activeNav.dataset.section)) {
            return { type: 'section', id: activeNav.dataset.section };
        }
        // If a subsection is active
        if (activeSubNav) {
            return { type: 'subsection', id: activeSubNav.dataset.subsection };
        }
        return { type: 'section', id: 'dashboard' }; 
    }

    function clearAllDataContainers() {
        allDataContainers.forEach(container => {
            if (container) container.innerHTML = ''; 
        });
        if (snapshotAttPerc) snapshotAttPerc.textContent = '...';
        if (snapshotAttBar) snapshotAttBar.style.width = '0%';
        if (snapshotOdCount) snapshotOdCount.textContent = '... / 40';
        if (snapshotOdBar) snapshotOdBar.style.width = '0%';
        if (todayScheduleContainer) todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">Loading today\'s schedule...</p>';
    }

    // Calendar Navigation Listener
    calendarContainer.addEventListener('click', (e) => {
        const navBtn = e.target.closest('.calendar-nav-btn');
        if (navBtn) {
            const targetDate = navBtn.dataset.date;
            fetchAndDisplay(CALENDAR_TARGET, calendarContainer, "Academic Calendar", { calDate: targetDate });
        }
    });

    function refreshCurrentPage() {
        clearAllDataContainers();
        const activePage = getActivePage();

        if (activePage.type === 'section') {
            switch (activePage.id) {
                case 'dashboard':
                    fetchTimetableAndCourses(); 
                    fetchAndCalculateAttendanceSnapshot();
                    fetchAndDisplayODSnapshot(); 
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
                // Academics
                case 'academics-courses':
                case 'academics-timetable':
                    fetchTimetableAndCourses();
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
                
                // Examinations
                case 'examinations-marks':
                    fetchAndDisplay(MARKS_TARGET, marksContainer, "Marks");
                    break;
                case 'examinations-schedule':
                    fetchAndDisplay(EXAM_SCHEDULE_TARGET, examScheduleContainer, "Exam Schedule");
                    break;
            }
        }
    }

    // Main Nav Listeners
    navLinks.forEach(link => {
        if (link === academicsToggle || link === examinationsToggle) return; // Skip dropdown toggles
        
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPageSection(link.dataset.section);
            const section = link.dataset.section;
            
            if (section === 'enrollment') fetchAndDisplay(ENROLLMENT_TARGET, enrollmentContainer, "Course Enrollment");
            else if (section === 'hostel') fetchAndDisplay(HOSTEL_TARGET, hostelContainer, "Hostel");
            else if (section === 'profile') fetchAndDisplay(PROFILE_TARGET, profileContainer, "Profile");
            else if (section === 'dashboard') refreshCurrentPage();

            if (window.innerWidth < 768) sidebar.classList.add('-translate-x-full');
            contentContainer.scrollTop = 0;
        });
    });

    // Subsection Nav Listeners (Handles both Academics and Examinations)
    navLinkChildren.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const parentId = link.dataset.parent;
            const subsectionId = link.dataset.subsection;
            
            showPageSection(parentId);
            showSubsection(parentId, subsectionId);
            
            if (subsectionId === 'academics-attendance') fetchAndDisplay(ATTENDANCE_TARGET, attendanceContainer, "Attendance");
            else if (subsectionId === 'academics-calendar') fetchAndDisplay(CALENDAR_TARGET, calendarContainer, "Academic Calendar");
            else if (subsectionId === 'academics-curriculum') fetchAndDisplay(CURRICULUM_TARGET, curriculumContainer, "My Curriculum");
            else if (subsectionId === 'academics-projects') fetchAndDisplay(PROJECTS_TARGET, projectsContainer, "Projects");
            else if (subsectionId === 'examinations-marks') fetchAndDisplay(MARKS_TARGET, marksContainer, "Marks");
            else if (subsectionId === 'examinations-schedule') fetchAndDisplay(EXAM_SCHEDULE_TARGET, examScheduleContainer, "Exam Schedule");

            if (window.innerWidth < 768) sidebar.classList.add('-translate-x-full');
            contentContainer.scrollTop = 0;
        });
    });
    
    menuToggle.addEventListener('click', () => sidebar.classList.toggle('-translate-x-full'));

    const themeToggle = document.getElementById('theme-toggle');
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });

    function handleFetchError(error, container) {
        console.error('Fetch error:', error);
        if (error.message.includes("Session expired")) {
             localStorage.removeItem('vtop_session_id');
             window.location.href = '/login';
        } else if (container) {
             container.innerHTML = `<p class="text-red-500 text-sm">Error: ${error.message}</p>`;
        }
    }

    async function fetchAndDisplay(target, containerElement, title, extraParams = {}) {
        containerElement.innerHTML = `<p class="text-sm text-gray-500 flex items-center"><i data-lucide="loader" class="animate-spin h-5 w-5 mr-2 text-indigo-600"></i> Loading ${title || 'content'}...</p>`;
        lucide.createIcons(); 

        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            if (!currentSessionId) throw new Error("No session ID");

            const payload = { 
                session_id: currentSessionId, 
                target: target,
                semesterSubId: currentSemesterId,
                ...extraParams 
            };

            const response = await fetch(`${API_BASE_URL}/fetch-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 401) throw new Error("Session expired. Redirecting to login.");
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
        if (!savedSessionId) { window.location.href = '/login'; return; }

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
                semesterSelect.innerHTML = ''; 
                data.semesters.forEach(semester => {
                    const option = document.createElement('option');
                    option.value = semester.id;
                    option.textContent = semester.name;
                    semesterSelect.appendChild(option);
                });
                currentSemesterId = data.semesters[0].id;
                
                // Only load dashboard default items (not all tabs)
                fetchTimetableAndCourses();
                fetchAndCalculateAttendanceSnapshot();
                fetchAndDisplayODSnapshot();
            } else {
                throw new Error(data.message || 'Could not load semesters');
            }
        } catch (error) {
            semesterSelect.innerHTML = '<option>Error loading</option>';
            console.error("Failed to populate semesters:", error);
        }
    }

    async function fetchAndCalculateAttendanceSnapshot() {
        if (!currentSemesterId) return; 
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/fetch-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId, target: ATTENDANCE_TARGET, semesterSubId: currentSemesterId })
            });
            if (!response.ok) throw new Error('Failed to fetch attendance');
            const data = await response.json();
            if (data.status === 'success' && data.raw_data) {
                let totalAttended = 0;
                let totalConducted = 0;
                data.raw_data.forEach(course => {
                    const attended = parseInt(course.attended_classes, 10);
                    const total = parseInt(course.total_classes, 10);
                    if (!isNaN(attended) && !isNaN(total)) { totalAttended += attended; totalConducted += total; }
                });
                let percentage = 0;
                if (totalConducted > 0) percentage = (totalAttended / totalConducted) * 100;
                if (snapshotAttPerc && snapshotAttBar) {
                    if (totalConducted === 0) { snapshotAttPerc.textContent = 'N/A'; snapshotAttBar.style.width = '0%'; }
                    else { snapshotAttPerc.textContent = `${percentage.toFixed(0)}%`; snapshotAttBar.style.width = `${percentage.toFixed(0)}%`; }
                }
            }
        } catch (error) { console.error('Error calculating attendance snapshot:', error); if (snapshotAttPerc) snapshotAttPerc.textContent = 'Err'; }
    }

    async function fetchAndDisplayODSnapshot() {
        if (!currentSemesterId) return;
        if (snapshotOdCount) snapshotOdCount.textContent = '... / 40';
        if (snapshotOdBar) snapshotOdBar.style.width = '0%';
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/get-od-snapshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId, semesterSubId: currentSemesterId })
            });
            if (!response.ok) throw new Error('Failed to fetch OD data');
            const data = await response.json();
            if (data.status === 'success') {
                const odCount = data.total_od_count;
                const odPercentage = (odCount / 40) * 100;
                if (snapshotOdCount && snapshotOdBar) { snapshotOdCount.textContent = `${odCount} / 40`; snapshotOdBar.style.width = `${Math.min(odPercentage, 100)}%`; }
            } else { throw new Error(data.message || 'Failed to get OD count'); }
        } catch (error) { console.error('Error fetching OD snapshot:', error); if (snapshotOdCount) snapshotOdCount.textContent = 'Err / 40'; }
    }

    async function fetchTimetableAndCourses() {
        if (!currentSemesterId) return;
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/fetch-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId, target: TIMETABLE_TARGET, semesterSubId: currentSemesterId })
            });

            if (!response.ok) {
                 if (response.status === 401) throw new Error("Session expired. Redirecting to login.");
                 throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();
            if (data.status === 'success') {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.html_content, 'text/html');
                const coursesContent = doc.getElementById('registered-courses-content');
                const timetableContent = doc.getElementById('weekly-timetable-content');

                if (coursesContent) { coursesContainer.innerHTML = ''; coursesContainer.appendChild(coursesContent); }
                else { coursesContainer.innerHTML = '<p class="text-red-500">Could not parse registered courses.</p>'; }
                
                if (timetableContent) { timetableContainer.innerHTML = ''; timetableContainer.appendChild(timetableContent); }
                else { timetableContainer.innerHTML = '<p class="text-red-500">Could not parse timetable.</p>'; }
                
                populateTodaySchedule(data.raw_data.timetable);
                lucide.createIcons(); 
            } else { throw new Error(data.message || "Failed to fetch data."); }
        } catch (error) {
            handleFetchError(error, timetableContainer);
            if (coursesContainer) handleFetchError(error, coursesContainer);
            if (todayScheduleContainer) handleFetchError(error, todayScheduleContainer);
        }
    }
    
    function populateTodaySchedule(timetableData) {
        if (!timetableData) { todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500">Could not load timetable data for dashboard card.</p>'; return; }
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
                const endTime = (time_slot_keys[endIndex] || "N/A").split(' - ')[1];
                finalHtml += `
                    <div class="flex items-center p-3 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
                        <div class="w-16 text-center border-r border-gray-200 dark:border-gray-600 pr-3">
                            <p class="font-bold text-indigo-600 dark:text-indigo-400">${startTime}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">${endTime}</p>
                        </div>
                        <div class="ml-4 flex-grow">
                            <p class="font-semibold text-gray-900 dark:text-white">${course.title}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">${course.code} (${course.type})</p>
                        </div>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">${course.venue}</span>
                    </div>
                `;
            }
        });
        if (classCount === 0) { todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 p-2">No classes scheduled for today.</p>'; } 
        else { todayScheduleContainer.innerHTML = finalHtml; }
    }
    
    function showModal(title, body) {
        modalTitle.textContent = title;
        modalBody.innerHTML = body;
        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); modalContent.classList.remove('scale-95', 'opacity-0'); }, 10);
    }

    function closeModal() {
        modal.classList.add('opacity-0');
        modalContent.classList.add('scale-95', 'opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 250);
    }

    modalCloseBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    async function fetchAttendanceDetail(classId, slot, courseTitle, buttonElement) {
        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i data-lucide="loader" class="animate-spin h-4 w-4"></i>';
        lucide.createIcons();
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/fetch-attendance-detail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId, class_id: classId, slot: slot, semesterSubId: currentSemesterId })
            });
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();
            if (data.status === 'success') showModal(`Attendance: ${courseTitle}`, data.html_content);
            else throw new Error(data.message || "Failed to get details.");
        } catch (error) {
            alert(error.message);
            if (error.message.includes("Session expired")) handleFetchError(error, contentContainer);
        } finally { buttonElement.innerHTML = originalText; }
    }

    contentContainer.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.view-attendance-detail');
        if (targetButton) {
            e.preventDefault();
            fetchAttendanceDetail(targetButton.dataset.classId, targetButton.dataset.slot, targetButton.dataset.courseTitle, targetButton);
        }
    });

    semesterSelect.addEventListener('change', () => {
        currentSemesterId = semesterSelect.value;
        refreshCurrentPage();
    });

    logoutBtn.addEventListener('click', async (e) => { 
        e.preventDefault();
        const currentSessionId = localStorage.getItem('vtop_session_id');
        await fetch(`${API_BASE_URL}/logout`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({session_id: currentSessionId}) }); 
        localStorage.removeItem('vtop_session_id');
        window.location.href = '/login';
    });

    lucide.createIcons();
    showPageSection('dashboard');
    checkSession();
});