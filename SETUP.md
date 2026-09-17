# PhilSys Packet Monitoring Board & Matrix Ticket Automation - Setup Guide

This guide explains how to set up the system on a new machine.

## Prerequisites
1. **Node.js**: Ensure Node.js (version 18 or higher) is installed.
2. **Git**: (Optional) For cloning the repository, though you can simply extract the ZIP.

## Installation Steps

1. **Extract the ZIP file** to your preferred location.
2. **Double-click `Install_PhilSys.bat`**. This will automatically:
   - Install all required background dependencies.
   - Initialize your local database.
   - Set up the default `admin` account.

Wait until the black window says "Setup Complete!" and prompts you to press any key.

## Configuration

The system uses environment variables for configuration (API keys, credentials, etc.). 

1. Locate the `.env.example` file in the main folder.
2. Copy it and rename the copy to exactly `.env`.
3. Open `.env` in a text editor (like Notepad) and fill in your specific values:
   - `DATABASE_URL`: Leave it as `"file:./dev.db"` if you want to use the local offline database.
   - `GOOGLE_API_KEY`: Your Google Sheets API key (if needed).
   - `MATRIX_API_KEY`: Your Matrix API key.

## Running the Desktop App

To start the system, simply double-click **`Start_PhilSys.bat`**. 
- A black command window will open to start the server. **Do not close it!**
- After a few seconds, a standalone desktop window will launch automatically.
- When you are done using the system, you can close the app window and close the black command window.

## Account Setup (First Time)
1. Since you ran the seed script, a default Admin account has been created for you.
2. Go to the login page and use the following credentials:
   - **Username**: `admin`
   - **Password**: `admin`
3. You will be immediately prompted to change this password to something secure.
4. Once logged in as the admin, you can navigate to the User Management dashboard to create accounts for other employees.
5. For new employees you create, their default password will be `changeme`. They will also be forced to change it upon their first login.
