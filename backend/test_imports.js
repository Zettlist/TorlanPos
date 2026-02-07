import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { print } from 'pdf-to-printer';
import { fileURLToPath } from 'url';

console.log('Imports successful');
console.log('PDFDocument:', PDFDocument);
console.log('bwipjs:', bwipjs);
console.log('print:', print);
