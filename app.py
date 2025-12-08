from flask import Flask, render_template, send_from_directory
from flask_cors import CORS
import os
from whitenoise import WhiteNoise

# Import blueprints
from auth import auth_bp
from data_routes import data_bp

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Secure secret key for signing cookies
app.secret_key = os.environ.get('SECRET_KEY', 'vtopc_default_secret_key_change_this_in_prod')

# Add whitenoise for efficient static file serving
app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/', prefix='static/')

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(data_bp)

@app.route('/')
def index():
    """Serves the main dashboard page."""
    return render_template('dashboard.html')

@app.route('/login')
def login():
    """Serves the login page."""
    return render_template('login.html')

@app.route('/sw.js')
def service_worker():
    response = send_from_directory('static', 'sw.js', mimetype='application/javascript')
    # Force browser to never cache the Service Worker
    # This ensures the browser always checks for the latest version
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)