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
    let cachedAttendance = []; 
    let cachedTimetable = {};  

    // --- Elements ---
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const navLinks = document.querySelectorAll('.nav-link');
    const navLinkChildren = document.querySelectorAll('.nav-link-child'); 
    const pageSections = document.querySelectorAll('.page-section');
    const academicsToggle = document.querySelector('[data-section="academics"]');
    const examinationsToggle = document.querySelector('[data-section="examinations"]');
    const extraToggle = document.querySelector('[data-section="extra"]'); 
    
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
    const calculatorContainer = document.getElementById('extra-calculator'); 

    const snapshotAttPerc = document.getElementById('snapshot-attendance-perc');
    const snapshotAttBar = document.getElementById('snapshot-attendance-bar');
    const snapshotOdCount = document.getElementById('snapshot-od-count');
    const snapshotOdBar = document.getElementById('snapshot-od-bar');

    const allDataContainers = [
        todayScheduleContainer, timetableContainer, coursesContainer,
        attendanceContainer, marksContainer, examScheduleContainer, curriculumContainer,
        projectsContainer, calendarContainer, enrollmentContainer,
        hostelContainer, profileContainer, calculatorContainer
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
        navLinks.forEach(l => l.classList.toggle('active', l.dataset.section === sectionId));
        
        if (sectionId === 'academics' && academicsToggle) academicsToggle.classList.add('active');
        if (sectionId === 'examinations' && examinationsToggle) examinationsToggle.classList.add('active');
        if (sectionId === 'extra' && extraToggle) extraToggle.classList.add('active');
    }

    function showSubsection(parentId, subsectionId) {
        const parentSection = document.getElementById(parentId);
        if (!parentSection) return;
        const subsections = parentSection.querySelectorAll(`.${parentId}-subsection`);
        subsections.forEach(sub => sub.style.display = 'none');
        
        const targetSub = document.getElementById(subsectionId);
        if (targetSub) targetSub.style.display = 'block';

        navLinkChildren.forEach(l => {
            l.classList.toggle('active-subsection', l.dataset.subsection === subsectionId);
        });
    }

    function getActivePage() {
        const activeNav = document.querySelector('.nav-link.active');
        const activeSubNav = document.querySelector('.nav-link-child.active-subsection');
        
        if (activeNav && !['academics', 'examinations', 'extra'].includes(activeNav.dataset.section)) {
            return { type: 'section', id: activeNav.dataset.section };
        }
        if (activeSubNav) {
            return { type: 'subsection', id: activeSubNav.dataset.subsection };
        }
        return { type: 'section', id: 'dashboard' }; 
    }

    function clearAllDataContainers() {
        allDataContainers.forEach(container => { if (container) container.innerHTML = ''; });
        if (snapshotAttPerc) snapshotAttPerc.textContent = '...';
        if (snapshotAttBar) snapshotAttBar.style.width = '0%';
        if (snapshotOdCount) snapshotOdCount.textContent = '... / 40';
        if (snapshotOdBar) snapshotOdBar.style.width = '0%';
        if (todayScheduleContainer) todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400">Loading today\'s schedule...</p>';
    }

    // --- CALCULATOR LOGIC ---
    function renderCalculator() {
        calculatorContainer.innerHTML = `
        <div class="max-w-4xl mx-auto">
            <h2 class="text-3xl font-bold mb-6 text-gray-800 dark:text-white border-b-4 border-indigo-500 inline-block pb-2">Attendance Calculator</h2>
            
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div class="flex border-b border-gray-200 dark:border-gray-700">
                    <button id="calc-tab-subject" class="flex-1 py-4 text-sm font-medium text-center text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400 transition-colors">Subject Wise</button>
                    <button id="calc-tab-days" class="flex-1 py-4 text-sm font-medium text-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">Days / Dates</button>
                </div>

                <div id="calc-view-subject" class="p-6">
                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Predict attendance by manually adding classes to a specific subject.</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Subject</label>
                            <select id="calc-subject-select" class="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"></select>
                        </div>
                        <div class="flex gap-4">
                            <div class="flex-1">
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Attend Next</label>
                                <input type="number" id="calc-attend" value="0" min="0" class="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500">
                            </div>
                            <div class="flex-1">
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Miss Next</label>
                                <input type="number" id="calc-miss" value="0" min="0" class="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500">
                            </div>
                        </div>
                    </div>
                    <div id="calc-subject-result" class="mt-6 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg hidden border border-gray-100 dark:border-gray-700"></div>
                </div>

                <div id="calc-view-days" class="p-6 hidden">
                     <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Predict attendance by simulating future days based on your specific timetable.</p>
                     <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Date</label>
                            <input type="date" id="calc-start-date" class="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        </div>
                         <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Date</label>
                            <input type="date" id="calc-end-date" class="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        </div>
                         <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status for these days</label>
                            <select id="calc-day-status" class="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                <option value="present">Attend All</option>
                                <option value="absent">Miss All</option>
                            </select>
                        </div>
                         <div class="flex items-end">
                            <button id="calc-days-btn" class="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm">Calculate Prediction</button>
                        </div>
                     </div>
                     <div id="calc-days-result" class="mt-6 hidden space-y-3"></div>
                </div>
            </div>
        </div>`;

        const subjectSelect = document.getElementById('calc-subject-select');
        cachedAttendance.forEach((course, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${course.course_code} - ${course.course_title}`;
            subjectSelect.appendChild(option);
        });

        const tabSubject = document.getElementById('calc-tab-subject');
        const tabDays = document.getElementById('calc-tab-days');
        const viewSubject = document.getElementById('calc-view-subject');
        const viewDays = document.getElementById('calc-view-days');

        function switchTab(isSubject) {
            if (isSubject) {
                viewSubject.classList.remove('hidden'); viewDays.classList.add('hidden');
                tabSubject.classList.add('text-indigo-600', 'border-b-2', 'border-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/20', 'dark:text-indigo-400');
                tabSubject.classList.remove('text-gray-500', 'hover:text-gray-700', 'dark:text-gray-400');
                tabDays.classList.remove('text-indigo-600', 'border-b-2', 'border-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/20', 'dark:text-indigo-400');
                tabDays.classList.add('text-gray-500', 'hover:text-gray-700', 'dark:text-gray-400');
            } else {
                viewDays.classList.remove('hidden'); viewSubject.classList.add('hidden');
                tabDays.classList.add('text-indigo-600', 'border-b-2', 'border-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/20', 'dark:text-indigo-400');
                tabDays.classList.remove('text-gray-500', 'hover:text-gray-700', 'dark:text-gray-400');
                tabSubject.classList.remove('text-indigo-600', 'border-b-2', 'border-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/20', 'dark:text-indigo-400');
                tabSubject.classList.add('text-gray-500', 'hover:text-gray-700', 'dark:text-gray-400');
            }
        }
        tabSubject.addEventListener('click', () => switchTab(true));
        tabDays.addEventListener('click', () => switchTab(false));

        function updateSubjectCalc() {
            const idx = subjectSelect.value;
            const attend = parseInt(document.getElementById('calc-attend').value) || 0;
            const miss = parseInt(document.getElementById('calc-miss').value) || 0;
            if (cachedAttendance[idx]) {
                const course = cachedAttendance[idx];
                const currentAttended = parseInt(course.attended_classes);
                const currentTotal = parseInt(course.total_classes);
                
                const newAttended = currentAttended + attend;
                const newTotal = currentTotal + attend + miss;
                const newPerc = (newAttended / newTotal * 100).toFixed(2);
                
                const resultDiv = document.getElementById('calc-subject-result');
                resultDiv.classList.remove('hidden');
                
                let colorClass = newPerc >= 75 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                resultDiv.innerHTML = `
                    <div class="flex flex-col sm:flex-row justify-between items-center gap-2">
                        <span class="text-sm text-gray-600 dark:text-gray-300">Current: <strong>${course.percentage}</strong> (${course.attended_classes}/${course.total_classes})</span>
                        <span class="text-lg font-bold ${colorClass}">Prediction: ${newPerc}% <span class="text-xs text-gray-500 font-normal">(${newAttended}/${newTotal})</span></span>
                    </div>
                `;
            }
        }
        
        document.getElementById('calc-attend').addEventListener('input', updateSubjectCalc);
        document.getElementById('calc-miss').addEventListener('input', updateSubjectCalc);
        subjectSelect.addEventListener('change', updateSubjectCalc);

        document.getElementById('calc-days-btn').addEventListener('click', () => {
            const startDateVal = document.getElementById('calc-start-date').value;
            const endDateVal = document.getElementById('calc-end-date').value;
            const status = document.getElementById('calc-day-status').value;
            
            if (!startDateVal || !endDateVal) { alert("Please select dates."); return; }
            
            const start = new Date(startDateVal);
            const end = new Date(endDateVal);
            
            let tempAttendance = JSON.parse(JSON.stringify(cachedAttendance));
            const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dayName = dayMap[d.getDay()];
                if (cachedTimetable[dayName]) {
                    const daySchedule = cachedTimetable[dayName];
                    const coursesInDay = new Set();
                    Object.values(daySchedule).forEach(slot => { if (slot.code) coursesInDay.add(slot.code); });
                    
                    coursesInDay.forEach(code => {
                        const courseIdx = tempAttendance.findIndex(c => c.course_code === code);
                        if (courseIdx !== -1) {
                             // Simple approximation: 1 slot = 1 class. 
                             // If a course has 2 slots in a day (e.g., 2 hours), it counts as 2.
                             let classesInDay = 0;
                             Object.values(daySchedule).forEach(s => { if(s.code === code) classesInDay++; });

                             tempAttendance[courseIdx].total_classes = parseInt(tempAttendance[courseIdx].total_classes) + classesInDay;
                             if (status === 'present') {
                                 tempAttendance[courseIdx].attended_classes = parseInt(tempAttendance[courseIdx].attended_classes) + classesInDay;
                             }
                        }
                    });
                }
            }
            
            const resDiv = document.getElementById('calc-days-result');
            resDiv.innerHTML = '';
            resDiv.classList.remove('hidden');
            
            tempAttendance.forEach(course => {
                const original = cachedAttendance.find(c => c.course_code === course.course_code);
                if (original && original.total_classes != course.total_classes) {
                    const newPerc = (course.attended_classes / course.total_classes * 100).toFixed(2);
                    const colorClass = newPerc >= 75 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                    
                    resDiv.innerHTML += `
                        <div class="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex justify-between items-center shadow-sm">
                            <div>
                                <p class="font-bold text-sm dark:text-white mb-0.5">${course.course_code}</p>
                                <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <span>${original.percentage}</span>
                                    <i data-lucide="arrow-right" class="w-3 h-3"></i>
                                    <span class="${colorClass} font-bold text-sm">${newPerc}%</span>
                                </div>
                            </div>
                            <div class="text-xs text-gray-400 font-mono">
                                ${course.attended_classes}/${course.total_classes}
                            </div>
                        </div>
                    `;
                }
            });
            if (resDiv.innerHTML === '') resDiv.innerHTML = '<p class="text-sm text-gray-500 text-center italic">No classes found in schedule for these dates.</p>';
            lucide.createIcons();
        });
    }

    // --- REFRESH LOGIC ---
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
            if (activePage.id === 'extra-calculator') {
                if (cachedAttendance.length === 0 || Object.keys(cachedTimetable).length === 0) {
                     calculatorContainer.innerHTML = '<div class="p-8 text-center"><i data-lucide="loader" class="animate-spin h-8 w-8 mx-auto text-indigo-500 mb-2"></i><p class="text-gray-500">Fetching data for calculator...</p></div>';
                     lucide.createIcons();
                     Promise.all([fetchAttendanceForCache(), fetchTimetableForCache()]).then(() => {
                         renderCalculator();
                     });
                } else {
                    renderCalculator();
                }
            } else {
                // Trigger sub-section fetches
                const link = document.querySelector(`.nav-link-child[data-subsection="${activePage.id}"]`);
                if (link) link.click(); 
            }
        }
    }

    async function fetchAttendanceForCache() {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: ATTENDANCE_TARGET, semesterSubId: currentSemesterId })
        });
        const data = await response.json();
        if (data.status === 'success') cachedAttendance = data.raw_data;
    }
    
    async function fetchTimetableForCache() {
         const response = await fetch(`${API_BASE_URL}/fetch-data`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: TIMETABLE_TARGET, semesterSubId: currentSemesterId })
        });
        const data = await response.json();
        if (data.status === 'success') cachedTimetable = data.raw_data.timetable;
    }

    // Overwrite to cache data
    async function fetchAndCalculateAttendanceSnapshot() {
        if (!currentSemesterId) return; 
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/fetch-data`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId, target: ATTENDANCE_TARGET, semesterSubId: currentSemesterId })
            });
            const data = await response.json();
            if (data.status === 'success' && data.raw_data) {
                cachedAttendance = data.raw_data; 
                let totalAttended = 0, totalConducted = 0;
                data.raw_data.forEach(course => {
                    const attended = parseInt(course.attended_classes, 10);
                    const total = parseInt(course.total_classes, 10);
                    if (!isNaN(attended) && !isNaN(total)) { totalAttended += attended; totalConducted += total; }
                });
                let percentage = 0;
                if (totalConducted > 0) percentage = (totalAttended / totalConducted) * 100;
                if (snapshotAttPerc) {
                     snapshotAttPerc.textContent = `${percentage.toFixed(0)}%`;
                     snapshotAttBar.style.width = `${percentage.toFixed(0)}%`;
                }
            }
        } catch (error) { console.error(error); }
    }

    async function fetchTimetableAndCourses() {
        if (!currentSemesterId) return;
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const response = await fetch(`${API_BASE_URL}/fetch-data`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId, target: TIMETABLE_TARGET, semesterSubId: currentSemesterId })
            });
            const data = await response.json();
            if (data.status === 'success') {
                cachedTimetable = data.raw_data.timetable;
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.html_content, 'text/html');
                const coursesContent = doc.getElementById('registered-courses-content');
                const timetableContent = doc.getElementById('weekly-timetable-content');
                if (coursesContainer) coursesContainer.innerHTML = ''; 
                if (coursesContent) coursesContainer.appendChild(coursesContent);
                if (timetableContainer) timetableContainer.innerHTML = ''; 
                if (timetableContent) timetableContainer.appendChild(timetableContent);
                populateTodaySchedule(data.raw_data.timetable);
                lucide.createIcons(); 
            }
        } catch (error) { handleFetchError(error, timetableContainer); }
    }
    
    // --- Navigation & Init ---
    navLinks.forEach(link => {
        if (link === academicsToggle || link === examinationsToggle || link === extraToggle) return;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPageSection(link.dataset.section);
            const section = link.dataset.section;
            if (section === 'hostel') fetchAndDisplay(HOSTEL_TARGET, hostelContainer, "Hostel");
            else if (section === 'profile') fetchAndDisplay(PROFILE_TARGET, profileContainer, "Profile");
            else if (section === 'dashboard') refreshCurrentPage();
            if (window.innerWidth < 768) sidebar.classList.add('-translate-x-full');
            contentContainer.scrollTop = 0;
        });
    });

    navLinkChildren.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const parentId = link.dataset.parent;
            const subsectionId = link.dataset.subsection;
            showPageSection(parentId);
            showSubsection(parentId, subsectionId);
            
            if (subsectionId === 'extra-calculator') {
                if (cachedAttendance.length === 0 || Object.keys(cachedTimetable).length === 0) {
                     calculatorContainer.innerHTML = '<div class="p-8 text-center"><i data-lucide="loader" class="animate-spin h-8 w-8 mx-auto text-indigo-500 mb-2"></i><p class="text-gray-500">Fetching data for calculator...</p></div>';
                     lucide.createIcons();
                     Promise.all([fetchAttendanceForCache(), fetchTimetableForCache()]).then(() => { renderCalculator(); });
                } else { renderCalculator(); }
            }
            else if (subsectionId === 'academics-attendance') fetchAndDisplay(ATTENDANCE_TARGET, attendanceContainer, "Attendance");
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
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
    
    // ... (Existing modal, fetch details, semester select, logout code) ...
    function handleFetchError(error, container) {
        console.error('Fetch error:', error);
        if (error.message.includes("Session expired")) { localStorage.removeItem('vtop_session_id'); window.location.href = '/login'; } 
        else if (container) { container.innerHTML = `<p class="text-red-500 text-sm">Error: ${error.message}</p>`; }
    }

    async function fetchAndDisplay(target, containerElement, title, extraParams = {}) {
        containerElement.innerHTML = `<p class="text-sm text-gray-500 flex items-center"><i data-lucide="loader" class="animate-spin h-5 w-5 mr-2 text-indigo-600"></i> Loading ${title || 'content'}...</p>`;
        lucide.createIcons(); 
        try {
            const currentSessionId = localStorage.getItem('vtop_session_id');
            const payload = { session_id: currentSessionId, target: target, semesterSubId: currentSemesterId, ...extraParams };
            const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error("Server error");
            const data = await response.json();
            if (data.status === 'success') { containerElement.innerHTML = data.html_content; lucide.createIcons(); } 
            else { throw new Error(data.message); }
        } catch (error) { handleFetchError(error, containerElement); }
    }

    async function checkSession() {
        const savedSessionId = localStorage.getItem('vtop_session_id');
        if (!savedSessionId) { window.location.href = '/login'; return; }
        try {
            const response = await fetch(`${API_BASE_URL}/check-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: savedSessionId }) });
            if (!response.ok) throw new Error();
            const data = await response.json();
            if (data.status === 'success') { sidebarUsername.textContent = data.username; sidebarRegNo.textContent = data.username; populateSemesterDropdown(); } 
            else { localStorage.removeItem('vtop_session_id'); window.location.href = '/login'; }
        } catch (error) { localStorage.removeItem('vtop_session_id'); window.location.href = '/login'; }
    }

    async function populateSemesterDropdown() {
        try {
            const response = await fetch(`${API_BASE_URL}/get-semesters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id') }) });
            const data = await response.json();
            if (data.status === 'success' && data.semesters.length > 0) {
                semesterSelect.innerHTML = ''; 
                data.semesters.forEach(s => { const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.name; semesterSelect.appendChild(opt); });
                currentSemesterId = data.semesters[0].id;
                fetchTimetableAndCourses(); fetchAndCalculateAttendanceSnapshot(); fetchAndDisplayODSnapshot();
            }
        } catch (error) { console.error(error); }
    }

    function populateTodaySchedule(timetableData) {
        if (!timetableData) { todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500">Could not load timetable.</p>'; return; }
        const time_slot_keys = ["08:00 - 08:50", "08:55 - 09:45", "09:50 - 10:40", "10:45 - 11:35", "11:40 - 12:30", "12:35 - 13:25", "LUNCH", "14:00 - 14:50", "14:55 - 15:45", "15:50 - 16:40", "16:45 - 17:35", "17:40 - 18:30", "18:35 - 19:25"];
        const dayMap = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const todayDayString = dayMap[new Date().getDay()];
        const todaySchedule = timetableData[todayDayString];
        let classCount = 0; let finalHtml = '';

        time_slot_keys.forEach((slotKey, index) => {
            if (todaySchedule && todaySchedule[slotKey] && todaySchedule[slotKey].rowspan) {
                classCount++;
                const course = todaySchedule[slotKey];
                const endTime = (time_slot_keys[index + course.rowspan - 1] || "N/A").split(' - ')[1];
                finalHtml += `<div class="flex items-center p-3 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"><div class="w-16 text-center border-r border-gray-200 dark:border-gray-600 pr-3"><p class="font-bold text-indigo-600 dark:text-indigo-400">${slotKey.split(' - ')[0]}</p><p class="text-xs text-gray-500 dark:text-gray-400">${endTime}</p></div><div class="ml-4 flex-grow"><p class="font-semibold text-gray-900 dark:text-white">${course.title}</p><p class="text-xs text-gray-500 dark:text-gray-400">${course.code} (${course.type})</p></div><span class="text-sm font-medium text-gray-700 dark:text-gray-300">${course.venue}</span></div>`;
            }
        });
        todayScheduleContainer.innerHTML = classCount === 0 ? '<p class="text-sm text-gray-500 dark:text-gray-400 p-2">No classes scheduled for today.</p>' : finalHtml;
    }

    function showModal(title, body) { modalTitle.textContent = title; modalBody.innerHTML = body; modal.classList.remove('hidden'); setTimeout(() => { modal.classList.remove('opacity-0'); modalContent.classList.remove('scale-95', 'opacity-0'); }, 10); }
    function closeModal() { modal.classList.add('opacity-0'); modalContent.classList.add('scale-95', 'opacity-0'); setTimeout(() => modal.classList.add('hidden'), 250); }
    modalCloseBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    async function fetchAttendanceDetail(classId, slot, courseTitle, buttonElement) {
        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i data-lucide="loader" class="animate-spin h-4 w-4"></i>';
        lucide.createIcons();
        try {
            const response = await fetch(`${API_BASE_URL}/fetch-attendance-detail`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), class_id: classId, slot: slot, semesterSubId: currentSemesterId }) });
            const data = await response.json();
            if (data.status === 'success') showModal(`Attendance: ${courseTitle}`, data.html_content);
        } catch (error) { alert(error.message); } finally { buttonElement.innerHTML = originalText; }
    }

    contentContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.view-attendance-detail');
        if (btn) { e.preventDefault(); fetchAttendanceDetail(btn.dataset.classId, btn.dataset.slot, btn.dataset.courseTitle, btn); }
    });

    async function fetchAndDisplayODSnapshot() {
        if (!currentSemesterId) return;
        try {
            const response = await fetch(`${API_BASE_URL}/get-od-snapshot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), semesterSubId: currentSemesterId }) });
            const data = await response.json();
            if (data.status === 'success' && snapshotOdCount) {
                snapshotOdCount.textContent = `${data.total_od_count} / 40`;
                snapshotOdBar.style.width = `${Math.min((data.total_od_count / 40) * 100, 100)}%`;
            }
        } catch (e) { console.error(e); }
    }
    
    semesterSelect.addEventListener('change', () => { currentSemesterId = semesterSelect.value; refreshCurrentPage(); });
    logoutBtn.addEventListener('click', async (e) => { 
        e.preventDefault(); 
        await fetch(`${API_BASE_URL}/logout`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({session_id: localStorage.getItem('vtop_session_id')}) }); 
        localStorage.removeItem('vtop_session_id'); window.location.href = '/login'; 
    });

    lucide.createIcons();
    showPageSection('dashboard');
    checkSession();
});