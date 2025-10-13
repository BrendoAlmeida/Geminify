#!/usr/bin/env node

/**
 * Cross-platform clean script for build process
 * Replaces Windows-specific rmdir commands with Node.js fs operations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

/**
 * Recursively remove directory and all contents
 */
function removeDirectory(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          // Recursively remove subdirectories
          removeDirectory(itemPath);
        } else {
          // Remove files
          fs.unlinkSync(itemPath);
        }
      }

      // Remove the now-empty directory
      fs.rmdirSync(dirPath);
      console.log(`🗑️  Removed directory: ${dirPath}`);
    } else {
      console.log(`ℹ️  Directory doesn't exist: ${dirPath}`);
    }
  } catch (error) {
    console.error(`Error removing directory ${dirPath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Main clean operation
 */
function main() {
  console.log('🧹 Cleaning build directory...');

  if (fs.existsSync(distDir)) {
    removeDirectory(distDir);
    console.log('✅ Build directory cleaned successfully!');
  } else {
    console.log('ℹ️  No build directory to clean.');
  }
}

// Run the script
main();