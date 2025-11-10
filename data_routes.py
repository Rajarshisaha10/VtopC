from flask import Blueprint, jsonify, request, render_template
from bs4 import BeautifulSoup
import requests
import warnings
import re

from session_manager import session_storage
# Updated parser imports
from parsers.timetable_parser import parse_course_data
from parsers.attendance_parser import parse_attendance_summary, parse_attendance_detail

warnings.filterwarnings('ignore', category=requests.packages.urllib3.exceptions.InsecureRequestWarning)

data_bp = Blueprint('data_bp', __name__)

# --- Targets ---
TIMETABLE_TARGET = 'academics/common/StudentTimeTableChn'
GRADES_TARGET = 'examinations/examGradeView/StudentGradeView'
ATTENDANCE_TARGET = 'processViewStudentAttendance'
CALENDAR_TARGET = 'academics/common/CalendarPreview'
ENROLLMENT_TARGET = 'courseManagement/studentCourseRegister'
HOSTEL_TARGET = 'hostels/student/leave/1'
PROFILE_TARGET = 'student/studentProfileView'
# New endpoint for attendance detail
ATTENDANCE_DETAIL_TARGET = 'processViewAttendanceDetail'


def get_session_details(session_id):
    """Helper function to get session, username, csrf, and base_url."""
    if not session_id or 'session' not in session_storage.get(session_id, {}):
        raise Exception("Invalid session.")
    
    session_data = session_storage[session_id]
    session = session_data['session']
    username = session_data['username']
    
    base_url = "https://vtopcc.vit.ac.in/vtop"
    
    # Get a fresh CSRF token
    # Using 'content' page as the referrer, as seen in your network log
    headers = {'Referer': f"{base_url}/content"}
    content_res = session.get(f"{base_url}/content", verify=False, headers=headers)
    content_res.raise_for_status()
    soup = BeautifulSoup(content_res.text, 'html.parser')
    
    csrf_token_tag = soup.find('input', {'name': '_csrf'})
    if not csrf_token_tag:
        if session_id in session_storage:
            del session_storage[session_id]
        raise Exception("Session expired.")
        
    csrf_token = csrf_token_tag['value']
    
    return session, username, csrf_token, base_url

@data_bp.route('/get-semesters', methods=['POST'])
def get_semesters():
    """
    Fetches the list of all available semesters from the timetable page.
    """
    session_id = request.json.get('session_id')
    try:
        session, username, csrf_token, base_url = get_session_details(session_id)
        headers = {
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': f"{base_url}/content"
            }
        
        print("\n--- Fetching Semester List ---")
        initial_tt_page_res = session.post(
            f"{base_url}/{TIMETABLE_TARGET}", 
            data={'authorizedID': username, '_csrf': csrf_token, 'verifyMenu': 'true'}, 
            headers=headers,
            verify=False
        )
        initial_tt_page_res.raise_for_status()
        
        tt_soup = BeautifulSoup(initial_tt_page_res.text, 'html.parser')
        semester_select_tag = tt_soup.find('select', {'id': 'semesterSubId'})
        
        semesters = []
        if semester_select_tag:
            for option in semester_select_tag.find_all('option'):
                value = option.get('value')
                name = option.get_text(strip=True)
                if value and len(value) > 0:
                    semesters.append({'id': value, 'name': name})
            print(f"   > Found {len(semesters)} semesters.")
            return jsonify({'status': 'success', 'semesters': semesters})
        
        raise ValueError("Could not find semester dropdown.")

    except Exception as e:
        print(f"   > CRITICAL ERROR in '/get-semesters': {e}")
        if 'session_id' in locals() and session_id in session_storage:
            del session_storage[session_id]
        return jsonify({'status': 'session_expired', 'message': str(e)}), 401


