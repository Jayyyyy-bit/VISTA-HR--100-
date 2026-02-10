from flask import Flask, app, jsonify
from flask_cors import CORS
from sqlalchemy.exc import SQLAlchemyError

from .config import Config
from .extensions import db

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)

    CORS(app, resources={r"/api/*": {"origins": "*"}})

    from .routes.auth import auth_bp
    from .routes.listings import listings_bp
    from .routes.locations import locations_bp
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(listings_bp, url_prefix="/api")
    app.register_blueprint(locations_bp, url_prefix="/api")

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    @app.errorhandler(SQLAlchemyError)
    def handle_db_error(_):
        return jsonify({"error": "Database error"}), 500
    

    @app.get("/api/_routes")
    def _routes():
        return jsonify(sorted([str(r) for r in app.url_map.iter_rules()])), 200
    

    return app

