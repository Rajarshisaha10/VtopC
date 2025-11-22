import { API_BASE_URL, TARGETS } from './modules/constants.js';
import { state } from './modules/state.js';
import * as UI from './modules/ui.js';
import * as Data from './modules/data.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard module loaded.");

    // --- DOM Elements ---
    const elements = {
        menuToggle: document.getElementById('menu-toggle'),
        sidebar: document.getElementById('sidebar'),
        navLinks: document.querySelectorAll('.nav-link'),
        navLinkChildren: document.querySelectorAll('.nav-link-child'),
        pageSections: document.querySelectorAll('.page-section'),
        academicsToggle: document.querySelector('[data-section="academics"]'),
        examinationsToggle: document.querySelector('[data-section="examinations"]'),
        extraToggle: document.querySelector('[data-section="extra"]'),
        semesterSelect: document.getElementById('semester-select'),
        logoutBtn: document.getElementById('logoutBtn'),
        sidebarUsername: document.getElementById('sidebar-username'),
        sidebarRegNo: document.getElementById('sidebar-regno'),
        contentContainer: document.getElementById('content'),
        btnQuickAttendance: document.getElementById('btn-quick-attendance'),
        btnQuickMarks: document.getElementById('btn-quick-marks'),
        
        // Content Containers
        todaySchedule: document.getElementById('today-schedule-container'),
        timetable: document.getElementById('timetable-container'),
        courses: document.getElementById('courses-container'),
        attendance: document.getElementById('attendance-container'),
        marks: document.getElementById('marks-container'),
        examSchedule: document.getElementById('exam-schedule-container'),
        curriculum: document.getElementById('curriculum-container'),
        projects: document.getElementById('projects-container'),
        calendar: document.getElementById('calendar-container'),
        enrollment: document.getElementById('enrollment-container'),
        hostel: document.getElementById('hostel-container'),
        profile: document.getElementById('profile-container'),
        calculator: document.getElementById('extra-calculator'),
        
        // Modal
        modal: document.getElementById('detail-modal'),
        modalContent: document.querySelector('.modal-content'),
        modalTitle: document.getElementById('modal-title'),
        modalBody: document.getElementById('modal-body'),
        modalCloseBtn: document.getElementById('modal-close-btn')
    };

    const allDataContainers = [
        elements.todaySchedule, elements.timetable, elements.courses,
        elements.attendance, elements.marks, elements.examSchedule,
        elements.curriculum, elements.projects, elements.calendar,
        elements.enrollment, elements.hostel, elements.profile,
        elements.calculator
    ];

    // --- Logic ---

    function refreshCurrentPage() {
        UI.clearAllDataContainers(allDataContainers);
        const activeNav = document.querySelector('.nav-link.active');
        
        if (activeNav && !['academics', 'examinations', 'extra'].includes(activeNav.dataset.section)) {
            const sectionId = activeNav.dataset.section;
            if (sectionId === 'dashboard') {
                // Fix: Ensure we don't pass null elements if they aren't on screen
                Data.fetchTimetableAndCourses(null, null, elements.todaySchedule)
                    .then(() => Data.fetchAndCalculateAttendanceSnapshot())
                    .then(() => Data.fetchAndDisplayODSnapshot());
            } else if (sectionId === 'enrollment') Data.fetchAndDisplay(TARGETS.ENROLLMENT, elements.enrollment, "Course Enrollment");
            else if (sectionId === 'hostel') Data.fetchAndDisplay(TARGETS.HOSTEL, elements.hostel, "Hostel");
            else if (sectionId === 'profile') Data.fetchAndDisplay(TARGETS.PROFILE, elements.profile, "Profile");
        } else {
            const activeSub = document.querySelector('.nav-link-child.active-subsection');
            if (activeSub) activeSub.click();
        }
    }

    // --- Event Listeners ---

    // 1. Attendance Modal (Event Delegation)
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.view-attendance-detail');
        if (btn) {
            e.preventDefault(); e.stopPropagation();
            const { classId, slot } = UI.openAttendanceDetailModal(
                elements.modal, elements.modalTitle, elements.modalBody, 
                elements.modalContent, btn.dataset.classId, btn.dataset.slot, btn.dataset.courseTitle
            );
            Data.fetchAttendanceDetails(classId, slot, elements.modalBody);
        }
    });

    // 2. Modal Close
    if (elements.modalCloseBtn) {
        elements.modalCloseBtn.addEventListener('click', () => UI.closeModal(elements.modal, elements.modalContent, elements.modalBody));
    }
    if (elements.modal) {
        elements.modal.addEventListener('click', (e) => {
            if (e.target === elements.modal) UI.closeModal(elements.modal, elements.modalContent, elements.modalBody);
        });
    }

    // 3. Quick Actions
    if (elements.btnQuickAttendance) elements.btnQuickAttendance.addEventListener('click', (e) => { 
        e.preventDefault(); 
        if(document.querySelector('.nav-link-child[data-subsection="academics-attendance"]'))
             document.querySelector('.nav-link-child[data-subsection="academics-attendance"]').click(); 
    });
    if (elements.btnQuickMarks) elements.btnQuickMarks.addEventListener('click', (e) => { 
        e.preventDefault(); 
        if(document.querySelector('.nav-link-child[data-subsection="examinations-marks"]'))
             document.querySelector('.nav-link-child[data-subsection="examinations-marks"]').click(); 
    });

    // 4. Nav Links
    elements.navLinks.forEach(link => {
        if (['academics', 'examinations', 'extra'].includes(link.dataset.section)) return;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            UI.showPageSection(link.dataset.section, elements.pageSections, elements.navLinks, elements.academicsToggle, elements.examinationsToggle, elements.extraToggle);
            
            // Handle Data Loading
            const section = link.dataset.section;
            if (section === 'enrollment') Data.fetchAndDisplay(TARGETS.ENROLLMENT, elements.enrollment, "Course Enrollment");
            else if (section === 'hostel') Data.fetchAndDisplay(TARGETS.HOSTEL, elements.hostel, "Hostel");
            else if (section === 'profile') Data.fetchAndDisplay(TARGETS.PROFILE, elements.profile, "Profile");
            
            if (window.innerWidth < 768) elements.sidebar.classList.add('-translate-x-full');
            elements.contentContainer.scrollTop = 0;
        });
    });

    // 5. Sub-nav Links
    elements.navLinkChildren.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const parentId = link.dataset.parent;
            const subsectionId = link.dataset.subsection;
            
            UI.showPageSection(parentId, elements.pageSections, elements.navLinks, elements.academicsToggle, elements.examinationsToggle, elements.extraToggle);
            UI.showSubsection(parentId, subsectionId, elements.navLinkChildren);
            
            if (subsectionId === 'extra-calculator') {
                if (state.cachedAttendance.length === 0 || Object.keys(state.cachedTimetable).length === 0) {
                     elements.calculator.innerHTML = '<div class="p-8 text-center"><i data-lucide="loader" class="animate-spin h-8 w-8 mx-auto text-indigo-500 mb-2"></i><p class="text-gray-500">Fetching data for calculator...</p></div>';
                     if (typeof lucide !== 'undefined') lucide.createIcons();
                     Promise.all([Data.fetchAttendanceForCache(), Data.fetchTimetableForCache()]).then(() => { 
                         if(window.initAttendanceCalculator) window.initAttendanceCalculator(elements.calculator, state.cachedAttendance, state.cachedTimetable);
                     });
                } else { 
                    if(window.initAttendanceCalculator) window.initAttendanceCalculator(elements.calculator, state.cachedAttendance, state.cachedTimetable); 
                }
            }
            else if (subsectionId === 'academics-attendance') Data.fetchAndDisplay(TARGETS.ATTENDANCE, elements.attendance, "Attendance");
            else if (subsectionId === 'academics-calendar') Data.fetchAndDisplay(TARGETS.CALENDAR, elements.calendar, "Academic Calendar");
            else if (subsectionId === 'academics-curriculum') Data.fetchAndDisplay(TARGETS.CURRICULUM, elements.curriculum, "My Curriculum");
            else if (subsectionId === 'academics-projects') Data.fetchAndDisplay(TARGETS.PROJECTS, elements.projects, "Projects");
            else if (subsectionId === 'examinations-marks') Data.fetchAndDisplay(TARGETS.MARKS, elements.marks, "Marks");
            else if (subsectionId === 'examinations-schedule') Data.fetchAndDisplay(TARGETS.EXAM_SCHEDULE, elements.examSchedule, "Exam Schedule");

            if (window.innerWidth < 768) elements.sidebar.classList.add('-translate-x-full');
            elements.contentContainer.scrollTop = 0;
        });
    });
    
    // 6. General UI
    if(elements.menuToggle) elements.menuToggle.addEventListener('click', () => elements.sidebar.classList.toggle('-translate-x-full'));
    
    const themeToggle = document.getElementById('theme-toggle');
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }
    
    if(elements.semesterSelect) {
        elements.semesterSelect.addEventListener('change', () => { 
            state.setSemesterId(elements.semesterSelect.value); 
            refreshCurrentPage(); 
        });
    }
    
    if(elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', async (e) => { 
            e.preventDefault();
            await fetch(`${API_BASE_URL}/logout`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({session_id: localStorage.getItem('vtop_session_id')}) 
            }); 
            localStorage.removeItem('vtop_session_id'); 
            window.location.href = '/login'; 
        });
    }
    
    if(elements.calendar) {
        elements.calendar.addEventListener('click', (e) => {
            const navBtn = e.target.closest('.calendar-nav-btn');
            if (navBtn) Data.fetchAndDisplay(TARGETS.CALENDAR, elements.calendar, "Academic Calendar", { calDate: navBtn.dataset.date });
        });
    }

    // --- Global Credentials Unlock Function ---
    window.unlockCredentials = async function() {
        const passwordInput = document.getElementById('creds-password-input');
        const unlockBtn = document.getElementById('creds-unlock-btn');
        const errorMsg = document.getElementById('creds-error');
        const lockedView = document.getElementById('creds-locked');
        const contentView = document.getElementById('creds-content');
        
        const password = passwordInput.value;
        if (!password) {
            errorMsg.textContent = "Please enter your password.";
            errorMsg.classList.remove('hidden');
            return;
        }

        const originalBtnText = unlockBtn.innerHTML;
        unlockBtn.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4 mr-2"></i> Verifying...';
        unlockBtn.disabled = true;
        errorMsg.classList.add('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            const response = await fetch(`${window.location.origin}/fetch-profile-credentials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    session_id: localStorage.getItem('vtop_session_id'),
                    password: password 
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                contentView.innerHTML = data.html_content;
                lockedView.style.opacity = '0';
                setTimeout(() => {
                    lockedView.classList.add('hidden');
                    contentView.classList.remove('hidden');
                    if (window.Alpine) window.Alpine.initTree(contentView);
                }, 300);
            } else {
                errorMsg.textContent = data.message || "Verification failed.";
                errorMsg.classList.remove('hidden');
                unlockBtn.innerHTML = originalBtnText;
                unlockBtn.disabled = false;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } catch (error) {
            console.error(error);
            errorMsg.textContent = "Network error. Please try again.";
            errorMsg.classList.remove('hidden');
            unlockBtn.innerHTML = originalBtnText;
            unlockBtn.disabled = false;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    };

    // --- Initialization Functions ---
    
    async function checkSession() {
        const savedSessionId = localStorage.getItem('vtop_session_id');
        if (!savedSessionId) { window.location.href = '/login'; return; }
        try {
            const response = await fetch(`${API_BASE_URL}/check-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: savedSessionId }) });
            if (!response.ok) throw new Error();
            const data = await response.json();
            if (data.status === 'success') {
                if (elements.sidebarUsername) elements.sidebarUsername.textContent = data.username || 'User';
                if (elements.sidebarRegNo) elements.sidebarRegNo.textContent = data.username || 'Session Active';
                populateSemesterDropdown(); 
            } else { localStorage.removeItem('vtop_session_id'); window.location.href = '/login'; }
        } catch (error) { localStorage.removeItem('vtop_session_id'); window.location.href = '/login'; }
    }
    
    async function populateSemesterDropdown() {
        try {
            const response = await fetch(`${API_BASE_URL}/get-semesters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id') }) });
            const data = await response.json();
            if (data.status === 'success' && data.semesters.length > 0) {
                elements.semesterSelect.innerHTML = ''; 
                data.semesters.forEach(s => { const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.name; elements.semesterSelect.appendChild(opt); });
                state.setSemesterId(data.semesters[0].id);
                refreshCurrentPage();
            }
        } catch (error) { console.error(error); }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
    UI.showPageSection('dashboard', elements.pageSections, elements.navLinks, elements.academicsToggle, elements.examinationsToggle, elements.extraToggle);
    checkSession();
});