@data_bp.route('/fetch-data', methods=['POST'])
def fetch_data():
    data = request.json
    session_id = data.get('session_id')
    target = data.get('target')
    semester_sub_id = data.get('semesterSubId') # Semester is now sent from client

    try:
        session, username, csrf_token, base_url = get_session_details(session_id)
        headers = {
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': f"{base_url}/content"
            }
        print(f"\n--- Fetching '{target}' for {username} (Sem: {semester_sub_id}) ---")

        # All routes that need a semester ID must have it provided
        if not semester_sub_id and target in [TIMETABLE_TARGET, ATTENDANCE_TARGET, GRADES_TARGET]:
             return jsonify({'status': 'failure', 'message': 'Semester ID not provided.'}), 400

        if target == TIMETABLE_TARGET:
            print("   > Fetching actual timetable data with Semester ID...")
            payload = {'authorizedID': username, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
            data_res = session.post(f"{base_url}/processViewTimeTable", data=payload, headers=headers, verify=False)
            data_res.raise_for_status()
            
            print("   > Parsing timetable data and rendering custom template.")
            parsed_data = parse_course_data(data_res.text)
            rendered_html = render_template('timetable_content.html', data=parsed_data)
            
            return jsonify({
                'status': 'success', 
                'html_content': rendered_html,
                'raw_data': parsed_data 
            })

        elif target == GRADES_TARGET:
            print(f"   > Fetching grades page: {target}")
            payload = {'authorizedID': username, '_csrf': csrf_token, 'verifyMenu': 'true'}
            data_res = session.post(f"{base_url}/{target}", data=payload, headers=headers, verify=False)
            data_res.raise_for_status()
            
            rendered_html = render_template('grades_content.html', data_html=data_res.text)
            return jsonify({'status': 'success', 'html_content': rendered_html})

        elif target == ATTENDANCE_TARGET:
            print(f"   > Fetching attendance data: {target}")
            payload = {'authorizedID': username, '_csrf': csrf_token, 'semesterSubId': semester_sub_id}
            data_res = session.post(f"{base_url}/{target}", data=payload, headers=headers, verify=False)
            data_res.raise_for_status()

            parsed_data = parse_attendance_summary(data_res.text)
            rendered_html = render_template('attendance_content.html', courses=parsed_data)
            return jsonify({'status': 'success', 'html_content': rendered_html})
        
        else:
            # --- GENERIC HANDLER FOR OTHER TARGETS (Calendar, Placeholders) ---
            print(f"   > Performing generic fetch for target: {target}")
            payload = {'authorizedID': username, '_csrf': csrf_token, 'verifyMenu': 'true'}
            data_res = session.post(f"{base_url}/{target}", data=payload, headers=headers, verify=False)
            data_res.raise_for_status()
            
            template_name = 'placeholder_content.html'
            title = target.split('/')[-1].replace('_', ' ').title()
            
            if target == CALENDAR_TARGET:
                 template_name = 'calendar_content.html'
                 title = "Academic Calendar"
            
            rendered_html = render_template(template_name, title=title, data_html=data_res.text)
            return jsonify({'status': 'success', 'html_content': rendered_html})

    except Exception as e:
        print(f"   > CRITICAL ERROR in '/fetch-data': {e}")
        import traceback
        traceback.print_exc()
        if 'session_id' in locals() and session_id in session_storage:
            del session_storage[session_id]
        return jsonify({'status': 'session_expired', 'message': str(e)}), 401


@data_bp.route('/fetch-attendance-detail', methods=['POST'])
def fetch_attendance_detail():
    """
    Fetches the detailed attendance for a specific class.
    """
    data = request.json
    session_id = data.get('session_id')
    class_id = data.get('class_id')
    slot = data.get('slot')
    semester_sub_id = data.get('semesterSubId') # Semester is now sent from client
    
    try:
        session, username, csrf_token, base_url = get_session_details(session_id)
        headers = {
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': f"{base_url}/content"
            }
        
        if not semester_sub_id:
             return jsonify({'status': 'failure', 'message': 'Semester ID not provided.'}), 400

        print(f"\n--- Fetching attendance detail for {class_id} (Sem: {semester_sub_id}) ---")
        
        # *** THIS IS THE FIX ***
        # The key VTOP expects is 'slotName', not 'slot'
        payload = {
            'authorizedID': username,
            '_csrf': csrf_token,
            'lSemesterSubId': semester_sub_id, 
            'classId': class_id,
            'slotName': slot  # <-- Changed from 'slot' to 'slotName'
        }
        
        data_res = session.post(f"{base_url}/{ATTENDANCE_DETAIL_TARGET}", data=payload, headers=headers, verify=False)
        data_res.raise_for_status()

        # Parse the detailed HTML response
        parsed_data = parse_attendance_detail(data_res.text)
        rendered_html = render_template('attendance_detail_content.html', details=parsed_data)
        
        return jsonify({'status': 'success', 'html_content': rendered_html})

    except Exception as e:
        print(f"   > CRITICAL ERROR in '/fetch-attendance-detail': {e}")
        import traceback
        traceback.print_exc()
        if 'session_id' in locals() and session_id in session_storage:
            del session_storage[session_id]
        return jsonify({'status': 'session_expired', 'message': str(e)}), 401