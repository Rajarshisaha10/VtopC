from flask import request, jsonify, render_template
from . import data_bp
from .utils import get_session_details
from . import timetable, attendance, calendar, marks, exams, profile

# Constants for Dispatching
TIMETABLE_TARGET = 'academics/common/StudentTimeTableChn'
ATTENDANCE_TARGET = 'processViewStudentAttendance'
CALENDAR_TARGET = 'academics/common/CalendarPreview'
MARKS_TARGET = 'examinations/doStudentMarkView'
EXAM_SCHEDULE_TARGET = 'examinations/doSearchExamScheduleForStudent'
PROFILE_TARGET = 'student/studentProfileView'

@data_bp.route('/get-semesters', methods=['POST'])
def get_semesters():
    return timetable.get_semesters(request)

@data_bp.route('/fetch-data', methods=['POST'])
def fetch_data():
    data = request.json
    target = data.get('target')
    session_id = data.get('session_id')

    try:
        # Get session details once for all handlers
        session_data = get_session_details(session_id)
        if not session_data:
            return jsonify({'status': 'error', 'message': 'Session expired or invalid'}), 401
            
        session, authorized_id, csrf_token, base_url = session_data
        
        context = {
            'session': session,
            'authorized_id': authorized_id,
            'csrf_token': csrf_token,
            'base_url': base_url,
            'headers': {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}
        }

        if target == TIMETABLE_TARGET:
            return timetable.fetch_timetable(context, data)
        
        elif target == ATTENDANCE_TARGET:
            return attendance.fetch_attendance(context, data)
            
        elif target == CALENDAR_TARGET:
            return calendar.fetch_calendar(context, data)

        elif target == MARKS_TARGET:
            return marks.fetch_marks(context, data)
            
        elif target == EXAM_SCHEDULE_TARGET:
            return exams.fetch_exams(context, data)

        elif target == PROFILE_TARGET:
            return profile.fetch_profile(context, data)
        
        else:
            # Fallback for generic/unknown targets
            payload = {'authorizedID': authorized_id, '_csrf': csrf_token, 'verifyMenu': 'true'}
            res = session.post(f"{base_url}/{target}", data=payload, headers=context['headers'], verify=False)
            html = render_template('placeholder_content.html', title=target, data_html=res.text)
            return jsonify({'status': 'success', 'html_content': html})

    except Exception as e:
        err_msg = str(e).lower()
        # If VTOP is slow or unreachable, return 502 to PREVENT the frontend from logging the user out.
        if "timeout" in err_msg or "connection" in err_msg or "max retries" in err_msg:
            return jsonify({'status': 'error', 'message': 'VTOP is taking too long to respond.'}), 502
        
        # If the error is something else, return 401 to trigger a clean re-login.
        return jsonify({'status': 'error', 'message': 'Session expired or invalid.'}), 401

@data_bp.route('/fetch-attendance-detail', methods=['POST'])
def fetch_attendance_detail():
    return attendance.fetch_detail(request)

@data_bp.route('/get-od-snapshot', methods=['POST'])
def get_od_snapshot():
    return attendance.get_od_snapshot(request)