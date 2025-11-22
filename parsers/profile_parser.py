from bs4 import BeautifulSoup

def parse_profile(html_content):
    """
    Parses the VTOP Student Profile HTML response.
    Returns a dictionary with profile sections.
    """
    if not html_content:
        return {}

    soup = BeautifulSoup(html_content, 'html.parser')
    profile_data = {
        'personal': {},
        'educational': {},
        'family': {},
        'proctor': {},
        'hostel': {}
    }

    # Helper to safely get text from a row
    def get_row_value(table, key_name):
        if not table: return "N/A"
        # Find the td containing the key (e.g., "STUDENT NAME")
        key_td = table.find('td', string=lambda text: text and key_name.lower() in text.lower())
        if key_td:
            # The value is usually in the next td
            value_td = key_td.find_next_sibling('td')
            if value_td:
                return value_td.get_text(strip=True)
        return "N/A"

    # --- Personal Info ---
    # Personal info is usually in the first collapse/accordion item
    personal_table = soup.find('div', id='collapseOne')
    if personal_table:
        profile_data['personal'] = {
            'name': get_row_value(personal_table, 'STUDENT NAME'),
            'app_no': get_row_value(personal_table, 'APPLICATION NUMBER'),
            'dob': get_row_value(personal_table, 'DATE OF BIRTH'),
            'gender': get_row_value(personal_table, 'GENDER'),
            'blood_group': get_row_value(personal_table, 'BLOOD GROUP'),
            'email': get_row_value(personal_table, 'EMAIL'),
            'mobile': get_row_value(personal_table, 'MOBILE NUMBER'),
            'native_state': get_row_value(personal_table, 'NATIVE STATE')
        }

        # Image extraction (it's outside the table usually)
        img_tag = soup.find('img', class_='img border border-primary')
        if img_tag:
            profile_data['personal']['photo_url'] = img_tag.get('src')

    # --- Educational Info ---
    edu_table = soup.find('div', id='collapseTwo')
    if edu_table:
        profile_data['educational'] = {
            'reg_no': get_row_value(edu_table, 'REGISTER NO'),
            'school': get_row_value(edu_table, 'SCHOOL NAME'),
            'board': get_row_value(edu_table, 'BOARD'),
            'medium': get_row_value(edu_table, 'MEDIUM'),
            'year_passing': get_row_value(edu_table, 'YEAR OF PASSING')
        }

    # --- Family Info ---
    # (Skipping for brevity unless specifically requested, follows same pattern)
    
    # --- Proctor Info ---
    proctor_table = soup.find('div', id='collapseFour')
    if proctor_table:
        profile_data['proctor'] = {
            'name': get_row_value(proctor_table, 'FACULTY NAME'),
            'designation': get_row_value(proctor_table, 'FACULTY DESIGNATION'),
            'cabin': get_row_value(proctor_table, 'CABIN'),
            'email': get_row_value(proctor_table, 'FACULTY EMAIL'),
            'mobile': get_row_value(proctor_table, 'FACULTY MOBILE NUMBER')
        }

    # --- Hostel Info ---
    hostel_table = soup.find('div', id='collapseFive')
    if hostel_table:
        profile_data['hostel'] = {
            'block': get_row_value(hostel_table, 'Block Name'),
            'room': get_row_value(hostel_table, 'Room No'),
            'bed_type': get_row_value(hostel_table, 'Bed Type'),
            'mess': get_row_value(hostel_table, 'Mess Information')
        }

    return profile_data