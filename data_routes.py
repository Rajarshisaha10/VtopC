from flask import Blueprint, jsonify, request, render_template
from bs4 import BeautifulSoup
import requests
import warnings
import datetime
import re

from session_manager import session_storage
from parsers.timetable_parser import parse_course_data
from parsers.attendance_parser import parse_attendance_summary, parse_attendance_detail
from parsers.calendar_parser import parse_academic_calendar
from parsers.marks_parser import parse_marks # Import the new parser

warnings.filterwarnings('ignore', category=requests.packages.urllib3.exceptions.InsecureRequestWarning)

data_bp = Blueprint('data_bp', __name__)

# --- Targets ---
TIMETABLE_TARGET = 'academics/common/StudentTimeTableChn'
GRADES_TARGET = 'examinations/examGradeView/StudentGradeView'
GRADES_VIEW_TARGET = 'examinations/doStudentMarkView' # Endpoint for actual marks
ATTENDANCE_TARGET = 'processViewStudentAttendance'
CALENDAR_TARGET = 'academics/common/CalendarPreview'
CALENDAR_VIEW_TARGET = 'processViewCalendar'
ATTENDANCE_DETAIL_TARGET = 'processViewAttendanceDetail'


def get_session_details(session_id):
    """Helper function to get session, username, csrf, and base_url."""
    if not session_id or 'session' not in session_storage.get(session_id, {}):
        raise Exception("Invalid session.")
    
    session_data = session_storage[session_id]
    session = session_data['session']
    username = session_data['username']
    
    base_url = "https://vtopcc.vit.ac.in/vtop"
    
    # Refresh CSRF
    try:
        headers = {'Referer': f"{base_url}/content"}
        content_res = session.get(f"{base_url}/content", verify=False, headers=headers)
        content_res.raise_for_status()
        soup = BeautifulSoup(content_res.text, 'html.parser')
        
        csrf_token_tag = soup.find('input', {'name': '_csrf'})
        if not csrf_token_tag:
            if session_id in session_storage:
                del session_storage[session_id]
            raise Exception("Session expired (CSRF missing).")
            
        csrf_token = csrf_token_tag['value']
    except Exception as e:
        print(f"Error fetching CSRF: {e}")
        if session_id in session_storage:
            del session_storage[session_id]
        raise Exception("Session expired or network error.")
    
    return session, username, csrf_token, base_url

