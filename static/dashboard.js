import { API_BASE_URL, TARGETS } from './modules/constants.js';
import { state } from './modules/state.js';
import * as UI from './modules/ui.js';
import * as Data from './modules/data_service.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard module loaded. Version: Background Session Sync");

    // ============================================================
    //  CRITICAL FAILSAFE: STUCK ON LOADING WATCHDOG
    // ============================================================
    setTimeout(() => {
        const scheduleEl = document.getElementById('today-schedule-container');
        const snapshotEl = document.getElementById('snapshot-attendance-perc');
        const userLabel = document.getElementById('sidebar-username');

        const isScheduleStuck = scheduleEl && (scheduleEl.innerText.toLowerCase().includes('loading') || scheduleEl.innerText.trim() === '');
        const isSnapshotStuck = snapshotEl && snapshotEl.innerText === '...';
        const isUserStuck = userLabel && userLabel.textContent.trim() === 'Loading...';

        if (isScheduleStuck || isSnapshotStuck || isUserStuck) {
            console.warn(">> WATCHDOG: App taking long to load. Ensure network connects.");
        }
    }, 10000); 
    // ============================================================

    // State for secure directory
    let decryptedStudentList = [];
    let isDirectoryUnlocked = false;

    // Chat State
    let supabaseClient = null;
    let currentChatRoomId = null;
    let chatSubscription = null;

    const elements = {
        menuToggle: document.getElementById('menu-toggle'),
        sidebar: document.getElementById('sidebar'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
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

        todaySchedule: document.getElementById('today-schedule-container'),
        timetable: document.getElementById('timetable-container'),
        courses: document.getElementById('courses-container'),
        attendance: document.getElementById('attendance-container'),
        marks: document.getElementById('marks-container'),
        examSchedule: document.getElementById('exam-schedule-container'),
        calendar: document.getElementById('calendar-container'),
        enrollment: document.getElementById('enrollment-container'), 
        profile: document.getElementById('profile-container'),
        calculator: document.getElementById('extra-calculator'),
        
        chatContentArea: document.getElementById('chat-content-area'),

        dirPassword: document.getElementById('dir-password'),
        dirTogglePassword: document.getElementById('dir-toggle-password'),
        dirSearch: document.getElementById('dir-search'),
        dirSearchBtn: document.getElementById('dir-search-btn'),
        dirResults: document.getElementById('dir-results'),
        dirLockScreen: document.getElementById('dir-lock-screen'),
        dirSearchScreen: document.getElementById('dir-search-screen'),
        dirUnlockBtn: document.getElementById('dir-unlock-btn'),
        dirLockBtn: document.getElementById('dir-lock-btn'),

        modal: document.getElementById('detail-modal'),
        modalContent: document.querySelector('.modal-content'),
        modalTitle: document.getElementById('modal-title'),
        modalBody: document.getElementById('modal-body'),
        modalCloseBtn: document.getElementById('modal-close-btn')
    };

    const allDataContainers = [
        elements.todaySchedule, elements.timetable, elements.courses,
        elements.attendance, elements.marks, elements.examSchedule,
        elements.calendar, elements.enrollment, elements.profile,
        elements.calculator
    ].filter(Boolean);

    function closeSidebar() {
        if (window.innerWidth < 768) {
            elements.sidebar.classList.add('-translate-x-full');
            if (elements.sidebarOverlay) {
                elements.sidebarOverlay.classList.remove('opacity-100');
                setTimeout(() => elements.sidebarOverlay.classList.add('hidden'), 300);
            }
        }
    }

    function openSidebar() {
        elements.sidebar.classList.remove('-translate-x-full');
        if (elements.sidebarOverlay) {
            elements.sidebarOverlay.classList.remove('hidden');
            setTimeout(() => elements.sidebarOverlay.classList.add('opacity-100'), 10);
        }
    }

    function refreshCurrentPage() {
        try {
            console.log("Refreshing current page view...");
            
            if (UI && typeof UI.clearAllDataContainers === 'function') {
                UI.clearAllDataContainers(allDataContainers);
            } else {
                allDataContainers.forEach(c => { if (c) c.innerHTML = ''; });
            }

            const activeNav = document.querySelector('.nav-link.active');

            if (activeNav && !['academics', 'examinations', 'extra'].includes(activeNav.dataset.section)) {
                const sectionId = activeNav.dataset.section;
                
                if (sectionId === 'dashboard') {
                    if (Data && typeof Data.fetchTimetableAndCourses === 'function') {
                        Data.fetchTimetableAndCourses(null, null, elements.todaySchedule)
                            .then(() => { if (typeof Data.fetchAndCalculateAttendanceSnapshot === 'function') return Data.fetchAndCalculateAttendanceSnapshot(); })
                            .then(() => { if (typeof Data.fetchAndDisplayODSnapshot === 'function') return Data.fetchAndDisplayODSnapshot(); })
                            .catch(err => console.error("Dashboard Fetch Chain Failed:", err));
                    } else {
                        if (elements.todaySchedule) elements.todaySchedule.innerHTML = '<p class="text-red-500 text-sm p-4 text-center">Module load failed. Please press Ctrl+F5.</p>';
                    }
                } else if (sectionId === 'enrollment' && elements.enrollment) {
                    if (Data && typeof Data.fetchAndDisplay === 'function') Data.fetchAndDisplay(TARGETS.ENROLLMENT, elements.enrollment, "Course Enrollment");
                } else if (sectionId === 'profile') {
                    if (Data && typeof Data.fetchAndDisplay === 'function') Data.fetchAndDisplay(TARGETS.PROFILE, elements.profile, "Profile");
                }
            } else {
                const activeSub = document.querySelector('.nav-link-child.active-subsection');
                if (activeSub) activeSub.click();
            }
        } catch (error) {
            console.error("FATAL ERROR in refreshCurrentPage:", error);
            if (elements.todaySchedule) elements.todaySchedule.innerHTML = `<p class="text-red-500 text-sm p-4">Client error: ${error.message}</p>`;
        }
    }

    // Modal Events
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.view-attendance-detail');
        if (btn) {
            e.preventDefault(); e.stopPropagation();
            if (UI && typeof UI.openAttendanceDetailModal === 'function' && Data && typeof Data.fetchAttendanceDetails === 'function') {
                const { classId, slot } = UI.openAttendanceDetailModal(
                    elements.modal, elements.modalTitle, elements.modalBody,
                    elements.modalContent, btn.dataset.classId, btn.dataset.slot, btn.dataset.courseTitle
                );
                Data.fetchAttendanceDetails(classId, slot, elements.modalBody);
            }
        }
    });

    if (elements.modalCloseBtn) elements.modalCloseBtn.addEventListener('click', () => { if(UI && UI.closeModal) UI.closeModal(elements.modal, elements.modalContent, elements.modalBody); });
    if (elements.modal) elements.modal.addEventListener('click', (e) => { if (e.target === elements.modal && UI && UI.closeModal) UI.closeModal(elements.modal, elements.modalContent, elements.modalBody); });

    if (elements.btnQuickAttendance) elements.btnQuickAttendance.addEventListener('click', (e) => {
        e.preventDefault();
        const link = document.querySelector('.nav-link-child[data-subsection="academics-attendance"]');
        if (link) link.click();
    });
    if (elements.btnQuickMarks) elements.btnQuickMarks.addEventListener('click', (e) => {
        e.preventDefault();
        const link = document.querySelector('.nav-link-child[data-subsection="examinations-marks"]');
        if (link) link.click();
    });

    // Main Navigation Links Handler
    elements.navLinks.forEach(link => {
        if (['academics', 'examinations', 'extra'].includes(link.dataset.section)) return;
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            if (UI && UI.showPageSection) UI.showPageSection(link.dataset.section, elements.pageSections, elements.navLinks, elements.academicsToggle, elements.examinationsToggle, elements.extraToggle);

            const section = link.dataset.section;
            if (section === 'enrollment' && elements.enrollment && Data && Data.fetchAndDisplay) Data.fetchAndDisplay(TARGETS.ENROLLMENT, elements.enrollment, "Course Enrollment");
            else if (section === 'profile' && Data && Data.fetchAndDisplay) Data.fetchAndDisplay(TARGETS.PROFILE, elements.profile, "Profile");
            
            // --- Handle Chat Request ---
            if (section === 'chat') {
                const container = elements.chatContentArea;
                if (!document.getElementById('chat-container')) {
                    try {
                        const response = await fetch('/fetch-chat', { method: 'POST' });
                        const data = await response.json();
                        container.innerHTML = data.html_content;
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                    } catch (err) {
                        container.innerHTML = '<p class="text-center p-10 text-red-500">Failed to load chat UI.</p>';
                        return;
                    }
                }
                initRoommateChat();
            }

            closeSidebar();
            elements.contentContainer.scrollTop = 0;
        });
    });

    elements.navLinkChildren.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const parentId = link.dataset.parent;
            const subsectionId = link.dataset.subsection;

            if (UI && UI.showPageSection) UI.showPageSection(parentId, elements.pageSections, elements.navLinks, elements.academicsToggle, elements.examinationsToggle, elements.extraToggle);
            if (UI && UI.showSubsection) UI.showSubsection(parentId, subsectionId, elements.navLinkChildren);

            if (!Data || typeof Data.fetchTimetableAndCourses !== 'function') {
                console.error("Data Service Module is incomplete.");
                return;
            }

            if (subsectionId === 'extra-calculator') {
                elements.calculator.innerHTML = '<div class="p-8 text-center"><i data-lucide="loader" class="animate-spin h-8 w-8 mx-auto text-indigo-500 mb-2"></i><p class="text-gray-500">Opening calculator...</p></div>';
                if (typeof lucide !== 'undefined') lucide.createIcons();

                Promise.all([Data.fetchAttendanceForCache(), Data.fetchTimetableForCache()]).then(() => {
                    if (window.initAttendanceCalculator) window.initAttendanceCalculator(elements.calculator, state.cachedAttendance, state.cachedTimetable);
                });
            }
            else if (subsectionId === 'academics-courses') Data.fetchTimetableAndCourses(elements.courses, null, null);
            else if (subsectionId === 'academics-timetable') Data.fetchTimetableAndCourses(null, elements.timetable, null);
            else if (subsectionId === 'academics-attendance') Data.fetchAndCalculateAttendanceSnapshot().then(() => Data.fetchAndDisplay(TARGETS.ATTENDANCE, elements.attendance, "Attendance"));
            else if (subsectionId === 'academics-calendar') Data.fetchAndDisplay(TARGETS.CALENDAR, elements.calendar, "Academic Calendar");
            else if (subsectionId === 'examinations-marks') Data.fetchAndDisplay(TARGETS.MARKS, elements.marks, "Marks");
            else if (subsectionId === 'examinations-schedule') Data.fetchAndDisplay(TARGETS.EXAM_SCHEDULE, elements.examSchedule, "Exam Schedule");
            else if (subsectionId === 'extra-directory') {
                if (!isDirectoryUnlocked) {
                    elements.dirPassword.value = '';
                    elements.dirSearch.value = '';
                    elements.dirResults.classList.add('hidden');
                    elements.dirResults.innerHTML = '';
                    if (elements.dirTogglePassword) {
                        elements.dirPassword.type = 'password';
                        elements.dirTogglePassword.innerHTML = '<i data-lucide="eye" class="h-5 w-5"></i>';
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                    }
                    elements.dirLockScreen.classList.remove('hidden');
                    elements.dirSearchScreen.classList.add('hidden');
                    setTimeout(() => elements.dirPassword.focus(), 100);
                } else {
                    elements.dirLockScreen.classList.add('hidden');
                    elements.dirSearchScreen.classList.remove('hidden');
                    setTimeout(() => elements.dirSearch.focus(), 100);
                }
            }

            closeSidebar();
            elements.contentContainer.scrollTop = 0;
        });
    });

    if (elements.menuToggle) elements.menuToggle.addEventListener('click', () => { if (elements.sidebar.classList.contains('-translate-x-full')) openSidebar(); else closeSidebar(); });
    if (elements.sidebarOverlay) elements.sidebarOverlay.addEventListener('click', closeSidebar);

    const themeToggle = document.getElementById('theme-toggle');
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }

    if (elements.semesterSelect) {
        elements.semesterSelect.addEventListener('change', () => {
            const val = elements.semesterSelect.value;
            if(state && state.setSemesterId) state.setSemesterId(val);
            localStorage.setItem('vtop_semester_id', val);
            refreshCurrentPage();
        });
    }

    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (navigator.onLine) {
                try { await fetch(`${API_BASE_URL}/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id') }) }); } catch (e) { }
            }
            localStorage.removeItem('vtop_session_id');
            window.location.href = '/login';
        });
    }

    if (elements.calendar) {
        elements.calendar.addEventListener('click', (e) => {
            const navBtn = e.target.closest('.calendar-nav-btn');
            if (navBtn && Data && Data.fetchAndDisplay) Data.fetchAndDisplay(TARGETS.CALENDAR, elements.calendar, "Academic Calendar", { calDate: navBtn.dataset.date });
        });
    }

    // --- Directory Logic ---
    if (elements.dirTogglePassword) {
        elements.dirTogglePassword.addEventListener('click', () => {
            const type = elements.dirPassword.getAttribute('type') === 'password' ? 'text' : 'password';
            elements.dirPassword.setAttribute('type', type);
            elements.dirTogglePassword.innerHTML = type === 'password' ? '<i data-lucide="eye" class="h-5 w-5"></i>' : '<i data-lucide="eye-off" class="h-5 w-5"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    if (elements.dirUnlockBtn) {
        elements.dirUnlockBtn.addEventListener('click', async () => {
            const password = elements.dirPassword.value;
            if (!password) { alert("Please enter the password."); return; }

            const originalBtnText = elements.dirUnlockBtn.innerHTML;
            elements.dirUnlockBtn.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4 mr-2"></i> Unlocking & Syncing...';
            elements.dirUnlockBtn.disabled = true;
            if (typeof lucide !== 'undefined') lucide.createIcons();

            try {
                const key = CryptoJS.SHA256(password);
                const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js');
                const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');

                const firebaseConfig = {
                    apiKey: "AIzaSyBsdpGsNO3y6a0EapBakU1cS6WC0pEoXSU",
                    authDomain: "vitc29.firebaseapp.com",
                    projectId: "vitc29",
                    storageBucket: "vitc29.firebasestorage.app",
                    messagingSenderId: "376204861458",
                    appId: "1:376204861458:web:5dc7fdaa74f2650911f8cb",
                    measurementId: "G-733GMSBTQQ"
                };

                const app = initializeApp(firebaseConfig);
                const db = getFirestore(app);

                let querySnapshot;
                try {
                    querySnapshot = await getDocs(collection(db, "encrypted_students"));
                } catch (fetchError) {
                    throw new Error("Database Unreachable.");
                }

                decryptedStudentList = [];
                let decryptionFailedCount = 0;
                let successCount = 0;

                if (querySnapshot.size === 0) {
                    alert("Database is empty.");
                    elements.dirUnlockBtn.innerHTML = originalBtnText;
                    elements.dirUnlockBtn.disabled = false;
                    return;
                }

                querySnapshot.forEach((doc) => {
                    try {
                        const data = doc.data();
                        const decrypted = CryptoJS.AES.decrypt(data.blob, key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 });
                        const jsonString = decrypted.toString(CryptoJS.enc.Utf8);

                        if (jsonString && jsonString.startsWith('{')) {
                            const student = JSON.parse(jsonString);
                            student._searchStr = `${student.Name} ${student.RegNo} ${student.Mail} ${student.Mobile}`.toLowerCase();
                            decryptedStudentList.push(student);
                            successCount++;
                        } else {
                            decryptionFailedCount++;
                        }
                    } catch (e) {
                        decryptionFailedCount++;
                    }
                });

                if (successCount === 0) {
                    alert("Unlock Failed: Incorrect Password.");
                    elements.dirUnlockBtn.innerHTML = originalBtnText;
                    elements.dirUnlockBtn.disabled = false;
                    return;
                }

                isDirectoryUnlocked = true;
                elements.dirLockScreen.classList.add('hidden');
                elements.dirSearchScreen.classList.remove('hidden');
                elements.dirPassword.value = '';
                setTimeout(() => elements.dirSearch.focus(), 100);

            } catch (error) {
                alert(error.message || "Failed to connect database.");
                elements.dirUnlockBtn.innerHTML = originalBtnText;
                elements.dirUnlockBtn.disabled = false;
            }
        });
    }

    if (elements.dirLockBtn) {
        elements.dirLockBtn.addEventListener('click', () => {
            decryptedStudentList = [];
            isDirectoryUnlocked = false;

            elements.dirLockScreen.classList.remove('hidden');
            elements.dirSearchScreen.classList.add('hidden');
            elements.dirResults.classList.add('hidden');
            elements.dirResults.innerHTML = '';
            elements.dirUnlockBtn.innerHTML = '<i data-lucide="lock-open" class="h-4 w-4 mr-2"></i> Unlock Directory';
            elements.dirUnlockBtn.disabled = false;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    if (elements.dirSearch) {
        elements.dirSearch.addEventListener('input', (e) => {
            if (!isDirectoryUnlocked) return;
            const term = e.target.value.toLowerCase().trim();
            const resultsContainer = elements.dirResults;

            if (term.length < 2) {
                resultsContainer.innerHTML = '';
                resultsContainer.classList.add('hidden');
                return;
            }

            const matches = decryptedStudentList.filter(s => s._searchStr.includes(term)).slice(0, 10);
            resultsContainer.innerHTML = '';

            if (matches.length === 0) {
                resultsContainer.innerHTML = '<div class="p-3 text-gray-500 text-sm text-center">No matches found.</div>';
            } else {
                matches.forEach(student => {
                    const card = document.createElement('div');
                    card.className = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group';
                    card.innerHTML = `
                        <div class="flex justify-between items-center">
                            <div>
                                <h4 class="font-bold text-gray-900 dark:text-white text-base">${student.Name}</h4>
                                <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">${student.RegNo}</p>
                            </div>
                            <div class="transform transition-transform duration-200 chevron-icon text-gray-400 group-hover:text-indigo-500">
                                <i data-lucide="chevron-down" class="w-5 h-5"></i>
                            </div>
                        </div>
                        <div class="hidden mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-sm space-y-2">
                            <div class="flex items-center text-gray-700 dark:text-gray-300">
                                <i data-lucide="mail" class="w-4 h-4 mr-2 text-gray-400"></i>
                                <span>${student.Mail || 'N/A'}</span>
                            </div>
                            <div class="flex items-center text-gray-700 dark:text-gray-300">
                                <i data-lucide="phone" class="w-4 h-4 mr-2 text-gray-400"></i>
                                <span>${student.Mobile || 'N/A'}</span>
                            </div>
                        </div>
                    `;
                    card.addEventListener('click', function () {
                        const details = this.querySelector('.hidden, .block');
                        const chevron = this.querySelector('.chevron-icon');
                        if (details.classList.contains('hidden')) {
                            details.classList.remove('hidden');
                            details.classList.add('block');
                            chevron.classList.add('rotate-180');
                        } else {
                            details.classList.add('hidden');
                            details.classList.remove('block');
                            chevron.classList.remove('rotate-180');
                        }
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                    });
                    resultsContainer.appendChild(card);
                });
            }
            resultsContainer.classList.remove('hidden');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    if (elements.dirSearchBtn) {
        elements.dirSearchBtn.addEventListener('click', () => {
            elements.dirSearch.dispatchEvent(new Event('input'));
        });
    }

    // --- Roommate Chat Specific Logic ---
    async function initRoommateChat() {
        const chatUI = {
            messages: document.getElementById('chat-messages'),
            input: document.getElementById('chat-input'),
            sendBtn: document.getElementById('send-chat-btn'),
            title: document.getElementById('chat-room-title'),
            subtitle: document.getElementById('chat-room-subtitle'),
            fileInput: document.getElementById('chat-file-input'),
            fileIndicator: document.getElementById('chat-file-indicator'),
            fileName: document.getElementById('chat-file-name'),
            fileRemoveBtn: document.getElementById('chat-file-remove')
        };

        if (!chatUI.messages) return;

        chatUI.messages.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-400"><i data-lucide="loader" class="animate-spin h-8 w-8 mb-2 text-indigo-500"></i><p>Locating your room...</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Check config before doing anything
        if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.key) {
            chatUI.messages.innerHTML = '<div class="p-10 text-center text-red-500 text-sm">Chat is disabled: Supabase configuration is missing in environment.</div>';
            return;
        }

        try {
            // Safely get profile data (direct fetch if cached is missing to prevent UI overlap)
            let profileData = state.cachedProfile;
            if (!profileData) {
                try {
                    const res = await fetch(`${API_BASE_URL}/get-profile`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id') })
                    });
                    const d = await res.json();
                    if (d.status === 'success') {
                        profileData = d.data || d.profile || d;
                        state.cachedProfile = profileData;
                    }
                } catch(e) { console.error("Chat Profile Fetch:", e); }
            }
            
            profileData = profileData || {};
            const personal = profileData.personal || {};

            // Extract Registration Number accurately
            let myRegNo = personal?.registerNumber || profileData?.registerNumber || personal?.app_no;
            
            // Further fallback if it's missing (sometimes nested in flat arrays)
            if (!myRegNo && Array.isArray(profileData.personal)) {
                const flat = profileData.personal.flat(Infinity);
                for (let i = 0; i < flat.length; i++) {
                    const val = String(flat[i]).toLowerCase();
                    if ((val.includes('register') || val.includes('reg no')) && i + 1 < flat.length) {
                        myRegNo = flat[i + 1];
                        break;
                    }
                }
            }
            myRegNo = myRegNo || 'Campus User';

            let roomTitle, roomSub, roomId;

            // --- SMART HOSTEL DATA EXTRACTION ---
            let hBlock = null;
            let hRoom = null;
            
            if (profileData.hostel) {
                const hData = profileData.hostel;
                
                // 1. Direct object matching
                if (typeof hData === 'object' && !Array.isArray(hData)) {
                    hBlock = hData['Block'] || hData.block || hData.Block;
                    hRoom = hData['Room No'] || hData.room || hData.Room;
                } 
                
                // 2. Key-Value List matching (e.g. flat list: ["Block", "D1...", "Room No", "1129"])
                if (!hBlock && !hRoom && Array.isArray(hData)) {
                    const flat = hData.flat(Infinity);
                    for (let i = 0; i < flat.length; i++) {
                        const val = String(flat[i]).trim();
                        if (val.toLowerCase() === 'block' && i + 1 < flat.length) hBlock = flat[i + 1];
                        if (val.toLowerCase() === 'room no' && i + 1 < flat.length) hRoom = flat[i + 1];
                    }
                }
                
                // 3. User described structure: [ "D1 Block Mens...", ["1129"] ]
                if (!hBlock && !hRoom && Array.isArray(hData) && hData.length >= 2) {
                    if (typeof hData[0] === 'string') hBlock = hData[0];
                    if (Array.isArray(hData[1])) hRoom = String(hData[1][0]);
                    else hRoom = String(hData[1]);
                }
            }
            
            // Clean up block name (e.g. "D1 Block Mens Hostel (D1 - Block )" -> "D1")
            if (hBlock && typeof hBlock === 'string') {
                const match = hBlock.match(/\((.*?)\)/);
                if (match) {
                    hBlock = match[1].replace(/-\s*Block/i, '').trim(); 
                } else {
                    hBlock = hBlock.split(' ')[0]; // E.g., "D1" from "D1 Block Mens..."
                }
            }
            if (hRoom) {
                hRoom = String(hRoom).trim();
            }
            // ------------------------------------

            // If hostel info exists, use Roommate Chat. Otherwise, gracefully fallback to Global Chat.
            if (hBlock && hRoom) {
                roomId = `${hBlock}-${hRoom}`.replace(/\s+/g, '-').replace(/[^\w-]/g, '').toUpperCase();
                roomTitle = `Room ${hRoom}`;
                roomSub = `Block ${hBlock}`;
            } else {
                roomId = 'CAMPUS-LOUNGE';
                roomTitle = 'Campus Lounge';
                roomSub = 'Global Community Chat';
            }

            currentChatRoomId = roomId;
            chatUI.title.textContent = roomTitle;
            chatUI.subtitle.textContent = roomSub;

            if (!supabaseClient) {
                supabaseClient = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key);
            }

            // Clean up any existing subscription if user navigated away and back
            if (chatSubscription) chatSubscription.unsubscribe();

            // Fetch recent message history
            const { data: messages, error } = await supabaseClient
                .from('messages')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true })
                .limit(50);
                
            if (error) throw error;

            chatUI.messages.innerHTML = '';
            if (messages && messages.length > 0) {
                messages.forEach(msg => appendMessageUI(msg, myRegNo, chatUI.messages));
            } else {
                chatUI.messages.innerHTML = '<div class="flex flex-col items-center justify-center h-full opacity-50"><i data-lucide="messages-square" class="w-12 h-12 mb-3 text-gray-400"></i><p class="italic text-sm text-gray-500">No messages yet. Say hi to your roommates!</p></div>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }

            // Subscribe to real-time incoming messages for this specific room
            chatSubscription = supabaseClient
                .channel(`room-${roomId}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, 
                payload => appendMessageUI(payload.new, myRegNo, chatUI.messages))
                .subscribe();

            // Attach UI Event Listeners
            chatUI.sendBtn.onclick = () => handleSendMessage(chatUI, myRegNo);
            
            chatUI.input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(chatUI, myRegNo);
                }
            };
            
            // Handle File Input UI updates
            chatUI.fileInput.onchange = () => {
                const file = chatUI.fileInput.files[0];
                if (file) {
                    chatUI.fileIndicator.classList.remove('hidden');
                    chatUI.fileName.textContent = file.name;
                    chatUI.input.focus();
                } else {
                    chatUI.fileIndicator.classList.add('hidden');
                }
            };

            // Remove File Button
            if (chatUI.fileRemoveBtn) {
                chatUI.fileRemoveBtn.onclick = (e) => {
                    e.preventDefault();
                    chatUI.fileInput.value = '';
                    chatUI.fileIndicator.classList.add('hidden');
                };
            }

            setTimeout(() => chatUI.input.focus(), 100);

        } catch (err) {
            console.error("Chat Init Error:", err);
            chatUI.messages.innerHTML = '<div class="p-10 flex flex-col items-center text-center"><i data-lucide="wifi-off" class="w-10 h-10 text-red-400 mb-3"></i><p class="text-red-500 font-medium">Connection error</p><p class="text-sm text-gray-500 mt-1">Failed to connect to the secure chat server.</p></div>';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    async function handleSendMessage(ui, myRegNo) {
        const content = ui.input.value.trim();
        const file = ui.fileInput.files[0];
        
        // Prevent empty sends
        if (!content && !file) return;

        // UI Loading state
        ui.sendBtn.disabled = true;
        const originalBtnHTML = ui.sendBtn.innerHTML;
        ui.sendBtn.innerHTML = '<i data-lucide="loader" class="animate-spin w-5 h-5"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            let fileUrl = null;
            let fileNameDb = null;
            
            // 1. Upload file if it exists
            if (file) {
                // Ensure unique filename to prevent overwrites in storage
                const safeFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
                const { data, error } = await supabaseClient.storage
                    .from('chat-attachments')
                    .upload(`${currentChatRoomId}/${safeFileName}`, file);
                
                if (error) throw error;
                
                if (data) {
                    const { data: urlData } = supabaseClient.storage
                        .from('chat-attachments')
                        .getPublicUrl(`${currentChatRoomId}/${safeFileName}`);
                    fileUrl = urlData.publicUrl;
                    fileNameDb = file.name; // Keep original name for display
                }
            }

            // 2. Insert Message into Database
            // PER REQUIREMENT: user_name MUST be the Registration Number
            const { error: msgError } = await supabaseClient.from('messages').insert([{
                room_id: currentChatRoomId,
                user_id: myRegNo,     // Identity tracking
                user_name: myRegNo,   // Display name tracking (Forcing RegNo as requested)
                content: content,
                file_url: fileUrl
                // Removed file_name insert to prevent Supabase schema errors if column doesn't exist
            }]);

            if (msgError) throw msgError;

            // 3. Clear Inputs on Success
            ui.input.value = '';
            ui.input.style.height = 'auto'; // Reset auto-grow
            ui.fileInput.value = '';
            ui.fileIndicator.classList.add('hidden');
            
        } catch (e) {
            console.error("Failed to send message:", e);
            alert("Failed to send message. Please check your connection.");
        } finally {
            // Restore UI state
            ui.sendBtn.disabled = false;
            ui.sendBtn.innerHTML = originalBtnHTML;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            ui.input.focus();
        }
    }

    function appendMessageUI(msg, myRegNo, container) {
        if (!container) return;

        // Remove the "No messages yet" placeholder if it exists
        const emptyState = container.querySelector('.opacity-50');
        if (emptyState) emptyState.remove();

        const isMe = msg.user_id === myRegNo;
        const div = document.createElement('div');
        div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in-up mb-4`;
        
        // Extract filename from URL if it's not provided in the DB row directly
        let displayFileName = msg.file_name || 'Attached Document';
        if (msg.file_url && !msg.file_name) {
            try {
                const urlParts = msg.file_url.split('/');
                displayFileName = decodeURIComponent(urlParts[urlParts.length - 1].split('_').slice(1).join('_')) || 'Attached Document';
            } catch(e) {}
        }
        
        div.innerHTML = `
            <div class="max-w-[85%] sm:max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                <div class="${isMe ? 'bg-indigo-600 text-white rounded-l-2xl rounded-tr-2xl' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700 rounded-r-2xl rounded-tl-2xl'} p-3 shadow-sm transition-all break-words w-full">
                    
                    ${!isMe ? `<p class="text-[11px] font-bold text-indigo-500 dark:text-indigo-400 mb-1 tracking-wide">${msg.user_name}</p>` : ''}
                    
                    ${msg.content ? `<p class="text-sm leading-relaxed whitespace-pre-wrap">${msg.content}</p>` : ''}
                    
                    ${msg.file_url ? `
                        <a href="${msg.file_url}" target="_blank" rel="noopener noreferrer" 
                           class="${msg.content ? 'mt-3' : ''} flex items-center p-2.5 ${isMe ? 'bg-indigo-700 hover:bg-indigo-800 border-indigo-500' : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-600'} rounded-xl text-xs transition-colors border group">
                            <div class="${isMe ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-600 dark:bg-gray-800 dark:text-indigo-400'} p-2 rounded-lg mr-3 shrink-0">
                                <i data-lucide="file" class="w-4 h-4"></i>
                            </div>
                            <span class="truncate font-medium flex-1 mr-2">${displayFileName}</span>
                            <i data-lucide="download" class="w-4 h-4 opacity-50 group-hover:opacity-100 shrink-0"></i>
                        </a>
                    ` : ''}
                </div>
                <p class="text-[10px] mt-1.5 opacity-50 font-medium px-1 flex items-center">
                    ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
            </div>
        `;
        
        container.appendChild(div);
        
        // Auto scroll to bottom
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ============================================================
    // --- System Init & Checks: Corrected Order of Operations ---
    // ============================================================
    
    // Step 1: Immediately render the dashboard from local cache
    function loadCachedData() {
        console.log("Loading cached data for immediate display...");
        const cachedName = localStorage.getItem('vtop_username_cache');
        const cachedRegNo = localStorage.getItem('vtop_regno_cache');

        if (elements.sidebarUsername) elements.sidebarUsername.textContent = cachedName || 'User';
        if (elements.sidebarRegNo) elements.sidebarRegNo.textContent = cachedRegNo || 'Checking Session...';

        const savedSemId = localStorage.getItem('vtop_semester_id');
        if (savedSemId) {
            if(state && state.setSemesterId) state.setSemesterId(savedSemId);
            elements.semesterSelect.innerHTML = `<option value="${savedSemId}" selected>Saved Semester</option>`;
        } else {
            elements.semesterSelect.innerHTML = `<option disabled>No semester saved</option>`;
        }
        
        // Render the current view immediately using existing cached state
        refreshCurrentPage();
    }

    // Step 2: Validate the session in the background and fetch fresh data if valid
    async function checkSessionAndFetchLatest() {
        console.log("Checking session status in background...");
        const savedSessionId = localStorage.getItem('vtop_session_id');
        
        if (!savedSessionId) { 
            // Step 3 (No Session): Redirect to login to create a new session
            window.location.href = '/login'; 
            return; 
        }

        if (!navigator.onLine) { 
            console.log("App is offline. Relying strictly on cached data.");
            return; 
        }

        try {
            const response = await fetch(`${API_BASE_URL}/check-session`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ session_id: savedSessionId }) 
            });
            
            if (!response.ok) throw new Error("Session check network failed");
            const data = await response.json();
            
            if (data.status === 'success') {
                // Step 3 (Valid Session): Update UI and fetch the latest fresh data
                const userName = data.username || localStorage.getItem('vtop_username_cache') || 'User';
                const regStatus = 'Session Active';

                if (elements.sidebarUsername) elements.sidebarUsername.textContent = userName;
                if (elements.sidebarRegNo) elements.sidebarRegNo.textContent = regStatus;

                localStorage.setItem('vtop_username_cache', userName);
                localStorage.setItem('vtop_regno_cache', regStatus);

                await populateSemesterDropdown(true); // pass true to indicate a network refresh is needed
            } else {
                // Step 3 (Expired Session): Dump the bad session and force the user to login to fetch new data
                console.warn("Session expired or invalid. Redirecting to login to load a new session...");
                localStorage.removeItem('vtop_session_id');
                window.location.href = '/login';
            }
        } catch (error) {
            console.warn("Session check failed (network issue?). Staying in offline mode.", error);
            if (elements.sidebarRegNo) elements.sidebarRegNo.textContent = 'Offline Mode';
        }
    }

    // Support function for fetching semesters and kicking off the latest data refresh
    async function populateSemesterDropdown(triggerRefresh = false) {
        console.log("Fetching semesters from network...");
        try {
            const response = await fetch(`${API_BASE_URL}/get-semesters`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id') }) 
            });
            const data = await response.json();
            
            if (data.status === 'success' && data.semesters && data.semesters.length > 0) {
                elements.semesterSelect.innerHTML = '';
                const savedSemId = localStorage.getItem('vtop_semester_id');
                let selectedId = data.semesters[0].id;
                
                // Keep the saved sem if it exists in the fetched list
                if (savedSemId && data.semesters.some(s => s.id === savedSemId)) {
                    selectedId = savedSemId;
                }

                data.semesters.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = s.name;
                    if (s.id === selectedId) opt.selected = true;
                    elements.semesterSelect.appendChild(opt);
                });
                
                if(state && state.setSemesterId) state.setSemesterId(selectedId);
                localStorage.setItem('vtop_semester_id', selectedId);
            } else {
                console.warn("No semesters returned from VTOP.");
            }
        } catch (error) {
            console.error("Failed to load semesters via network", error);
        } finally {
            if (triggerRefresh) {
                refreshCurrentPage(); // Trigger the network fetches for the active dashboard view
            }
        }
    }

    // Setup initial icons and view state
    if (typeof lucide !== 'undefined') lucide.createIcons();
    if (UI && UI.showPageSection) UI.showPageSection('dashboard', elements.pageSections, elements.navLinks, elements.academicsToggle, elements.examinationsToggle, elements.extraToggle);
    
    // START UP SEQUENCE: Open -> Cache -> Valid Check -> Refresh / Login
    loadCachedData();
    checkSessionAndFetchLatest();
});