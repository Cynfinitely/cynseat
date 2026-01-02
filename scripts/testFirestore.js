// Test script to verify Firestore connection
// Run with: node scripts/testFirestore.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testFirestore() {
  console.log('Testing Firestore connection...\n');
  
  try {
    // Test 1: Read seatIndex
    console.log('Test 1: Reading seatIndex document...');
    const seatIndexRef = db.doc('tickets/seatIndex');
    const seatIndexSnap = await seatIndexRef.get();
    
    if (seatIndexSnap.exists) {
      console.log('✅ seatIndex found:', seatIndexSnap.data());
    } else {
      console.log('⚠️  seatIndex not found - this is OK if you just cleaned the database');
    }
    
    // Test 2: Read all tickets
    console.log('\nTest 2: Reading all tickets...');
    const ticketsRef = db.collection('tickets');
    const snapshot = await ticketsRef.get();
    
    console.log(`Found ${snapshot.size} ticket documents`);
    
    if (snapshot.size > 0) {
      console.log('\nFirst 3 tickets:');
      snapshot.docs.slice(0, 3).forEach((doc, index) => {
        console.log(`${index + 1}. ${doc.id}:`, doc.data());
      });
    }
    
    // Test 3: Try to write a test document
    console.log('\nTest 3: Writing a test document...');
    const testDocRef = await ticketsRef.add({
      seatCode: 'TEST-001',
      purchaseId: 'test-purchase',
      userId: 'test-user',
      userEmail: 'test@example.com',
      imageUrl: 'https://example.com/test.pdf',
      isTest: true,
      createdAt: new Date().toISOString()
    });
    
    console.log('✅ Test document created with ID:', testDocRef.id);
    
    // Clean up test document
    await testDocRef.delete();
    console.log('✅ Test document deleted');
    
    console.log('\n✅ All tests passed! Firestore is working correctly.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

testFirestore();

