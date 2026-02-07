import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'database', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("🔍 Buscando tablas en tu SQLite...");

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
    if (err) return console.error(err);
    console.log("Tus tablas reales son:", rows.map(r => r.name).join(", "));
    process.exit();
});