@data_bp.route('/get-semesters', methods=['POST'])
def get_semesters():
    session_id = request.json.get('session_id')
    try:
        session, username, csrf_token, base_url = get_session_details(session_id)
        headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}
        
        res = session.post(
            f"{base_url}/{TIMETABLE_TARGET}", 
            data={'authorizedID': username, '_csrf': csrf_token, 'verifyMenu': 'true'}, 
            headers=headers, verify=False
        )
        res.raise_for_status()
        
        soup = BeautifulSoup(res.text, 'html.parser')
        sem_select = soup.find('select', {'id': 'semesterSubId'})
        
        semesters = []
        if sem_select:
            for opt in sem_select.find_all('option'):
                if opt.get('value'):
                    semesters.append({'id': opt['value'], 'name': opt.get_text(strip=True)})
        
        return jsonify({'status': 'success', 'semesters': semesters})

    except Exception as e:
        print(f"Error in get_semesters: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 401


@data_bp.route('/fetch-data', methods=['POST'])
def fetch_data():
    data = request.json
    session_id = data.get('session_id')
    target = data.get('target')
    semester_sub_id = data.get('semesterSubId')
    cal_date = data.get('calDate') 

    try:
        session, username, csrf_token, base_url = get_session_details(session_id)
        headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}

        if target == TIMETABLE_TARGET:
            payload = {'authorizedID': username, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
            res = session.post(f"{base_url}/processViewTimeTable", data=payload, headers=headers, verify=False)
            parsed_data = parse_course_data(res.text)
            html = render_template('timetable_content.html', data=parsed_data)
            return jsonify({'status': 'success', 'html_content': html, 'raw_data': parsed_data})

        elif target == ATTENDANCE_TARGET:
            payload = {'authorizedID': username, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
            res = session.post(f"{base_url}/{target}", data=payload, headers=headers, verify=False)
            parsed_data = parse_attendance_summary(res.text)
            html = render_template('attendance_content.html', courses=parsed_data)
            return jsonify({'status': 'success', 'html_content': html, 'raw_data': parsed_data})
            
        elif target == CALENDAR_TARGET:
            if not cal_date:
                now = datetime.datetime.now()
                cal_date = now.strftime("01-%b-%Y").upper()

            payload = {
                'authorizedID': username, 
                '_csrf': csrf_token, 
                'calDate': cal_date,
                'semSubId': semester_sub_id,
                'classGroupId': 'COMB', 
                'x': datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
            }
            
            res = session.post(f"{base_url}/{CALENDAR_VIEW_TARGET}", data=payload, headers=headers, verify=False)
            parsed_data = parse_academic_calendar(res.text)
            
            curr_dt = datetime.datetime.strptime(cal_date, "%d-%b-%Y")
            next_month = (curr_dt + datetime.timedelta(days=32)).replace(day=1)
            prev_month = (curr_dt - datetime.timedelta(days=1)).replace(day=1)
            
            nav_info = {
                'current': cal_date,
                'next': next_month.strftime("01-%b-%Y").upper(),
                'prev': prev_month.strftime("01-%b-%Y").upper()
            }

            html = render_template('calendar_content.html', calendar=parsed_data, nav=nav_info)
            return jsonify({'status': 'success', 'html_content': html})

        elif target == GRADES_TARGET:
            print(f"Fetching Marks for {username} (Sem: {semester_sub_id})")
            # Use the specific view target for data
            payload = {
                'authorizedID': username, 
                '_csrf': csrf_token, 
                'semesterSubId': semester_sub_id
            }
            res = session.post(f"{base_url}/{GRADES_VIEW_TARGET}", data=payload, headers=headers, verify=False)
            
            parsed_data = parse_marks(res.text)
            html = render_template('grades_content.html', courses=parsed_data)
            return jsonify({'status': 'success', 'html_content': html})
            
        else:
            # Fallback
            payload = {'authorizedID': username, '_csrf': csrf_token, 'verifyMenu': 'true'}
            res = session.post(f"{base_url}/{target}", data=payload, headers=headers, verify=False)
            html = render_template('placeholder_content.html', title=target, data_html=res.text)
            return jsonify({'status': 'success', 'html_content': html})

    except Exception as e:
        print(f"Error in fetch-data: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 401

# ... [Fetch Attendance Detail and OD Snapshot routes remain unchanged] ...
@data_bp.route('/fetch-attendance-detail', methods=['POST'])
def fetch_attendance_detail():
    data = request.json
    session_id = data.get('session_id')
    class_id = data.get('class_id')
    slot = data.get('slot')
    semester_sub_id = data.get('semesterSubId')
    
    try:
        session, username, csrf_token, base_url = get_session_details(session_id)
        headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}
        
        payload = {
            'authorizedID': username,
            '_csrf': csrf_token,
            'lSemesterSubId': semester_sub_id, 
            'classId': class_id,
            'slotName': slot 
        }
        
        res = session.post(f"{base_url}/{ATTENDANCE_DETAIL_TARGET}", data=payload, headers=headers, verify=False)
        parsed_data = parse_attendance_detail(res.text)
        html = render_template('attendance_detail_content.html', details=parsed_data)
        return jsonify({'status': 'success', 'html_content': html})

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 401

@data_bp.route('/get-od-snapshot', methods=['POST'])
def get_od_snapshot():
    data = request.json
    session_id = data.get('session_id')
    semester_sub_id = data.get('semesterSubId')
    
    try:
        session, username, csrf_token, base_url = get_session_details(session_id)
        headers = {'X-Requested-With': 'XMLHttpRequest', 'Referer': f"{base_url}/content"}

        summary_payload = {'authorizedID': username, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
        summary_res = session.post(f"{base_url}/{ATTENDANCE_TARGET}", data=summary_payload, headers=headers, verify=False)
        course_list = parse_attendance_summary(summary_res.text)
        
        total_od = 0
        for course in course_list:
            if not course.get('class_id') or not course.get('slot_param'): continue
            
            is_lab = 'LAB' in course.get('course_type', '').upper()
            detail_payload = {
                'authorizedID': username, '_csrf': csrf_token,
                'lSemesterSubId': semester_sub_id, 'classId': course['class_id'], 'slotName': course['slot_param']
            }
            try:
                detail_res = session.post(f"{base_url}/{ATTENDANCE_DETAIL_TARGET}", data=detail_payload, headers=headers, verify=False)
                detail_data = parse_attendance_detail(detail_res.text)
                for d in detail_data:
                    if d.get('status') == 'On Duty':
                        total_od += 2 if is_lab else 1
            except:
                continue 
                
        return jsonify({'status': 'success', 'total_od_count': total_od})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 401