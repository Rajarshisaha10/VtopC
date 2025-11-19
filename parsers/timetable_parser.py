from bs4 import BeautifulSoup
import re

def parse_course_data(html_content):
    """
    Main entry point. Parses the HTML content, automatically detecting which
    timetable format is being used (new or old) and calling the correct
    parsing functions.
    """
    if not html_content:
        return {'total_credits': '0.0', 'courses': [], 'timetable': {}}
        
    soup = BeautifulSoup(html_content, "html.parser")

    # --- 1. Parse Registered Courses ---
    courses, total_credits, course_title_map = _parse_registered_courses(soup)

    # --- 2. Parse Timetable Grid ---
    raw_timetable_data = _parse_timetable_grid(soup, course_title_map)
    
    # --- 3. Process Rowspans ---
    output_slots = [
        "08:00 - 08:50", "08:55 - 09:45", "09:50 - 10:40", "10:45 - 11:35",
        "11:40 - 12:30", "12:35 - 13:25", "LUNCH", "14:00 - 14:50",
        "14:55 - 15:45", "15:50 - 16:40", "16:45 - 17:35", "17:40 - 18:30",
        "18:35 - 19:25"
    ]
    
    processed_timetable = {day: {} for day in ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']}
    
    for day in raw_timetable_data:
        processed_slots = set()
        for i, slot_key in enumerate(output_slots):
            if slot_key == "LUNCH" or slot_key in processed_slots or slot_key not in raw_timetable_data[day]:
                continue

            current_course = raw_timetable_data[day].get(slot_key)
            if not current_course: continue
            current_course_code = current_course['code']
            
            rowspan = 1
            processed_slots.add(slot_key)
            
            for j in range(i + 1, len(output_slots)):
                next_slot_key = output_slots[j]
                if next_slot_key == "LUNCH": break
                next_slot_data = raw_timetable_data[day].get(next_slot_key)
                if next_slot_data and next_slot_data['code'] == current_course_code:
                    rowspan += 1
                    processed_slots.add(next_slot_key)
                else:
                    break

            current_course['rowspan'] = rowspan
            processed_timetable[day][slot_key] = current_course

    return {
        'total_credits': total_credits,
        'courses': courses,
        'timetable': processed_timetable
    }

def _parse_registered_courses(soup):
    course_table = soup.select_one("#getStudentDetails div.table-responsive table.table")
    if not course_table: return [], "0.0", {}

    headers = course_table.find_all("th")
    header_texts = [h.get_text(strip=True) for h in headers]
    
    if "Class Group" in header_texts:
        return _parse_courses_old_format(course_table)
    else:
        return _parse_courses_new_format(course_table)

def _parse_courses_new_format(course_table):
    courses = []
    total_credits = "0.0"
    rows = course_table.find_all("tr")
    if len(rows) > 2:
        for row in rows[1:-1]:
            try:
                cells = row.find_all("td")
                if len(cells) < 9: continue
                course_info_ps = cells[2].find_all("p")
                if not course_info_ps: continue
                code_title = course_info_ps[0].get_text(strip=True).split(" - ", 1)
                if len(code_title) < 2: continue
                course_type_text = course_info_ps[1].get_text(strip=True) if len(course_info_ps) > 1 else "Theory"
                slot_venue_ps = cells[7].find_all("p")
                slot = slot_venue_ps[0].get_text(strip=True).replace(' -', '') if len(slot_venue_ps) > 0 else "N/A"
                venue = slot_venue_ps[1].get_text(strip=True) if len(slot_venue_ps) > 1 else "N/A"
                faculty_ps = cells[8].find_all("p")
                faculty = " ".join([p.get_text(strip=True) for p in faculty_ps if p.get_text(strip=True)])
                courses.append({
                    "course_code": code_title[0], "course_title": code_title[1],
                    "course_type": course_type_text.strip('() '),
                    "credits": cells[3].get_text(strip=True).split()[-1],
                    "faculty": faculty.replace(' - ', ' '), "slot": slot, "venue": venue
                })
            except Exception: continue
        total_cell = course_table.find(lambda tag: 'Total Number Of Credits' in tag.get_text())
        if total_cell and total_cell.find('b'): total_credits = total_cell.find('b').get_text(strip=True)
    course_title_map = {course['course_code']: course['course_title'] for course in courses}
    return courses, total_credits, course_title_map

def _parse_courses_old_format(course_table):
    courses = []
    total_credits = "0.0"
    rows = course_table.find_all("tr")
    if len(rows) > 2:
        for row in rows[1:-1]:
            try:
                cells = row.find_all("td")
                if len(cells) < 12: continue
                course_ps = cells[2].find_all("p")
                if len(course_ps) < 1: continue
                code, title = course_ps[0].get_text(strip=True).split(" - ", 1)
                course_type = "Theory"
                if len(course_ps) > 1: course_type = course_ps[1].get_text(strip=True).strip("() ")
                credits = cells[3].get_text(strip=True).split()[-1]
                slot_venue_ps = cells[7].find_all("p")
                slot = slot_venue_ps[0].get_text(strip=True).replace(" - ", "")
                venue = "N/A"
                if len(slot_venue_ps) > 1: venue = slot_venue_ps[1].get_text(strip=True)
                faculty_ps = cells[8].find_all("p")
                faculty_name = faculty_ps[0].get_text(strip=True).replace(" - ", "")
                faculty_school = ""
                if len(faculty_ps) > 1: faculty_school = faculty_ps[1].get_text(strip=True)
                faculty = f"{faculty_name} ({faculty_school})" if faculty_school else faculty_name
                courses.append({
                    "course_code": code, "course_title": title, "course_type": course_type,
                    "credits": credits, "faculty": faculty, "slot": slot, "venue": venue
                })
            except Exception: continue
        total_cell = course_table.find(lambda tag: 'Total Number Of Credits' in tag.get_text())
        if total_cell and total_cell.find('b'): total_credits = total_cell.find('b').get_text(strip=True)
    course_title_map = {course['course_code']: course['course_title'] for course in courses}
    return courses, total_credits, course_title_map

def _parse_timetable_grid(soup, course_title_map):
    raw_timetable_data = {day: {} for day in ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']}
    timetable_tables = soup.find_all('table', id='timeTableStyle')
    if not timetable_tables: return raw_timetable_data
    
    first_header_cell = timetable_tables[0].find('td', {'bgcolor': '#e2e2e2'})
    if first_header_cell and " - " in first_header_cell.get_text():
        return _parse_grid_new_format(soup, timetable_tables, course_title_map)
    else:
        return _parse_grid_old_format(soup, timetable_tables, course_title_map)

def _parse_grid_new_format(soup, timetable_tables, course_title_map):
    raw_timetable_data = {day: {} for day in ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']}
    time_slot_keys = [
        "08:00 - 08:50", "08:55 - 09:45", "09:50 - 10:40", "10:45 - 11:35",
        "11:40 - 12:30", "12:35 - 13:25", "LUNCH", "14:00 - 14:50",
        "14:55 - 15:45", "15:50 - 16:40", "16:45 - 17:35", "17:40 - 18:30", "18:35 - 19:25"
    ]
    schedule_table = None
    for table in timetable_tables:
        for row in table.find_all('tr', limit=10):
            first_cell = row.find(['th', 'td'])
            if first_cell and first_cell.get_text(strip=True) in {"MON", "TUE"}:
                schedule_table = table; break
        if schedule_table: break
    if not schedule_table: return raw_timetable_data

    all_rows = schedule_table.find_all('tr')
    current_day = ""
    for row in all_rows:
        cells = row.find_all('td')
        if not cells: continue
        if 'rowspan' in cells[0].attrs:
            current_day = cells[0].get_text(strip=True)
            data_cells = cells[2:]
        elif cells[0].get_text(strip=True) in ["THEORY", "LAB"]:
            data_cells = cells[1:]
        else: continue
        if current_day not in raw_timetable_data: continue

        col_idx = 0
        for cell in data_cells:
            if col_idx >= len(time_slot_keys): break
            colspan = int(cell.get('colspan', 1))
            text = cell.get_text(strip=True)
            if text and text != '-':
                parts = text.split('-')
                if len(parts) >= 4:
                    course_code = parts[1]; course_type_short = parts[2]
                    venue = '-'.join(parts[3:-1])
                    class_info = {
                        'code': course_code, 'type': course_type_short, 'venue': venue,
                        'title': course_title_map.get(course_code, course_code)
                    }
                    for i in range(colspan):
                        slot_index = col_idx + i
                        if slot_index < len(time_slot_keys):
                            slot_key = time_slot_keys[slot_index]
                            if slot_key != "LUNCH": raw_timetable_data[current_day][slot_key] = class_info
            col_idx += colspan
    return raw_timetable_data
    
def _parse_grid_old_format(soup, timetable_tables, course_title_map):
    raw_timetable_data = {day: {} for day in ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']}
    theory_slots = ["08:00 - 08:50", "08:55 - 09:45", "09:50 - 10:40", "10:45 - 11:35", "11:40 - 12:30", "12:35 - 13:25", "LUNCH", "14:00 - 14:50", "14:55 - 15:45", "15:50 - 16:40", "16:45 - 17:35", "17:40 - 18:30", "18:35 - 19:25"]
    lab_slots = ["08:00 - 08:50", "08:50 - 09:40", "09:50 - 10:40", "10:40 - 11:30", "11:40 - 12:30", "12:30 - 13:20", "LUNCH", "14:00 - 14:50", "14:50 - 15:40", "15:50 - 16:40", "16:40 - 17:30", "17:40 - 18:30", "18:30 - 19:20"]
    lab_slot_map = { "08:50 - 09:40": "08:55 - 09:45", "10:40 - 11:30": "10:45 - 11:35", "12:30 - 13:20": "12:35 - 13:25", "14:50 - 15:40": "14:55 - 15:45", "16:40 - 17:30": "16:45 - 17:35", "18:30 - 19:20": "18:35 - 19:25" }
    
    try: schedule_table = soup.find(lambda tag: tag.name == 'td' and 'THEORY' in tag.get_text() and tag.get('rowspan') == '2').find_parent('table')
    except AttributeError: return raw_timetable_data

    current_day = ""
    for row in schedule_table.find_all('tr')[2:]:
        cells = row.find_all('td')
        if not cells: continue
        if cells[0].has_attr('rowspan'):
            current_day = cells[0].get_text(strip=True)
            if not cells[1].get_text(strip=True): continue
            row_type = cells[1].get_text(strip=True); data_cells = cells[2:]
        elif cells[0].get_text(strip=True) in ["THEORY", "LAB"]:
            row_type = cells[0].get_text(strip=True); data_cells = cells[1:]
        else: continue
        if current_day not in raw_timetable_data: continue

        if row_type == "THEORY": slot_keys = theory_slots; slot_map = {}
        elif row_type == "LAB": slot_keys = lab_slots; slot_map = lab_slot_map
        else: continue
        
        for i, cell in enumerate(data_cells):
            if i >= len(slot_keys): break
            text = cell.get_text(strip=True)
            slot_key_std = slot_map.get(slot_keys[i], slot_keys[i])
            if slot_key_std == "LUNCH": continue
            
            if text and text != '-' and not re.fullmatch(r"^[A-Z]{1,3}\d{1,2}$", text):
                parts = text.split('-')
                if len(parts) > 2:
                    course_code = parts[1]; course_type_short = parts[2]; venue = '-'.join(parts[3:-1])
                    class_info = { 'code': course_code, 'type': course_type_short, 'venue': venue, 'title': course_title_map.get(course_code, course_code) }
                    raw_timetable_data[current_day][slot_key_std] = class_info
    return raw_timetable_data