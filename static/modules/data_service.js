import { API_BASE_URL, TARGETS } from './constants.js';
import { state } from './state.js';
import * as UI from './ui.js';

/**
 * Generates a unique storage key based on the target and parameters.
 * Ensures Dashboard and Detail views share the same data source.
 */
function getStorageKey(target, params = {}) {
    // Base key using target and semester
    let key = `vtop_cache_${target}_${state.currentSemesterId || 'default'}`;

    // Append specific parameters to differentiate (e.g. Calendar months)
    if (params.calDate) key += `_${params.calDate}`;

    return key;
}

/**
 * Attempts to load and render data from LocalStorage.
 * Returns true if data was found and rendered, false otherwise.
 */
function loadFromCache(target, container, params) {
    const cacheKey = getStorageKey(target, params);
    const cachedString = localStorage.getItem(cacheKey);

    if (cachedString) {
        try {
            const cachedData = JSON.parse(cachedString);
            console.log(`[Cache] Hit for ${target}`);

            if (container) {
                // Render the cached HTML immediately
                container.innerHTML = cachedData.html_content;

                // Re-initialize icons since we injected new HTML
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }

            // Restore Application State from Cache
            if (target === TARGETS.ATTENDANCE && cachedData.raw_data) {
                state.setAttendance(cachedData.raw_data);
            }
            if (target === TARGETS.TIMETABLE && cachedData.raw_data) {
                state.setTimetable(cachedData.raw_data.timetable);
            }
            if ((target === TARGETS.PROFILE || target === 'student/studentProfileView') && (cachedData.data || cachedData.raw_data)) {
                state.cachedProfile = cachedData.data || cachedData.raw_data;
            }

            return true;
        } catch (e) {
            console.error("[Cache] Parse error", e);
            // If cache is corrupted, remove it
            localStorage.removeItem(cacheKey);
        }
    }
    return false;
}

/**
 * Handles fetch errors.
 * If content was already loaded from cache, we fail silently or show a toast.
 * If screen is empty, we show the error message.
 */
