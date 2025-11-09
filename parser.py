from bs4 import BeautifulSoup
import json

# Set this to True to save parser output to a file, False for production
DEBUG = False

def parse_course_data(html_content):
    if not html_content:
        return {'total_credits': '0.0', 'courses': [], 'timetable': {}}
        
    soup = BeautifulSoup(html_content, "html.parser")

    # --- Part 1: Registered Courses (Unchanged) ---
    courses = []
    total_credits = "0.0"
    course_table = soup.select_one("#getStudentDetails div.table-responsive table.table")
    
    if course_table:
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
                        "course_code": code_title[0],
                        "course_title": code_title[1],
                        "course_type": course_type_text.strip('() '),
                        "credits": cells[3].get_text(strip=True).split()[-1],
                        "faculty": faculty.replace(' - ', ' '),
                        "slot": slot,
                        "venue": venue
                    })
                except (IndexError, AttributeError):
                    continue

            total_cell = course_table.find(lambda tag: 'Total Number Of Credits' in tag.get_text())
            if total_cell and total_cell.find('b'):
                total_credits = total_cell.find('b').get_text(strip=True)

    # --- Part 1.5: Create a code-to-title map ---
    course_title_map = {course['course_code']: course['course_title'] for course in courses}

    # --- Part 2: Weekly Timetable (RAW PARSING) ---
    raw_timetable_data = {day: {} for day in ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']}
    timetable_tables = soup.find_all('table', id='timeTableStyle')
    
    time_slot_keys = [
        "08:00 - 08:50", "08:55 - 09:45", "09:50 - 10:40", "10:45 - 11:35",
        "11:40 - 12:30", "12:35 - 13:25", "LUNCH", "14:00 - 14:50",
        "14:55 - 15:45", "15:50 - 16:40", "16:45 - 17:35", "17:40 - 18:30",
        "18:35 - 19:25"
    ]
    
    # --- *** NEW LOGIC AS REQUESTED *** ---
    # Find the correct table instead of assuming it's the second one.
    schedule_table = None
    day_headers = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "THEORY", "LAB"}
    for table in timetable_tables:
        # Check the first <td> or <th> of the first few rows
        for row in table.find_all('tr', limit=10): # Check first 10 rows
            first_cell = row.find(['th', 'td'])
            if first_cell:
                cell_text = first_cell.get_text(strip=True)
                # If we find a day or "THEORY", this is the correct table
                if cell_text in day_headers:
                    schedule_table = table
                    break
        if schedule_table:
            break
    
    # Check if we found the correct table
    if schedule_table:
        if DEBUG: print("   > [DEBUG] Found the correct schedule table by content ('MON'/'THEORY').")
        all_rows = schedule_table.find_all('tr')
        # --- *** END OF NEW LOGIC *** ---
        
        current_day = ""
        for row in all_rows:
            cells = row.find_all('td')
            if not cells: continue
            
            # This logic remains the same
            if 'rowspan' in cells[0].attrs:
                current_day = cells[0].get_text(strip=True)
                data_cells = cells[2:]
            elif cells[0].get_text(strip=True) in ["THEORY", "LAB"]:
                data_cells = cells[1:]
            else:
                continue
            if current_day not in raw_timetable_data: continue

            col_idx = 0
            for cell in data_cells:
                if col_idx >= len(time_slot_keys): break
                colspan = int(cell.get('colspan', 1))
                text = cell.get_text(strip=True)
                if text and text != '-':
                    parts = text.split('-')
                    if len(parts) >= 4:
                        course_code = parts[1]
                        course_type_short = parts[2]
                        venue = '-'.join(parts[3:-1])
                        
                        class_info = {
                            'code': course_code,
                            'type': course_type_short,
                            'venue': venue,
                            'title': course_title_map.get(course_code, course_code)
                        }
                        
                        for i in range(colspan):
                            slot_index = col_idx + i
                            if slot_index < len(time_slot_keys):
                                slot_key = time_slot_keys[slot_index]
                                if slot_key != "LUNCH":
                                    raw_timetable_data[current_day][slot_key] = class_info
                col_idx += colspan
    else:
        if DEBUG: print("   > [DEBUG] Could not find the correct schedule table. Timetable will be empty.")

    # --- Part 3: PROCESS DATA TO CALCULATE ROWSPAN (Unchanged) ---
    processed_timetable = {day: {} for day in ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']}
    
    for day in raw_timetable_data:
        processed_slots = set()
        for i, slot_key in enumerate(time_slot_keys):
            # Skip this slot if it's LUNCH, already processed, or has no data
            if slot_key == "LUNCH" or slot_key in processed_slots or slot_key not in raw_timetable_data[day]:
                continue

            current_course = raw_timetable_data[day][slot_key]
            current_course_code = current_course['code']
            
            # Now, look ahead to find consecutive slots
            rowspan = 1
            processed_slots.add(slot_key)
            
            for j in range(i + 1, len(time_slot_keys)):
                next_slot_key = time_slot_keys[j]
                if next_slot_key == "LUNCH":
                    break  # Stop counting at lunch
                
                next_slot_data = raw_timetable_data[day].get(next_slot_key)
                
                if next_slot_data and next_slot_data['code'] == current_course_code:
                    rowspan += 1
                    processed_slots.add(next_slot_key)
                else:
                    break # Not the same course, stop counting

            # Add the final processed course to the new dictionary
            current_course['rowspan'] = rowspan
            processed_timetable[day][slot_key] = current_course

    return {
        'total_credits': total_credits,
        'courses': courses,
        'timetable': processed_timetable # Pass the PROCESSED data
    }

if __name__ == '__main__':
    try:
        with open('timetable_debug.html', 'r', encoding='utf-8') as f:
            html = f.read()

        parsed_data = parse_course_data(html)
        
        if DEBUG:
            print("[DEBUG] Parser output successfully generated.")
            with open('timetable_parsed_output.json', 'w', encoding='utf-8') as f:
                json.dump(parsed_data, f, indent=4)
            print("         - Saved to 'timetable_parsed_output.json'")

    except FileNotFoundError:
        print("[ERROR] timetable_debug.html not found. Make sure it's in the same directory.")
    except Exception as e:
        print(f"[ERROR] An error occurred: {e}")