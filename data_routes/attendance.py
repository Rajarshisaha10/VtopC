from flask import jsonify, render_template
from parsers.attendance_parser import parse_attendance_summary, parse_attendance_detail
from .utils import get_session_details

ATTENDANCE_TARGET = 'processViewStudentAttendance'
ATTENDANCE_DETAIL_TARGET = 'processViewAttendanceDetail'

def fetch_attendance(ctx, data):
    semester_sub_id = data.get('semesterSubId')
    payload = {'authorizedID': ctx['authorized_id'], '_csrf': ctx['csrf_token'], 'semesterSubId': semester_sub_id}
    res = ctx['session'].post(f"{ctx['base_url']}/{ATTENDANCE_TARGET}", data=payload, headers=ctx['headers'], verify=False)
    parsed_data = parse_attendance_summary(res.text)
    html = render_template('attendance_content.html', courses=parsed_data)
    return jsonify({'status': 'success', 'html_content': html, 'raw_data': parsed_data})

def fetch_detail(request):
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

def get_od_snapshot(request):
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