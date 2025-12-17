#!/usr/bin/env node
/**
 * Script to replace console.log/warn/error/debug with logger in frontend files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = path.join(__dirname, '../src');

// Find all .tsx and .ts files
const files = execSync(`find ${srcDir} -type f \\( -name "*.tsx" -o -name "*.ts" \\)`, { encoding: 'utf-8' })
  .trim()
  .split('\n')
  .filter(Boolean);

let processedCount = 0;
let skippedCount = 0;

files.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Skip if no console calls
  if (!/console\.(log|warn|error|debug)/.test(content)) {
    return;
  }
  
  // Calculate relative path from src/ to determine import depth
  const relativePath = path.relative(srcDir, filePath);
  const depth = relativePath.split(path.sep).length - 1;
  const loggerImportPath = '../'.repeat(depth) + 'lib/logger';
  
  // Check if logger is already imported
  const hasLoggerImport = /import.*logger.*from.*['"]\.\.\/.*lib\/logger['"]/.test(content);
  
  if (!hasLoggerImport) {
    // Find the last import statement
    const importRegex = /^import\s+.*from\s+['"].*['"];?$/gm;
    const imports = content.match(importRegex) || [];
    
    if (imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      const insertIndex = lastImportIndex + lastImport.length;
      
      // Add logger import after last import
      content = content.slice(0, insertIndex) + 
                `\nimport { logger } from "${loggerImportPath}";` + 
                content.slice(insertIndex);
      modified = true;
    } else {
      // No imports, add at the top (after "use client" if present)
      const useClientMatch = content.match(/^("use client";\s*\n)/);
      if (useClientMatch) {
        const insertIndex = useClientMatch[0].length;
        content = content.slice(0, insertIndex) + 
                  `import { logger } from "${loggerImportPath}";\n` + 
                  content.slice(insertIndex);
      } else {
        content = `import { logger } from "${loggerImportPath}";\n` + content;
      }
      modified = true;
    }
  }
  
  // Replace console.log with logger.log
  if (content.includes('console.log(')) {
    content = content.replace(/console\.log\(/g, 'logger.log(');
    modified = true;
  }
  
  // Replace console.warn with logger.warn
  if (content.includes('console.warn(')) {
    content = content.replace(/console\.warn\(/g, 'logger.warn(');
    modified = true;
  }
  
  // Replace console.error with logger.error
  if (content.includes('console.error(')) {
    content = content.replace(/console\.error\(/g, 'logger.error(');
    modified = true;
  }
  
  // Replace console.debug with logger.debug
  if (content.includes('console.debug(')) {
    content = content.replace(/console\.debug\(/g, 'logger.debug(');
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Processed: ${filePath}`);
    processedCount++;
  } else {
    skippedCount++;
  }
});

console.log(`\n📊 Summary:`);
console.log(`   Processed: ${processedCount} files`);
console.log(`   Skipped: ${skippedCount} files`);
