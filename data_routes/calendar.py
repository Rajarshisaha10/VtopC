from flask import jsonify, render_template
import datetime
import re
from parsers.calendar_parser import parse_academic_calendar
from parsers.exam_schedule_parser import parse_exam_schedule
from .timetable import fetch_available_semesters 

CALENDAR_VIEW_TARGET = 'processViewCalendar'
TIMETABLE_PROCESS_TARGET = 'processViewTimeTable'
EXAM_SCHEDULE_TARGET = 'examinations/doSearchExamScheduleForStudent'

def _get_class_group(ctx, semester_sub_id):
    """
    Fetches the timetable for a specific semester and extracts the Class Group ID
    using the pattern: Slot-Code-Type-Building-Room-GroupID.
    Returns 'ALL' if extraction fails.
    """
    try:
        tt_payload = {
            'authorizedID': ctx['authorized_id'],
            '_csrf': ctx['csrf_token'],
            'semesterSubId': semester_sub_id
        }
        # Fetch Timetable
        tt_res = ctx['session'].post(
            f"{ctx['base_url']}/{TIMETABLE_PROCESS_TARGET}", 
            data=tt_payload, 
            headers=ctx['headers'], 
            verify=False
        )
        
        # Regex to find the pattern: Slot-Code-Type-Building-Room-GroupID
        # Example: A2-BAENG101-ETH-AB1-410-ALL03
        pattern = r"[A-Z0-9\+]+-[A-Z0-9]+-[A-Z]+-[A-Z0-9\.-]+-[A-Z0-9\.-]+-(?P<group>[A-Z0-9]+)"
        match = re.search(pattern, tt_res.text)
        
        if match:
            return match.group('group')
            
    except Exception as e:
        print(f"Group ID extraction failed for sem {semester_sub_id}: {str(e)}")
    
    return 'ALL' # Default fallback

def has_meaningful_events(calendar_data):
    """
    Checks if the calendar has any events that indicate an active semester.
    Ignores holidays, Sundays, and 'no instructional days'.
    """
    if not calendar_data or 'days' not in calendar_data:
        return False
    
    meaningful_count = 0
    for day in calendar_data['days']:
        for event in day.get('events', []):
            text = event.get('text', '').lower()
            if not any(x in text for x in ['holiday', 'no instructional', 'sunday']):
                meaningful_count += 1
                
    return meaningful_count > 0

def fetch_calendar(ctx, data):
    semester_sub_id = data.get('semesterSubId')
    cal_date = data.get('calDate')
    
    if not cal_date:
        cal_date = datetime.datetime.now().strftime("01-%b-%Y").upper()

    # 1. Determine Class Group for the requested semester
    selected_group = _get_class_group(ctx, semester_sub_id)
    
    # 2. Fetch Calendar (Initial Attempt)
    payload = { 
        'authorizedID': ctx['authorized_id'], 
        '_csrf': ctx['csrf_token'], 
        'calDate': cal_date, 
        'semSubId': semester_sub_id, 
        'classGroupId': selected_group,
        'x': datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT") 
    }
    res = ctx['session'].post(f"{ctx['base_url']}/{CALENDAR_VIEW_TARGET}", data=payload, headers=ctx['headers'], verify=False)
    parsed_data = parse_academic_calendar(res.text)

    # 2.5 Auto-Switch Semester Logic
    new_semester_id = None
    
    if not has_meaningful_events(parsed_data):
        print(f"Month {cal_date} appears empty for sem {semester_sub_id}. Attempting auto-switch...")
        try:
            # Fetch all available semesters
            all_semesters = fetch_available_semesters(ctx['session'], ctx['base_url'], ctx['authorized_id'], ctx['csrf_token'])
            
            for sem in all_semesters:
                if sem['id'] == semester_sub_id: continue # Skip the one we just checked
                
                # CRITICAL: Re-calculate the correct Group ID for THIS candidate semester
                # because Sem 2 might have a different group (e.g. ALL04) than Sem 1 (ALL03)
                candidate_group = _get_class_group(ctx, sem['id'])
                
                retry_payload = payload.copy()
                retry_payload['semSubId'] = sem['id']
                retry_payload['classGroupId'] = candidate_group
                
                retry_res = ctx['session'].post(f"{ctx['base_url']}/{CALENDAR_VIEW_TARGET}", data=retry_payload, headers=ctx['headers'], verify=False)
                retry_data = parse_academic_calendar(retry_res.text)
                
                if has_meaningful_events(retry_data):
                    # Found a match! Use this data and update ID
                    parsed_data = retry_data
                    semester_sub_id = sem['id'] # Update ID for exams fetching below
                    new_semester_id = sem['id'] # Flag to send back to frontend
                    print(f"Auto-switched to semester: {sem['name']} ({sem['id']}) with group {candidate_group}")
                    break
        except Exception as e:
            print(f"Auto-switch failed: {str(e)}")

    # 3. Merge Exams (Using potentially updated semester_sub_id)
    try:
        cal_dt_obj = datetime.datetime.strptime(cal_date.title(), "%d-%b-%Y")
        view_month = cal_dt_obj.month
        view_year = cal_dt_obj.year
        exam_payload = {'authorizedID': ctx['authorized_id'], '_csrf': ctx['csrf_token'], 'semesterSubId': semester_sub_id}
        exam_res = ctx['session'].post(f"{ctx['base_url']}/{EXAM_SCHEDULE_TARGET}", data=exam_payload, headers=ctx['headers'], verify=False)
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
    
    response_data = {'status': 'success', 'html_content': html}
    if new_semester_id:
        response_data['new_semester_id'] = new_semester_id
        
    return jsonify(response_data)