import { API_BASE_URL, TARGETS } from './constants.js';
import { state } from './state.js';
import * as UI from './ui.js';

function getStorageKey(target, params = {}) {
    let key = `vtop_cache_${target}_${state.currentSemesterId || 'default'}`;
    if (params.calDate) key += `_${params.calDate}`;
    return key;
}

// --- Helper: Render Timetable/Courses ---
function renderTimetableData(data, coursesContainer, timetableContainer, todayScheduleContainer, isCached) {
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
}

// --- Helper: Render Attendance ---
function renderAttendanceData(data) {
    state.setAttendance(data.raw_data);
    UI.updateAttendanceSnapshot(data.raw_data);
}

export async function fetchTimetableAndCourses(coursesContainer, timetableContainer, todayScheduleContainer) {
    if (!state.currentSemesterId) return;
    const target = TARGETS.TIMETABLE;
    const cacheKey = getStorageKey(target);

    // 1. CACHE FIRST STRATEGY
    const cachedString = localStorage.getItem(cacheKey);
    if (cachedString) {
        try {
            const data = JSON.parse(cachedString);
            console.log(`[Data] Loaded ${target} from cache.`);
            renderTimetableData(data, coursesContainer, timetableContainer, todayScheduleContainer, true);
            return; // Stop here. Do not fetch.
        } catch (e) {
            console.error("Cache corrupt, removing.", e);
            localStorage.removeItem(cacheKey);
        }
    }

    // 2. NETWORK FALLBACK
    const loadingHTML = `<div class="p-8 text-center text-gray-500 flex flex-col items-center justify-center"><i data-lucide="loader" class="animate-spin h-8 w-8 mb-2 text-indigo-500"></i><p>Loading data...</p></div>`;
    
    if (coursesContainer) coursesContainer.innerHTML = loadingHTML;
    if (timetableContainer) timetableContainer.innerHTML = loadingHTML;
    if (todayScheduleContainer) todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 italic flex items-center"><i data-lucide="loader" class="animate-spin h-4 w-4 mr-2"></i> Loading schedule...</p>';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: target, semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        
        if (data.status === 'success') {
            renderTimetableData(data, coursesContainer, timetableContainer, todayScheduleContainer, false);
            localStorage.setItem(cacheKey, JSON.stringify(data)); // Save for next time
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error(error);
        if (error.message.includes("Session expired")) {
             localStorage.removeItem('vtop_session_id');
             window.location.href = '/login';
             return;
        }
        const errHtml = `<p class="text-sm text-red-500 p-2">Load failed.</p>`;
        if (todayScheduleContainer) todayScheduleContainer.innerHTML = errHtml;
        if (coursesContainer) coursesContainer.innerHTML = errHtml;
    }
}

export async function fetchAndCalculateAttendanceSnapshot() {
    if (!state.currentSemesterId) return; 
    const target = TARGETS.ATTENDANCE;
    const cacheKey = getStorageKey(target);

    // 1. CACHE FIRST STRATEGY
    const cachedString = localStorage.getItem(cacheKey);
    if (cachedString) {
        try {
            renderAttendanceData(JSON.parse(cachedString));
            return; // Stop here.
        } catch (e) { localStorage.removeItem(cacheKey); }
    }

    // 2. NETWORK FALLBACK
    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: target, semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success' && data.raw_data) {
            renderAttendanceData(data);
            localStorage.setItem(cacheKey, JSON.stringify(data)); // Save
        }
    } catch (error) { 
        const el = document.getElementById('snapshot-attendance-perc'); 
        if(el) el.textContent = '--'; 
    }
}

// Helper for Cache-First fetchAndDisplay (Generic)
async function fetchAndDisplayCacheFirst(target, containerElement, title, extraParams) {
    const cacheKey = getStorageKey(target, extraParams);
    const cachedString = localStorage.getItem(cacheKey);
    
    if (cachedString) {
        const data = JSON.parse(cachedString);
        containerElement.innerHTML = data.html_content;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }
    
    // Fallback to network if not in cache
    fetchAndDisplay(target, containerElement, title, extraParams);
}


export async function fetchAndDisplay(target, containerElement, title, extraParams = {}) {
    if (!containerElement) return;

    // For general items, we check offline status. If offline, try cache.
    if (!navigator.onLine) {
        const cacheKey = getStorageKey(target, extraParams);
        const cachedString = localStorage.getItem(cacheKey);
        if (cachedString) {
            const data = JSON.parse(cachedString);
            containerElement.innerHTML = data.html_content;
            UI.showOfflineMessage(containerElement);
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }
    }

    containerElement.innerHTML = `<p class="text-sm text-gray-500 flex items-center"><i data-lucide="loader" class="animate-spin h-5 w-5 mr-2 text-indigo-600"></i> Loading ${title || 'content'}...</p>`;
    if (typeof lucide !== 'undefined') lucide.createIcons(); 
    
    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: target, semesterSubId: state.currentSemesterId, ...extraParams }) });
        if (!response.ok) {
             if(response.status === 401) throw new Error("Session expired.");
             throw new Error(`Server error ${response.status}`);
        }
        const data = await response.json();
        if (data.status === 'success') { 
            containerElement.innerHTML = data.html_content; 
            if (typeof lucide !== 'undefined') lucide.createIcons(); 
            
            // Update State & Cache
            if (target === TARGETS.ATTENDANCE) state.setAttendance(data.raw_data);
            if (target === TARGETS.TIMETABLE) state.setTimetable(data.raw_data.timetable);
            
            try { localStorage.setItem(getStorageKey(target, extraParams), JSON.stringify(data)); } catch(e) {}
        } else throw new Error(data.message);
    } catch (error) { 
        // If network fails, try cache one last time
        const cacheKey = getStorageKey(target, extraParams);
        const cachedString = localStorage.getItem(cacheKey);
        if (cachedString) {
            const data = JSON.parse(cachedString);
            containerElement.innerHTML = data.html_content;
            UI.showOfflineMessage(containerElement);
             if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            if (error.message.includes("Session expired")) { 
                localStorage.removeItem('vtop_session_id'); 
                window.location.href = '/login'; 
            } else {
                containerElement.innerHTML = `<div class="p-6 text-center"><p class="text-red-500 font-bold mb-2">Connection Failed</p><button onclick="location.reload()" class="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm">Retry</button></div>`;
            }
        }
    }
}

// Keep these for calculator requirements
export async function fetchAttendanceForCache() { fetchAndCalculateAttendanceSnapshot(); }
export async function fetchTimetableForCache() { fetchTimetableAndCourses(null, null, null); }

export async function fetchAndDisplayODSnapshot() {
    if (!state.currentSemesterId || !navigator.onLine) return;
    try {
        const response = await fetch(`${API_BASE_URL}/get-od-snapshot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success') UI.updateODSnapshot(data);
    } catch (e) {}
}

export async function fetchAttendanceDetails(classId, slot, modalBody) {
    if (!navigator.onLine) { modalBody.innerHTML = '<p class="p-5 text-center text-gray-500">Offline. Details unavailable.</p>'; return; }
    try {
        const response = await fetch(`${API_BASE_URL}/${TARGETS.ATTENDANCE_DETAIL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), class_id: classId, slot: slot, semesterSubId: state.currentSemesterId })
        });
        const data = await response.json();
        if (data.status === 'success') modalBody.innerHTML = data.html_content;
        else modalBody.innerHTML = `<p class="p-5 text-center text-red-500">${data.message}</p>`;
    } catch (error) { modalBody.innerHTML = `<p class="p-5 text-center text-red-500">Network error.</p>`; }
}