import { API_BASE_URL, TARGETS } from './constants.js';
import { state } from './state.js';
import * as UI from './ui.js';

function getStorageKey(target, params = {}) {
    let key = `vtop_cache_${target}_${state.currentSemesterId || 'default'}`;
    if (params.calDate) key += `_${params.calDate}`;
    return key;
}

function loadFromCache(target, container, params) {
    const cacheKey = getStorageKey(target, params);
    const cachedString = localStorage.getItem(cacheKey);
    
    if (cachedString) {
        try {
            const cachedData = JSON.parse(cachedString);
            console.log(`[Offline] Serving ${target} from cache.`);
            
            if (container) {
                container.innerHTML = cachedData.html_content;
                UI.showOfflineMessage(container);
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }

            // Restore State
            if (target === TARGETS.ATTENDANCE && cachedData.raw_data) state.setAttendance(cachedData.raw_data);
            if (target === TARGETS.TIMETABLE && cachedData.raw_data) state.setTimetable(cachedData.raw_data.timetable);
            
            return true;
        } catch (e) {
            console.error("Cache parse error", e);
        }
    }
    return false;
}

function handleFetchError(error, container, target, params) {
    console.error('Fetch error:', error);

    // 1. Try to load from cache if network failed
    if (loadFromCache(target, container, params)) {
        return;
    }

    // 2. If generic error and no cache, show error message
    if (container) {
        // If session expired, we do want to redirect, BUT only if we are sure it's the server saying so
        if (error.message.includes("Session expired")) {
            localStorage.removeItem('vtop_session_id');
            window.location.href = '/login';
        } else {
            container.innerHTML = `<div class="p-6 text-center"><p class="text-red-500 mb-2">Connection Failed</p><button onclick="location.reload()" class="px-4 py-2 bg-gray-200 rounded text-sm">Retry</button></div>`;
        }
    }
}

export async function fetchAndDisplay(target, containerElement, title, extraParams = {}) {
    if (!containerElement) return;

    // Optimization: specific check for offline status to skip network attempt
    if (!navigator.onLine) {
        if (loadFromCache(target, containerElement, extraParams)) return;
        // If cache missing, fall through to try fetch (which will fail) or show error
    }

    containerElement.innerHTML = `<p class="text-sm text-gray-500 flex items-center"><i data-lucide="loader" class="animate-spin h-5 w-5 mr-2 text-indigo-600"></i> Loading ${title || 'content'}...</p>`;
    if (typeof lucide !== 'undefined') lucide.createIcons(); 
    
    try {
        const currentSessionId = localStorage.getItem('vtop_session_id');
        const payload = { session_id: currentSessionId, target: target, semesterSubId: state.currentSemesterId, ...extraParams };
        
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        
        if (!response.ok) {
             if(response.status === 401) throw new Error("Session expired.");
             throw new Error(`Server error ${response.status}`);
        }

        const data = await response.json();
        if (data.status === 'success') { 
            // 1. Render
            containerElement.innerHTML = data.html_content; 
            if (typeof lucide !== 'undefined') lucide.createIcons(); 
            
            // 2. Update State
            if (target === TARGETS.ATTENDANCE) state.setAttendance(data.raw_data);
            if (target === TARGETS.TIMETABLE) state.setTimetable(data.raw_data.timetable);
            
            // 3. Save to Cache immediately
            try {
                localStorage.setItem(getStorageKey(target, extraParams), JSON.stringify(data));
            } catch(e) { console.warn("Cache save failed", e); }

        } else throw new Error(data.message);

    } catch (error) { 
        handleFetchError(error, containerElement, target, extraParams); 
    }
}

export async function fetchAttendanceForCache() {
    const target = TARGETS.ATTENDANCE;
    try {
        if(!navigator.onLine) throw new Error("Offline");
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: target, semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success') {
            state.setAttendance(data.raw_data);
            localStorage.setItem(getStorageKey(target), JSON.stringify(data));
        }
    } catch (e) { 
        // Silent fallback
        const c = localStorage.getItem(getStorageKey(target));
        if(c) state.setAttendance(JSON.parse(c).raw_data);
    }
}

