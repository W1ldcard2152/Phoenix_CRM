/**
 * Minimal HTML Entity Issue Detector - Aggressive Edition
 * This script identifies only the most concerning potential HTML entity issues
 * with strict filtering to eliminate false positives.
 * 
 * Run with: node findHtmlEntityIssues.js
 */

const fs = require('fs');
const path = require('path');

// Directories to search
const CLIENT_SRC = path.join(__dirname, 'src/client/src');

// File extensions to check
const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

// Skip directories entirely
const SKIP_DIRS = ['node_modules', 'build', 'dist', '.git', 'tests', '__tests__', 'utils', 'services', 'hooks'];

// Skip files by name pattern
const SKIP_FILES = [
  'api.js', 'service.js', 'utils.js', 'helpers.js', 'constants.js', 
  'context.js', 'store.js', 'reducer.js', 'actions.js', 'routes.js',
  'config.js', 'types.js', 'hooks.js', 'theme.js', 'test', 'spec.js',
  'Generator', 'Calendar', 'Chart', 'Form', 'Table', 'List', 'Detail'
];

// Files we know are already heavily sanitized or don't need it
const SAFE_FILES = [
  'InvoiceGenerator', 'WorkOrderDetail', 'AppointmentDetail', 'CustomerDetail',
  'VehicleDetail', 'Dashboard', 'FormComponent', 'Modal', 'Card'
];

// Known safe patterns that never need sanitization
const ALWAYS_SAFE = [
  // Properties that take numbers or booleans
  /(?:width|height|min|max|top|left|right|bottom|padding|margin|flex|order|z-index|opacity|duration|index|count|length|size|id)(?:=|:)\s*\{/gi,
  // Boolean attributes
  /(?:disabled|required|checked|readonly|selected|open|hidden|active|loading|expanded)(?:=|:)\s*\{/gi,
  // Object properties that don't render HTML
  /\{(?:styles|classes|options|config|settings|theme|colors|props|attributes|data|items|formatDate|format|className|style|onClick|onChange|onBlur|on[A-Z])/gi,
  // Array rendering patterns
  /\{(?:.*?)\.(?:map|filter|reduce|forEach|some|every|find)\(/gi,
  // Numerical operations
  /\{[^}]*?(?:\+|\-|\*|\/|\>|\<|\>=|\<=|\?)[^}]*\}/g
];

// The only pattern we care about - direct HTML rendering of variables that might contain entities
const CRITICAL_PATTERN = /(?<!\bsanitizeText\()(\{(?!sanitizeText\()(?:[^{}]|(?:\{[^{}]*\}))*\})/g;

let results = {
  totalFiles: 0,
  checkedFiles: 0,
  potentialIssues: 0,
  ignoredFiles: 0,
  skippedFiles: 0,
  issuesByFile: {}
};

/**
 * Find all files with certain extensions in a directory
 */
function walkDirectory(dir) {
  let files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      if (SKIP_DIRS.some(skipDir => item.includes(skipDir))) continue;
      
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        files = files.concat(walkDirectory(fullPath));
      } else if (stats.isFile() && EXTENSIONS.includes(path.extname(fullPath))) {
        // Don't filter here - we'll check the filename during processing
        files.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }
  
  return files;
}

/**
 * Check if content might render HTML entities
 */
function checkFile(filePath) {
  const fileName = path.basename(filePath);
  
  // Skip files we know don't need checking or are already sanitized
  if (SKIP_FILES.some(pattern => fileName.includes(pattern)) || 
      SAFE_FILES.some(pattern => fileName.includes(pattern))) {
    results.skippedFiles++;
    return;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Skip files that don't render JSX/HTML content
    if (!content.includes('return') || 
        !content.includes('<') || 
        !content.match(/\breturn\s*\(/)) {
      results.ignoredFiles++;
      return;
    }
    
    // Skip files that are already using sanitizeText
    const sanitizeCount = (content.match(/sanitizeText\(/g) || []).length;
    if (sanitizeCount > 3) {
      results.skippedFiles++;
      return;
    }
    
    results.checkedFiles++;
    
    // Find potential issues - matches that aren't in safe contexts
    let issues = [];
    let match;
    
    while ((match = CRITICAL_PATTERN.exec(content)) !== null) {
      const matchText = match[0];
      
      // Skip if it's in a known safe pattern
      if (ALWAYS_SAFE.some(pattern => pattern.test(matchText))) {
        continue;
      }
      
      // Check surrounding context (50 chars before and after)
      const start = Math.max(0, match.index - 50);
      const end = Math.min(content.length, match.index + matchText.length + 50);
      const context = content.substring(start, end);
      
      // Skip if it's in an attribute or prop
      if (context.match(/(?:className|style|placeholder|title|alt|aria-|data-|href|src|id|key|value)=\s*\{/)) {
        continue;
      }
      
      // Skip if it's in a component prop pattern
      if (context.match(/<[A-Z][a-zA-Z]*\s+[a-zA-Z]+=\{/) && 
          !context.includes('dangerouslySetInnerHTML')) {
        continue;
      }
      
      // It's a potential issue
      issues.push({
        text: matchText,
        context: context
      });
      
      results.potentialIssues++;
    }
    
    if (issues.length > 0) {
      const relativePath = path.relative(process.cwd(), filePath);
      results.issuesByFile[relativePath] = {
        issues,
        sanitizeCount
      };
    }
  } catch (err) {
    console.error(`Error checking file ${filePath}:`, err);
  }
}

/**
 * Main script execution
 */
function main() {
  console.log('Scanning for critical HTML entity encoding issues...');
  
  // Find all files
  const clientFiles = walkDirectory(CLIENT_SRC);
  results.totalFiles = clientFiles.length;
  
  // Check each file
  clientFiles.forEach(checkFile);
  
  // Output results
  console.log('\n===== HTML Entity Encoding Issues Report =====\n');
  console.log(`Total Files: ${results.totalFiles}`);
  console.log(`Files Checked: ${results.checkedFiles}`);
  console.log(`Files Skipped (Already Sanitized): ${results.skippedFiles}`);
  console.log(`Files Ignored (Non-Rendering): ${results.ignoredFiles}`);
  console.log(`Potential Issues Found: ${results.potentialIssues}`);
  
  // Sort files by number of issues
  const suspiciousFiles = Object.entries(results.issuesByFile)
    .sort((a, b) => b[1].issues.length - a[1].issues.length);
  
  if (suspiciousFiles.length > 0) {
    console.log('\n=== Most Suspicious Files ===\n');
    
    for (const [file, data] of suspiciousFiles) {
      console.log(`📄 ${file} - ${data.issues.length} potential issues`);
      
      // Show just the first 3 issues maximum
      data.issues.slice(0, 3).forEach((issue, idx) => {
        console.log(`  • Issue ${idx+1}:`);
        console.log(`    ${issue.text}`);
        console.log(`    Context: "${issue.context.trim().replace(/\s+/g, ' ')}"`);
      });
      
      if (data.issues.length > 3) {
        console.log(`  • ... and ${data.issues.length - 3} more issues`);
      }
      
      if (data.sanitizeCount > 0) {
        console.log(`  ℹ️ File already uses sanitizeText ${data.sanitizeCount} times`);
      }
      
      console.log('');
    }
    
    console.log('\n=== Recommended Fix ===\n');
    console.log('For each issue, wrap the dynamic content in sanitizeText():');
    console.log('Before: <p>{user.description}</p>');
    console.log('After:  <p>{sanitizeText(user.description)}</p>');
  } else {
    console.log('\n✅ Great news! No suspicious files found that need further attention.\n');
  }
}

main();