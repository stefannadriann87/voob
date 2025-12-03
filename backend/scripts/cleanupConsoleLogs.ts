import * as fs from "fs";
import * as path from "path";

/**
 * Script pentru a curăța console.log din proiect
 * 
 * Acțiuni:
 * 1. Înlocuiește console.error cu logger.error în backend
 * 2. Înlocuiește console.warn cu logger.warn în backend
 * 3. Șterge console.log de debugging
 * 4. Adaugă import pentru logger unde lipsește
 */

const BACKEND_SRC = path.join(__dirname, "../src");
const FRONTEND_SRC = path.join(__dirname, "../../frontend/src");

interface FileStats {
  file: string;
  consoleLogs: number;
  consoleErrors: number;
  consoleWarns: number;
  replaced: number;
  removed: number;
}

const stats: FileStats[] = [];

function processFile(filePath: string, isBackend: boolean): void {
  const content = fs.readFileSync(filePath, "utf-8");
  let newContent = content;
  let replaced = 0;
  let removed = 0;
  let hasLoggerImport = content.includes('require("../lib/logger")') || 
                        content.includes("from '../lib/logger'") ||
                        content.includes('require("../../lib/logger")') ||
                        content.includes("from '../../lib/logger'");

  // Count occurrences
  const consoleLogMatches = content.match(/console\.log\(/g);
  const consoleErrorMatches = content.match(/console\.error\(/g);
  const consoleWarnMatches = content.match(/console\.warn\(/g);

  const consoleLogs = consoleLogMatches ? consoleLogMatches.length : 0;
  const consoleErrors = consoleErrorMatches ? consoleErrorMatches.length : 0;
  const consoleWarns = consoleWarnMatches ? consoleWarnMatches.length : 0;

  if (consoleLogs === 0 && consoleErrors === 0 && consoleWarns === 0) {
    return; // Skip files without console statements
  }

  if (isBackend) {
    // Backend: Replace console.error with logger.error
    if (consoleErrors > 0) {
      // Add logger import if missing
      if (!hasLoggerImport) {
        // Try to find a good place to add the import
        const importMatch = content.match(/^(const|import).*require\(/m);
        if (importMatch) {
          const lastImportIndex = content.lastIndexOf("require(");
          const lastImportLine = content.substring(0, lastImportIndex).split("\n").length;
          const lines = content.split("\n");
          
          // Find the last require statement
          let insertIndex = 0;
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].includes("require(")) {
              insertIndex = i + 1;
              break;
            }
          }
          
          // Calculate relative path to logger
          const relativePath = path.relative(
            path.dirname(filePath),
            path.join(BACKEND_SRC, "lib", "logger")
          ).replace(/\\/g, "/");
          
          const loggerImport = `const { logger } = require("${relativePath.startsWith(".") ? relativePath : "./" + relativePath}");`;
          lines.splice(insertIndex, 0, loggerImport);
          newContent = lines.join("\n");
          hasLoggerImport = true;
        }
      }

      // Replace console.error with logger.error
      newContent = newContent.replace(
        /console\.error\(/g,
        "logger.error("
      );
      replaced += consoleErrors;
    }

    // Backend: Replace console.warn with logger.warn
    if (consoleWarns > 0) {
      if (!hasLoggerImport) {
        // Same import logic as above
        const lines = newContent.split("\n");
        let insertIndex = 0;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].includes("require(")) {
            insertIndex = i + 1;
            break;
          }
        }
        
        const relativePath = path.relative(
          path.dirname(filePath),
          path.join(BACKEND_SRC, "lib", "logger")
        ).replace(/\\/g, "/");
        
        const loggerImport = `const { logger } = require("${relativePath.startsWith(".") ? relativePath : "./" + relativePath}");`;
        lines.splice(insertIndex, 0, loggerImport);
        newContent = lines.join("\n");
      }

      newContent = newContent.replace(
        /console\.warn\(/g,
        "logger.warn("
      );
      replaced += consoleWarns;
    }

    // Backend: Remove console.log (debugging)
    if (consoleLogs > 0) {
      // Remove entire lines with console.log (simple cases)
      const lines = newContent.split("\n");
      const filteredLines = lines.filter((line) => {
        const trimmed = line.trim();
        // Keep console.log if it's in a comment or part of a complex expression
        if (trimmed.includes("console.log(") && !trimmed.startsWith("//")) {
          // Check if it's a standalone statement
          if (trimmed.startsWith("console.log(") || trimmed.match(/^\s+console\.log\(/)) {
            removed++;
            return false;
          }
        }
        return true;
      });
      newContent = filteredLines.join("\n");
    }
  } else {
    // Frontend: Remove console.log (debugging), keep console.error
    if (consoleLogs > 0) {
      const lines = newContent.split("\n");
      const filteredLines = lines.filter((line) => {
        const trimmed = line.trim();
        if (trimmed.includes("console.log(") && !trimmed.startsWith("//")) {
          if (trimmed.startsWith("console.log(") || trimmed.match(/^\s+console\.log\(/)) {
            removed++;
            return false;
          }
        }
        return true;
      });
      newContent = filteredLines.join("\n");
    }
    // Keep console.error in frontend for now
  }

  // Only write if content changed
  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, "utf-8");
    stats.push({
      file: path.relative(process.cwd(), filePath),
      consoleLogs,
      consoleErrors,
      consoleWarns,
      replaced,
      removed,
    });
  }
}

function processDirectory(dir: string, isBackend: boolean): void {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules, .next, dist, etc.
      if (
        !file.startsWith(".") &&
        file !== "node_modules" &&
        file !== ".next" &&
        file !== "dist"
      ) {
        processDirectory(filePath, isBackend);
      }
    } else if (
      (file.endsWith(".ts") || file.endsWith(".tsx")) &&
      !file.endsWith(".d.ts") &&
      !file.includes(".test.") &&
      !file.includes(".spec.")
    ) {
      processFile(filePath, isBackend);
    }
  }
}

console.log("🧹 Curățare console.log din proiect...\n");

// Process backend
console.log("📦 Backend:");
processDirectory(BACKEND_SRC, true);

// Process frontend
console.log("📦 Frontend:");
processDirectory(FRONTEND_SRC, false);

// Print stats
console.log("\n📊 Rezumat:");
if (stats.length === 0) {
  console.log("✅ Nu s-au găsit console.log de curățat!");
} else {
  console.table(stats);
  const totalReplaced = stats.reduce((sum, s) => sum + s.replaced, 0);
  const totalRemoved = stats.reduce((sum, s) => sum + s.removed, 0);
  console.log(`\n✅ Înlocuite: ${totalReplaced}`);
  console.log(`🗑️  Șterse: ${totalRemoved}`);
  console.log(`📁 Fișiere modificate: ${stats.length}`);
}

console.log("\n✅ Curățare completată!");

