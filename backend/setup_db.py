#!/usr/bin/env python
"""
First-run database setup.
Creates all tables and seeds the initial admin user from .env values.

Usage:
    cd backend
    python setup_db.py
"""
import sys
import os

# Allow running from backend/ or project root
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.database import engine, Base, SessionLocal
from app.models import User
from app.auth import get_password_hash
from app.config import settings


def main():
    print("NIA Antigravity — Database Setup")
    print("=" * 40)

    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("  Tables created (or already exist)")

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == settings.admin_username).first()
        if existing:
            print(f"\n  Admin user '{settings.admin_username}' already exists — skipping creation.")
            print("  Setup complete.")
            return

        if not settings.admin_password:
            print("\n  ERROR: ADMIN_PASSWORD is not set in .env")
            print("  Add it to backend/.env and try again.")
            sys.exit(1)

        if len(settings.admin_password) < 8:
            print("\n  ERROR: ADMIN_PASSWORD must be at least 8 characters")
            sys.exit(1)

        admin = User(
            username=settings.admin_username,
            full_name=settings.admin_name,
            email=settings.admin_email,
            hashed_password=get_password_hash(settings.admin_password),
            role="admin",
            is_active=True,
        )
        db.add(admin)
        db.commit()

        print(f"\n  Admin user created:")
        print(f"    Username : {settings.admin_username}")
        print(f"    Role     : admin")
        print(f"    Email    : {settings.admin_email}")
        print(f"\n  You can now start the backend: start_backend.bat")
        print(f"\n  SECURITY: After setup, you may remove ADMIN_PASSWORD from .env")
    finally:
        db.close()


if __name__ == "__main__":
    main()
