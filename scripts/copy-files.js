#!/usr/bin/env node

/**
 * Cross-platform file copying script for build process
 * Replaces Windows-specific xcopy commands with Node.js fs operations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

/**
 * Recursively copy directory contents
 */
function copyDirectory(src, dest) {
  try {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    // Read all items in source directory
    const items = fs.readdirSync(src);

    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = fs.statSync(srcPath);

      if (stat.isDirectory()) {
        // Recursively copy subdirectories
        copyDirectory(srcPath, destPath);
      } else {
        // Copy files
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied: ${srcPath} -> ${destPath}`);
      }
    }
  } catch (error) {
    console.error(`Error copying directory ${src} to ${dest}:`, error.message);
    process.exit(1);
  }
}

/**
 * Copy individual file
 */
function copyFile(src, dest) {
  try {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${src} -> ${dest}`);
  } catch (error) {
    console.error(`Error copying file ${src} to ${dest}:`, error.message);
    process.exit(1);
  }
}

/**
 * Main copy operations
 */
function main() {
  console.log('🔄 Copying static files for production build...');

  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Copy public directory to dist/public
  const publicSrc = path.join(projectRoot, 'public');
  const publicDest = path.join(distDir, 'public');
  
  if (fs.existsSync(publicSrc)) {
    console.log('📁 Copying public directory...');
    copyDirectory(publicSrc, publicDest);
  }

  // Copy JSON configuration files
  const jsonFiles = [
    'package.json',
    'saved_playlists.json',
    'token.json'
  ];

  console.log('📄 Copying JSON files...');
  for (const filename of jsonFiles) {
    const srcFile = path.join(projectRoot, filename);
    const destFile = path.join(distDir, filename);
    
    if (fs.existsSync(srcFile)) {
      copyFile(srcFile, destFile);
    } else {
      console.log(`⚠️  File not found (skipping): ${filename}`);
    }
  }

  console.log('✅ Static files copied successfully!');
}

// Run the script
main();