from flask import Blueprint, jsonify, request, render_template, current_app
from bs4 import BeautifulSoup
import requests
import warnings
import datetime
import re

# Import the serializer getter from auth to verify password against cookie
from auth import get_serializer
from session_manager import session_storage
from parsers.timetable_parser import parse_course_data
from parsers.attendance_parser import parse_attendance_summary, parse_attendance_detail
from parsers.calendar_parser import parse_academic_calendar, parse_class_groups
from parsers.marks_parser import parse_marks
from parsers.exam_schedule_parser import parse_exam_schedule
from parsers.profile_parser import parse_profile
from parsers.credentials_parser import parse_credentials

warnings.filterwarnings('ignore', category=requests.packages.urllib3.exceptions.InsecureRequestWarning)

data_bp = Blueprint('data_bp', __name__)

# ... [Previous constants remain the same] ...
TIMETABLE_TARGET = 'academics/common/StudentTimeTableChn'
ATTENDANCE_TARGET = 'processViewStudentAttendance'
ATTENDANCE_DETAIL_TARGET = 'processViewAttendanceDetail'
CALENDAR_TARGET = 'academics/common/CalendarPreview'
CALENDAR_INIT_TARGET = 'getDateForSemesterPreview'
CALENDAR_VIEW_TARGET = 'processViewCalendar'
MARKS_TARGET = 'examinations/doStudentMarkView'
EXAM_SCHEDULE_TARGET = 'examinations/doSearchExamScheduleForStudent'
PROFILE_TARGET = 'student/studentProfileView'

# ... [get_session_details and get_semesters functions remain the same] ...
def get_session_details(session_id):
    if not session_id or 'session' not in session_storage.get(session_id, {}):
        raise Exception("Invalid session.")
    
    session_data = session_storage[session_id]
    session = session_data['session']
    authorized_id = session_data.get('authorized_id', session_data.get('username'))
    base_url = "https://vtopcc.vit.ac.in/vtop"
    
    try:
        headers = {'Referer': f"{base_url}/content"}
        content_res = session.get(f"{base_url}/content", verify=False, headers=headers)
        content_res.raise_for_status()
        soup = BeautifulSoup(content_res.text, 'html.parser')
        csrf_token_tag = soup.find('input', {'name': '_csrf'})
        if not csrf_token_tag:
            if session_id in session_storage: del session_storage[session_id]
            raise Exception("Session expired (CSRF missing).")
        csrf_token = csrf_token_tag['value']
    except Exception as e:
        if session_id in session_storage: del session_storage[session_id]
        raise Exception("Session expired or network error.")
    
    return session, authorized_id, csrf_token, base_url

@data_bp.route('/get-semesters', methods=['POST'])
def get_semesters():
    session_id = request.json.get('session_id')
    try:
        session, authorized_id, csrf_token, base_url = get_session_details(session_id)
        headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}
        res = session.post(f"{base_url}/{TIMETABLE_TARGET}", data={'authorizedID': authorized_id, '_csrf': csrf_token, 'verifyMenu': 'true'}, headers=headers, verify=False)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, 'html.parser')
        sem_select = soup.find('select', {'id': 'semesterSubId'})
        semesters = []
        if sem_select:
            for opt in sem_select.find_all('option'):
                if opt.get('value'): semesters.append({'id': opt['value'], 'name': opt.get_text(strip=True)})
        return jsonify({'status': 'success', 'semesters': semesters})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 401

