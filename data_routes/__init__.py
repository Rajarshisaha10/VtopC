from flask import Blueprint
import requests
import warnings

# Filter warnings globally for the blueprint context
warnings.filterwarnings('ignore', category=requests.packages.urllib3.exceptions.InsecureRequestWarning)

data_bp = Blueprint('data_bp', __name__)

# Import routes to ensure they are registered with the blueprint
from . import routes