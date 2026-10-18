#!/usr/bin/env ts-node
/**
 * Migration Script: Assign All Transactions to "AU Cash" Account
 * 
 * Purpose:
 * - Create a default "AU Cash" account if it doesn't exist
 * - Update all transactions without accountId to link to "AU Cash"
 * - Support user-specific or global migration
 * 
 * Usage:
 *   # Dry run (preview changes)
 *   npx ts-node --project tsconfig.scripts.json src/scripts/migrate-to-au-cash.ts --dry-run
 * 
 *   # Execute migration for specific user
 *   npx ts-node --project tsconfig.scripts.json src/scripts/migrate-to-au-cash.ts --user=YOUR_USER_ID
 * 
 *   # Execute migration for ALL users (⚠️ use with caution)
 *   npx ts-node --project tsconfig.scripts.json src/scripts/migrate-to-au-cash.ts --all-users
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin SDK
const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: serviceAccountKey.json not found!');
  console.error(`   Expected location: ${serviceAccountPath}`);
  console.error('   Please download it from Firebase Console > Project Settings > Service Accounts');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const allUsers = args.includes('--all-users');
const userArg = args.find(arg => arg.startsWith('--user='));
const targetUserId = userArg ? userArg.split('=')[1] : null;

// AU Cash account configuration
const AU_CASH_CONFIG = {
  name: 'AU Cash',
  type: 'CASH' as const,
  currency: 'AUD',
  isDefault: true,
  color: '#10b981', // Green color
  icon: '💰',
};

interface MigrationStats {
  accountsCreated: number;
  transactionsUpdated: number;
  transactionsSkipped: number;
  errors: string[];
  usersMigrated: string[];
}

async function findOrCreateAUCashAccount(userId: string): Promise<string> {
  console.log(`\n🔍 Checking for AU Cash account for user: ${userId}`);
  
  const accountsRef = db.collection(`users/${userId}/accounts`);
  const existingAccount = await accountsRef
    .where('name', '==', AU_CASH_CONFIG.name)
    .where('currency', '==', AU_CASH_CONFIG.currency)
    .limit(1)
    .get();

  if (!existingAccount.empty) {
    const accountId = existingAccount.docs[0].id;
    console.log(`✅ AU Cash account already exists: ${accountId}`);
    return accountId;
  }

  if (isDryRun) {
    console.log(`[DRY RUN] Would create AU Cash account for user ${userId}`);
    return 'DRY_RUN_ACCOUNT_ID';
  }

  // Create AU Cash account
  const newAccountRef = accountsRef.doc();
  await newAccountRef.set({
    ...AU_CASH_CONFIG,
    userId,
    id: newAccountRef.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`✅ Created AU Cash account: ${newAccountRef.id}`);
  return newAccountRef.id;
}

async function migrateUserTransactions(userId: string): Promise<Partial<MigrationStats>> {
  const stats: Partial<MigrationStats> = {
    transactionsUpdated: 0,
    transactionsSkipped: 0,
    errors: [],
  };

  try {
    // Get or create AU Cash account
    const auCashAccountId = await findOrCreateAUCashAccount(userId);
    if (auCashAccountId === 'DRY_RUN_ACCOUNT_ID' && !isDryRun) {
      throw new Error('Failed to create AU Cash account');
    }

    console.log(`\n📊 Querying transactions without accountId for user: ${userId}`);
    
    const transactionsRef = db.collection(`users/${userId}/transactions`);
    
    // Query transactions without accountId
    // Note: Firestore doesn't support direct "is null" queries, so we need to get all and filter
    const allTransactions = await transactionsRef.get();
    const transactionsToUpdate = allTransactions.docs.filter(doc => {
      const data = doc.data();
      return !data.accountId || data.accountId === null || data.accountId === undefined;
    });

    console.log(`📝 Found ${transactionsToUpdate.length} transactions to update`);

    if (transactionsToUpdate.length === 0) {
      console.log('✅ No transactions to migrate for this user');
      return stats;
    }

    if (isDryRun) {
      console.log(`[DRY RUN] Would update ${transactionsToUpdate.length} transactions with accountId: ${auCashAccountId}`);
      stats.transactionsUpdated = transactionsToUpdate.length;
      return stats;
    }

    // Batch update transactions (Firestore limit: 500 operations per batch)
    const batchSize = 500;
    let processed = 0;

    for (let i = 0; i < transactionsToUpdate.length; i += batchSize) {
      const batch = db.batch();
      const chunk = transactionsToUpdate.slice(i, i + batchSize);

      chunk.forEach(doc => {
        batch.update(doc.ref, {
          accountId: auCashAccountId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();
      processed += chunk.length;
      console.log(`✅ Updated batch: ${processed}/${transactionsToUpdate.length} transactions`);
    }

    stats.transactionsUpdated = processed;
    console.log(`\n✅ Migration completed for user ${userId}: ${processed} transactions updated`);

  } catch (error) {
    const errorMsg = `Failed to migrate transactions for user ${userId}: ${error}`;
    console.error(`❌ ${errorMsg}`);
    stats.errors!.push(errorMsg);
  }

  return stats;
}

async function getAllUserIds(): Promise<string[]> {
  console.log('\n🔍 Fetching all user IDs...');
  const usersSnapshot = await db.collection('users').listDocuments();
  const userIds = usersSnapshot.map(doc => doc.id);
  console.log(`✅ Found ${userIds.length} users`);
  return userIds;
}

async function runMigration() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 AU Cash Migration Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no changes will be made)' : '⚠️  PRODUCTION RUN'}`);
  console.log('='.repeat(60) + '\n');

  const globalStats: MigrationStats = {
    accountsCreated: 0,
    transactionsUpdated: 0,
    transactionsSkipped: 0,
    errors: [],
    usersMigrated: [],
  };

  try {
    let userIds: string[];

    if (targetUserId) {
      console.log(`Target: Single user (${targetUserId})`);
      userIds = [targetUserId];
    } else if (allUsers) {
      console.log('Target: ALL users');
      userIds = await getAllUserIds();
    } else {
      console.error('❌ Error: Please specify either --user=USER_ID or --all-users');
      process.exit(1);
    }

    // Migrate each user
    for (const userId of userIds) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`Processing user: ${userId}`);
      console.log('─'.repeat(60));

      const userStats = await migrateUserTransactions(userId);
      
      globalStats.transactionsUpdated += userStats.transactionsUpdated || 0;
      globalStats.transactionsSkipped += userStats.transactionsSkipped || 0;
      globalStats.errors.push(...(userStats.errors || []));
      globalStats.usersMigrated.push(userId);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`Users migrated:          ${globalStats.usersMigrated.length}`);
    console.log(`Transactions updated:    ${globalStats.transactionsUpdated}`);
    console.log(`Transactions skipped:    ${globalStats.transactionsSkipped}`);
    console.log(`Errors:                  ${globalStats.errors.length}`);
    
    if (globalStats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      globalStats.errors.forEach(err => console.log(`   - ${err}`));
    }

    if (isDryRun) {
      console.log('\n🔍 DRY RUN COMPLETED - No changes were made');
      console.log('   Run without --dry-run flag to execute migration');
    } else {
      console.log('\n✅ MIGRATION COMPLETED');
    }

    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Execute migration
runMigration()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