export async function fetchTimetableForCache() {
     const target = TARGETS.TIMETABLE;
     try {
        if(!navigator.onLine) throw new Error("Offline");
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: target, semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success') {
            state.setTimetable(data.raw_data.timetable);
            localStorage.setItem(getStorageKey(target), JSON.stringify(data));
        }
     } catch (e) {
        const c = localStorage.getItem(getStorageKey(target));
        if(c) state.setTimetable(JSON.parse(c).raw_data.timetable);
     }
}

export async function fetchAndCalculateAttendanceSnapshot() {
    if (!state.currentSemesterId) return; 
    const target = TARGETS.ATTENDANCE;

    const useCache = (data) => {
        state.setAttendance(data.raw_data);
        UI.updateAttendanceSnapshot(data.raw_data);
    };

    if (!navigator.onLine) {
        const c = localStorage.getItem(getStorageKey(target));
        if (c) useCache(JSON.parse(c));
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: target, semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success' && data.raw_data) {
            useCache(data);
            localStorage.setItem(getStorageKey(target), JSON.stringify(data)); // Immediate Save
        }
    } catch (error) { 
        const c = localStorage.getItem(getStorageKey(target));
        if (c) useCache(JSON.parse(c));
        else { const el = document.getElementById('snapshot-attendance-perc'); if(el) el.textContent = '--'; }
    }
}

export async function fetchTimetableAndCourses(coursesContainer, timetableContainer, todayScheduleContainer) {
    if (!state.currentSemesterId) return;
    const target = TARGETS.TIMETABLE;
    
    const renderData = (data, fromCache) => {
        state.setTimetable(data.raw_data.timetable);
        if (coursesContainer || timetableContainer) {
             const parser = new DOMParser();
             const doc = parser.parseFromString(data.html_content, 'text/html');
             const coursesContent = doc.getElementById('registered-courses-content');
             const timetableContent = doc.getElementById('weekly-timetable-content');
             
             if (coursesContainer) { 
                 coursesContainer.innerHTML = ''; 
                 if (coursesContent) coursesContainer.appendChild(coursesContent); 
                 if (fromCache) UI.showOfflineMessage(coursesContainer);
             }
             if (timetableContainer) { 
                 timetableContainer.innerHTML = ''; 
                 if (timetableContent) timetableContainer.appendChild(timetableContent); 
                 if (fromCache) UI.showOfflineMessage(timetableContainer);
             }
        }
        if (todayScheduleContainer) UI.populateTodaySchedule(data.raw_data.timetable, todayScheduleContainer);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    if (!navigator.onLine) {
         const c = localStorage.getItem(getStorageKey(target));
         if (c) renderData(JSON.parse(c), true);
         else if(todayScheduleContainer) todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500">No offline data.</p>';
         return;
    }

    // Show Loading
    const loadingHTML = `<div class="p-8 text-center text-gray-500 flex flex-col items-center justify-center"><i data-lucide="loader" class="animate-spin h-8 w-8 mb-2 text-indigo-500"></i><p>Loading data...</p></div>`;
    if (coursesContainer) coursesContainer.innerHTML = loadingHTML;
    if (timetableContainer) timetableContainer.innerHTML = loadingHTML;
    if (todayScheduleContainer) todayScheduleContainer.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 italic flex items-center"><i data-lucide="loader" class="animate-spin h-4 w-4 mr-2"></i> Loading schedule...</p>';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: target, semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success') {
            renderData(data, false);
            localStorage.setItem(getStorageKey(target), JSON.stringify(data)); // Immediate Save
        } else throw new Error(data.message);
    } catch (error) { 
        const c = localStorage.getItem(getStorageKey(target));
        if (c) renderData(JSON.parse(c), true);
        else handleFetchError(error, timetableContainer, target, {});
    }
}

export async function fetchAndDisplayODSnapshot() {
    // OD Snapshot is minimal, skip complex offline logic or caching for now to save space
    if (!state.currentSemesterId || !navigator.onLine) return;
    try {
        const response = await fetch(`${API_BASE_URL}/get-od-snapshot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success') UI.updateODSnapshot(data);
    } catch (e) { console.error(e); }
}

export async function fetchAttendanceDetails(classId, slot, modalBody) {
    // No caching for modals to keep logic simple
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