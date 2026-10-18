/**
 * 🏦 MIGRATION SCRIPT: Account Entity Setup
 * 
 * This script performs the following:
 * 1. Creates a default "Cash Wallet" account for each user
 * 2. Updates all existing transactions to reference this account
 * 
 * USAGE:
 *   npx ts-node --project tsconfig.scripts.json src/scripts/migrate-accounts.ts
 * 
 * FLAGS:
 *   --dry-run    Preview changes without writing to database
 *   --user=UID   Run migration for a specific user only
 */

import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

// Initialize Firebase Admin SDK
// Ensure GOOGLE_APPLICATION_CREDENTIALS env var is set, or provide serviceAccountKey path
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const SPECIFIC_USER = process.argv.find(arg => arg.startsWith('--user='))?.split('=')[1];
const BATCH_SIZE = 400; // Firestore batch limit is 500

interface MigrationStats {
  usersProcessed: number;
  accountsCreated: number;
  transactionsUpdated: number;
  transactionsSkipped: number;
  errors: string[];
}

const stats: MigrationStats = {
  usersProcessed: 0,
  accountsCreated: 0,
  transactionsUpdated: 0,
  transactionsSkipped: 0,
  errors: [],
};

/**
 * Create a default "Cash Wallet" account for a user
 */
async function createDefaultAccount(userId: string): Promise<string> {
  const accountId = uuidv4();
  const accountRef = db.collection(`users/${userId}/accounts`).doc(accountId);
  
  // Check if user already has a default account
  const existingDefault = await db
    .collection(`users/${userId}/accounts`)
    .where('isDefault', '==', true)
    .limit(1)
    .get();
  
  if (!existingDefault.empty) {
    console.log(`  ℹ️  User ${userId} already has a default account, skipping creation`);
    return existingDefault.docs[0].id;
  }
  
  const accountData = {
    id: accountId,
    userId,
    name: 'Cash Wallet',
    type: 'CASH',
    currency: 'AUD',
    isDefault: true,
    icon: '💳',
    color: '#10B981', // Emerald green
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  if (DRY_RUN) {
    console.log(`  🔍 [DRY RUN] Would create account: ${accountId}`);
  } else {
    await accountRef.set(accountData);
    console.log(`  ✅ Created default account: ${accountId}`);
  }
  
  stats.accountsCreated++;
  return accountId;
}

/**
 * Update all transactions for a user to reference the default account
 */
async function updateUserTransactions(userId: string, accountId: string): Promise<void> {
  const transactionsRef = db.collection(`users/${userId}/transactions`);
  const snapshot = await transactionsRef.get();
  
  if (snapshot.empty) {
    console.log(`  ℹ️  No transactions found for user ${userId}`);
    return;
  }
  
  console.log(`  📝 Processing ${snapshot.size} transactions...`);
  
  // Process in batches
  const docs = snapshot.docs;
  let batchCount = 0;
  
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);
    let updatesInBatch = 0;
    
    for (const doc of chunk) {
      const data = doc.data();
      
      // Skip if already has accountId (idempotent)
      if (data.accountId) {
        stats.transactionsSkipped++;
        continue;
      }
      
      if (DRY_RUN) {
        console.log(`    🔍 [DRY RUN] Would update transaction: ${doc.id}`);
      } else {
        batch.update(doc.ref, { accountId });
      }
      
      updatesInBatch++;
      stats.transactionsUpdated++;
    }
    
    if (updatesInBatch > 0 && !DRY_RUN) {
      await batch.commit();
      batchCount++;
      console.log(`    ✅ Committed batch ${batchCount} (${updatesInBatch} transactions)`);
    }
  }
}

/**
 * Process a single user's migration
 */
async function migrateUser(userId: string): Promise<void> {
  console.log(`\n👤 Processing user: ${userId}`);
  
  try {
    // Step 1: Create default account
    const accountId = await createDefaultAccount(userId);
    
    // Step 2: Update all transactions
    await updateUserTransactions(userId, accountId);
    
    stats.usersProcessed++;
  } catch (error: any) {
    const errorMsg = `Error processing user ${userId}: ${error.message}`;
    console.error(`  ❌ ${errorMsg}`);
    stats.errors.push(errorMsg);
  }
}

/**
 * Main migration entry point
 */
async function runMigration(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🏦 ACCOUNT MIGRATION SCRIPT');
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be written\n');
  }
  
  const startTime = Date.now();
  
  try {
    if (SPECIFIC_USER) {
      // Process single user
      console.log(`\n🎯 Running for specific user: ${SPECIFIC_USER}`);
      await migrateUser(SPECIFIC_USER);
    } else {
      // Process all users
      console.log('\n🌐 Processing all users...');
      const usersSnapshot = await db.collection('users').get();
      
      console.log(`Found ${usersSnapshot.size} users to process`);
      
      for (const userDoc of usersSnapshot.docs) {
        await migrateUser(userDoc.id);
      }
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error during migration:', error.message);
    stats.errors.push(`Fatal: ${error.message}`);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Users Processed:       ${stats.usersProcessed}`);
  console.log(`  Accounts Created:      ${stats.accountsCreated}`);
  console.log(`  Transactions Updated:  ${stats.transactionsUpdated}`);
  console.log(`  Transactions Skipped:  ${stats.transactionsSkipped} (already had accountId)`);
  console.log(`  Errors:                ${stats.errors.length}`);
  console.log(`  Duration:              ${duration}s`);
  
  if (stats.errors.length > 0) {
    console.log('\n⚠️  Errors encountered:');
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }
  
  if (DRY_RUN) {
    console.log('\n✨ DRY RUN COMPLETE - Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ MIGRATION COMPLETE');
  }
  
  console.log('='.repeat(60) + '\n');
}

// Execute
runMigration()
  .then(() => process.exit(stats.errors.length > 0 ? 1 : 0))
  .catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
