// One-time cleanup script to delete all users and tickets
// Run this with: node scripts/cleanupDatabase.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json'); // Points to root directory

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

// Delete all documents in a collection
async function deleteCollection(collectionPath, batchSize = 100) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject);
  });
}

async function deleteQueryBatch(query, resolve, reject) {
  try {
    const snapshot = await query.get();

    if (snapshot.size === 0) {
      resolve();
      return;
    }

    // Delete documents in a batch
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`Deleted ${snapshot.size} documents`);

    // Recurse on the next process tick to avoid stack overflow
    process.nextTick(() => {
      deleteQueryBatch(query, resolve, reject);
    });
  } catch (error) {
    reject(error);
  }
}

// Delete all users from Authentication
async function deleteAllUsers() {
  try {
    const listUsersResult = await auth.listUsers();
    const uids = listUsersResult.users.map(user => user.uid);
    
    console.log(`Found ${uids.length} users to delete`);
    
    for (const uid of uids) {
      await auth.deleteUser(uid);
      console.log(`Deleted user: ${uid}`);
    }
    
    console.log('✅ All users deleted');
  } catch (error) {
    console.error('Error deleting users:', error);
  }
}

// Main cleanup function
async function cleanup() {
  console.log('🔥 Starting database cleanup...\n');
  
  try {
    // Delete all tickets
    console.log('📋 Deleting tickets collection...');
    await deleteCollection('tickets');
    console.log('✅ Tickets collection deleted\n');
    
    // Delete all users from Authentication
    console.log('👥 Deleting all users...');
    await deleteAllUsers();
    console.log('✅ All users deleted\n');
    
    // Add any other collections you want to delete
    // await deleteCollection('otherCollectionName');
    
    console.log('🎉 Database cleanup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanup();

