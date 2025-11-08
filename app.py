from flask import Flask, render_template, redirect, url_for
from flask_cors import CORS
import os

# Import blueprints
from auth import auth_bp
from data_routes import data_bp

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(data_bp)

@app.route('/')
def index():
    """Serves the main dashboard page."""
    # This is now the protected dashboard
    return render_template('dashboard.html')

@app.route('/login')
def login():
    """Serves the login page."""
    # This is the new, public login page
    return render_template('login.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
