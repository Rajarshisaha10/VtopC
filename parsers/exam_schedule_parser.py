from bs4 import BeautifulSoup

def parse_exam_schedule(html_content):
    """
    Parses the VTOP Exam Schedule HTML response.
    Returns a list of exam entries.
    """
    if not html_content:
        return []

    soup = BeautifulSoup(html_content, 'html.parser')
    schedule = []
    
    # The table class is 'customTable' based on res.txt
    table = soup.find('table', class_='customTable')
    if not table:
        return []

    rows = table.find_all('tr')
    
    current_exam_type = "Unknown Exam"

    for row in rows:
        # Check for section headers (e.g., FAT, CAT2, CAT1)
        # These are in <td class="panelHead-secondary" colspan="13">
        header_cell = row.find('td', class_='panelHead-secondary')
        if header_cell:
            current_exam_type = header_cell.get_text(strip=True)
            continue

        # Skip actual table header row
        if 'tableHeader' in row.get('class', []):
            continue
            
        cells = row.find_all('td')
        # Expecting 13 columns based on res.txt
        # 0: S.No, 1: Code, 2: Title, 3: Type, 4: ClassID, 5: Slot, 
        # 6: Date, 7: Session, 8: Reporting, 9: Time, 10: Venue, 11: Seat Loc, 12: Seat No
        if len(cells) < 13:
            continue
            
        try:
            # Extract data
            exam_entry = {
                'exam_type': current_exam_type,
                'course_code': cells[1].get_text(strip=True),
                'course_title': cells[2].get_text(strip=True),
                'course_type': cells[3].get_text(strip=True),
                'slot': cells[5].get_text(strip=True),
                'exam_date': cells[6].get_text(strip=True),
                'exam_session': cells[7].get_text(strip=True),
                'exam_time': cells[9].get_text(strip=True),
                'venue': cells[10].get_text(strip=True),
                'seat_location': cells[11].get_text(strip=True),
                'seat_no': cells[12].get_text(strip=True)
            }
            schedule.append(exam_entry)
        except IndexError:
            continue
            
    return schedule