@data_bp.route('/fetch-data', methods=['POST'])
def fetch_data():
    data = request.json
    session_id = data.get('session_id')
    target = data.get('target')
    semester_sub_id = data.get('semesterSubId')
    cal_date = data.get('calDate') 

    try:
        session, authorized_id, csrf_token, base_url = get_session_details(session_id)
        headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}

        if target == TIMETABLE_TARGET:
            payload = {'authorizedID': authorized_id, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
            res = session.post(f"{base_url}/processViewTimeTable", data=payload, headers=headers, verify=False)
            parsed_data = parse_course_data(res.text)
            html = render_template('timetable_content.html', data=parsed_data)
            return jsonify({'status': 'success', 'html_content': html, 'raw_data': parsed_data})

        elif target == ATTENDANCE_TARGET:
            payload = {'authorizedID': authorized_id, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
            res = session.post(f"{base_url}/{target}", data=payload, headers=headers, verify=False)
            parsed_data = parse_attendance_summary(res.text)
            html = render_template('attendance_content.html', courses=parsed_data)
            return jsonify({'status': 'success', 'html_content': html, 'raw_data': parsed_data})
            
        elif target == CALENDAR_TARGET:
            # 1. Fetch available class groups to determine if we are Freshers or General
            init_payload = {
                'authorizedID': authorized_id,
                '_csrf': csrf_token,
                'semSubId': semester_sub_id,
                'paramReturnId': 'getDateForSemesterPreview',
                'x': datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
            }
            
            selected_group = 'ALL' # Default to General Semester
            try:
                init_res = session.post(f"{base_url}/{CALENDAR_INIT_TARGET}", data=init_payload, headers=headers, verify=False)
                available_groups = parse_class_groups(init_res.text)
                
                # Priority: Fresher (ALL03) > General (ALL)
                if 'ALL03' in available_groups:
                    selected_group = 'ALL03'
                elif 'ALL' in available_groups:
                    selected_group = 'ALL'
            except Exception:
                pass # Stick to default 'ALL' if init fails

            if not cal_date:
                now = datetime.datetime.now()
                cal_date = now.strftime("01-%b-%Y").upper()
            
            # 2. Fetch the actual calendar data using the selected group
            payload = { 
                'authorizedID': authorized_id, 
                '_csrf': csrf_token, 
                'calDate': cal_date, 
                'semSubId': semester_sub_id, 
                'classGroupId': selected_group,
                'x': datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT") 
            }
            res = session.post(f"{base_url}/{CALENDAR_VIEW_TARGET}", data=payload, headers=headers, verify=False)
            parsed_data = parse_academic_calendar(res.text)

            # [Exam merging logic omitted for brevity, assumed same as before]
            try:
                cal_dt_obj = datetime.datetime.strptime(cal_date.title(), "%d-%b-%Y")
                view_month = cal_dt_obj.month
                view_year = cal_dt_obj.year
                exam_payload = {'authorizedID': authorized_id, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
                exam_res = session.post(f"{base_url}/{EXAM_SCHEDULE_TARGET}", data=exam_payload, headers=headers, verify=False)
                exam_schedule = parse_exam_schedule(exam_res.text)
                for exam in exam_schedule:
                    try:
                        ex_date = datetime.datetime.strptime(exam['exam_date'], "%d-%b-%Y")
                        if ex_date.month == view_month and ex_date.year == view_year:
                            for day_obj in parsed_data['days']:
                                if day_obj['day'] == ex_date.day:
                                    day_obj['status'] = 'exam' 
                                    day_obj['events'] = [e for e in day_obj['events'] if 'holiday' not in e['text'].lower() and 'no instructional' not in e['text'].lower()]
                                    exam_type_lbl = exam.get('exam_type', 'Exam')
                                    day_obj['events'].append({'text': f"{exam_type_lbl}: {exam['course_code']} ({exam['slot']})"})
                    except (ValueError, KeyError, TypeError): continue
            except Exception: pass

            curr_dt = datetime.datetime.strptime(cal_date.title(), "%d-%b-%Y")
            next_month = (curr_dt + datetime.timedelta(days=32)).replace(day=1)
            prev_month = (curr_dt - datetime.timedelta(days=1)).replace(day=1)
            nav_info = { 'current': cal_date, 'next': next_month.strftime("01-%b-%Y").upper(), 'prev': prev_month.strftime("01-%b-%Y").upper() }
            html = render_template('calendar_content.html', calendar=parsed_data, nav=nav_info)
            return jsonify({'status': 'success', 'html_content': html})

        elif target == MARKS_TARGET:
            payload = {'authorizedID': authorized_id, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
            res = session.post(f"{base_url}/{MARKS_TARGET}", data=payload, headers=headers, verify=False)
            parsed_data = parse_marks(res.text)
            html = render_template('marks_content.html', courses=parsed_data)
            return jsonify({'status': 'success', 'html_content': html})
            
        elif target == EXAM_SCHEDULE_TARGET:
            payload = {'authorizedID': authorized_id, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
            res = session.post(f"{base_url}/{EXAM_SCHEDULE_TARGET}", data=payload, headers=headers, verify=False)
            parsed_data = parse_exam_schedule(res.text)
            html = render_template('exam_schedule_content.html', exams=parsed_data)
            return jsonify({'status': 'success', 'html_content': html})

        elif target == PROFILE_TARGET:
             real_target = "studentsRecord/StudentProfileAllView"
             payload = {'verifyMenu': 'true', 'authorizedID': authorized_id, '_csrf': csrf_token, 'nocache': '@(new Date().getTime())'}
             res = session.post(f"{base_url}/{real_target}", data=payload, headers=headers, verify=False)
             parsed_profile = parse_profile(res.text)
             # NOTE: We do NOT fetch credentials here anymore. 
             # They are fetched via a separate authenticated call.
             html = render_template('profile_content.html', profile=parsed_profile)
             return jsonify({'status': 'success', 'html_content': html})
        
        else:
            payload = {'authorizedID': authorized_id, '_csrf': csrf_token, 'verifyMenu': 'true'}
            res = session.post(f"{base_url}/{target}", data=payload, headers=headers, verify=False)
            html = render_template('placeholder_content.html', title=target, data_html=res.text)
            return jsonify({'status': 'success', 'html_content': html})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 401

@data_bp.route('/fetch-profile-credentials', methods=['POST'])
def fetch_profile_credentials():
    """
    Secure endpoint to fetch credentials. Requires re-validation of VTOP password.
    """
    data = request.json
    session_id = data.get('session_id')
    password_attempt = data.get('password')
    
    if not session_id or session_id not in session_storage:
        return jsonify({'status': 'error', 'message': 'Session expired'}), 401

    # 1. Verify Password against the secure cookie (avoiding re-login to VTOP for speed/security)
    cookie_token = request.cookies.get('vtop_creds')
    if not cookie_token:
        return jsonify({'status': 'error', 'message': 'Auth token missing. Please relogin.'}), 401

    try:
        creds = get_serializer().loads(cookie_token, max_age=60*60*24*30)
        stored_password = creds['p']
        
        if password_attempt != stored_password:
            return jsonify({'status': 'error', 'message': 'Incorrect Password'}), 403
            
        # 2. Password is correct, fetch the data
        session, authorized_id, csrf_token, base_url = get_session_details(session_id)
        headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}
        payload = {'verifyMenu': 'true', 'authorizedID': authorized_id, '_csrf': csrf_token, 'nocache': '@(new Date().getTime())'}
        
        creds_target = "proctor/viewStudentCredentials"
        creds_res = session.post(f"{base_url}/{creds_target}", data=payload, headers=headers, verify=False)
        parsed_data = parse_credentials(creds_res.text)
        
        # Render just the table part using a new mini-template string or reusable block
        # For simplicity, we'll return the JSON data and let frontend build it, 
        # OR render a partial template. Let's render a partial for consistency.
        html = render_template('credentials_table_partial.html', data=parsed_data)
        
        return jsonify({'status': 'success', 'html_content': html})
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ... [Other routes like fetch_attendance_detail and get_od_snapshot remain unchanged] ...
@data_bp.route('/fetch-attendance-detail', methods=['POST'])
def fetch_attendance_detail():
    data = request.json
    session_id = data.get('session_id'); class_id = data.get('class_id'); slot = data.get('slot'); semester_sub_id = data.get('semesterSubId')
    try:
        session, authorized_id, csrf_token, base_url = get_session_details(session_id)
        headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}
        payload = { 'authorizedID': authorized_id, '_csrf': csrf_token, 'lSemesterSubId': semester_sub_id, 'classId': class_id, 'slotName': slot }
        res = session.post(f"{base_url}/{ATTENDANCE_DETAIL_TARGET}", data=payload, headers=headers, verify=False)
        parsed_data = parse_attendance_detail(res.text)
        html = render_template('attendance_detail_content.html', details=parsed_data)
        return jsonify({'status': 'success', 'html_content': html})
    except Exception as e: return jsonify({'status': 'error', 'message': str(e)}), 401

@data_bp.route('/get-od-snapshot', methods=['POST'])
def get_od_snapshot():
    data = request.json
    session_id = data.get('session_id'); semester_sub_id = data.get('semesterSubId')
    try:
        session, authorized_id, csrf_token, base_url = get_session_details(session_id)
        headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}
        summary_payload = {'authorizedID': authorized_id, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
        summary_res = session.post(f"{base_url}/{ATTENDANCE_TARGET}", data=summary_payload, headers=headers, verify=False)
        course_list = parse_attendance_summary(summary_res.text)
        total_od = 0
        for course in course_list:
            if not course.get('class_id') or not course.get('slot_param'): continue
            is_lab = 'LAB' in course.get('course_type', '').upper()
            detail_payload = { 'authorizedID': authorized_id, '_csrf': csrf_token, 'lSemesterSubId': semester_sub_id, 'classId': course['class_id'], 'slotName': course['slot_param'] }
            try:
                detail_res = session.post(f"{base_url}/{ATTENDANCE_DETAIL_TARGET}", data=detail_payload, headers=headers, verify=False)
                detail_data = parse_attendance_detail(detail_res.text)
                for d in detail_data:
                    if d.get('status') == 'On Duty': total_od += 2 if is_lab else 1
            except: continue 
        return jsonify({'status': 'success', 'total_od_count': total_od})
    except Exception as e: return jsonify({'status': 'error', 'message': str(e)}), 401