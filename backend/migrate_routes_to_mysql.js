import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROUTES_DIR = join(__dirname, 'routes');

console.log('🔧 Starting automatic route migration to MySQL async/await (v2)...\n');

function migrateFile(filePath) {
    console.log(`📝 Processing: ${filePath}`);

    let content = readFileSync(filePath, 'utf-8');
    let modified = false;

    // STEP 1: Convert db.prepare().get/all/run to await db.get/all/run
    const prepareGetPattern = /dbHelpers\.prepare\(([^)]+)\)\.get\(([^)]*)\)/g;
    content = content.replace(prepareGetPattern, (match, query, params) => {
        modified = true;
        if (params && params.trim()) {
            return `await dbHelpers.get(${query}, [${params}])`;
        }
        return `await dbHelpers.get(${query})`;
    });

    const prepareAllPattern = /dbHelpers\.prepare\(([^)]+)\)\.all\(([^)]*)\)/g;
    content = content.replace(prepareAllPattern, (match, query, params) => {
        modified = true;
        if (params && params.trim()) {
            return `await dbHelpers.all(${query}, [${params}])`;
        }
        return `await dbHelpers.all(${query})`;
    });

    const prepareRunPattern = /dbHelpers\.prepare\(([^)]+)\)\.run\(([^)]*)\)/g;
    content = content.replace(prepareRunPattern, (match, query, params) => {
        modified = true;
        if (params && params.trim()) {
            return `await dbHelpers.run(${query}, [${params}])`;
        }
        return `await dbHelpers.run(${query})`;
    });

    // Also handle 'db.prepare' without 'Helpers'
    content = content.replace(/\bdb\.prepare\(([^)]+)\)\.get\(([^)]*)\)/g, (match, query, params) => {
        modified = true;
        if (params && params.trim()) {
            return `await db.get(${query}, [${params}])`;
        }
        return `await db.get(${query})`;
    });

    content = content.replace(/\bdb\.prepare\(([^)]+)\)\.all\(([^)]*)\)/g, (match, query, params) => {
        modified = true;
        if (params && params.trim()) {
            return `await db.all(${query}, [${params}])`;
        }
        return `await db.all(${query})`;
    });

    content = content.replace(/\bdb\.prepare\(([^)]+)\)\.run\(([^)]*)\)/g, (match, query, params) => {
        modified = true;
        if (params && params.trim()) {
            return `await db.run(${query}, [${params}])`;
        }
        return `await db.run(${query})`;
    });

    // STEP 2: Make route handlers async
    // Match patterns like: router.get('/path', (req, res) =>
    // or: router.get('/path', middleware, (req, res) =>
    content = content.replace(
        /router\.(get|post|put|delete)\(([^,]+),\s*(?:(\w+),\s*)?\(req,\s*res\)\s*=>/g,
        (match, method, path, middleware) => {
            modified = true;
            if (middleware) {
                return `router.${method}(${path}, ${middleware}, async (req, res) =>`;
            }
            return `router.${method}(${path}, async (req, res) =>`;
        }
    );

    // STEP 3: MySQL date functions (only for reports.js)
    if (filePath.includes('reports.js')) {
        content = content.replace(/strftime\('%Y-%m',\s*([^)]+)\)/g, "DATE_FORMAT($1, '%Y-%m')");
        content = content.replace(/strftime\('%Y-%m-%d',\s*([^)]+)\)/g, "DATE_FORMAT($1, '%Y-%m-%d')");
        console.log('  ✅ Applied MySQL date function conversion');
    }

    // STEP 4: Clean up duplicates
    content = content.replace(/async\s+async/g, 'async');
    content = content.replace(/await\s+await/g, 'await');

    if (modified) {
        // Backup original
        writeFileSync(filePath + '.backup2', readFileSync(filePath));

        // Write updated content
        writeFileSync(filePath, content);
        console.log('  ✅ Migrated successfully');
        return true;
    } else {
        console.log('  ⏭️  No changes needed');
        return false;
    }
}

// Get all route files (excluding auth.js which is already done)
const files = readdirSync(ROUTES_DIR)
    .filter(f => f.endsWith('.js') && !f.endsWith('.backup') && !f.endsWith('.backup2') && f !== 'auth.js')
    .map(f => join(ROUTES_DIR, f));

console.log(`Found ${files.length} route files to process\n`);

let totalMigrated = 0;

files.forEach(file => {
    if (migrateFile(file)) {
        totalMigrated++;
    }
});

console.log('\n═══════════════════════════════════════════════');
console.log('✅ MIGRATION COMPLETE!');
console.log('═══════════════════════════════════════════════');
console.log(`   Files processed: ${files.length}`);
console.log(`   Files migrated: ${totalMigrated}`);
console.log(`   Backups created: ${totalMigrated} (.backup2 files)`);
console.log('\n');
