from flask import jsonify, render_template
import datetime
import re
from parsers.calendar_parser import parse_academic_calendar
from parsers.exam_schedule_parser import parse_exam_schedule

CALENDAR_VIEW_TARGET = 'processViewCalendar'
TIMETABLE_PROCESS_TARGET = 'processViewTimeTable'
EXAM_SCHEDULE_TARGET = 'examinations/doSearchExamScheduleForStudent'

def fetch_calendar(ctx, data):
    semester_sub_id = data.get('semesterSubId')
    cal_date = data.get('calDate')
    
    # 1. Determine Class Group from Timetable (Strict Logic)
    # We assume the timetable contains cells in the format: 
    # Slot-CourseCode-Type-Building-Room-GroupID
    # Example: A2-BAENG101-ETH-AB1-410-ALL03
    
    selected_group = 'ALL' # Safe default for the variable, but logic relies on extraction
    
    try:
        # Fetch the Timetable to find the group ID
        tt_payload = {
            'authorizedID': ctx['authorized_id'],
            '_csrf': ctx['csrf_token'],
            'semesterSubId': semester_sub_id
        }
        # We verify=False to match your existing pattern for ignoring SSL warnings
        tt_res = ctx['session'].post(
            f"{ctx['base_url']}/{TIMETABLE_PROCESS_TARGET}", 
            data=tt_payload, 
            headers=ctx['headers'], 
            verify=False
        )
        
        # Regex explanation:
        # [A-Z0-9\+]+  : Slot (e.g., A2 or L41+L42)
        # -            : Separator
        # [A-Z0-9]+    : Course Code (e.g., BAENG101)
        # -            : Separator
        # [A-Z]+       : Type (e.g., ETH, LO)
        # -            : Separator
        # [A-Z0-9\.-]+ : Building (e.g., AB1)
        # -            : Separator
        # [A-Z0-9\.-]+ : Room (e.g., 410)
        # -            : Separator
        # (?P<group>[A-Z0-9]+) : Group ID (Captured, e.g., ALL03)
        pattern = r"[A-Z0-9\+]+-[A-Z0-9]+-[A-Z]+-[A-Z0-9\.-]+-[A-Z0-9\.-]+-(?P<group>[A-Z0-9]+)"
        
        match = re.search(pattern, tt_res.text)
        
        if match:
            selected_group = match.group('group')
            print(f"Detected Class Group: {selected_group}")
        else:
            print("Warning: Could not extract Group ID from timetable. Defaulting to 'ALL'.")
            
    except Exception as e:
        print(f"Calendar Group Detection Error: {str(e)}")
        # We do NOT fall back to the old initialization call here. 
        # We proceed with the default 'ALL' or whatever was successfully parsed.

    if not cal_date:
        cal_date = datetime.datetime.now().strftime("01-%b-%Y").upper()
    
    # 2. Fetch Calendar using the extracted group
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

    # 3. Merge Exams (Standard Logic)
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
                            # Filter out filler text to make room for exam details
                            day_obj['events'] = [e for e in day_obj['events'] if 'holiday' not in e['text'].lower() and 'no instructional' not in e['text'].lower()]
                            exam_type_lbl = exam.get('exam_type', 'Exam')
                            day_obj['events'].append({'text': f"{exam_type_lbl}: {exam['course_code']} ({exam['slot']})"})
            except (ValueError, KeyError, TypeError): continue
    except Exception: pass

    # 4. Generate Navigation & Render
    curr_dt = datetime.datetime.strptime(cal_date.title(), "%d-%b-%Y")
    next_month = (curr_dt + datetime.timedelta(days=32)).replace(day=1)
    prev_month = (curr_dt - datetime.timedelta(days=1)).replace(day=1)
    nav_info = { 'current': cal_date, 'next': next_month.strftime("01-%b-%Y").upper(), 'prev': prev_month.strftime("01-%b-%Y").upper() }
    
    html = render_template('calendar_content.html', calendar=parsed_data, nav=nav_info)
    return jsonify({'status': 'success', 'html_content': html})