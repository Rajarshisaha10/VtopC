from bs4 import BeautifulSoup

def parse_academic_calendar(html_content):
    """
    Parses the VTOP Academic Calendar HTML response.
    Returns a dictionary with month info and a list of days/events.
    """
    if not html_content:
        return None

    soup = BeautifulSoup(html_content, 'html.parser')
    
    # 1. Extract Month and Year title (e.g., "SEPTEMBER 2025")
    # It's usually in an h4 tag
    title_tag = soup.find('h4')
    month_title = title_tag.get_text(strip=True) if title_tag else "Calendar"
    
    # 2. Extract Calendar Grid
    calendar_data = []
    
    # Find the main calendar table by class
    table = soup.find('table', class_='calendar-table')
    if not table:
        # Fallback if class is missing but ID exists
        table = soup.find('table', id='calendar-table')
        
    if not table:
        return {'month_title': month_title, 'days': []}

    # Iterate through all rows
    rows = table.find_all('tr')
    
    for row in rows:
        # Skip header rows that contain day names
        if "Sunday" in row.get_text():
            continue
            
        cells = row.find_all('td')
        for cell in cells:
            # Each cell represents a day
            # Extract Day Number (it's in a span with float:left and bold font)
            # We look for text that is a number
            
            # VTOP structure is often: <span>1</span> <span>Event</span>
            
            # Find the day number
            day_text = ""
            spans = cell.find_all('span')
            
            # The first span usually holds the day number if it exists
            # But sometimes it's empty if it's padding
            day_found = False
            events = []
            
            for span in spans:
                text = span.get_text(strip=True)
                style = span.get('style', '').lower()
                
                # Check if this span is the day number
                if not day_found and text.isdigit():
                    day_text = text
                    day_found = True
                    continue
                
                # If we have text that isn't a number, it's an event
                if text and not text.isdigit():
                    evt_type = 'general'
                    if 'color: green' in style or 'green' in style:
                        evt_type = 'instructional'
                    elif '#eb556e' in style or 'red' in style:
                        evt_type = 'holiday'
                    
                    events.append({'text': text, 'type': evt_type})
            
            if day_text:
                calendar_data.append({
                    'day': int(day_text),
                    'events': events
                })
            else:
                # Empty padding cell
                calendar_data.append({'day': None, 'events': []})

    return {
        'month_title': month_title,
        'days': calendar_data
    }
