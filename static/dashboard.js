import { API_BASE_URL, TARGETS } from './modules/constants.js';
import { state } from './modules/state.js';
import * as UI from './modules/ui.js';
import * as Data from './modules/data_service.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard module loaded. Version: Bulletproof Init");

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
            console.warn(">> WATCHDOG: App taking long to load. Background fetch is running.");
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
            
            // BUG FIX: Bulletproof Container Clearing. 
            // If ui.js doesn't have clearAllDataContainers, it safely falls back.
            if (UI && typeof UI.clearAllDataContainers === 'function') {
                UI.clearAllDataContainers(allDataContainers);
            } else {
                allDataContainers.forEach(c => { if (c) c.innerHTML = ''; });
            }

            const activeNav = document.querySelector('.nav-link.active');

            if (activeNav && !['academics', 'examinations', 'extra'].includes(activeNav.dataset.section)) {
                const sectionId = activeNav.dataset.section;
                console.log(`Active section is: ${sectionId}`);
                
                if (sectionId === 'dashboard') {
                    console.log("Initiating Dashboard Fetches...");
                    
                    // BUG FIX: Ensure Data methods exist before calling them
                    if (Data && typeof Data.fetchTimetableAndCourses === 'function') {
                        Data.fetchTimetableAndCourses(null, null, elements.todaySchedule)
                            .then(() => { if (typeof Data.fetchAndCalculateAttendanceSnapshot === 'function') return Data.fetchAndCalculateAttendanceSnapshot(); })
                            .then(() => { if (typeof Data.fetchAndDisplayODSnapshot === 'function') return Data.fetchAndDisplayODSnapshot(); })
                            .catch(err => console.error("Dashboard Fetch Chain Failed:", err));
                    } else {
                        console.error("Data module missing. Please check data_service.js");
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
                if (container.innerHTML.trim() === '') {
                    try {
                        const response = await fetch('/fetch-chat', { method: 'POST' });
                        const data = await response.json();
                        container.innerHTML = data.html_content;
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
                // Reset Directory View IF LOCKED
                if (!isDirectoryUnlocked) {
                    elements.dirPassword.value = '';
                    elements.dirSearch.value = '';
                    elements.dirResults.classList.add('hidden');
                    elements.dirResults.innerHTML = '';

                    // Reset eye icon
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

    // --- Directory Logic (Preserved) ---
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

    // --- Credentials Unlock Logic ---
    window.unlockCredentials = async function () {
        const passwordInput = document.getElementById('creds-password-input');
        const unlockBtn = document.getElementById('creds-unlock-btn');
        const errorMsg = document.getElementById('creds-error');
        const lockedView = document.getElementById('creds-locked');
        const contentView = document.getElementById('creds-content');

        const password = passwordInput.value;
        if (!password) { errorMsg.textContent = "Please enter your password."; errorMsg.classList.remove('hidden'); return; }

        const originalBtnText = unlockBtn.innerHTML;
        unlockBtn.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4 mr-2"></i> Verifying...';
        unlockBtn.disabled = true;
        errorMsg.classList.add('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            const response = await fetch(`${window.location.origin}/fetch-profile-credentials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), password: password })
            });
            const data = await response.json();
            if (data.status === 'success') {
                contentView.innerHTML = data.html_content;
                lockedView.style.opacity = '0';
                setTimeout(() => { lockedView.classList.add('hidden'); contentView.classList.remove('hidden'); }, 300);
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

    // --- Roommate Chat Specific Logic ---
    async function initRoommateChat() {
        const chatUI = {
            messages: document.getElementById('chat-messages'),
            input: document.getElementById('chat-input'),
            sendBtn: document.getElementById('send-chat-btn'),
            title: document.getElementById('chat-room-title'),
            subtitle: document.getElementById('chat-room-subtitle'),
            fileInput: document.getElementById('chat-file-input'),
            fileIndicator: document.getElementById('chat-file-indicator')
        };

        if (!chatUI.messages) return;

        chatUI.messages.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-400"><i data-lucide="loader" class="animate-spin h-8 w-8 mb-2 text-indigo-500"></i><p>Locating your room...</p></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            const profileData = state.cachedProfile || await Data.fetchAndDisplay(TARGETS.PROFILE, null, "Profile", {}, true);
            
            if (!profileData || !profileData.hostel || !profileData.hostel.room) {
                chatUI.messages.innerHTML = '<div class="text-center p-10"><i data-lucide="home" class="mx-auto h-12 w-12 text-gray-300 mb-4"></i><h4 class="font-bold text-gray-800 dark:text-white">Hostel Profile Required</h4><p class="text-sm text-gray-500 mt-2">Could not find room details in your VTOP profile. Chat is limited to hostellers.</p></div>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            const { hostel, personal } = profileData;
            const roomId = `${hostel.block}-${hostel.room}`.replace(/\s+/g, '-').replace(/[^\w-]/g, '');
            currentChatRoomId = roomId;

            chatUI.title.textContent = `Room ${hostel.room}`;
            chatUI.subtitle.textContent = hostel.block;

            if (!supabaseClient) {
                supabaseClient = supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key);
            }

            if (chatSubscription) chatSubscription.unsubscribe();

            const { data: messages } = await supabaseClient
                .from('messages')
                .select('*')
                .eq('room_id', roomId)
                .order('created_at', { ascending: true })
                .limit(50);

            chatUI.messages.innerHTML = '';
            if (messages && messages.length > 0) {
                messages.forEach(msg => appendMessageUI(msg, personal.app_no, chatUI.messages));
            } else {
                chatUI.messages.innerHTML = '<div class="text-center py-10 opacity-40 italic text-sm">No messages yet. Start the conversation!</div>';
            }

            chatSubscription = supabaseClient
                .channel(`room-${roomId}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, 
                payload => appendMessageUI(payload.new, personal.app_no, chatUI.messages))
                .subscribe();

            chatUI.sendBtn.onclick = () => handleSendMessage(chatUI);
            chatUI.input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(chatUI);
                }
            };
            chatUI.fileInput.onchange = () => {
                chatUI.fileIndicator.classList.toggle('hidden', chatUI.fileInput.files.length === 0);
            };

            setTimeout(() => chatUI.input.focus(), 100);

        } catch (err) {
            chatUI.messages.innerHTML = '<div class="p-10 text-center text-red-500 text-sm">Connection error. Check your network.</div>';
        }
    }

    async function handleSendMessage(ui) {
        const content = ui.input.value.trim();
        const file = ui.fileInput.files[0];
        if (!content && !file) return;

        ui.sendBtn.disabled = true;
        const originalBtn = ui.sendBtn.innerHTML;
        ui.sendBtn.innerHTML = '<i data-lucide="loader" class="animate-spin w-5 h-5"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        try {
            let fileUrl = null;
            if (file) {
                const fileName = `${Date.now()}_${file.name}`;
                const { data } = await supabaseClient.storage
                    .from('chat-attachments')
                    .upload(`${currentChatRoomId}/${fileName}`, file);
                
                if (data) {
                    const { data: urlData } = supabaseClient.storage
                        .from('chat-attachments')
                        .getPublicUrl(`${currentChatRoomId}/${fileName}`);
                    fileUrl = urlData.publicUrl;
                }
            }

            await supabaseClient.from('messages').insert([{
                room_id: currentChatRoomId,
                user_id: state.cachedProfile.personal.app_no,
                user_name: state.cachedProfile.personal.name,
                content: content,
                file_url: fileUrl
            }]);

            ui.input.value = '';
            ui.fileInput.value = '';
            ui.fileIndicator.classList.add('hidden');
        } catch (e) {
            console.error(e);
        } finally {
            ui.sendBtn.disabled = false;
            ui.sendBtn.innerHTML = originalBtn;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    function appendMessageUI(msg, myAppNo, container) {
        if (!container) return;

        const emptyMsg = container.querySelector('.italic');
        if (emptyMsg) emptyMsg.remove();

        const isMe = msg.user_id === myAppNo;
        const div = document.createElement('div');
        div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in-up mb-4`;
        
        div.innerHTML = `
            <div class="max-w-[85%] sm:max-w-[75%] ${isMe ? 'bg-indigo-600 text-white rounded-l-2xl rounded-tr-2xl' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700 rounded-r-2xl rounded-tl-2xl'} p-3 shadow-sm shadow-indigo-500/5">
                ${!isMe ? `<p class="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 mb-1 uppercase tracking-wider">${msg.user_name}</p>` : ''}
                <p class="text-sm leading-relaxed whitespace-pre-wrap">${msg.content || ''}</p>
                ${msg.file_url ? `
                    <a href="${msg.file_url}" target="_blank" class="mt-2 flex items-center p-2.5 bg-black/5 dark:bg-white/5 rounded-xl text-xs hover:bg-black/10 transition-all border border-black/5 dark:border-white/5">
                        <i data-lucide="external-link" class="w-3.5 h-3.5 mr-2"></i> View Attached Document
                    </a>
                ` : ''}
                <p class="text-[9px] mt-1.5 opacity-40 text-right font-medium">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // --- System Init & Checks ---
    function startOfflineMode() {
        console.log("Starting offline/fallback mode.");
        const cachedName = localStorage.getItem('vtop_username_cache');
        const cachedRegNo = localStorage.getItem('vtop_regno_cache');

        if (elements.sidebarUsername) elements.sidebarUsername.textContent = cachedName || 'User';
        if (elements.sidebarRegNo) elements.sidebarRegNo.textContent = cachedRegNo || 'Offline';

        const savedSemId = localStorage.getItem('vtop_semester_id');
        if (savedSemId) {
            if(state && state.setSemesterId) state.setSemesterId(savedSemId);
            elements.semesterSelect.innerHTML = `<option value="${savedSemId}" selected>Saved Semester</option>`;
        } else {
            elements.semesterSelect.innerHTML = `<option disabled>No semester saved</option>`;
        }
        refreshCurrentPage();
    }

    async function checkSession() {
        console.log("Checking session status...");
        const savedSessionId = localStorage.getItem('vtop_session_id');
        if (!savedSessionId) { window.location.href = '/login'; return; }

        if (!navigator.onLine) { startOfflineMode(); return; }

        try {
            const response = await fetch(`${API_BASE_URL}/check-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: savedSessionId }) });
            if (!response.ok) throw new Error("Session check failed");
            const data = await response.json();
            if (data.status === 'success') {
                const userName = data.username || 'User';
                const regStatus = 'Session Active';

                if (elements.sidebarUsername) elements.sidebarUsername.textContent = userName;
                if (elements.sidebarRegNo) elements.sidebarRegNo.textContent = regStatus;

                localStorage.setItem('vtop_username_cache', userName);
                localStorage.setItem('vtop_regno_cache', regStatus);

                populateSemesterDropdown();
            } else {
                localStorage.removeItem('vtop_session_id');
                window.location.href = '/login';
            }
        } catch (error) {
            startOfflineMode();
        }
    }

    async function populateSemesterDropdown() {
        console.log("Fetching semesters...");
        try {
            const response = await fetch(`${API_BASE_URL}/get-semesters`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id') }) });
            const data = await response.json();
            
            if (data.status === 'success' && data.semesters && data.semesters.length > 0) {
                elements.semesterSelect.innerHTML = '';
                const savedSemId = localStorage.getItem('vtop_semester_id');
                let selectedId = data.semesters[0].id;
                if (savedSemId && data.semesters.some(s => s.id === savedSemId)) selectedId = savedSemId;

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
                console.warn("No semesters returned from VTOP. Proceeding with cached/fallback semester.");
                const savedSemId = localStorage.getItem('vtop_semester_id');
                if (savedSemId && state && state.setSemesterId) state.setSemesterId(savedSemId);
            }
        } catch (error) {
            console.error("Failed to load semesters via network", error);
            const savedSemId = localStorage.getItem('vtop_semester_id');
            if (savedSemId && state && state.setSemesterId) state.setSemesterId(savedSemId);
        } finally {
            refreshCurrentPage();
        }
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
    if (UI && UI.showPageSection) UI.showPageSection('dashboard', elements.pageSections, elements.navLinks, elements.academicsToggle, elements.examinationsToggle, elements.extraToggle);
    checkSession();
});