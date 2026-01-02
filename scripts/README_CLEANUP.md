# Database Cleanup Script

This script will delete all users and tickets from your Firebase project.

## ⚠️ WARNING
**This action is irreversible! Make sure you want to delete all data before running this script.**

## Setup Instructions

### 1. Get Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the ⚙️ (gear icon) next to "Project Overview" → **Project Settings**
4. Go to the **Service Accounts** tab
5. Click **"Generate new private key"**
6. Save the JSON file as `serviceAccountKey.json` in your project root
7. **IMPORTANT**: Add this file to `.gitignore` (never commit it!)

### 2. Update .gitignore

Add this line to your `.gitignore` file:
```
serviceAccountKey.json
```

### 3. Update the Script

Open `scripts/cleanupDatabase.js` and update line 5:
```javascript
const serviceAccount = require('../serviceAccountKey.json'); // Update path if needed
```

### 4. Run the Cleanup

```bash
node scripts/cleanupDatabase.js
```

## What Gets Deleted

- ✅ All documents in the `tickets` collection
- ✅ All users from Firebase Authentication
- ✅ Add more collections in the script if needed

## Alternative: Manual Cleanup in Firebase Console

### For Firestore Collections:
1. Go to Firestore Database
2. Click Settings (⚙️) → Delete database
3. Recreate the database

### For Authentication Users:
Unfortunately, Firebase Console doesn't have bulk delete. Options:
- Use this script (recommended)
- Delete users one by one (tedious)
- Delete and recreate the entire Firebase project (nuclear option)

## After Cleanup

Your database will be completely fresh:
- No old users
- No old tickets
- Ready for your new event!

## Troubleshooting

**Error: "Cannot find module 'firebase-admin'"**
```bash
npm install firebase-admin
```

**Error: "Service account key file not found"**
- Make sure you downloaded the service account key
- Check the file path in line 5 of the script
- Make sure the file is in your project root

**Permission Errors**
- Make sure your service account has the necessary permissions
- You may need to enable the Firebase Admin SDK

