from flask import jsonify, render_template
import datetime
import re
from parsers.calendar_parser import parse_academic_calendar
from parsers.exam_schedule_parser import parse_exam_schedule
from session_manager import session_storage
from .timetable import fetch_available_semesters 

CALENDAR_VIEW_TARGET = 'processViewCalendar'
TIMETABLE_PROCESS_TARGET = 'processViewTimeTable'
EXAM_SCHEDULE_TARGET = 'examinations/doSearchExamScheduleForStudent'

def _get_class_group(ctx, semester_sub_id):
    """
    Fetches the timetable for a specific semester and extracts the Class Group ID.
    Returns 'ALL' if extraction fails.
    """
    try:
        tt_payload = {
            'authorizedID': ctx['authorized_id'],
            '_csrf': ctx['csrf_token'],
            'semesterSubId': semester_sub_id
        }
        tt_res = ctx['session'].post(
            f"{ctx['base_url']}/{TIMETABLE_PROCESS_TARGET}", 
            data=tt_payload, 
            headers=ctx['headers'], 
            verify=False
        )
        pattern = r"[A-Z0-9\+]+-[A-Z0-9]+-[A-Z]+-[A-Z0-9\.-]+-[A-Z0-9\.-]+-(?P<group>[A-Z0-9]+)"
        match = re.search(pattern, tt_res.text)
        if match:
            return match.group('group')
    except Exception as e:
        print(f"Group ID extraction failed for sem {semester_sub_id}: {str(e)}")
    return 'ALL'

def has_meaningful_events(calendar_data):
    """
    Checks if the calendar has any events (ignoring holidays/weekends).
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
    original_sem_id = data.get('semesterSubId') # The semester the user was viewing
    target_sem_id = original_sem_id             # The semester we will actually render
    cal_date = data.get('calDate')
    
    if not cal_date:
        cal_date = datetime.datetime.now().strftime("01-%b-%Y").upper()

    # --- 1. CACHE LOOKUP ---
    month_key = cal_date 
    
    if original_sem_id and original_sem_id in session_storage:
        if 'calendar_cache' not in session_storage[original_sem_id]:
            session_storage[original_sem_id]['calendar_cache'] = {}
        
        cached_sem = session_storage[original_sem_id]['calendar_cache'].get(month_key)
        if cached_sem:
            print(f"Cache Hit: Using semester {cached_sem} for {month_key}")
            target_sem_id = cached_sem

    # --- 2. Determine Group & Fetch Calendar ---
    selected_group = _get_class_group(ctx, target_sem_id)
    
    payload = { 
        'authorizedID': ctx['authorized_id'], 
        '_csrf': ctx['csrf_token'], 
        'calDate': cal_date, 
        'semSubId': target_sem_id, 
        'classGroupId': selected_group,
        'x': datetime.datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT") 
    }
    res = ctx['session'].post(f"{ctx['base_url']}/{CALENDAR_VIEW_TARGET}", data=payload, headers=ctx['headers'], verify=False)
    parsed_data = parse_academic_calendar(res.text)

    # --- 3. Auto-Switch Semester Logic ---
    new_semester_id = None
    
    if not has_meaningful_events(parsed_data):
        print(f"Month {cal_date} appears empty for sem {target_sem_id}. Attempting auto-switch...")
        try:
            all_semesters = fetch_available_semesters(ctx['session'], ctx['base_url'], ctx['authorized_id'], ctx['csrf_token'])
            
            for sem in all_semesters:
                if sem['id'] == target_sem_id: continue 

                candidate_group = _get_class_group(ctx, sem['id'])
                
                retry_payload = payload.copy()
                retry_payload['semSubId'] = sem['id']
                retry_payload['classGroupId'] = candidate_group
                
                retry_res = ctx['session'].post(f"{ctx['base_url']}/{CALENDAR_VIEW_TARGET}", data=retry_payload, headers=ctx['headers'], verify=False)
                retry_data = parse_academic_calendar(retry_res.text)
                
                if has_meaningful_events(retry_data):
                    parsed_data = retry_data
                    target_sem_id = sem['id']
                    new_semester_id = sem['id']
                    print(f"Auto-switched to: {sem['name']} ({sem['id']})")
                    
                    if original_sem_id and session_storage.get(original_sem_id):
                        session_storage[original_sem_id]['calendar_cache'][month_key] = new_semester_id
                    break
        except Exception as e:
            print(f"Auto-switch failed: {str(e)}")
    else:
        if original_sem_id and session_storage.get(original_sem_id):
            session_storage[original_sem_id]['calendar_cache'][month_key] = target_sem_id

    # --- 4. Merge Exams (Check BOTH active semesters) ---
    # Overflow Fix: We fetch exams for both the Original semester AND the Target semester.
    # This ensures if we switched to Sem 2, we still see Sem 1's exams if they overlap.
    
    semesters_to_check = {original_sem_id, target_sem_id}
    # Filter out None
    semesters_to_check = {s for s in semesters_to_check if s}

    try:
        cal_dt_obj = datetime.datetime.strptime(cal_date.title(), "%d-%b-%Y")
        view_month = cal_dt_obj.month
        view_year = cal_dt_obj.year
        
        for sem_id in semesters_to_check:
            try:
                exam_payload = {'authorizedID': ctx['authorized_id'], '_csrf': ctx['csrf_token'], 'semesterSubId': sem_id}
                exam_res = ctx['session'].post(f"{ctx['base_url']}/{EXAM_SCHEDULE_TARGET}", data=exam_payload, headers=ctx['headers'], verify=False)
                exam_schedule = parse_exam_schedule(exam_res.text)
                
                for exam in exam_schedule:
                    try:
                        ex_date = datetime.datetime.strptime(exam['exam_date'], "%d-%b-%Y")
                        if ex_date.month == view_month and ex_date.year == view_year:
                            for day_obj in parsed_data['days']:
                                if day_obj['day'] == ex_date.day:
                                    # Avoid duplicate entries if multiple semesters return same data?
                                    # Usually different semesters have different course codes, so duplicates are rare.
                                    
                                    day_obj['status'] = 'exam' 
                                    day_obj['events'] = [e for e in day_obj['events'] if 'holiday' not in e['text'].lower() and 'no instructional' not in e['text'].lower()]
                                    
                                    exam_type_lbl = exam.get('exam_type', 'Exam')
                                    # Add semester hint if we are mixing data
                                    # sem_hint = " (Prev)" if sem_id == original_sem_id and sem_id != target_sem_id else ""
                                    
                                    event_text = f"{exam_type_lbl}: {exam['course_code']} ({exam['slot']})"
                                    
                                    # Simple dedup check
                                    if not any(e['text'] == event_text for e in day_obj['events']):
                                        day_obj['events'].append({'text': event_text})
                    except (ValueError, KeyError, TypeError): continue
            except Exception as e:
                print(f"Exam fetch error for sem {sem_id}: {str(e)}")

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