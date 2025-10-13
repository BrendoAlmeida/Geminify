#!/usr/bin/env node

/**
 * Fix ES module imports by adding .js extensions
 * This is required for proper ES module resolution in Node.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../src');

/**
 * Fix imports in a TypeScript file
 */
function fixImportsInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Replace relative imports that don't have extensions
    const fixedContent = content.replace(
      /from\s+["'](\.[^"']+)["']/g,
      (match, importPath) => {
        // Don't modify if already has an extension
        if (importPath.includes('.js') || importPath.includes('.ts') || importPath.includes('.json')) {
          return match;
        }
        
        // Check if this is a directory import that should point to index
        const fullPath = path.resolve(path.dirname(filePath), importPath);
        
        // If the path exists as a directory, add /index.js
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
          return match.replace(importPath, importPath + '/index.js');
        }
        
        // Add .js extension for ES modules
        return match.replace(importPath, importPath + '.js');
      }
    );
    
    if (content !== fixedContent) {
      fs.writeFileSync(filePath, fixedContent);
      console.log(`✅ Fixed imports in: ${path.relative(srcDir, filePath)}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Recursively process all TypeScript files
 */
function processDirectory(dirPath) {
  const items = fs.readdirSync(dirPath);
  let filesFixed = 0;
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      filesFixed += processDirectory(itemPath);
    } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      if (fixImportsInFile(itemPath)) {
        filesFixed++;
      }
    }
  }
  
  return filesFixed;
}

/**
 * Main function
 */
function main() {
  console.log('🔧 Fixing ES module imports for production build...');
  
  const filesFixed = processDirectory(srcDir);
  
  if (filesFixed > 0) {
    console.log(`\n✅ Fixed imports in ${filesFixed} files!`);
  } else {
    console.log('\nℹ️  No imports needed fixing.');
  }
}

// Run the script
main();