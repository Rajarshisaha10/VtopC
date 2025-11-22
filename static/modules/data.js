import { API_BASE_URL, TARGETS } from './constants.js';
import { state } from './state.js';
import * as UI from './ui.js';

function handleFetchError(error, container) {
    console.error('Fetch error:', error);
    if (error.message.includes("Session expired")) { 
        localStorage.removeItem('vtop_session_id'); 
        window.location.href = '/login'; 
    } else if (container) { 
        container.innerHTML = `<p class="text-red-500 text-sm">Error: ${error.message}</p>`; 
    }
}

export async function fetchAndDisplay(target, containerElement, title, extraParams = {}) {
    if (!containerElement) return;
    containerElement.innerHTML = `<p class="text-sm text-gray-500 flex items-center"><i data-lucide="loader" class="animate-spin h-5 w-5 mr-2 text-indigo-600"></i> Loading ${title || 'content'}...</p>`;
    if (typeof lucide !== 'undefined') lucide.createIcons(); 
    
    try {
        const currentSessionId = localStorage.getItem('vtop_session_id');
        const payload = { session_id: currentSessionId, target: target, semesterSubId: state.currentSemesterId, ...extraParams };
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error("Session expired.");
        const data = await response.json();
        if (data.status === 'success') { 
            containerElement.innerHTML = data.html_content; 
            if (typeof lucide !== 'undefined') lucide.createIcons(); 
            
            if (target === TARGETS.ATTENDANCE) state.setAttendance(data.raw_data);
            if (target === TARGETS.TIMETABLE) state.setTimetable(data.raw_data.timetable);
            
        } else throw new Error(data.message);
    } catch (error) { handleFetchError(error, containerElement); }
}

export async function fetchAttendanceForCache() {
    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: TARGETS.ATTENDANCE, semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success') state.setAttendance(data.raw_data);
    } catch (e) { console.error(e); }
}

export async function fetchTimetableForCache() {
     try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: TARGETS.TIMETABLE, semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success') state.setTimetable(data.raw_data.timetable);
     } catch (e) { console.error(e); }
}

export async function fetchAndCalculateAttendanceSnapshot() {
    if (!state.currentSemesterId) return; 
    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: TARGETS.ATTENDANCE, semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success' && data.raw_data) {
            state.setAttendance(data.raw_data);
            UI.updateAttendanceSnapshot(data.raw_data);
        }
    } catch (error) { 
        console.error(error); 
        const el = document.getElementById('snapshot-attendance-perc'); 
        if(el) el.textContent = 'Err'; 
    }
}

export async function fetchTimetableAndCourses(coursesContainer, timetableContainer, todayScheduleContainer) {
    if (!state.currentSemesterId) return;
    try {
        const response = await fetch(`${API_BASE_URL}/fetch-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), target: TARGETS.TIMETABLE, semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success') {
            state.setTimetable(data.raw_data.timetable);
            // If the containers exist (we might be on dashboard only, so coursesContainer might be null)
            if (coursesContainer || timetableContainer) {
                 const parser = new DOMParser();
                 const doc = parser.parseFromString(data.html_content, 'text/html');
                 const coursesContent = doc.getElementById('registered-courses-content');
                 const timetableContent = doc.getElementById('weekly-timetable-content');
                 
                 if (coursesContainer) { coursesContainer.innerHTML = ''; if (coursesContent) coursesContainer.appendChild(coursesContent); }
                 if (timetableContainer) { timetableContainer.innerHTML = ''; if (timetableContent) timetableContainer.appendChild(timetableContent); }
            }
            
            if (todayScheduleContainer) {
                UI.populateTodaySchedule(data.raw_data.timetable, todayScheduleContainer);
            }
            if (typeof lucide !== 'undefined') lucide.createIcons(); 
        } else throw new Error(data.message);
    } catch (error) { handleFetchError(error, timetableContainer); }
}

export async function fetchAndDisplayODSnapshot() {
    if (!state.currentSemesterId) return;
    try {
        const response = await fetch(`${API_BASE_URL}/get-od-snapshot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: localStorage.getItem('vtop_session_id'), semesterSubId: state.currentSemesterId }) });
        const data = await response.json();
        if (data.status === 'success') {
            UI.updateODSnapshot(data);
        }
    } catch (e) { console.error(e); }
}

export async function fetchAttendanceDetails(classId, slot, modalBody) {
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
        console.error(error);
        modalBody.innerHTML = `<div class="p-5 text-center text-red-500"><p>Network error. Please try again.</p></div>`;
    }
}