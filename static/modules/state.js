export const state = {
    currentSemesterId: null,
    cachedAttendance: [],
    cachedTimetable: {},
    
    setSemesterId(id) {
        this.currentSemesterId = id;
    },
    setAttendance(data) {
        this.cachedAttendance = data;
    },
    setTimetable(data) {
        this.cachedTimetable = data;
    }
};