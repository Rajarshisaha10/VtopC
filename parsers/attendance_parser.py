from bs4 import BeautifulSoup
import re

def parse_attendance_summary(html_content):
    """
    Parses the main attendance summary page HTML.
    (Based on atd.html)
    """
    soup = BeautifulSoup(html_content, "html.parser")
    attendance_data = []
    
    table = soup.select_one("#getStudentDetails table.table")
    if not table:
        return []

    rows = table.find_all("tr")
    
    # Regex to extract parameters from the onclick attribute
    onclick_regex = re.compile(r"processViewAttendanceDetail\('([^']*)','([^']*)'\);")

    for row in rows[1:]: # Skip header row
        cells = row.find_all("td")
        if len(cells) < 14: # Check for a valid data row (14 columns)
            continue
        
        faculty_ps = cells[5].find_all("p")
        faculty = " ".join([p.get_text(strip=True) for p in faculty_ps if p.get_text(strip=True)])

        view_link = cells[13].find("a")
        class_id = None
        slot_param = None
        if view_link and view_link.get("onclick"):
            match = onclick_regex.search(view_link.get("onclick"))
            if match:
                class_id, slot_param = match.groups()

        course_data = {
            "sl_no": cells[0].get_text(strip=True),
            "course_code": cells[1].get_text(strip=True),
            "course_title": cells[2].get_text(strip=True),
            "course_type": cells[3].get_text(strip=True),
            "slot": cells[4].get_text(strip=True),
            "faculty": faculty,
            "attended_classes": cells[9].get_text(strip=True),
            "total_classes": cells[10].get_text(strip=True),
            "percentage": cells[11].get_text(strip=True),
            "class_id": class_id,      # Parsed from onclick
            "slot_param": slot_param   # Parsed from onclick
        }
        attendance_data.append(course_data)
        
    return attendance_data


def parse_attendance_detail(html_content):
    """
    Parses the detailed attendance view (modal content) HTML.
    (Based on view atd.html)
    """
    soup = BeautifulSoup(html_content, "html.parser")
    detail_data = []
    
    table = soup.select_one("#main-section table.table")
    if not table:
        return []

    rows = table.find_all("tr")
    
    for row in rows[1:]: # Skip header row
        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        status_span = cells[4].find("span")
        status = "Present" # Default
        
        if status_span:
            if "color:red;" in status_span.get("style", ""):
                status = "Absent"
            else:
                status = status_span.get_text(strip=True)
        else:
            # Fallback if there's no span
            status = cells[4].get_text(strip=True)


        detail = {
            "sl_no": cells[0].get_text(strip=True),
            "date": cells[1].get_text(strip=True),
            "slot": cells[2].get_text(strip=True),
            "timing": cells[3].get_text(strip=True),
            "status": status,
        }
        detail_data.append(detail)
        
    return detail_data