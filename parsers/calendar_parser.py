from bs4 import BeautifulSoup

def parse_academic_calendar(html_content):
    """
    Parses the VTOP Academic Calendar HTML response.
    Returns a dictionary with month info and a list of days/events.
    """
    if not html_content:
        return None

    soup = BeautifulSoup(html_content, 'html.parser')
    
    # 1. Extract Month and Year title
    title_tag = soup.find('h4')
    month_title = title_tag.get_text(strip=True) if title_tag else "Calendar"
    
    # 2. Extract Calendar Grid
    calendar_data = []
    
    table = soup.find('table', class_='calendar-table')
    if not table:
        table = soup.find('table', id='calendar-table')
        
    if not table:
        tables = soup.find_all('table')
        table = tables[0] if tables else None

    if not table:
        return {'month_title': month_title, 'days': []}

    rows = table.find_all('tr')
    
    for row in rows:
        # Skip header rows
        if "Sunday" in row.get_text():
            continue
            
        cells = row.find_all('td')
        
        # Enumerate to get column index (0=Sun, ... 6=Sat)
        for col_idx, cell in enumerate(cells):
            day_text = ""
            spans = cell.find_all('span')
            
            day_found = False
            events = []
            all_text_content = "" # Combined text to check for keywords
            
            for span in spans:
                text = span.get_text(strip=True)
                if not text: continue

                # Check if this span is the day number
                if not day_found and text.isdigit():
                    day_text = text
                    day_found = True
                    continue
                
                # It's an event text
                if not text.isdigit():
                    events.append({'text': text})
                    all_text_content += " " + text.lower()
            
            if day_text:
                # --- Determine Overall Status for Color Coding ---
                # Default to general (White/Empty)
                status = 'general'
                
                # Priority 1: Explicit Holidays / No Instruction (Red)
                # Matches "No Instructional Day", "Holiday", "Winter Vacation", "Pongal", etc.
                if 'no instructional' in all_text_content or 'holiday' in all_text_content or 'vacation' in all_text_content:
                    status = 'holiday'
                
                # Priority 2: Day Orders (Yellow) 
                # Takes precedence over generic "Instructional"
                elif 'order' in all_text_content:
                    status = 'day_order'
                
                # Priority 3: Working Days (Green)
                elif 'instructional' in all_text_content or 'working' in all_text_content or 'fid' in all_text_content:
                    status = 'working'
                
                # Priority 4: Default Weekends (Red)
                # ONLY if the day is purely empty.
                # If it has text like "CAT - I" (which is 'general'), it stays 'general' (White).
                elif status == 'general' and (col_idx == 0 or col_idx == 6):
                    if not events:
                        status = 'holiday'
                        events.append({'text': 'Holiday'})
                    # Else: keep as 'general' (White) because something is written there

                calendar_data.append({
                    'day': int(day_text),
                    'status': status,
                    'events': events
                })
            else:
                # Empty padding cell for start/end of month
                calendar_data.append({'day': None, 'status': 'padding', 'events': []})

    return {
        'month_title': month_title,
        'days': calendar_data
    }

def parse_class_groups(html_content):
    """
    Parses the class group dropdown from the calendar preview page response.
    Returns a set of available value codes (e.g., {'ALL', 'ALL03', ...}).
    """
    if not html_content:
        return set()
    
    soup = BeautifulSoup(html_content, 'html.parser')
    select = soup.find('select', {'name': 'classGroupId'})
    
    if not select:
        return set()
        
    options = set()
    for opt in select.find_all('option'):
        val = opt.get('value')
        if val:
            options.add(val)
            
    return options

def get_day_order(events):
    """
    Scans events for day order text and returns the corresponding day key (MON, TUE, etc.)
    e.g., "Monday Order" -> "MON"
    """
    if not events: return None
    
    text_map = {
        "monday": "MON", "tuesday": "TUE", "wednesday": "WED", 
        "thursday": "THU", "friday": "FRI", "saturday": "SAT", "sunday": "SUN"
    }
    
    for event in events:
        text = event.get('text', '').lower()
        # Looking for strings like "Monday Order", "Tuesday Day Order", etc.
        if 'order' in text:
            for day_name, day_code in text_map.items():
                if day_name in text:
                    return day_code
    return None