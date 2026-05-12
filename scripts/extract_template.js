const fs = require('fs');
const html = fs.readFileSync('dlicom-cards-v27.html', 'utf-8');
const lines = html.split('\n');

// Full content of stats columns
console.log('=== LINE 341 (X stats col) ===');
console.log(lines[341]);
console.log('\n=== LINE 342 (DC stats col) ===');
console.log(lines[342]);
