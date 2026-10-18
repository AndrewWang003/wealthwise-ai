/**
 * 📊 MIGRATION SCRIPT: Asset Entity Setup
 * 
 * This script performs the following:
 * 1. Scans all BUY/SELL transactions
 * 2. Extracts unique symbols
 * 3. Creates Asset documents for each symbol
 * 4. Links existing transactions to the new Asset IDs
 * 
 * USAGE:
 *   npx ts-node --project tsconfig.scripts.json src/scripts/migrate-assets.ts
 * 
 * FLAGS:
 *   --dry-run    Preview changes without writing to database
 *   --user=UID   Run migration for a specific user only
 */

import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const SPECIFIC_USER = process.argv.find(arg => arg.startsWith('--user='))?.split('=')[1];
const BATCH_SIZE = 400;

// Known ETF symbols (heuristic for auto-classification)
const KNOWN_ETFS = new Set([
  'IVV', 'NDQ', 'VAS', 'VGS', 'VDHG', 'A200', 'IOZ', 'VTS', 'VEU', 'VGAD',
  'QUAL', 'ETHI', 'HACK', 'ACDC', 'ASIA', 'HYGG', 'BOND', 'PLUS', 'STW',
  'SPY', 'QQQ', 'VTI', 'VOO', 'ARKK', 'DIA', 'IWM', 'EFA', 'EEM', 'AGG',
]);

// Known crypto symbols
const KNOWN_CRYPTO = new Set([
  'BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM',
  'BTC-USD', 'ETH-USD', 'BTCUSD', 'ETHUSD',
]);

interface MigrationStats {
  usersProcessed: number;
  assetsCreated: number;
  transactionsLinked: number;
  transactionsSkipped: number;
  errors: string[];
}

const stats: MigrationStats = {
  usersProcessed: 0,
  assetsCreated: 0,
  transactionsLinked: 0,
  transactionsSkipped: 0,
  errors: [],
};

/**
 * Infer asset type from symbol
 */
function inferAssetType(symbol: string, assetClass?: string): 'STOCK' | 'ETF' | 'CRYPTO' | 'REIT' | 'BOND' | 'COMMODITY' | 'INDEX' {
  const upperSymbol = symbol.toUpperCase();
  
  // Check known ETFs
  if (KNOWN_ETFS.has(upperSymbol)) {
    return 'ETF';
  }
  
  // Check known crypto
  if (KNOWN_CRYPTO.has(upperSymbol) || assetClass === 'Crypto') {
    return 'CRYPTO';
  }
  
  // Check asset class hints
  if (assetClass) {
    const lowerClass = assetClass.toLowerCase();
    if (lowerClass === 'etf') return 'ETF';
    if (lowerClass === 'crypto') return 'CRYPTO';
    if (lowerClass === 'reit') return 'REIT';
    if (lowerClass === 'bond') return 'BOND';
    if (lowerClass === 'commodity') return 'COMMODITY';
    if (lowerClass === 'index') return 'INDEX';
  }
  
  // Default to STOCK
  return 'STOCK';
}

/**
 * Infer market from currency/symbol
 */
function inferMarket(currency: string, symbol: string): string {
  if (currency === 'AUD') return 'ASX';
  if (currency === 'USD') return 'NASDAQ';
  if (symbol.endsWith('.AX')) return 'ASX';
  return 'NASDAQ';
}

/**
 * Create assets for a user from their transactions
 */
