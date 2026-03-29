from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.extensions import db

app = create_app()

with app.app_context():
    db.create_all() 
    print("tables synced")

if __name__ == "__main__":
    app.run(debug=True, port=5000)
