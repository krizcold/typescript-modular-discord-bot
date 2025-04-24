// scripts/exportContext.js
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const outputFileName = 'contextExport.txt';
const srcDir = 'src';
const rootFilesToInclude = [
    'package.json',
    'Dockerfile', // Assuming this exists
    'docker-compose.yml',
    'start.sh' // Assuming this exists
    // README.md will be handled separately
];
const excludedDirs = ['node_modules', 'dist', '.git', 'scripts']; // Directories to always exclude
const optionalDirs = ['commands', 'events']; // Directories to potentially include

// --- Helper Functions ---

/**
 * Recursively gets all file paths within a directory, respecting exclusions.
 * @param {string} dirPath The directory path to scan.
 * @param {string[]} currentExcludedDirs The list of directories to exclude in this run.
 * @returns {string[]} An array of full file paths.
 */
function getAllFilesRecursive(dirPath, currentExcludedDirs) {
    let files = [];
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Skip excluded directories
                if (currentExcludedDirs.includes(entry.name)) {
                    continue;
                }
                // Recursively get files from subdirectories
                files = files.concat(getAllFilesRecursive(fullPath, currentExcludedDirs));
            } else if (entry.isFile()) {
                // Add file path (consider adding file type filters if needed, e.g., .ts, .js)
                 if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) { // Only include TS/JS files from src
                    files.push(fullPath);
                 }
            }
        }
    } catch (error) {
        console.warn(`Warning: Could not read directory ${dirPath}. Skipping. Error: ${error.message}`);
    }
    return files;
}

/**
 * Reads the content of a file safely.
 * @param {string} filePath The path to the file.
 * @returns {string | null} The file content or null if reading fails.
 */
function readFileContent(filePath) {
    try {
        // Ensure the file exists before reading
        if (fs.existsSync(filePath)) {
             return fs.readFileSync(filePath, 'utf-8');
        } else {
            console.warn(`Warning: File not found: ${filePath}. Skipping.`);
            return null;
        }
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
}

// --- Main Script Logic ---

async function exportContext() {
    console.log('Starting context export...');

    // Determine if optional directories should be included by checking for '--all' flag
    const includeOptional = process.argv.includes('--all');
    console.log(`Including optional directories ('${optionalDirs.join(', ')}'): ${includeOptional}`);

    let outputContent = '';

    // 1. Add App Description from package.json
    const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
    const packageJsonContent = readFileContent(packageJsonPath);
    if (packageJsonContent) {
        try {
            const packageData = JSON.parse(packageJsonContent);
            outputContent += `App Description: ${packageData.description || 'No description found.'}\n\n`;
        } catch (e) {
            console.error("Error parsing package.json:", e);
            outputContent += "App Description: Error parsing package.json\n\n";
        }
    } else {
         outputContent += "App Description: package.json not found.\n\n";
    }

    // 2. Add README.md content
    console.log('Processing README.md...');
    const readmePath = path.resolve(__dirname, '..', 'README.md');
    const readmeContent = readFileContent(readmePath);
    if (readmeContent !== null) {
        const relativePath = path.relative(path.resolve(__dirname, '..'), readmePath);
        const posixPath = relativePath.split(path.sep).join(path.posix.sep); // Use POSIX separators
        outputContent += `${posixPath}:\n${readmeContent}\n\n`;
        console.log(`  Added: ${posixPath}`);
    }


    // 3. Process Other Root Files (excluding README.md again)
    console.log('Processing other root files...');
    for (const fileName of rootFilesToInclude) {
        // Skip README if it was accidentally left in the array
        if (fileName.toLowerCase() === 'readme.md') continue;

        const filePath = path.resolve(__dirname, '..', fileName);
        const content = readFileContent(filePath);
        if (content !== null) {
            // Use relative path for display
            const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
            const posixPath = relativePath.split(path.sep).join(path.posix.sep); // Use POSIX separators
            outputContent += `${posixPath}:\n${content}\n\n`;
            console.log(`  Added: ${posixPath}`);
        }
    }

    // 4. Process 'src' Directory
    console.log(`Processing '${srcDir}' directory...`);
    const srcPath = path.resolve(__dirname, '..', srcDir);
    let currentExcluded = [...excludedDirs];
    if (!includeOptional) {
        // If --all flag is NOT present, exclude the optional directories
        currentExcluded = currentExcluded.concat(optionalDirs);
    } else {
         console.log(`Including content from: ${optionalDirs.join(', ')}`);
    }


    const srcFiles = getAllFilesRecursive(srcPath, currentExcluded);

    for (const filePath of srcFiles) {
         const content = readFileContent(filePath);
         if (content !== null) {
            // Use relative path for display
            const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
            // Use POSIX separators for consistency
            const posixPath = relativePath.split(path.sep).join(path.posix.sep);
            outputContent += `${posixPath}:\n${content}\n\n`;
            console.log(`  Added: ${posixPath}`);
         }
    }

    // 5. Write to Output File
    const outputFilePath = path.resolve(__dirname, '..', outputFileName);
    try {
        // Trim trailing newlines before writing
        fs.writeFileSync(outputFilePath, outputContent.trimEnd(), 'utf-8');
        console.log(`\nContext successfully exported to: ${outputFilePath}`);
    } catch (error) {
        console.error(`\nError writing output file ${outputFileName}:`, error);
    }
}

// --- Run the script ---
exportContext();