async function migrateUserAssets(userId: string): Promise<void> {
  console.log(`\n👤 Processing user: ${userId}`);
  
  try {
    // Step 1: Get all BUY/SELL transactions
    const transactionsRef = db.collection(`users/${userId}/transactions`);
    const snapshot = await transactionsRef
      .where('transactionType', 'in', ['buy', 'sell'])
      .get();
    
    if (snapshot.empty) {
      console.log(`  ℹ️  No buy/sell transactions found`);
      return;
    }
    
    console.log(`  📝 Found ${snapshot.size} buy/sell transactions`);
    
    // Step 2: Extract unique symbols with metadata
    const symbolMap = new Map<string, {
      currency: string;
      market: string;
      assetClass: string;
      count: number;
    }>();
    
    snapshot.docs.forEach(doc => {
      const tx = doc.data();
      const symbol = (tx.symbol || '').toUpperCase().trim();
      
      if (!symbol || symbol === 'AUD CASH' || symbol === 'USD CASH') {
        return; // Skip cash entries
      }
      
      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, {
          currency: tx.currency || 'USD',
          market: tx.market || inferMarket(tx.currency, symbol),
          assetClass: tx.assetClass || 'Stock',
          count: 1,
        });
      } else {
        const existing = symbolMap.get(symbol)!;
        existing.count++;
      }
    });
    
    console.log(`  📊 Found ${symbolMap.size} unique symbols`);
    
    // Step 3: Check existing assets
    const existingAssetsSnap = await db.collection(`users/${userId}/assets`).get();
    const existingSymbols = new Set(existingAssetsSnap.docs.map(d => d.data().symbol?.toUpperCase()));
    
    // Step 4: Create new assets
    const assetIdMap = new Map<string, string>(); // symbol -> assetId
    
    // First, populate with existing assets
    existingAssetsSnap.docs.forEach(doc => {
      const symbol = (doc.data().symbol || '').toUpperCase();
      if (symbol) {
        assetIdMap.set(symbol, doc.id);
      }
    });
    
    // Create new assets for symbols not yet in DB
    for (const [symbol, metadata] of symbolMap) {
      if (existingSymbols.has(symbol)) {
        console.log(`  ⏭️  Asset already exists: ${symbol}`);
        continue;
      }
      
      const assetId = uuidv4();
      const assetType = inferAssetType(symbol, metadata.assetClass);
      
      const assetData = {
        id: assetId,
        userId,
        symbol,
        name: symbol, // Placeholder, can be enriched later
        type: assetType,
        currency: metadata.currency,
        market: metadata.market,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      if (DRY_RUN) {
        console.log(`  🔍 [DRY RUN] Would create asset: ${symbol} (${assetType})`);
      } else {
        await db.doc(`users/${userId}/assets/${assetId}`).set(assetData);
        console.log(`  ✅ Created asset: ${symbol} (${assetType})`);
      }
      
      assetIdMap.set(symbol, assetId);
      stats.assetsCreated++;
    }
    
    // Step 5: Link transactions to assets
    const docs = snapshot.docs;
    let batchCount = 0;
    
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + BATCH_SIZE);
      let updatesInBatch = 0;
      
      for (const docRef of chunk) {
        const tx = docRef.data();
        const symbol = (tx.symbol || '').toUpperCase().trim();
        
        // Skip if already has assetId
        if (tx.assetId) {
          stats.transactionsSkipped++;
          continue;
        }
        
        const assetId = assetIdMap.get(symbol);
        if (!assetId) {
          continue; // No asset for this symbol
        }
        
        if (DRY_RUN) {
          console.log(`    🔍 [DRY RUN] Would link tx ${docRef.id} to asset ${symbol}`);
        } else {
          batch.update(docRef.ref, { assetId });
        }
        
        updatesInBatch++;
        stats.transactionsLinked++;
      }
      
      if (updatesInBatch > 0 && !DRY_RUN) {
        await batch.commit();
        batchCount++;
        console.log(`    ✅ Committed batch ${batchCount} (${updatesInBatch} transactions linked)`);
      }
    }
    
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
  console.log('📊 ASSET MIGRATION SCRIPT');
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be written\n');
  }
  
  const startTime = Date.now();
  
  try {
    if (SPECIFIC_USER) {
      console.log(`\n🎯 Running for specific user: ${SPECIFIC_USER}`);
      await migrateUserAssets(SPECIFIC_USER);
    } else {
      console.log('\n🌐 Processing all users...');
      const usersSnapshot = await db.collection('users').get();
      
      console.log(`Found ${usersSnapshot.size} users to process`);
      
      for (const userDoc of usersSnapshot.docs) {
        await migrateUserAssets(userDoc.id);
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
  console.log(`  Users Processed:        ${stats.usersProcessed}`);
  console.log(`  Assets Created:         ${stats.assetsCreated}`);
  console.log(`  Transactions Linked:    ${stats.transactionsLinked}`);
  console.log(`  Transactions Skipped:   ${stats.transactionsSkipped} (already had assetId)`);
  console.log(`  Errors:                 ${stats.errors.length}`);
  console.log(`  Duration:               ${duration}s`);
  
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