function handleFetchError(error, container, target, params) {
    console.warn('[Network] Fetch failed:', error);

    // Check if container already has content (from cache)
    const isContentVisible = container && !container.innerHTML.includes('animate-spin');

    if (isContentVisible) {
        console.log('[Network] keeping cached data visible.');

        if (error.message.includes("Session expired")) {
            localStorage.removeItem('vtop_session_id');
            window.location.href = '/login';
        }
    } else {
        if (loadFromCache(target, container, params)) {
            return;
        }

        if (container) {
            if (error.message.includes("Session expired")) {
                localStorage.removeItem('vtop_session_id');
                window.location.href = '/login';
            } else {
                container.innerHTML = `
                    <div class="p-8 text-center">
                        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                            <i data-lucide="wifi-off" class="w-6 h-6 text-red-600 dark:text-red-400"></i>
                        </div>
                        <p class="text-gray-600 dark:text-gray-300 font-medium mb-2">Connection Failed</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Unable to load data.</p>
                        <button onclick="location.reload()" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-sm transition-colors">Retry</button>
                    </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
    }
}

/**
 * Primary Data Fetcher with Stale-While-Revalidate Strategy.
 * Modified to support returning raw data (returnDataOnly) for background tasks like Chat initialization.
 */
export async function fetchAndDisplay(target, containerElement, title, extraParams = {}, returnDataOnly = false) {
    if (!containerElement && !returnDataOnly) return;

    let hasCachedData = false;
    let cachedObject = null;

    // STEP 1: Show Cache First (Instant Load)
    if (containerElement && !returnDataOnly) {
        hasCachedData = loadFromCache(target, containerElement, extraParams);
    } else if (returnDataOnly) {
        // Extract cache data silently if we just need the raw data (e.g., Profile logic)
        const cachedStr = localStorage.getItem(getStorageKey(target, extraParams));
        if (cachedStr) {
            try { 
                const p = JSON.parse(cachedStr); 
                cachedObject = p.data || p.raw_data || p; 
                if (target === TARGETS.PROFILE || target === 'student/studentProfileView') state.cachedProfile = cachedObject;
            } catch(e) {}
        }
    }

    // STEP 2: Show Loading State (Only if no cache found)
    if (!hasCachedData && containerElement && !returnDataOnly) {
        containerElement.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12">
                <i data-lucide="loader" class="animate-spin h-8 w-8 text-indigo-600 mb-3"></i>
                <p class="text-sm text-gray-500">Loading ${title || 'content'}...</p>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // STEP 3: Check Online Status
    if (!navigator.onLine) {
        if (!hasCachedData && containerElement && !returnDataOnly) {
            containerElement.innerHTML = `<div class="p-6 text-center"><p class="text-gray-500">No data available offline.</p></div>`;
        }
        return cachedObject;
    }

    // STEP 4: Network Fetch (Background Refresh)
    try {
        const currentSessionId = localStorage.getItem('vtop_session_id');
        const payload = {
            session_id: currentSessionId,
            target: target,
            semesterSubId: state.currentSemesterId,
            ...extraParams
        };

        // Standard /fetch-data call 
        const response = await fetch(`${API_BASE_URL}/fetch-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            if (response.status === 401) throw new Error("Session expired.");
            throw new Error(`Server error ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'success') {
            // Handle Auto-Semester Switch
            if (data.new_semester_id && data.new_semester_id !== state.currentSemesterId) {
                console.log(`[Data] Auto-switching semester to ${data.new_semester_id}`);
                state.setSemesterId(data.new_semester_id);
                localStorage.setItem('vtop_semester_id', data.new_semester_id);
                const semSelect = document.getElementById('semester-select');
                if (semSelect) semSelect.value = data.new_semester_id;
            }

            // Update UI with fresh data
            if (containerElement && !returnDataOnly) {
                containerElement.innerHTML = data.html_content;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }

            // Update Runtime State
            if (target === TARGETS.ATTENDANCE && data.raw_data) state.setAttendance(data.raw_data);
            if (target === TARGETS.TIMETABLE && data.raw_data) state.setTimetable(data.raw_data.timetable);
            
            // --- TEMPORARY OVERRIDE FOR CHAT TESTING ---
            if (target === TARGETS.PROFILE || target === 'student/studentProfileView') {
                const regNo = localStorage.getItem('vtop_regno_cache') || 'TEST_USER';
                
                // Force a fake profile specifically to test the chat room
                const mockProfile = {
                    personal: { app_no: regNo, name: regNo },
                    hostel: { block: 'Test-Block', room: 'Test-Room' }
                };
                
                state.cachedProfile = mockProfile;
                data.data = mockProfile;
                data.raw_data = mockProfile;
            }

            // Save to Persistent Cache
            try {
                localStorage.setItem(getStorageKey(target, extraParams), JSON.stringify(data));
                console.log(`[Cache] Updated ${target}`);
            } catch (e) { console.warn("Cache save failed", e); }

            // Return data object so background callers (like Chat) can use it
            return data.data || data.raw_data || data;

        } else {
            throw new Error(data.message);
        }

    } catch (error) {
        
        // --- FALLBACK FOR CHAT: Force a test profile if fetch failed ---
        if (target === TARGETS.PROFILE || target === 'student/studentProfileView') {
            console.warn("Profile fetch failed, enforcing TEST ROOM fallback for chat.");
            const regNo = localStorage.getItem('vtop_regno_cache') || 'TEST_USER';
            const mockProfile = {
                personal: { app_no: regNo, name: regNo },
                hostel: { block: 'Test-Block', room: 'Test-Room' }
            };
            state.cachedProfile = mockProfile;
            if (returnDataOnly) return mockProfile; 
        }

        if (!returnDataOnly && containerElement) {
            handleFetchError(error, containerElement, target, extraParams);
        }
        return cachedObject;
    }
}

// --- Specialized Fetchers for Dashboard Pre-loading ---

export async function fetchAttendanceForCache() {
    const target = TARGETS.ATTENDANCE;
    const c = localStorage.getItem(getStorageKey(target));
    if (c) state.setAttendance(JSON.parse(c).raw_data);

    if (!navigator.onLine) return;

    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: localStorage.getItem('vtop_session_id'),
                target: target,
                semesterSubId: state.currentSemesterId
            })
        });
        const data = await response.json();
        if (data.status === 'success') {
            state.setAttendance(data.raw_data);
            localStorage.setItem(getStorageKey(target), JSON.stringify(data));
            console.log('[Cache] Pre-fetched Attendance');
        }
    } catch (e) { console.warn(e); }
}

export async function fetchTimetableForCache() {
    const target = TARGETS.TIMETABLE;
    const c = localStorage.getItem(getStorageKey(target));
    if (c) state.setTimetable(JSON.parse(c).raw_data.timetable);

    if (!navigator.onLine) return;

    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: localStorage.getItem('vtop_session_id'),
                target: target,
                semesterSubId: state.currentSemesterId,
                isSaturday: new Date().getDay() === 6 // Check client-side time
            })
        });
        const data = await response.json();
        if (data.status === 'success') {
            state.setTimetable(data.raw_data.timetable);
            localStorage.setItem(getStorageKey(target), JSON.stringify(data));
            console.log('[Cache] Pre-fetched Timetable');
        }
    } catch (e) { console.warn(e); }
}

export async function fetchAndCalculateAttendanceSnapshot() {
    if (!state.currentSemesterId) return;
    const target = TARGETS.ATTENDANCE;

    const updateWidget = (rawData) => {
        state.setAttendance(rawData);
        UI.updateAttendanceSnapshot(rawData);
    };

    // 1. Cache First
    const c = localStorage.getItem(getStorageKey(target));
    if (c) {
        updateWidget(JSON.parse(c).raw_data);
    } else {
        const el = document.getElementById('snapshot-attendance-perc');
        if (el) el.textContent = '...';
    }

    if (!navigator.onLine) return;

    // 2. Network
    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: localStorage.getItem('vtop_session_id'),
                target: target,
                semesterSubId: state.currentSemesterId
            })
        });
        const data = await response.json();
        if (data.status === 'success' && data.raw_data) {
            updateWidget(data.raw_data);
            localStorage.setItem(getStorageKey(target), JSON.stringify(data));
        }
    } catch (error) { console.error("Snapshot fetch failed", error); }
}

export async function fetchTimetableAndCourses(coursesContainer, timetableContainer, todayScheduleContainer) {
    if (!state.currentSemesterId) return;
    const target = TARGETS.TIMETABLE;

    const renderData = (data) => {
        state.setTimetable(data.raw_data.timetable);

        if (coursesContainer || timetableContainer) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(data.html_content, 'text/html');
            const coursesContent = doc.getElementById('registered-courses-content');
            const timetableContent = doc.getElementById('weekly-timetable-content');

            if (coursesContainer) {
                coursesContainer.innerHTML = '';
                if (coursesContent) coursesContainer.appendChild(coursesContent);
            }
            if (timetableContainer) {
                timetableContainer.innerHTML = '';
                if (timetableContent) timetableContainer.appendChild(timetableContent);
            }
        }

        if (todayScheduleContainer) {
            UI.populateTodaySchedule(data.raw_data.timetable, todayScheduleContainer);
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    // 1. Try Cache First
    const cacheKey = getStorageKey(target);
    const cachedString = localStorage.getItem(cacheKey);
    let hasCache = false;

    if (cachedString) {
        try {
            const cachedData = JSON.parse(cachedString);
            console.log('[Cache] Loaded Timetable/Courses data.');
            renderData(cachedData);
            hasCache = true;
        } catch (e) { console.error(e); }
    }

    // 2. Check Online
    if (!navigator.onLine) {
        if (!hasCache && todayScheduleContainer) {
            todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500">No offline data.</p>';
        }
        return;
    }

    // 3. Loading UI
    const loadingHTML = `<div class="p-8 text-center text-gray-500 flex flex-col items-center justify-center"><i data-lucide="loader" class="animate-spin h-8 w-8 mb-2 text-indigo-500"></i><p>Loading data...</p></div>`;

    if (!hasCache) {
        if (coursesContainer) coursesContainer.innerHTML = loadingHTML;
        if (timetableContainer) timetableContainer.innerHTML = loadingHTML;
        if (todayScheduleContainer) todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 italic flex items-center"><i data-lucide="loader" class="animate-spin h-4 w-4 mr-2"></i> Loading schedule...</p>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // 4. Network Fetch
    try {
        const payload = {
            session_id: localStorage.getItem('vtop_session_id'),
            target: target,
            semesterSubId: state.currentSemesterId,
            includeDayOrder: !!timetableContainer, // Request day order check ONLY if showing full timetable
            isSaturday: new Date().getDay() === 6 // Check client-side time
        };
        console.log("[Debug] Fetching data with payload:", payload);
        console.log("[Debug] Client-side isSaturday:", payload.isSaturday, "Day:", new Date().getDay());

        const response = await fetch(`${API_BASE_URL}/fetch-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.status === 'success') {
            renderData(data);
            localStorage.setItem(cacheKey, JSON.stringify(data));
        } else throw new Error(data.message);
    } catch (error) {
        console.error(error);
        if (!hasCache) handleFetchError(error, timetableContainer || coursesContainer, target, {});
    }
}

export async function fetchAndDisplayODSnapshot() {
    if (!state.currentSemesterId) return;
    const cacheKey = `vtop_cache_od_snapshot_${state.currentSemesterId}`;

    const cachedString = localStorage.getItem(cacheKey);
    if (cachedString) {
        try {
            const cachedData = JSON.parse(cachedString);
            UI.updateODSnapshot(cachedData);
        } catch (e) { console.error(e); }
    } else {
        const el = document.getElementById('snapshot-od-count');
        if (el) el.textContent = '... / 40';
    }

    if (!navigator.onLine) return;

    try {
        const response = await fetch(`${API_BASE_URL}/get-od-snapshot`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                session_id: localStorage.getItem('vtop_session_id'), 
                semesterSubId: state.currentSemesterId 
            }) 
        });
        const data = await response.json();
        if (data.status === 'success') {
            UI.updateODSnapshot(data);
            localStorage.setItem(cacheKey, JSON.stringify(data));
        }
    } catch (e) { console.error(e); }
}

export async function fetchAttendanceDetails(classId, slot, modalBody) {
    if (!navigator.onLine) {
        modalBody.innerHTML = `<div class="p-5 text-center text-gray-500"><p>Details not available offline.</p></div>`;
        return;
    }
    try {
        const payload = {
            session_id: localStorage.getItem('vtop_session_id'),
            class_id: classId,
            slot: slot,
            semesterSubId: state.currentSemesterId
        };
        const response = await fetch(`${API_BASE_URL}/${TARGETS.ATTENDANCE_DETAIL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.status === 'success') {
            modalBody.innerHTML = data.html_content;
        } else {
            modalBody.innerHTML = `<div class="p-5 text-center text-red-500"><p>Error: ${data.message}</p></div>`;
        }
    } catch (error) {
        modalBody.innerHTML = `<div class="p-5 text-center text-red-500"><p>Network error.</p></div>`;
    }
}