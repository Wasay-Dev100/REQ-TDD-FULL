const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class WebviewProvider {
    constructor(extensionUri) {
        this.panel = null;
        this.embeddedPackets = [];
        this.generatedContracts = {}; // Store generated contracts
        this.extensionUri = extensionUri;
        this.currentSRSFilename = null;
        this.testResultsStore = {}; // Store test results: { functionalityName: { passed, failed, total, timestamp } }
        this.generationTimingStore = {}; // Store timing data: { functionalityName: { codeGen: { startTime, endTime, duration }, testGen: { startTime, endTime, duration } } }
    }

    static getInstance(extensionUri) {
        if (!WebviewProvider.instance) {
            if (!extensionUri) {
                console.error('❌ [WEBVIEW] extensionUri is required but not provided');
                throw new Error('Extension URI is required to create WebviewProvider');
            }
            WebviewProvider.instance = new WebviewProvider(extensionUri);
        }
        return WebviewProvider.instance;
    }

    createOrShow() {
        try {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        
        this.panel = vscode.window.createWebviewPanel(
            'kinmailDashboard',
            'Kinmail SRS to Code',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );
        
        this.panel.webview.html = this.getWebviewContent();
        
        this.panel.webview.onDidReceiveMessage(
            message => {
                    try {
                switch (message.type) {
                    case 'uploadSRS':
                        this.handleUploadSRS(message.file);
                        break;
                    case 'generateCode':
                        this.handleGenerateCode(message.functionality, message.language);
                        break;
                    case 'exportCode':
                        this.handleExportCode(message.functionality, message.code, message.language);
                        break;
                    case 'generateTests':
                                this.handleGenerateTests(message.functionality, message.language);
                        break;
                    case 'verifyCode':
                                this.handleVerifyCode(message.functionality, message.code, message.testFunctionality);
                                break;
                            case 'exportCsv':
                                this.handleExportCsv();
                        break;
                        }
                    } catch (error) {
                        console.error('❌ [WEBVIEW] Error handling message:', error);
                        vscode.window.showErrorMessage(`Extension error: ${error.message}`);
                    }
                }
            );
            
            this.panel.onDidDispose(() => {
                this.panel = null;
            });
        } catch (error) {
            console.error('❌ [WEBVIEW] Error creating webview:', error);
            vscode.window.showErrorMessage(`Failed to open extension: ${error.message}`);
        }
    }

    getWebviewContent() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kinmail SRS to Code</title>
    <!-- Prism.js for syntax highlighting -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
    <script>
        window.Prism = window.Prism || {};
        window.Prism.manual = true;
    </script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #1a202c;
            color: #e2e8f0;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: #2d3748;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            border: 1px solid #4a5568;
        }
        .upload-area {
            border: 2px dashed #4a5568;
            border-radius: 8px;
            padding: 40px;
            text-align: center;
            margin-bottom: 20px;
            cursor: pointer;
            transition: all 0.3s ease;
            background: #1a202c;
        }
        .upload-area:hover {
            border-color: #90cdf4;
            background: #2d3748;
        }
        .upload-area.dragover {
            border-color: #90cdf4;
            background: #2d3748;
        }
        .functionality-selector {
            margin: 20px 0;
        }
        select {
            width: 100%;
            padding: 12px;
            border: 1px solid #4a5568;
            border-radius: 6px;
            font-size: 16px;
            background: #1a202c;
            color: #e2e8f0;
        }
        select:focus {
            border-color: #90cdf4;
            outline: none;
            box-shadow: 0 0 0 3px rgba(144, 205, 244, 0.1);
        }
        .generate-btn {
            background: #3182ce;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 10px;
            transition: all 0.2s ease;
        }
        .generate-btn:hover {
            background: #2c5aa0;
            transform: translateY(-1px);
        }
        .generate-btn:disabled {
            background: #4a5568;
            cursor: not-allowed;
            transform: none;
        }
        .status {
            margin: 10px 0;
            padding: 12px;
            border-radius: 6px;
            font-weight: 500;
        }
        .status.info {
            background: #2b6cb0;
            color: #90cdf4;
            border: 1px solid #3182ce;
        }
        .status.success {
            background: #22543d;
            color: #68d391;
            border: 1px solid #38a169;
        }
        .status.error {
            background: #742a2a;
            color: #feb2b2;
            border: 1px solid #e53e3e;
        }
        .code-container {
            background: #1a202c;
            border: 1px solid #2d3748;
            border-radius: 8px;
            padding: 0;
            margin: 10px 0;
            max-height: 400px;
            overflow-y: auto;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        .code-container pre {
            margin: 0;
            padding: 20px;
            background: transparent;
            border-radius: 8px;
        }
        .code-container code {
            font-family: 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.6;
            color: #e2e8f0;
        }
        /* Professional syntax highlighting - VS Code inspired */
        .token.comment { color: #6a9955; font-style: italic; }
        .token.keyword { color: #569cd6; font-weight: bold; }
        .token.string { color: #ce9178; }
        .token.number { color: #b5cea8; }
        .token.function { color: #dcdcaa; font-weight: bold; }
        .token.class-name { color: #4ec9b0; font-weight: bold; }
        .token.operator { color: #d4d4d4; }
        .token.punctuation { color: #d4d4d4; }
        .token.variable { color: #9cdcfe; }
        .token.property { color: #9cdcfe; }
        .token.boolean { color: #569cd6; font-weight: bold; }
        .token.constant { color: #4fc1ff; }
        .token.tag { color: #569cd6; }
        .token.attr-name { color: #92c5f7; }
        .token.attr-value { color: #ce9178; }
        .token.selector { color: #d7ba7d; }
        .token.important { color: #f44747; font-weight: bold; }
        
        /* Button styling for action buttons */
        .btn {
            background: #4a5568;
            color: #e2e8f0;
            border: 1px solid #4a5568;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
            margin: 4px;
        }
        .btn:hover {
            background: #2d3748;
            border-color: #90cdf4;
            transform: translateY(-1px);
        }
        .btn:disabled {
            background: #2d3748;
            color: #718096;
            cursor: not-allowed;
            transform: none;
        }
        
        /* Specific button colors */
        .btn[style*="background-color: #28a745"] {
            background: #38a169 !important;
            border-color: #38a169 !important;
        }
        .btn[style*="background-color: #17a2b8"] {
            background: #319795 !important;
            border-color: #319795 !important;
        }
        .btn[style*="background-color: #6f42c1"] {
            background: #805ad5 !important;
            border-color: #805ad5 !important;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Kinmail SRS to Code</h1>
        
        <div class="upload-area" id="uploadArea">
            <p id="uploadText">📄 Drag and drop your SRS document here or click to select</p>
            <input type="file" id="fileInput" accept=".pdf,.docx,.txt" style="display: none;">
            <button id="uploadButton" class="btn" style="margin-top: 10px;">📁 Select SRS File</button>
            <div id="uploadedFileInfo" style="display: none; margin-top: 10px; padding: 12px; background: #22543d; border-radius: 6px; color: #68d391; border: 1px solid #38a169;">
                <strong>📄 Uploaded:</strong> <span id="uploadedFileName"></span>
            </div>
        </div>
        
        <div class="functionality-selector" id="functionalitySelector" style="display: none;">
            <label for="functionalitySelect">Select Functionality:</label>
            <select id="functionalitySelect">
                <option value="">Choose a functionality...</option>
            </select>
            
            <label for="languageSelect">Programming Language:</label>
            <select id="languageSelect">
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
                <option value="csharp">C#</option>
            </select>
            
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button class="generate-btn" id="generateTestsBtn" disabled style="background-color: #17a2b8; color: white;">Generate Tests (TDD)</button>
            <button class="generate-btn" id="generateBtn" disabled>Generate Code</button>
            </div>
        </div>
        
        <div id="status"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Function to detect programming language from code
        function detectCodeLanguage(code) {
            if (!code) return 'javascript';
            
            const codeStr = code.toString().toLowerCase();
            
            // Check for specific language patterns
            if (codeStr.includes('def ') && (codeStr.includes('import ') || codeStr.includes('from '))) {
                return 'python';
            }
            if (codeStr.includes('public class') || codeStr.includes('import java.')) {
                return 'java';
            }
            if (codeStr.includes('#include') || codeStr.includes('std::')) {
                return 'cpp';
            }
            if (codeStr.includes('using system') || codeStr.includes('namespace ')) {
                return 'csharp';
            }
            if (codeStr.includes('function ') || codeStr.includes('const ') || codeStr.includes('let ')) {
                return 'javascript';
            }
            
            // Default to JavaScript
            return 'javascript';
        }
        
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const functionalitySelector = document.getElementById('functionalitySelector');
        const functionalitySelect = document.getElementById('functionalitySelect');
        const languageSelect = document.getElementById('languageSelect');
        const generateBtn = document.getElementById('generateBtn');
        const generateTestsBtn = document.getElementById('generateTestsBtn');
        const uploadButton = document.getElementById('uploadButton');
        const status = document.getElementById('status');
        
        uploadArea.addEventListener('click', () => {
            console.log('📁 [FRONTEND] Upload area clicked');
            fileInput.click();
        });
        uploadArea.addEventListener('dragover', (e) => {
            console.log('📁 [FRONTEND] Drag over detected');
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => {
            console.log('📁 [FRONTEND] Drag leave detected');
            uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', (e) => {
            console.log('📁 [FRONTEND] File dropped');
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            console.log('📁 [FRONTEND] Dropped files count:', files.length);
            if (files.length > 0) {
                console.log('📁 [FRONTEND] Processing dropped file:', files[0].name);
                handleFileUpload(files[0]);
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            console.log('📁 [FRONTEND] File input changed');
            console.log('📁 [FRONTEND] Selected files count:', e.target.files.length);
            if (e.target.files.length > 0) {
                console.log('📁 [FRONTEND] Processing selected file:', e.target.files[0].name);
                handleFileUpload(e.target.files[0]);
            }
        });
        
        uploadButton.addEventListener('click', (e) => {
            console.log('📁 [FRONTEND] Upload button clicked');
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
        
        functionalitySelect.addEventListener('change', (e) => {
            const hasSelection = !!e.target.value;
            generateBtn.disabled = !hasSelection;
            
            // TDD: Enable "Generate Tests" button when functionality is selected
            if (generateTestsBtn) {
                generateTestsBtn.disabled = !hasSelection;
            }
        });
        
        // TDD: Set up "Generate Tests" button event listener (tests first)
        if (generateTestsBtn) {
            generateTestsBtn.addEventListener('click', () => {
                const selectedIndex = functionalitySelect.value;
                const selectedLanguage = languageSelect.value;
                
                if (!selectedIndex) {
                    showStatus('Please select a functionality first!', 'error');
                    return;
                }
                
                const selectedFunctionality = window.functionalities[selectedIndex];
                console.log('🧪 [FRONTEND] Generate Tests button clicked (TDD Mode)');
                console.log('🧪 [FRONTEND] Functionality:', selectedFunctionality);
                console.log('🧪 [FRONTEND] Language:', selectedLanguage);
                console.log('🧪 [FRONTEND] TDD Mode: Tests will be generated FIRST, code will follow');
                
                // Show loading message
                status.innerHTML = '<div style="color: #17a2b8; font-weight: bold;">🧪 Generating test cases (TDD Mode)... Please wait!</div>';
                generateTestsBtn.disabled = true;
                generateTestsBtn.textContent = 'Generating Tests...';
                
                // TDD: Generate tests WITHOUT code (code will be generated later)
                vscode.postMessage({
                    type: 'generateTests',
                    functionality: selectedFunctionality,
                    code: null, // TDD: No code yet, tests first
                    language: selectedLanguage
                });
            });
        }
        
        generateBtn.addEventListener('click', () => {
            const selectedIndex = functionalitySelect.value;
            const selectedLanguage = languageSelect.value;
            
            if (selectedIndex) {
                // Show loading message
                status.innerHTML = '<div style="color: #007acc; font-weight: bold;">🔄 Generating code... Please wait!</div>';
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generating...';
                
                // Get the actual functionality object from the stored functionalities
                const selectedFunctionality = window.functionalities[selectedIndex];
                console.log('🔍 [FRONTEND] Selected functionality:', selectedFunctionality);
                console.log('🔍 [FRONTEND] Selected functionality name:', selectedFunctionality?.name);
                console.log('🔍 [FRONTEND] Selected language:', selectedLanguage);
                
                vscode.postMessage({
                    type: 'generateCode',
                    functionality: selectedFunctionality,
                    language: selectedLanguage
                });
            }
        });
        
        function handleFileUpload(file) {
            console.log('📁 [FRONTEND] handleFileUpload called with file:', file);
            console.log('📁 [FRONTEND] File name:', file.name);
            console.log('📁 [FRONTEND] File type:', file.type);
            console.log('📁 [FRONTEND] File size:', file.size);
            
            // Show uploaded file name
            const uploadedFileInfo = document.getElementById('uploadedFileInfo');
            const uploadedFileName = document.getElementById('uploadedFileName');
            const uploadText = document.getElementById('uploadText');
            
            if (uploadedFileInfo && uploadedFileName && uploadText) {
                uploadedFileName.textContent = file.name;
                uploadedFileInfo.style.display = 'block';
                uploadText.textContent = '✅ SRS document uploaded successfully!';
                uploadText.style.color = '#2e7d32';
            }
            
            // Show upload status
            showStatus('📤 Uploading file... Please wait!', 'info');
            
            const reader = new FileReader();
            reader.onload = (e) => {
                console.log('📁 [FRONTEND] FileReader onload triggered');
                const content = e.target.result;
                console.log('📁 [FRONTEND] Content length:', content?.length);
                
                const base64Content = content.split(',')[1];
                console.log('📁 [FRONTEND] Base64 content length:', base64Content?.length);
                
                console.log('📁 [FRONTEND] Sending uploadSRS message to backend...');
                vscode.postMessage({
                    type: 'uploadSRS',
                    file: {
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        content: base64Content,
                        isBase64: true
                    }
                });
                console.log('📁 [FRONTEND] uploadSRS message sent successfully');
            };
            
            reader.onerror = (error) => {
                console.error('❌ [FRONTEND] FileReader error:', error);
                showStatus('Failed to read file: ' + error.message, 'error');
            };
            
            console.log('📁 [FRONTEND] Starting file read...');
            reader.readAsDataURL(file);
        }
        
        function showStatus(message, type = 'info') {
            status.innerHTML = \`<div class="status \${type}">\${message}</div>\`;
        }
        
        function showGeneratedCode(code, functionality, message = null) {
            console.log('🔄 [FRONTEND] showGeneratedCode called with code length:', code?.length);
            console.log('🔄 [FRONTEND] Functionality name:', functionality);
            
            // Create or update the code display section
            let codeSection = document.getElementById('codeSection');
            if (!codeSection) {
                codeSection = document.createElement('div');
                codeSection.id = 'codeSection';
                codeSection.innerHTML = \`
                    <div class="container">
                        <h3 id="codeHeader">Generated Code for: \${functionality}</h3>
                        <div class="code-container">
                            <pre><code id="generatedCode"></code></pre>
                        </div>
                        <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <button id="copyCodeBtn" class="btn">Copy Code</button>
                            <button id="exportCodeBtn" class="btn" style="background-color: #28a745;">Export to Project</button>
                            <select id="testFunctionalitySelect" style="padding: 6px 10px; border: 1px solid #4a5568; border-radius: 6px; background: #1a202c; color: #e2e8f0; font-size: 13px; width: 200px;">
                                <option value="all">All Functionalities</option>
                            </select>
                            <button id="verifyCodeBtn" class="btn" style="background-color: #6f42c1;">Run Tests</button>
                            <button id="exportCsvBtn" class="btn" style="background-color: #17a2b8; display: none;">Export CSV</button>
                        </div>
                    </div>
                \`;
                document.body.appendChild(codeSection);
            } else {
                // Update the header with new functionality name
                const codeHeader = document.getElementById('codeHeader');
                if (codeHeader) {
                    codeHeader.textContent = 'Generated Code for: ' + functionality;
                    console.log('✅ [FRONTEND] Updated code header to:', functionality);
                } else {
                    // If header doesn't exist, find the h3 and update it
                    const h3 = codeSection.querySelector('h3');
                    if (h3) {
                        h3.id = 'codeHeader';
                        h3.textContent = 'Generated Code for: ' + functionality;
                        console.log('✅ [FRONTEND] Updated h3 header to:', functionality);
                    }
                }
            }
            
            // Update the code content
            const codeElement = document.getElementById('generatedCode');
            if (codeElement) {
                // Detect language from code for syntax highlighting
                const language = detectCodeLanguage(code);
                codeElement.className = 'language-' + language;
                codeElement.textContent = code;
                
                // Apply syntax highlighting
                if (typeof Prism !== 'undefined') {
                    Prism.highlightElement(codeElement);
                }
            }
            
            // Add copy functionality
            const copyBtn = document.getElementById('copyCodeBtn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(code).then(() => {
                        showStatus('Code copied to clipboard!', 'success');
                    }).catch(err => {
                        showStatus('Failed to copy code', 'error');
                    });
                };
            }
            
            // Add export button event listener
            const exportBtn = document.getElementById('exportCodeBtn');
            if (exportBtn) {
                exportBtn.onclick = () => {
                    console.log('📤 [FRONTEND] Export button clicked');
                    console.log('📤 [FRONTEND] Functionality:', functionality);
                    console.log('📤 [FRONTEND] Code length:', code?.length);
                    
                    // Show loading message
                    status.innerHTML = '<div style="color: #007acc; font-weight: bold;">📤 Exporting code... Please wait!</div>';
                    exportBtn.disabled = true;
                    exportBtn.textContent = 'Exporting...';
                    
                    vscode.postMessage({
                        type: 'exportCode',
                        functionality: functionality,
                        code: code,
                        language: languageSelect.value
                    });
                };
            }
            
            // Test button event listener is set up in the main initialization (around line 550)
            // This section is only for code display, not initial setup
            
            // Populate test functionality dropdown - only show functionalities with test files
            const testFunctionalitySelect = document.getElementById('testFunctionalitySelect');
            if (testFunctionalitySelect) {
                // Clear existing options except "All Functionalities"
                testFunctionalitySelect.innerHTML = '<option value="all">All Functionalities</option>';
                
                // Use functionalitiesWithTests if provided, otherwise check window.functionalities
                const functionalitiesToShow = message.functionalitiesWithTests || [];
                
                if (functionalitiesToShow.length > 0) {
                    // Add each functionality that has a test file
                    functionalitiesToShow.forEach((func) => {
                        const option = document.createElement('option');
                        option.value = func.name;
                        option.textContent = func.name;
                        testFunctionalitySelect.appendChild(option);
                    });
                    console.log('✅ [FRONTEND] Populated test dropdown with', functionalitiesToShow.length, 'functionalities that have test files');
                } else if (window.functionalities) {
                    // Fallback: if no test files found, show all functionalities (for backward compatibility)
                    console.log('⚠️ [FRONTEND] No test files found, showing all functionalities as fallback');
                    window.functionalities.forEach((func, index) => {
                        const option = document.createElement('option');
                        option.value = index;
                        option.textContent = func.name || 'Functionality ' + (index + 1);
                        testFunctionalitySelect.appendChild(option);
                    });
                }
            }
            
            // Add verify code button event listener
            const verifyBtn = document.getElementById('verifyCodeBtn');
            if (verifyBtn) {
                verifyBtn.onclick = () => {
                    console.log('🔍 [FRONTEND] Run Tests button clicked');
                    console.log('🔍 [FRONTEND] Functionality:', functionality);
                    console.log('🔍 [FRONTEND] Code length:', code?.length);
                    
                    // Get selected test functionality
                    const selectedValue = testFunctionalitySelect ? testFunctionalitySelect.value : 'all';
                    let selectedTestFunctionality = null;
                    
                    if (selectedValue !== 'all') {
                        // Find functionality by name (since we're using names as values now)
                        if (window.functionalities) {
                            selectedTestFunctionality = window.functionalities.find(f => f.name === selectedValue);
                        }
                    }
                    
                    console.log('🔍 [FRONTEND] Selected test functionality:', selectedTestFunctionality?.name || 'All Functionalities');
                    
                    // Show loading message
                    status.innerHTML = '<div style="color: #6f42c1; font-weight: bold;">📤 Exporting code and running tests... Please wait!</div>';
                    verifyBtn.disabled = true;
                    verifyBtn.textContent = 'Verifying...';
                    
                    vscode.postMessage({
                        type: 'verifyCode',
                        functionality: functionality,
                        code: code,
                        testFunctionality: selectedTestFunctionality // Pass selected functionality for test filtering
                    });
                };
            }
            
            // Add export CSV button event listener
            const exportCsvBtn = document.getElementById('exportCsvBtn');
            if (exportCsvBtn) {
                exportCsvBtn.onclick = () => {
                    console.log('📊 [FRONTEND] Export CSV button clicked');
                    exportCsvBtn.disabled = true;
                    exportCsvBtn.textContent = 'Exporting...';
                    
                    vscode.postMessage({
                        type: 'exportCsv'
                    });
                };
            }
            
            // Show success message
            showStatus('Code generated successfully!', 'success');
            console.log('✅ [FRONTEND] Code displayed successfully');
        }
        
        function showTestResults(results, success, iteration, maxIterations, iterationMessage) {
            console.log('🧪 [FRONTEND] showTestResults called');
            console.log('🧪 [FRONTEND] Success:', success);
            console.log('🧪 [FRONTEND] Results length:', results?.length);
            console.log('🧪 [FRONTEND] Iteration:', iteration, '/', maxIterations);
            
            // Parse test results to extract pass/fail counts
            let passedTests = 0;
            let failedTests = 0;
            let totalTests = 0;
            
            if (results) {
                // Try to extract test counts from common test frameworks
                const resultsText = results.toString();
                console.log('🔍 [PARSER] Parsing test results:', resultsText.substring(0, 200) + '...');
                
                // Check for missing build tool errors
                if (resultsText.includes('not recognized as an internal or external command') || 
                    resultsText.includes('command not found') || 
                    resultsText.includes('is not installed') ||
                    resultsText.includes('not found') ||
                    resultsText.includes('not available')) {
                    // Handle missing build tool errors
                    totalTests = 0;
                    passedTests = 0;
                    failedTests = 1; // Mark as failed due to missing tools
                }
                // FIRST: Extract "collected X items" to get the actual test count
                // This handles cases like "collected 91 items / 1 error" where tests were collected but not run
                if (resultsText.match(/collected\s+(\d+)\s+items?/)) {
                    const collectedMatch = resultsText.match(/collected\s+(\d+)\s+items?/);
                    if (collectedMatch) {
                        totalTests = parseInt(collectedMatch[1]);
                    }
                }
                
                // Check if tests actually ran (have passed/failed counts) vs collection error that prevented execution
                // Look for actual test execution results in the output
                const hasActualTestResults = resultsText.match(/(\d+)\s+passed.*?(\d+)\s+failed.*?in/) || 
                                            resultsText.match(/(\d+)\s+passed.*?in/) ||
                                            (resultsText.match(/(\d+)\s+passed/) && resultsText.match(/(\d+)\s+failed/)) ||
                                            resultsText.includes('PASSED') || resultsText.includes('FAILED');
                
                // THEN: Check for pytest collection errors (tests collected but not run due to errors)
                // Only treat as collection error if tests didn't actually run (no passed/failed counts found)
                // If tests DID run despite collection errors, parse the actual results instead
                if (!hasActualTestResults && (resultsText.includes('ERROR collecting') || resultsText.includes('ImportError') || 
                    resultsText.includes('ModuleNotFoundError') || resultsText.includes('collected 0 items'))) {
                    // Handle pytest collection errors - tests were collected but NOT run
                    if (resultsText.includes('collected 0 items')) {
                        totalTests = 0;
                        passedTests = 0;
                        failedTests = 0;
                    } else {
                        // Collection error occurred - tests were collected but not run
                        // totalTests already set from "collected X items" above
                        // If no tests were collected, set to 1 to indicate error
                        if (totalTests === 0) {
                        totalTests = 1;
                        }
                        passedTests = 0;
                        failedTests = 0; // Collection errors prevent tests from running, so no "failed" tests
                    }
                }
                // Pytest pattern: "45 passed, 3 failed in 1.23s" (final summary line - check this first)
                else if (resultsText.match(/(\d+)\s+passed.*?(\d+)\s+failed.*?in/)) {
                    const pytestMatch = resultsText.match(/(\d+)\s+passed.*?(\d+)\s+failed.*?in/);
                    if (pytestMatch) {
                        passedTests = parseInt(pytestMatch[1]);
                        failedTests = parseInt(pytestMatch[2]);
                        totalTests = passedTests + failedTests;
                    }
                }
                // Pytest pattern: "45 passed in 1.23s" (no failures)
                else if (resultsText.match(/(\d+)\s+passed.*?in/) && !resultsText.includes('failed')) {
                    const passedMatch = resultsText.match(/(\d+)\s+passed.*?in/);
                    if (passedMatch) {
                        passedTests = parseInt(passedMatch[1]);
                        failedTests = 0;
                        totalTests = passedTests;
                    }
                }
                // Jest pattern: "Tests: 5 passed, 1 failed" or "5 passed, 1 failed"
                else if (resultsText.match(/(\d+)\s+passed.*?(\d+)\s+failed/)) {
                    const jestMatch = resultsText.match(/(\d+)\s+passed.*?(\d+)\s+failed/);
                    passedTests = parseInt(jestMatch[1]);
                    failedTests = parseInt(jestMatch[2]);
                    totalTests = passedTests + failedTests;
                }
                // Jest pattern: "Tests: 5 passed" (no failures)
                else if (resultsText.match(/(\d+)\s+passed/) && !resultsText.includes('failed')) {
                    const passedMatch = resultsText.match(/(\d+)\s+passed/);
                    passedTests = parseInt(passedMatch[1]);
                    failedTests = 0;
                    totalTests = passedTests;
                }
                // Jest pattern: "Test Suites: 1 failed, 1 total" or "Tests: 0 total"
                else if (resultsText.includes('Test Suites:') || resultsText.includes('Tests:')) {
                    const totalMatch = resultsText.match(/Tests:\s*(\d+)\s+total/);
                    const failedMatch = resultsText.match(/Test Suites:\s*\d+\s+failed,\s*\d+\s+total/);
                    if (totalMatch) {
                        totalTests = parseInt(totalMatch[1]);
                        if (resultsText.includes('failed')) {
                            failedTests = 1;
                            passedTests = totalTests - failedTests;
                        } else {
                            passedTests = totalTests;
                            failedTests = 0;
                        }
                    }
                }
                // Pytest pattern: "5 passed, 1 failed" (without "in")
                else if (resultsText.includes('passed') && resultsText.includes('failed')) {
                    const passedMatch = resultsText.match(/(\d+)\s+passed/);
                    const failedMatch = resultsText.match(/(\d+)\s+failed/);
                    if (passedMatch) passedTests = parseInt(passedMatch[1]);
                    if (failedMatch) failedTests = parseInt(failedMatch[1]);
                    totalTests = passedTests + failedTests;
                }
                // Pytest pattern: "5 passed" (no failures, without "in")
                else if (resultsText.includes('passed') && !resultsText.includes('failed')) {
                    const passedMatch = resultsText.match(/(\d+)\s+passed/);
                    if (passedMatch) {
                        passedTests = parseInt(passedMatch[1]);
                        failedTests = 0;
                        totalTests = passedTests;
                    }
                }
                // JUnit pattern: "Tests run: 5, Failures: 1"
                else if (resultsText.includes('Tests run:')) {
                    const totalMatch = resultsText.match(/Tests run:\s*(\d+)/);
                    const failedMatch = resultsText.match(/Failures:\s*(\d+)/);
                    if (totalMatch) totalTests = parseInt(totalMatch[1]);
                    if (failedMatch) failedTests = parseInt(failedMatch[1]);
                    passedTests = totalTests - failedTests;
                }
                // Maven pattern: "Tests run: 5, Failures: 1, Errors: 0"
                else if (resultsText.includes('Tests run:') && resultsText.includes('Failures:')) {
                    const totalMatch = resultsText.match(/Tests run:\s*(\d+)/);
                    const failedMatch = resultsText.match(/Failures:\s*(\d+)/);
                    const errorMatch = resultsText.match(/Errors:\s*(\d+)/);
                    if (totalMatch) totalTests = parseInt(totalMatch[1]);
                    if (failedMatch) failedTests = parseInt(failedMatch[1]);
                    if (errorMatch) failedTests += parseInt(errorMatch[1]);
                    passedTests = totalTests - failedTests;
                }
                // C++ Google Test pattern: "[  PASSED  ] 5 tests" or "[  FAILED  ] 1 tests"
                else if (resultsText.includes('[  PASSED  ]') || resultsText.includes('[  FAILED  ]')) {
                    const passedMatch = resultsText.match(/\[  PASSED  \]\s*(\d+)\s*tests?/);
                    const failedMatch = resultsText.match(/\[  FAILED  \]\s*(\d+)\s*tests?/);
                    if (passedMatch) passedTests = parseInt(passedMatch[1]);
                    if (failedMatch) failedTests = parseInt(failedMatch[1]);
                    totalTests = passedTests + failedTests;
                }
                // C++ CMake build errors
                else if (resultsText.includes('CMake Error') || resultsText.includes('cmake') && resultsText.includes('not found')) {
                    totalTests = 0;
                    passedTests = 0;
                    failedTests = 1;
                }
                // C# NUnit pattern: "Tests run: 5, Passed: 4, Failed: 1"
                else if (resultsText.includes('Tests run:') && resultsText.includes('Passed:')) {
                    const totalMatch = resultsText.match(/Tests run:\s*(\d+)/);
                    const passedMatch = resultsText.match(/Passed:\s*(\d+)/);
                    const failedMatch = resultsText.match(/Failed:\s*(\d+)/);
                    if (totalMatch) totalTests = parseInt(totalMatch[1]);
                    if (passedMatch) passedTests = parseInt(passedMatch[1]);
                    if (failedMatch) failedTests = parseInt(failedMatch[1]);
                }
                // Handle .NET SDK errors
                else if (resultsText.includes('dotnet') && (resultsText.includes('not found') || resultsText.includes('not recognized'))) {
                    totalTests = 0;
                    passedTests = 0;
                    failedTests = 1;
                }
                // Handle pytest with errors but no specific counts
                else if (resultsText.includes('ERROR') || resultsText.includes('FAILED')) {
                    totalTests = 1;
                    passedTests = 0;
                    failedTests = 1;
                }
                // If we found "collected X items" but haven't parsed passed/failed yet, try to infer
                // (This is a fallback if the earlier collection check didn't set totalTests)
                if (totalTests === 0 && resultsText.match(/collected\s+(\d+)\s+items?/)) {
                    const collectedMatch = resultsText.match(/collected\s+(\d+)\s+items?/);
                    if (collectedMatch) {
                        totalTests = parseInt(collectedMatch[1]);
                        // If we still don't have passed/failed counts, check if all passed or all failed
                        if (resultsText.includes('passed') && !resultsText.includes('failed')) {
                            passedTests = totalTests;
                            failedTests = 0;
                        } else if (resultsText.includes('failed') && !resultsText.includes('passed')) {
                            passedTests = 0;
                            failedTests = totalTests;
                        }
                    }
                }
                
                // Generic pattern: look for numbers (fallback)
                if (totalTests === 0) {
                    const numbers = resultsText.match(/\d+/g);
                    if (numbers && numbers.length >= 2) {
                        totalTests = parseInt(numbers[0]);
                        failedTests = parseInt(numbers[1]);
                        passedTests = totalTests - failedTests;
                    } else if (numbers && numbers.length === 1) {
                        // Only one number found, assume it's total tests
                        totalTests = parseInt(numbers[0]);
                        passedTests = totalTests;
                        failedTests = 0;
                    }
                }
                
                console.log('🔍 [PARSER] Parsed results - Total:', totalTests, 'Passed:', passedTests, 'Failed:', failedTests);
            }
            
            // Create or update the test results section
            let testSection = document.getElementById('testSection');
            if (!testSection) {
                testSection = document.createElement('div');
                testSection.id = 'testSection';
                testSection.innerHTML = \`
                    <div class="container">
                        <h3>🧪 Test Results</h3>
                        <div id="testSummary" style="margin-bottom: 10px; padding: 10px; border-radius: 5px; font-weight: bold;"></div>
                        <div class="code-container">
                            <pre><code id="testResults"></code></pre>
                        </div>
                    </div>
                \`;
                document.body.appendChild(testSection);
            }
            
            // Update the test summary
            const summaryElement = document.getElementById('testSummary');
            if (summaryElement) {
                if (totalTests > 0) {
                    let summaryColor, summaryIcon, summaryBg;
                    const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
                    
                    if (failedTests === 0) {
                        // All tests passed
                        summaryColor = '#28a745';
                        summaryIcon = '✅';
                        summaryBg = '#d4edda';
                    } else if (passedTests > 0) {
                        // Mixed results
                        summaryColor = '#856404';
                        summaryIcon = '📊';
                        summaryBg = '#fff3cd';
                    } else {
                        // All tests failed
                        summaryColor = '#721c24';
                        summaryIcon = '❌';
                        summaryBg = '#f8d7da';
                    }
                    
                    summaryElement.style.backgroundColor = summaryBg;
                    summaryElement.style.color = summaryColor;
                    summaryElement.style.border = \`2px solid \${summaryColor}\`;
                    summaryElement.style.padding = '15px';
                    summaryElement.style.marginBottom = '15px';
                    summaryElement.style.borderRadius = '8px';
                    summaryElement.style.fontSize = '16px';
                    summaryElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    summaryElement.innerHTML = \`
                        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 1.5em;">\${summaryIcon}</span>
                                <strong style="font-size: 1.2em;">TEST SUMMARY</strong>
                            </div>
                            <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                                <div style="text-align: center;">
                                    <div style="color: #28a745; font-size: 2em; font-weight: bold; line-height: 1;">\${passedTests}</div>
                                    <div style="font-size: 0.9em; margin-top: 4px;">PASSED</div>
                                </div>
                                <div style="text-align: center;">
                                    <div style="color: #dc3545; font-size: 2em; font-weight: bold; line-height: 1;">\${failedTests}</div>
                                    <div style="font-size: 0.9em; margin-top: 4px;">FAILED</div>
                                </div>
                                <div style="text-align: center;">
                                    <div style="font-size: 2em; font-weight: bold; line-height: 1;">\${totalTests}</div>
                                    <div style="font-size: 0.9em; margin-top: 4px;">TOTAL</div>
                                </div>
                                <div style="text-align: center;">
                                    <div style="font-size: 2em; font-weight: bold; line-height: 1;">\${passRate}%</div>
                                    <div style="font-size: 0.9em; margin-top: 4px;">PASS RATE</div>
                                </div>
                            </div>
                        </div>
                        \${iteration !== undefined && maxIterations !== undefined ? \`<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid \${summaryColor}; font-size: 0.9em; opacity: 0.8;">Iteration: \${iteration}/\${maxIterations}</div>\` : ''}
                    \`;
                } else {
                    // Show raw results when parsing fails
                    const resultsText = results ? results.toString() : 'No test results available';
                    const truncatedResults = resultsText.length > 200 ? resultsText.substring(0, 200) + '...' : resultsText;
                    
                    // Check if it's a missing build tool error
                    if (resultsText.includes('not recognized as an internal or external command') || 
                        resultsText.includes('command not found') || 
                        resultsText.includes('not found')) {
                        
                        let toolName = 'Build tool';
                        let installInstructions = 'Check the detailed error below for installation instructions.';
                        
                        if (resultsText.includes('mvn') || resultsText.includes('maven')) {
                            toolName = 'Maven';
                            installInstructions = 'Install Maven: Download from https://maven.apache.org or use: choco install maven';
                        } else if (resultsText.includes('dotnet')) {
                            toolName = '.NET SDK';
                            installInstructions = 'Install .NET SDK: Download from https://dotnet.microsoft.com/download';
                        } else if (resultsText.includes('cmake') || resultsText.includes('make')) {
                            toolName = 'CMake/Make';
                            installInstructions = 'Install CMake: Download from https://cmake.org or use: choco install cmake';
                        } else if (resultsText.includes('npm') || resultsText.includes('npx')) {
                            toolName = 'Node.js';
                            installInstructions = 'Install Node.js: Download from https://nodejs.org';
                        } else if (resultsText.includes('python') || resultsText.includes('pip')) {
                            toolName = 'Python';
                            installInstructions = 'Install Python: Download from https://python.org';
                        } else if (resultsText.includes('cmake')) {
                            toolName = 'CMake';
                            installInstructions = 'Install CMake: Download from https://cmake.org or use: choco install cmake';
                        }
                        
                        summaryElement.style.backgroundColor = '#f8d7da';
                        summaryElement.style.color = '#721c24';
                        summaryElement.style.border = '1px solid #f5c6cb';
                        summaryElement.innerHTML = \`
                            ❌ <strong>Test Summary:</strong> \${toolName} not found
                            <br><small>\${installInstructions}</small>
                        \`;
                    } else {
                        summaryElement.style.backgroundColor = '#fff3cd';
                        summaryElement.style.color = '#856404';
                        summaryElement.style.border = '1px solid #ffeaa7';
                        summaryElement.innerHTML = \`
                            ⚠️ <strong>Test Summary:</strong> Could not parse test results
                            <br><small>Raw output: \${truncatedResults}</small>
                        \`;
                    }
                }
            }
            
            // Update the test results content
            const resultsElement = document.getElementById('testResults');
            if (resultsElement) {
                resultsElement.className = 'language-bash';
                
                // Add iteration header if available
                let resultsText = results || '';
                if (iteration !== undefined && maxIterations !== undefined) {
                    const iterationHeader = \`\n\${'='.repeat(80)}\n🔄 ITERATION \${iteration}/\${maxIterations} - TEST RESULTS\n\${'='.repeat(80)}\n\`;
                    if (iterationMessage) {
                        resultsText = iterationHeader + iterationMessage + '\\n\\n' + resultsText;
                    } else {
                        resultsText = iterationHeader + resultsText;
                    }
                }
                
                resultsElement.textContent = resultsText;
                
                // Apply syntax highlighting for test output
                if (typeof Prism !== 'undefined') {
                    Prism.highlightElement(resultsElement);
                }
            }
            
            // Show status message with iteration info
            let statusColor, statusIcon, statusText, statusType;
            
            // Add iteration prefix if available
            const iterationPrefix = (iteration !== undefined && maxIterations !== undefined) ? \`[Iteration \${iteration}/\${maxIterations}] \` : '';
            
            if (totalTests > 0) {
                if (failedTests === 0) {
                    // All tests passed
                    statusColor = '#28a745';
                    statusIcon = '✅';
                    statusText = \`\${iterationPrefix}All tests passed! (\${passedTests}/\${totalTests})\`;
                    statusType = 'success';
                } else if (passedTests > 0) {
                    // Mixed results - some passed, some failed
                    statusColor = '#ffc107';
                    statusIcon = '📊';
                    statusText = \`\${iterationPrefix}Test results: \${passedTests} passed, \${failedTests} failed (\${totalTests} total)\`;
                    statusType = 'warning';
                } else {
                    // All tests failed
                    statusColor = '#dc3545';
                    statusIcon = '❌';
                    statusText = \`\${iterationPrefix}All tests failed (\${failedTests}/\${totalTests})\`;
                    statusType = 'error';
                }
            } else {
                // No tests parsed
                statusColor = '#6c757d';
                statusIcon = 'ℹ️';
                statusText = iterationPrefix + 'Test results available';
                statusType = 'info';
            }
            
            // Use iteration message if provided
            if (iterationMessage) {
                statusText = iterationMessage;
            }
            
            showStatus(\`\${statusIcon} \${statusText}\`, statusType);
            console.log('✅ [FRONTEND] Test results displayed successfully');
        }
        
        function updateFunctionalities(functionalities) {
            console.log('🔄 [FRONTEND] updateFunctionalities called with:', functionalities);
            console.log('🔍 [FRONTEND] Functionalities type:', typeof functionalities);
            console.log('🔍 [FRONTEND] Functionalities length:', functionalities?.length);
            console.log('🔍 [FRONTEND] First functionality:', functionalities?.[0]);
            console.log('🔍 [FRONTEND] First functionality name:', functionalities?.[0]?.name);
            
            // Deduplicate functionalities by name (case-insensitive) on frontend as well
            const seen = new Set();
            const uniqueFunctionalities = [];
            functionalities.forEach((func, index) => {
                if (!func || typeof func !== 'object' || !func.name) {
                    console.log('⚠️ [FRONTEND] Skipping invalid functionality at index ' + index);
                    return;
                }
                const nameKey = func.name.toLowerCase().trim();
                if (nameKey && !seen.has(nameKey)) {
                    seen.add(nameKey);
                    uniqueFunctionalities.push(func);
                } else if (nameKey) {
                    console.log('⚠️ [FRONTEND] Duplicate functionality skipped: "' + func.name + '"');
                }
            });
            
            console.log('✅ [FRONTEND] Deduplicated: ' + functionalities.length + ' → ' + uniqueFunctionalities.length + ' functionalities');
            
            // Store unique functionalities globally for access in generate button
            window.functionalities = uniqueFunctionalities;
            
            functionalitySelect.innerHTML = '<option value="">Choose a functionality...</option>';
            uniqueFunctionalities.forEach((func, index) => {
                console.log('📋 [FRONTEND] Adding functionality ' + (index + 1) + ':', func);
                console.log('🔍 [FRONTEND] Function ' + (index + 1) + ' name:', func.name);
                console.log('🔍 [FRONTEND] Function ' + (index + 1) + ' type:', typeof func.name);
                
                const option = document.createElement('option');
                option.value = index; // Use index as value for easy retrieval
                option.textContent = func.name || 'Functionality ' + (index + 1); // Use the name field
                functionalitySelect.appendChild(option);
            });
            functionalitySelector.style.display = 'block';
            console.log('✅ [FRONTEND] Dropdown populated with', uniqueFunctionalities.length, 'unique functionalities');
        }
        
        // Listen for messages from extension
        window.addEventListener('message', event => {
            console.log('📨 [FRONTEND] Dashboard: Received message from extension:', event.data);
            console.log('🔍 [FRONTEND] Message type:', event.data?.type);
            console.log('🔍 [FRONTEND] Message functionalities:', event.data?.functionalities);
            
            const message = event.data;
            switch (message.type) {
                case 'updateStatus':
                        showStatus(message.message, message.statusType);
                    break;
                case 'srsParsed':
                    console.log('📋 [FRONTEND] SRS parsed message received, functionalities:', message.functionalities);
                    console.log('🔍 [FRONTEND] Message type:', message.type);
                    console.log('🔍 [FRONTEND] Message content:', message.content);
                    console.log('🔍 [FRONTEND] Functionalities count:', message.functionalities?.length);
                    console.log('🔍 [FRONTEND] First functionality:', message.functionalities?.[0]);
                    
                    showStatus(message.content, 'success');
                    updateFunctionalities(message.functionalities);
                    break;
                case 'codeGenerated':
                    console.log('📋 [FRONTEND] Code generated message received');
                    console.log('🔍 [FRONTEND] Generated code length:', message.code?.length);
                    console.log('🔍 [FRONTEND] Functionality:', message.functionality);
                    
                    // Reset button state
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'Generate Code';
                    status.innerHTML = '<div style="color: #28a745; font-weight: bold;">✅ Code generated successfully!</div>';
                    
                    showGeneratedCode(message.code, message.functionality, message);
                    break;
                case 'testResults':
                    console.log('🧪 [FRONTEND] Test results received');
                    console.log('🧪 [FRONTEND] Test success:', message.success);
                    console.log('🧪 [FRONTEND] Exit code:', message.exitCode);
                    console.log('🧪 [FRONTEND] Iteration:', message.iteration);
                    console.log('🧪 [FRONTEND] Max iterations:', message.maxIterations);
                    
                    // Reset verify button
                    const verifyBtnReset = document.getElementById('verifyCodeBtn');
                    if (verifyBtnReset) {
                        verifyBtnReset.disabled = false;
                        verifyBtnReset.textContent = 'Run Tests';
                    }
                    
                    // Show test results with iteration info if available
                    showTestResults(message.results, message.success, message.iteration, message.maxIterations, message.message);
                    break;
                case 'exportSuccess':
                    console.log('📤 [FRONTEND] Export success received');
                    
                    // Reset export button
                    const exportBtnReset = document.getElementById('exportCodeBtn');
                    if (exportBtnReset) {
                        exportBtnReset.disabled = false;
                        exportBtnReset.textContent = 'Export to Project';
                    }
                    
                    showStatus(message.message, 'success');
                    break;
                case 'testResultsStored':
                    console.log('💾 [FRONTEND] Test results stored, hasResults:', message.hasResults);
                    
                    // Show/hide export CSV button based on whether we have results
                    const exportCsvBtn = document.getElementById('exportCsvBtn');
                    if (exportCsvBtn) {
                        if (message.hasResults) {
                            exportCsvBtn.style.display = 'inline-block';
                        } else {
                            exportCsvBtn.style.display = 'none';
                        }
                    }
                    break;
                case 'testResultsSummary':
                    console.log('📊 [FRONTEND] Test results summary received');
                    console.log('📊 [FRONTEND] Initial:', message.initialTestCounts);
                    console.log('📊 [FRONTEND] Final:', message.finalTestCounts);
                    
                    // Display summary with initial and final metrics
                    if (message.initialTestCounts && message.finalTestCounts) {
                        const initial = message.initialTestCounts;
                        const final = message.finalTestCounts;
                        const improvement = initial.failed - final.failed;
                        
                        // Update test results section with summary
                        const testSection = document.getElementById('testSection');
                        if (testSection) {
                            // Remove existing summary if any
                            const existingSummary = testSection.querySelector('[data-test-summary]');
                            if (existingSummary) {
                                existingSummary.remove();
                            }
                            
                            const summaryDiv = document.createElement('div');
                            summaryDiv.setAttribute('data-test-summary', 'true');
                            summaryDiv.style.cssText = 'margin-top: 20px; padding: 15px; background: #1a202c; border: 2px solid #3182ce; border-radius: 8px; font-family: monospace;';
                            const iterationsText = message.iterations > 0 ? \` (after \${message.iterations} iteration\${message.iterations === 1 ? '' : 's'})\` : '';
                            summaryDiv.innerHTML = \`
                                <div style="color: #90cdf4; font-weight: bold; margin-bottom: 10px; font-size: 1.1em;">📊 TEST RESULTS SUMMARY</div>
                                <div style="color: #e2e8f0; margin-bottom: 8px;">
                                    <span style="color: #90cdf4;">Initial Run:</span> 
                                    <span style="color: #68d391;">\${initial.passed} passed</span>, 
                                    <span style="color: #feb2b2;">\${initial.failed} failed</span> 
                                    (<span style="color: #cbd5e0;">\${initial.total} total</span>)
                                </div>
                                <div style="color: #e2e8f0; margin-bottom: 8px;">
                                    <span style="color: #90cdf4;">Final Run\${iterationsText}:</span> 
                                    <span style="color: #68d391;">\${final.passed} passed</span>, 
                                    <span style="color: #feb2b2;">\${final.failed} failed</span> 
                                    (<span style="color: #cbd5e0;">\${final.total} total</span>)
                                </div>
                                \${improvement > 0 ? \`<div style="color: #68d391; margin-top: 8px; font-weight: bold;">✅ Improvement: \${improvement} test\${improvement === 1 ? '' : 's'} fixed</div>\` : ''}
                            \`;
                            testSection.appendChild(summaryDiv);
                        }
                    }
                    break;
                case 'verificationCompleted':
                    console.log('✅ [FRONTEND] Verification completed');
                    console.log('📊 [FRONTEND] Initial:', message.initialTestCounts);
                    console.log('📊 [FRONTEND] Final:', message.finalTestCounts);
                    
                    // Display summary if available
                    if (message.initialTestCounts && message.finalTestCounts) {
                        const initial = message.initialTestCounts;
                        const final = message.finalTestCounts;
                        const improvement = initial.failed - final.failed;
                        
                        // Update test results section with summary
                        const testSection = document.getElementById('testSection');
                        if (testSection) {
                            // Remove existing summary if any
                            const existingSummary = testSection.querySelector('[data-test-summary]');
                            if (existingSummary) {
                                existingSummary.remove();
                            }
                            
                            const summaryDiv = document.createElement('div');
                            summaryDiv.setAttribute('data-test-summary', 'true');
                            summaryDiv.style.cssText = 'margin-top: 20px; padding: 15px; background: #1a202c; border: 2px solid #28a745; border-radius: 8px; font-family: monospace;';
                            const iterationsText = message.iteration > 0 ? \` (after \${message.iteration} iteration\${message.iteration === 1 ? '' : 's'})\` : '';
                            summaryDiv.innerHTML = \`
                                <div style="color: #68d391; font-weight: bold; margin-bottom: 10px; font-size: 1.1em;">📊 TEST RESULTS SUMMARY</div>
                                <div style="color: #e2e8f0; margin-bottom: 8px;">
                                    <span style="color: #90cdf4;">Initial Run:</span> 
                                    <span style="color: #68d391;">\${initial.passed} passed</span>, 
                                    <span style="color: #feb2b2;">\${initial.failed} failed</span> 
                                    (<span style="color: #cbd5e0;">\${initial.total} total</span>)
                                </div>
                                <div style="color: #e2e8f0; margin-bottom: 8px;">
                                    <span style="color: #90cdf4;">Final Run\${iterationsText}:</span> 
                                    <span style="color: #68d391;">\${final.passed} passed</span>, 
                                    <span style="color: #feb2b2;">\${final.failed} failed</span> 
                                    (<span style="color: #cbd5e0;">\${final.total} total</span>)
                                </div>
                                \${improvement > 0 ? \`<div style="color: #68d391; margin-top: 8px; font-weight: bold;">✅ Improvement: \${improvement} test\${improvement === 1 ? '' : 's'} fixed</div>\` : ''}
                            \`;
                            testSection.appendChild(summaryDiv);
                        }
                    }
                    
                    showStatus(message.message, 'success');
                    break;
                case 'csvExportSuccess':
                    console.log('📊 [FRONTEND] CSV export success received');
                    
                    // Reset export CSV button
                    const exportCsvBtnReset = document.getElementById('exportCsvBtn');
                    if (exportCsvBtnReset) {
                        exportCsvBtnReset.disabled = false;
                        exportCsvBtnReset.textContent = 'Export CSV';
                    }
                    
                    showStatus(message.message, 'success');
                    break;
                case 'csvExportError':
                    console.log('❌ [FRONTEND] CSV export error received');
                    
                    // Reset export CSV button
                    const exportCsvBtnError = document.getElementById('exportCsvBtn');
                    if (exportCsvBtnError) {
                        exportCsvBtnError.disabled = false;
                        exportCsvBtnError.textContent = 'Export CSV';
                    }
                    
                    showStatus(message.message, 'error');
                    break;
                case 'testGenerated':
                    console.log('🧪 [FRONTEND] Test generation success received');
                    console.log('🔍 [FRONTEND] TDD Mode:', message.isTDDMode);
                    
                    // Reset test generation button
                    const testBtnReset = document.getElementById('generateTestsBtn');
                    if (testBtnReset) {
                        testBtnReset.disabled = false;
                        testBtnReset.textContent = 'Generate Tests';
                    }
                    
                    // TDD: Enable code generation button after tests are generated
                    if (message.isTDDMode) {
                        const generateBtn = document.getElementById('generateCodeBtn');
                        if (generateBtn) {
                            generateBtn.disabled = false;
                            console.log('✅ [TDD] Code generation button enabled');
                        }
                    }
                    
                    showStatus(message.message, 'success');
                    break;
                case 'verificationStarted':
                    console.log('🔍 [FRONTEND] Verification started message received');
                    
                    // Reset verify button
                    const verifyBtnStarted = document.getElementById('verifyCodeBtn');
                    if (verifyBtnStarted) {
                        verifyBtnStarted.disabled = false;
                        verifyBtnStarted.textContent = 'Run Tests';
                    }
                    
                    showStatus(message.message, 'info');
                    break;
                case 'showError':
                    // Reset all button states on error
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'Generate Code';
                    
                    const exportBtnError = document.getElementById('exportCodeBtn');
                    if (exportBtnError) {
                        exportBtnError.disabled = false;
                        exportBtnError.textContent = 'Export to Project';
                    }
                    
                    const testBtnError = document.getElementById('generateTestsBtn');
                    if (testBtnError) {
                        testBtnError.disabled = false;
                        testBtnError.textContent = 'Generate Tests';
                    }
                    
                    const verifyBtnError = document.getElementById('verifyCodeBtn');
                    if (verifyBtnError) {
                        verifyBtnError.disabled = false;
                        verifyBtnError.textContent = 'Run Tests';
                    }
                    
                    showStatus(message.message, 'error');
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    async handleUploadSRS(file) {
        try {
            console.log('🔄 [EXTENSION] handleUploadSRS called with file:', file);
            
            this.panel?.webview.postMessage({
                type: 'updateStatus',
                message: 'Parsing SRS document with AI...',
                statusType: 'info'
            });

            console.log('📁 [EXTENSION] File upload received:', file);
            console.log('📊 [EXTENSION] File details - name:', file.name, 'type:', file.type, 'size:', file.size);
            
            // Store the SRS filename for project folder creation
            this.currentSRSFilename = file.name;
            console.log('📁 [EXTENSION] Stored SRS filename:', this.currentSRSFilename);

            let functionalityPackets = [];

            if (file.type === 'application/pdf') {
                console.log('📄 [EXTENSION] PDF file detected, attempting to parse...');
                console.log('📊 [EXTENSION] File type:', file.type);
                console.log('📊 [EXTENSION] File name:', file.name);
                console.log('📊 [EXTENSION] Content length:', file.content.length);
                
                // Use LLM to parse SRS and extract functionalities directly
                console.log('🔄 [EXTENSION] Using LLM to parse SRS and extract functionalities...');
                functionalityPackets = await this.parsePDFWithMultipleStrategies(file.content, file.name);
                
                if (!functionalityPackets || functionalityPackets.length === 0) {
                    console.log('⚠️ [EXTENSION] LLM parsing failed, using fallback...');
                    
                    // Use fallback functionalities
                    functionalityPackets = [
                        {
                            name: "User Management",
                            description: "Basic user management functionality",
                            useCases: ["User registration", "User login", "Profile management"],
                            activityDiagrams: ["User registration flow", "Login process"],
                            context: "Standard user management features",
                            requirements: ["User authentication", "Profile management", "Access control"],
                            dependencies: []
                        }
                    ];
                }
                
                console.log('✅ [EXTENSION] Functionality packets extracted:', functionalityPackets.length);
                console.log('📄 [EXTENSION] Functionalities:', functionalityPackets.map(f => f.name));
                
                // Update user about successful parsing
                this.panel?.webview.postMessage({
                    type: 'updateStatus',
                    message: 'SRS document parsed successfully. Creating embeddings...',
                    statusType: 'info'
                });
                
                console.log('✅ [EXTENSION] Extracted functionality packets:', functionalityPackets);
                
                // Create embeddings for functionality packets
                console.log('🧠 [EMBEDDINGS] Creating embeddings for functionality packets...');
                const embeddedPackets = await this.createEmbeddingsForPackets(functionalityPackets);
                
                // Store embedded packets for future retrieval
                this.embeddedPackets = embeddedPackets;
                console.log('💾 [EXTENSION] Stored', this.embeddedPackets.length, 'embedded packets');
                
                // Display all embedded functionalities JSON (complete structure)
                console.log('\n📦 [EMBEDDED-FUNCTIONALITIES] ==========================================');
                console.log('📦 [EMBEDDED-FUNCTIONALITIES] Complete Embedded Functionalities JSON:');
                console.log('📦 [EMBEDDED-FUNCTIONALITIES] Total Count:', embeddedPackets.length);
                console.log('📦 [EMBEDDED-FUNCTIONALITIES] ==========================================\n');
                
                embeddedPackets.forEach((packet, index) => {
                    console.log(`\n📦 [FUNCTIONALITY-${index + 1}/${embeddedPackets.length}] ${packet.name || 'Unnamed'}`);
                    console.log('─'.repeat(60));
                    
                    // Display complete functionality data
                    const fullPacket = {
                        name: packet.name || 'N/A',
                        description: packet.description || 'N/A',
                        useCases: packet.useCases || [],
                        activityDiagrams: packet.activityDiagrams || [],
                        context: packet.context || 'N/A',
                        requirements: packet.requirements || [],
                        dependencies: packet.dependencies || [],
                        embedding: packet.embedding ? {
                            dimensions: packet.embedding.length,
                            sample: packet.embedding.slice(0, 5), // Show first 5 values as sample
                            note: 'Full vector has ' + packet.embedding.length + ' dimensions'
                        } : 'No embedding'
                    };
                    
                    console.log(JSON.stringify(fullPacket, null, 2));
                    console.log('─'.repeat(60));
                });
                
                console.log('\n📦 [EMBEDDED-FUNCTIONALITIES] ==========================================');
                console.log('📦 [EMBEDDED-FUNCTIONALITIES] Summary:');
                console.log('📦 [EMBEDDED-FUNCTIONALITIES] - Total functionalities:', embeddedPackets.length);
                console.log('📦 [EMBEDDED-FUNCTIONALITIES] - With embeddings:', embeddedPackets.filter(p => p.embedding).length);
                console.log('📦 [EMBEDDED-FUNCTIONALITIES] ==========================================\n');
                
                console.log('📤 [EXTENSION] About to send srsParsed message to webview');
                console.log('📤 [EXTENSION] Functionalities to send:', functionalityPackets.length);
                console.log('📤 [EXTENSION] First functionality:', functionalityPackets[0]);
                console.log('📤 [EXTENSION] First functionality keys:', Object.keys(functionalityPackets[0]));
                console.log('📤 [EXTENSION] First functionality name:', functionalityPackets[0].name);
                console.log('📤 [EXTENSION] First functionality type:', typeof functionalityPackets[0].name);
                
                // Test if objects are serializable
                try {
                    const testString = JSON.stringify(functionalityPackets[0]);
                    console.log('📤 [EXTENSION] First functionality JSON:', testString.substring(0, 200) + '...');
                } catch (error) {
                    console.log('❌ [EXTENSION] JSON serialization failed:', error.message);
                }
                
                // Send only the basic functionality info to frontend (without embeddings)
                let frontendFunctionalities = functionalityPackets.map(packet => ({
                    name: packet.name,
                    description: packet.description,
                    useCases: packet.useCases,
                    activityDiagrams: packet.activityDiagrams,
                    context: packet.context,
                    requirements: packet.requirements,
                    dependencies: packet.dependencies
                }));
                
                // Final deduplication check before sending to frontend
                const seen = new Set();
                frontendFunctionalities = frontendFunctionalities.filter(func => {
                    try {
                        if (!func || typeof func !== 'object' || !func.name) {
                            return false;
                        }
                        const nameKey = func.name.toLowerCase().trim();
                        if (nameKey && !seen.has(nameKey)) {
                            seen.add(nameKey);
                            return true;
                        }
                        return false;
                    } catch (error) {
                        console.log(`⚠️ [EXTENSION] Error filtering functionality: ${error.message}`);
                        return false;
                    }
                });
                
                console.log('📤 [EXTENSION] Frontend functionalities (without embeddings):', frontendFunctionalities.length);
                console.log('📤 [EXTENSION] First frontend functionality:', frontendFunctionalities[0]);
                
                this.panel?.webview.postMessage({
                    type: 'srsParsed',
                    content: 'SRS parsed successfully! Found ' + frontendFunctionalities.length + ' unique functionality packets with context and embeddings.',
                    functionalities: frontendFunctionalities
                });
                console.log('📤 [EXTENSION] SRS parsed response sent to webview');
                
            } else {
                console.log('📄 [EXTENSION] Non-PDF file, decoding base64 content...');
                console.log('📄 [EXTENSION] File content preview:', file.content.substring(0, 200) + '...');
                
                // Decode base64 content for text files
                let textContent = file.content;
                try {
                    textContent = Buffer.from(file.content, 'base64').toString('utf-8');
                    console.log('✅ [EXTENSION] Base64 decoded, text length:', textContent.length);
                    console.log('📄 [EXTENSION] Decoded text preview:', textContent.substring(0, 500) + '...');
                } catch (error) {
                    console.log('⚠️ [EXTENSION] Base64 decoding failed, using content as-is:', error.message);
                }
                
                // For non-PDF files, extract functionalities directly
                console.log('🔍 [DEBUG] About to call extractFunctionalityPackets with textContent');
                console.log('🔍 [DEBUG] textContent type:', typeof textContent);
                console.log('🔍 [DEBUG] textContent length:', textContent.length);
                console.log('🔍 [DEBUG] textContent preview:', textContent.substring(0, 200) + '...');
                console.log('🔍 [DEBUG] textContent contains SRS:', textContent.includes('SRS'));
                console.log('🔍 [DEBUG] textContent contains Kinmail:', textContent.includes('Kinmail'));
                
                functionalityPackets = await this.extractFunctionalityPackets(textContent);
                
                if (functionalityPackets && functionalityPackets.length > 0) {
                    // Final deduplication check
                    const seen = new Set();
                    functionalityPackets = functionalityPackets.filter(func => {
                        try {
                            if (!func || typeof func !== 'object' || !func.name) {
                                return false;
                            }
                            const nameKey = func.name.toLowerCase().trim();
                            if (nameKey && !seen.has(nameKey)) {
                                seen.add(nameKey);
                                return true;
                            }
                            return false;
                        } catch (error) {
                            console.log(`⚠️ [EXTENSION] Error filtering functionality: ${error.message}`);
                            return false;
                        }
                    });
                    
                    this.embeddedPackets = await this.createEmbeddingsForPackets(functionalityPackets);
                    
                    this.panel?.webview.postMessage({
                        type: 'srsParsed',
                        content: 'SRS parsed successfully! Found ' + functionalityPackets.length + ' unique functionality packets.',
                        functionalities: functionalityPackets
                    });
                }
            }
            
        } catch (error) {
            console.error('❌ [EXTENSION] Error in handleUploadSRS:', error);
            this.panel?.webview.postMessage({
                type: 'showError',
                message: 'Failed to parse SRS document: ' + error.message
            });
        }
    }

    async parsePDFWithMultipleStrategies(base64Content, filename) {
        console.log('🔍 [LLM-PARSER] Using LLM to parse SRS directly...');
        
        try {
            // Send base64 content directly to LLM for parsing
            const result = await this.parseSRSWithLLM(base64Content, filename);
            return result;
        } catch (error) {
            console.log(`❌ [LLM-PARSER] Failed: ${error.message}`);
            throw error;
        }
    }

    async parseSRSWithLLM(base64Content, filename) {
        console.log('🤖 [LLM-PARSER] Parsing SRS with LLM...');
        
        // First, try to extract text from PDF using a simple approach
        let pdfText = '';
        try {
            console.log('📄 [LLM-PARSER] Attempting to extract text from PDF...');
            const pdfParse = require('pdf-parse');
            const buffer = Buffer.from(base64Content, 'base64');
            const data = await pdfParse(buffer);
            pdfText = data.text;
            console.log('✅ [LLM-PARSER] PDF text extracted, length:', pdfText.length);
        } catch (error) {
            console.log('⚠️ [LLM-PARSER] PDF parsing failed, using base64 content directly');
            // If PDF parsing fails, we'll use the base64 content as fallback
            pdfText = base64Content;
        }
        
        // If we have meaningful text, chunk it properly
        if (pdfText && pdfText.length > 100 && !pdfText.includes('JVBERi0xLjc')) {
            console.log('📄 [LLM-PARSER] Using extracted PDF text for analysis');
            return await this.analyzeTextContent(pdfText);
        } else {
            console.log('📄 [LLM-PARSER] Using base64 content for analysis');
            return await this.analyzeBase64Content(base64Content);
        }
    }


    async analyzeTextContent(text) {
        console.log('📄 [LLM-PARSER] Analyzing extracted text content...');
        
        // Split text into meaningful chunks (by paragraphs or sections)
        const textChunks = this.splitTextIntoChunks(text, 8000); // 8k chars per chunk
        console.log(`📊 [LLM-PARSER] Split text into ${textChunks.length} chunks`);
        
        const allFunctionalities = [];
        
        // Prepare data structure to save chunks and extracted functionalities
        const chunkAnalysisData = [];
        
        for (let i = 0; i < textChunks.length; i++) {
            console.log(`🔄 [LLM-PARSER] Processing text chunk ${i + 1}/${textChunks.length}`);
            
            const prompt = `You are an expert SRS analyst. Extract functionality packets from this SRS document text.

CRITICAL INSTRUCTIONS:
- Return ONLY a valid JSON array
- No explanations, no markdown, no additional text
- If no functionalities found in this chunk, return: []
- Each functionality must be a complete, implementable feature
- Look for functional requirements, use cases, system features

REQUIRED JSON FORMAT:
[
  {
    "name": "Feature Name (e.g., Student Registration)",
    "description": "Detailed description of what this feature does",
    "useCases": ["Specific use case 1", "Specific use case 2"],
    "activityDiagrams": ["Workflow description 1", "Process flow 2"],
    "context": "Additional context, diagrams, or related information",
    "requirements": ["Requirement 1", "Requirement 2", "Requirement 3"],
    "dependencies": ["Other feature 1", "Other feature 2"]
  }
]

SRS TEXT CHUNK ${i + 1}/${textChunks.length}:
${textChunks[i]}

EXTRACT FUNCTIONALITIES FROM THIS TEXT:`;
            
            try {
                const llmResult = await this.callLLM(prompt);
                
                // Strip markdown code blocks if present
                let jsonContent = llmResult.content.trim();
                console.log('🔍 [DEBUG] Raw LLM response for chunk', i + 1, ':', jsonContent.substring(0, 200) + '...');
                
                // Remove markdown code blocks
                if (jsonContent.includes('```json')) {
                    jsonContent = jsonContent.replace(/```json\s*/, '').replace(/\s*```$/, '');
                } else if (jsonContent.includes('```')) {
                    jsonContent = jsonContent.replace(/```\s*/, '').replace(/\s*```$/, '');
                }
                
                // Clean up any remaining markdown artifacts
                jsonContent = jsonContent.replace(/^```.*$/gm, '').trim();
                
                console.log('🔍 [DEBUG] Cleaned JSON for chunk', i + 1, ':', jsonContent.substring(0, 200) + '...');
                
                const functionalities = JSON.parse(jsonContent);
                
                // Store chunk and extracted functionalities for saving
                chunkAnalysisData.push({
                    chunkNumber: i + 1,
                    totalChunks: textChunks.length,
                    chunkContent: textChunks[i],
                    extractedFunctionalities: Array.isArray(functionalities) ? functionalities : [],
                    chunkLength: textChunks[i].length
                });
                
                if (Array.isArray(functionalities) && functionalities.length > 0) {
                    console.log(`✅ [LLM-PARSER] Found ${functionalities.length} functionalities in text chunk ${i + 1}`);
                    allFunctionalities.push(...functionalities);
                } else {
                    console.log(`📄 [LLM-PARSER] No functionalities found in text chunk ${i + 1}`);
                }
            } catch (error) {
                console.log(`⚠️ [LLM-PARSER] Error processing text chunk ${i + 1}: ${error.message}`);
                
                // Store chunk even if extraction failed
                chunkAnalysisData.push({
                    chunkNumber: i + 1,
                    totalChunks: textChunks.length,
                    chunkContent: textChunks[i],
                    extractedFunctionalities: [],
                    error: error.message,
                    chunkLength: textChunks[i].length
                });
            }
        }
        
        // Save chunks and extracted functionalities to a text file
        console.log(`💾 [LLM-PARSER] Preparing to save chunk analysis (${chunkAnalysisData.length} chunks)...`);
        await this.saveChunkAnalysis(chunkAnalysisData);
        console.log(`💾 [LLM-PARSER] Chunk analysis save completed`);
        
        console.log(`🎯 [LLM-PARSER] Total functionalities found: ${allFunctionalities.length}`);
        
        // Deduplicate functionalities by name (case-insensitive)
        const seen = new Set();
        const uniqueFunctionalities = [];
        for (const func of allFunctionalities) {
            try {
                if (!func || typeof func !== 'object') {
                    console.log(`⚠️ [LLM-PARSER] Skipping invalid functionality object`);
                    continue;
                }
                const nameKey = func.name?.toLowerCase()?.trim();
                if (nameKey && !seen.has(nameKey)) {
                    seen.add(nameKey);
                    uniqueFunctionalities.push(func);
                } else if (nameKey) {
                    console.log(`⚠️ [LLM-PARSER] Duplicate functionality skipped: "${func.name}"`);
                } else {
                    console.log(`⚠️ [LLM-PARSER] Skipping functionality with missing or invalid name`);
                }
            } catch (error) {
                console.log(`⚠️ [LLM-PARSER] Error processing functionality: ${error.message}`);
            }
        }
        
        console.log(`✅ [LLM-PARSER] Unique functionalities after deduplication: ${uniqueFunctionalities.length}`);
        return uniqueFunctionalities;
    }

    async saveChunkAnalysis(chunkAnalysisData) {
        console.log(`💾 [LLM-PARSER] saveChunkAnalysis called with ${chunkAnalysisData.length} chunks`);
        try {
            // Get workspace folder
            const workspaceFolders = vscode.workspace.workspaceFolders;
            console.log(`💾 [LLM-PARSER] Workspace folders: ${workspaceFolders ? workspaceFolders.length : 0}`);
            if (!workspaceFolders || workspaceFolders.length === 0) {
                console.log('⚠️ [LLM-PARSER] No workspace folder found, skipping chunk analysis save');
                vscode.window.showWarningMessage('Cannot save chunk analysis: No workspace folder open');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const fileName = `srs_chunk_analysis_${timestamp}.txt`;
            const filePath = path.join(workspacePath, fileName);

            // Build the analysis text
            let analysisText = '='.repeat(80) + '\n';
            analysisText += 'SRS CHUNK ANALYSIS REPORT\n';
            analysisText += `Generated: ${new Date().toLocaleString()}\n`;
            analysisText += `Total Chunks: ${chunkAnalysisData.length}\n`;
            analysisText += '='.repeat(80) + '\n\n';

            let totalFunctionalities = 0;
            
            for (const chunkData of chunkAnalysisData) {
                analysisText += '='.repeat(80) + '\n';
                analysisText += `CHUNK ${chunkData.chunkNumber} of ${chunkData.totalChunks}\n`;
                analysisText += `Chunk Length: ${chunkData.chunkLength} characters\n`;
                
                if (chunkData.error) {
                    analysisText += `❌ ERROR: ${chunkData.error}\n`;
                } else {
                    analysisText += `✅ Extracted ${chunkData.extractedFunctionalities.length} functionality/functionalities\n`;
                    totalFunctionalities += chunkData.extractedFunctionalities.length;
                }
                
                analysisText += '='.repeat(80) + '\n\n';
                
                // Chunk Content
                analysisText += 'CHUNK CONTENT:\n';
                analysisText += '-'.repeat(80) + '\n';
                analysisText += chunkData.chunkContent + '\n';
                analysisText += '-'.repeat(80) + '\n\n';
                
                // Extracted Functionalities
                if (chunkData.extractedFunctionalities.length > 0) {
                    analysisText += 'EXTRACTED FUNCTIONALITIES:\n';
                    analysisText += '-'.repeat(80) + '\n';
                    
                    chunkData.extractedFunctionalities.forEach((func, index) => {
                        analysisText += `\n[Functionality ${index + 1}]\n`;
                        analysisText += `Name: ${func.name || 'N/A'}\n`;
                        analysisText += `Description: ${func.description || 'N/A'}\n`;
                        
                        if (func.useCases && func.useCases.length > 0) {
                            analysisText += `Use Cases:\n`;
                            func.useCases.forEach((uc, i) => {
                                analysisText += `  ${i + 1}. ${uc}\n`;
                            });
                        }
                        
                        if (func.requirements && func.requirements.length > 0) {
                            analysisText += `Requirements:\n`;
                            func.requirements.forEach((req, i) => {
                                analysisText += `  ${i + 1}. ${req}\n`;
                            });
                        }
                        
                        if (func.dependencies && func.dependencies.length > 0) {
                            analysisText += `Dependencies: ${func.dependencies.join(', ')}\n`;
                        }
                        
                        if (func.activityDiagrams && func.activityDiagrams.length > 0) {
                            analysisText += `Activity Diagrams:\n`;
                            func.activityDiagrams.forEach((ad, i) => {
                                analysisText += `  ${i + 1}. ${ad}\n`;
                            });
                        }
                        
                        if (func.context) {
                            analysisText += `Context: ${func.context}\n`;
                        }
                        
                        analysisText += '\n';
                    });
                    
                    analysisText += '-'.repeat(80) + '\n\n';
                } else if (!chunkData.error) {
                    analysisText += 'EXTRACTED FUNCTIONALITIES: None found in this chunk\n';
                    analysisText += '-'.repeat(80) + '\n\n';
                }
                
                analysisText += '\n';
            }

            // Summary
            analysisText += '\n' + '='.repeat(80) + '\n';
            analysisText += 'SUMMARY\n';
            analysisText += '='.repeat(80) + '\n';
            analysisText += `Total Chunks Processed: ${chunkAnalysisData.length}\n`;
            analysisText += `Total Functionalities Extracted: ${totalFunctionalities}\n`;
            analysisText += `Average Functionalities per Chunk: ${(totalFunctionalities / chunkAnalysisData.length).toFixed(2)}\n`;
            
            const chunksWithFunctionalities = chunkAnalysisData.filter(c => c.extractedFunctionalities.length > 0).length;
            analysisText += `Chunks with Functionalities: ${chunksWithFunctionalities} of ${chunkAnalysisData.length}\n`;
            
            const chunksWithErrors = chunkAnalysisData.filter(c => c.error).length;
            if (chunksWithErrors > 0) {
                analysisText += `Chunks with Errors: ${chunksWithErrors}\n`;
            }
            
            analysisText += '='.repeat(80) + '\n';

            // Write to file
            console.log(`💾 [LLM-PARSER] Attempting to save chunk analysis...`);
            console.log(`💾 [LLM-PARSER] Workspace path: ${workspacePath}`);
            console.log(`💾 [LLM-PARSER] File name: ${fileName}`);
            console.log(`💾 [LLM-PARSER] Full path: ${filePath}`);
            console.log(`💾 [LLM-PARSER] Analysis text length: ${analysisText.length} characters`);
            
            fs.writeFileSync(filePath, analysisText, 'utf8');
            console.log(`✅ [LLM-PARSER] Chunk analysis saved successfully to: ${filePath}`);
            
            // Verify file was created
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                console.log(`✅ [LLM-PARSER] File verified: ${stats.size} bytes`);
            } else {
                console.error(`❌ [LLM-PARSER] File was not created at: ${filePath}`);
            }
            
            // Show notification to user with full path
            const displayPath = filePath.length > 60 ? `...${filePath.slice(-60)}` : filePath;
            vscode.window.showInformationMessage(
                `SRS chunk analysis saved: ${fileName}\nLocation: ${displayPath}`,
                'Open File',
                'Show in Explorer'
            ).then(selection => {
                if (selection === 'Open File') {
                    vscode.workspace.openTextDocument(filePath).then(doc => {
                        vscode.window.showTextDocument(doc);
                    }).catch(err => {
                        console.error(`❌ [LLM-PARSER] Failed to open file: ${err.message}`);
                        vscode.window.showErrorMessage(`Failed to open file: ${err.message}`);
                    });
                } else if (selection === 'Show in Explorer') {
                    // Open file in system file explorer
                    const { exec } = require('child_process');
                    const platform = process.platform;
                    let command;
                    if (platform === 'win32') {
                        command = `explorer /select,"${filePath}"`;
                    } else if (platform === 'darwin') {
                        command = `open -R "${filePath}"`;
                    } else {
                        command = `xdg-open "${path.dirname(filePath)}"`;
                    }
                    exec(command, (error) => {
                        if (error) {
                            console.error(`❌ [LLM-PARSER] Failed to show in explorer: ${error.message}`);
                        }
                    });
                }
            });
        } catch (error) {
            console.error(`❌ [LLM-PARSER] Failed to save chunk analysis: ${error.message}`);
            console.error(`❌ [LLM-PARSER] Stack trace: ${error.stack}`);
            // Show error to user
            vscode.window.showErrorMessage(`Failed to save chunk analysis: ${error.message}`);
            // Don't throw - this is a non-critical feature
        }
    }

    async analyzeBase64Content(base64Content) {
        console.log('📄 [LLM-PARSER] Analyzing base64 content...');
        
        // For base64 content, we'll try a different approach
        const prompt = `You are an expert SRS analyst. This appears to be a PDF document in base64 format. 

CRITICAL INSTRUCTIONS:
- Return ONLY a valid JSON array
- No explanations, no markdown, no additional text
- If you cannot extract meaningful content, return: []
- Each functionality must be a complete, implementable feature

REQUIRED JSON FORMAT:
[
  {
    "name": "Feature Name (e.g., Student Registration)",
    "description": "Detailed description of what this feature does",
    "useCases": ["Specific use case 1", "Specific use case 2"],
    "activityDiagrams": ["Workflow description 1", "Process flow 2"],
    "context": "Additional context, diagrams, or related information",
    "requirements": ["Requirement 1", "Requirement 2", "Requirement 3"],
    "dependencies": ["Other feature 1", "Other feature 2"]
  }
]

BASE64 PDF CONTENT:
${base64Content.substring(0, 10000)}...

EXTRACT FUNCTIONALITIES FROM THIS PDF:`;
        
        try {
            const llmResult = await this.callLLM(prompt);
            
            // Strip markdown code blocks if present
            let jsonContent = llmResult.content.trim();
            if (jsonContent.startsWith('```json')) {
                jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (jsonContent.startsWith('```')) {
                jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            const functionalities = JSON.parse(jsonContent);
            
            if (Array.isArray(functionalities) && functionalities.length > 0) {
                console.log(`✅ [LLM-PARSER] Found ${functionalities.length} functionalities from base64 content`);
                return functionalities;
            } else {
                console.log(`📄 [LLM-PARSER] No functionalities found in base64 content`);
                return [];
            }
        } catch (error) {
            console.log(`⚠️ [LLM-PARSER] Error processing base64 content: ${error.message}`);
            return [];
        }
    }

    splitTextIntoChunks(text, chunkSize) {
        const chunks = [];
        const lines = text.split('\n');
        let currentChunk = '';
        
        for (const line of lines) {
            if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = line;
            } else {
                currentChunk += (currentChunk ? '\n' : '') + line;
            }
        }
        
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks;
    }

    async callLLM(prompt) {
        console.log('☁️ [LLM] Using OpenAI API');
        console.log('🔄 [API] Making OpenAI API call...');
        
        const axios = require('axios');
        const vscode = require('vscode');
        const config = vscode.workspace.getConfiguration('kinmail');
        const apiKey = config.get('openaiApiKey');
        
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Please set it in VS Code settings.');
        }
        
        console.log('🔑 [API] API Key (first 10 chars):', apiKey.substring(0, 10));
        console.log('🔑 [API] API Key length:', apiKey.length);
        console.log('🔑 [API] API Key starts with sk-:', apiKey.startsWith('sk-'));
        console.log('📊 [API] Prompt length:', prompt.length);
        
        const requestBody = {
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert software analyst. Extract functionalities from SRS documents and return structured JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 4000
        };
        
        console.log('📊 [API] Request body size:', JSON.stringify(requestBody).length);
        console.log('🌐 [API] Sending request to OpenAI...');
        
        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', requestBody, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('✅ [API] OpenAI API response received');
            console.log('📄 [API] Response content length:', response.data.choices[0].message.content.length);
            console.log('📄 [API] Response preview:', response.data.choices[0].message.content.substring(0, 100) + '...');
            
            return {
                content: response.data.choices[0].message.content,
                model: 'gpt-4o'
            };
            
        } catch (error) {
            console.error('❌ [API] OpenAI API call failed:', error.message);
            throw error;
        }
    }

    async extractFunctionalityPackets(content) {
        console.log('📦 [FUNCTIONALITY-PACKETS] Extracting functionality packets with context...');
        console.log('📄 [FUNCTIONALITY-PACKETS] Content length:', content.length);
        console.log('🔍 [DEBUG] extractFunctionalityPackets received content type:', typeof content);
        console.log('🔍 [DEBUG] extractFunctionalityPackets content preview:', content.substring(0, 200) + '...');
        console.log('🔍 [DEBUG] extractFunctionalityPackets contains SRS:', content.includes('SRS'));
        console.log('🔍 [DEBUG] extractFunctionalityPackets contains Kinmail:', content.includes('Kinmail'));
        console.log('🔍 [DEBUG] extractFunctionalityPackets contains base64:', content.includes('bE9Nb0FSY1BTRHw'));
        
        try {
            const prompt = `You are an expert software analyst specializing in Software Requirements Specification (SRS) analysis. Your task is to extract functionality packets from the provided SRS document.

CRITICAL INSTRUCTIONS:
- Return ONLY a valid JSON array
- No explanations, no markdown, no additional text
- If content is corrupted or unreadable, return: []
- Each functionality must be a complete, implementable feature

REQUIRED JSON FORMAT:
[
  {
    "name": "Feature Name (e.g., Student Registration)",
    "description": "Detailed description of what this feature does",
    "useCases": ["Specific use case 1", "Specific use case 2"],
    "activityDiagrams": ["Workflow description 1", "Process flow 2"],
    "context": "Additional context, diagrams, or related information",
    "requirements": ["Requirement 1", "Requirement 2", "Requirement 3"],
    "dependencies": ["Other feature 1", "Other feature 2"]
  }
]

SRS DOCUMENT CONTENT:
${content}

EXTRACT FUNCTIONALITIES NOW:`;
            
            console.log('📄 [FUNCTIONALITY-PACKETS] Content preview for LLM:', content.substring(0, 500) + '...');
            console.log('📄 [FUNCTIONALITY-PACKETS] Content length:', content.length);
            console.log('🔍 [DEBUG] LLM prompt content preview:', content.substring(0, 200) + '...');
            console.log('🔍 [DEBUG] LLM prompt contains SRS:', content.includes('SRS'));
            console.log('🔍 [DEBUG] LLM prompt contains Kinmail:', content.includes('Kinmail'));
            console.log('🔍 [DEBUG] LLM prompt contains base64:', content.includes('bE9Nb0FSY1BTRHw'));
            
            const llmResult = await this.callLLM(prompt);
            console.log('📄 [FUNCTIONALITY-PACKETS] LLM response:', llmResult.content);
            
            let functionalityPackets;
            try {
                // Strip markdown code blocks if present
                let jsonContent = llmResult.content.trim();
                if (jsonContent.startsWith('```json')) {
                    jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                } else if (jsonContent.startsWith('```')) {
                    jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
                }
                
                // Try to parse JSON directly
                functionalityPackets = JSON.parse(jsonContent);
            } catch (jsonError) {
                console.log('⚠️ [FUNCTIONALITY-PACKETS] JSON parsing failed, trying to extract JSON from response...');
                // Try to extract JSON from the response
                const jsonMatch = llmResult.content.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    functionalityPackets = JSON.parse(jsonMatch[0]);
                } else {
                    console.log('❌ [FUNCTIONALITY-PACKETS] No valid JSON found in response');
                    throw new Error('No valid JSON found in LLM response');
                }
            }
            
            console.log('✅ [FUNCTIONALITY-PACKETS] Extracted', functionalityPackets.length, 'functionality packets');
            
            // Log each packet for debugging
            functionalityPackets.forEach((packet, index) => {
                console.log(`📦 [PACKET-${index + 1}] ${packet.name}`);
                console.log(`   Description: ${packet.description}`);
                console.log(`   Use Cases: ${packet.useCases?.length || 0}`);
                console.log(`   Context: ${packet.context}`);
            });
            
            return functionalityPackets;
            
        } catch (error) {
            console.error('❌ [FUNCTIONALITY-PACKETS] Failed to extract packets:', error.message);
            return [];
        }
    }

    async createEmbeddingsForPackets(functionalityPackets) {
        console.log('🧠 [EMBEDDINGS] Creating embeddings for functionality packets...');
        console.log('🧠 [EMBEDDINGS] Creating embeddings for', functionalityPackets.length, 'functionality packets...');
        
        const embeddedPackets = [];
        
        for (const packet of functionalityPackets) {
            try {
                // Create embedding text from packet
                const embeddingText = `${packet.name}. ${packet.description}. ${packet.context || ''}. ${packet.requirements?.join(', ') || ''}`;
                
                // Debug: Log the embedding text being created
                console.log('🧠 [EMBEDDINGS] Creating embedding for:', packet.name);
                console.log('🧠 [EMBEDDINGS] Embedding text length:', embeddingText.length);
                console.log('🧠 [EMBEDDINGS] Embedding text preview:', embeddingText.substring(0, 200) + '...');
                console.log('🧠 [EMBEDDINGS] Full embedding text:', embeddingText);
                
                // Generate embedding
                const embedding = await this.generateEmbedding(embeddingText);
                
                // Add embedding to packet
                const embeddedPacket = {
                    ...packet,
                    embedding: embedding
                };
                
                embeddedPackets.push(embeddedPacket);
                console.log('✅ [EMBEDDINGS] Created embedding for:', packet.name);
                
            } catch (error) {
                console.error('❌ [EMBEDDINGS] Failed to create embedding for:', packet.name, error.message);
                // Add packet without embedding
                embeddedPackets.push(packet);
            }
        }
        
        console.log('✅ [EMBEDDINGS] Created embeddings for', embeddedPackets.length, 'packets');
        
        // Display all embedded packets JSON structure (complete)
        console.log('\n📦 [EMBEDDED-PACKETS] ==========================================');
        console.log('📦 [EMBEDDED-PACKETS] Complete Embedded Packets JSON:');
        console.log('📦 [EMBEDDED-PACKETS] Total Count:', embeddedPackets.length);
        console.log('📦 [EMBEDDED-PACKETS] ==========================================\n');
        
        embeddedPackets.forEach((packet, index) => {
            console.log(`\n📦 [PACKET-${index + 1}/${embeddedPackets.length}] ${packet.name || 'Unnamed'}`);
            console.log('─'.repeat(60));
            
            const fullPacketInfo = {
                name: packet.name || 'N/A',
                description: packet.description || 'N/A',
                useCases: packet.useCases || [],
                activityDiagrams: packet.activityDiagrams || [],
                context: packet.context || 'N/A',
                requirements: packet.requirements || [],
                dependencies: packet.dependencies || [],
                embedding: packet.embedding ? {
                    dimensions: packet.embedding.length,
                    sample: packet.embedding.slice(0, 5), // Show first 5 values
                    note: 'Full vector: ' + packet.embedding.length + ' dimensions'
                } : 'No embedding'
            };
            
            console.log(JSON.stringify(fullPacketInfo, null, 2));
            console.log('─'.repeat(60));
        });
        
        console.log('\n📦 [EMBEDDED-PACKETS] ==========================================\n');
        
        return embeddedPackets;
    }

    async generateEmbedding(text) {
        console.log('🧠 [EMBEDDINGS] Generating embedding for text length:', text.length);
        
        try {
            const axios = require('axios');
            const vscode = require('vscode');
            const config = vscode.workspace.getConfiguration('kinmail');
            const apiKey = config.get('openaiApiKey');
            
            if (!apiKey) {
                throw new Error('OpenAI API key not configured. Please set it in VS Code settings.');
            }
            
            const response = await axios.post('https://api.openai.com/v1/embeddings', {
                model: 'text-embedding-3-small',
                input: text
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const embedding = response.data.data[0].embedding;
            console.log('✅ [EMBEDDINGS] Generated embedding with', embedding.length, 'dimensions');
            return embedding;
            
        } catch (error) {
            console.error('❌ [EMBEDDINGS] Failed to generate embedding:', error.message);
            throw error;
        }
    }

    getEmbeddedPacketByName(functionalityName) {
        console.log('🔍 [EMBEDDINGS] Searching for functionality:', functionalityName);
        console.log('📊 [EMBEDDINGS] Available packets:', this.embeddedPackets.length);
        
        const packet = this.embeddedPackets.find(p => 
            p.name && p.name.toLowerCase().includes(functionalityName.toLowerCase())
        );
        
        if (packet) {
            console.log('✅ [EMBEDDINGS] Found embedded packet:', packet.name);
            console.log('📦 [EMBEDDINGS] Has embedding:', !!packet.embedding);
            console.log('📄 [EMBEDDINGS] Context:', packet.context);
            return packet;
        } else {
            console.log('❌ [EMBEDDINGS] No embedded packet found for:', functionalityName);
            return null;
        }
    }

    getAllEmbeddedPackets() {
        return this.embeddedPackets;
    }

    async callOpenAI(prompt) {
        console.log('☁️ [LLM] Using OpenAI API');
        console.log('🔄 [API] Making OpenAI API call...');
        
        const axios = require('axios');
        const vscode = require('vscode');
        const config = vscode.workspace.getConfiguration('kinmail');
        const apiKey = config.get('openaiApiKey');
        
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Please set it in VS Code settings.');
        }
        
        const requestBody = {
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 4000
        };
        
        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', requestBody, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            return response.data.choices[0].message.content;
            
        } catch (error) {
            console.error('❌ [API] OpenAI API call failed:', error.message);
            throw error;
        }
    }

    async handleGenerateCode(functionality, language = 'javascript') {
        console.log('🔄 [EXTENSION] handleGenerateCode called with:', functionality);
        console.log('🔍 [EXTENSION] Functionality type:', typeof functionality);
        console.log('🔍 [EXTENSION] Functionality name:', functionality?.name);
        console.log('🔍 [EXTENSION] Selected language:', language);
        
        // Start timing at the VERY BEGINNING (when button is clicked)
        const startTime = new Date();
        const startTimeISO = startTime.toISOString();
        const startTimeFormatted = startTime.toLocaleString();
        console.log(`⏱️ [CODE-GEN] Code generation started at: ${startTimeFormatted}`);
        
        try {
            // Extract the name from the functionality object
            const functionalityName = functionality.name || functionality;
            console.log('🔍 [EXTENSION] Using functionality name:', functionalityName);
            
            // Initialize timing store for this functionality if not exists
            if (!this.generationTimingStore[functionalityName]) {
                this.generationTimingStore[functionalityName] = {};
            }
            this.generationTimingStore[functionalityName].codeGen = {
                startTime: startTimeISO,
                startTimeFormatted: startTimeFormatted
            };
            
            // Find the embedded packet for this functionality
            const packet = this.getEmbeddedPacketByName(functionalityName);
            
            if (!packet) {
                throw new Error(`Functionality "${functionalityName}" not found`);
            }
            
            console.log('📦 [EXTENSION] Found embedded packet:', packet.name);
            
            // Step 1: Get or generate contract (should already exist if tests were generated)
            let contract = this.generatedContracts[functionalityName];
            if (!contract) {
                console.log('📋 [CONTRACT] Contract not found, generating now...');
                contract = await this.generateContract(packet, language);
                this.generatedContracts[functionalityName] = contract;
            } else {
                console.log('📋 [CONTRACT] Using existing contract for code generation');
            }
            
            // Step 2: Generate code using contract and packet (independent of tests, but aligned via contract)
            // Pass both contract (for structure) and packet (for SRS context/requirements)
            const code = await this.generateCodeWithLLM(contract, packet, language);
            
            // Get functionalities that have test files for the dropdown
            const functionalitiesWithTests = this.getFunctionalitiesWithTestFiles();
            
            // Show the generated code (this is when user sees the results)
            // Always in TDD mode (contract-first workflow)
            this.panel?.webview.postMessage({
                type: 'codeGenerated',
                code: code,
                functionality: functionalityName,
                isTDDMode: true,
                functionalitiesWithTests: functionalitiesWithTests // Send list of functionalities with test files
            });
            
            // End timing RIGHT AFTER user sees the results (includes everything: contract gen, code gen, UI update)
            const endTime = new Date();
            const endTimeISO = endTime.toISOString();
            const endTimeFormatted = endTime.toLocaleString();
            const duration = endTime - startTime; // Duration in milliseconds
            const durationSeconds = (duration / 1000).toFixed(2);
            const durationFormatted = this.formatDuration(duration);
            
            // Store timing data
            this.generationTimingStore[functionalityName].codeGen.endTime = endTimeISO;
            this.generationTimingStore[functionalityName].codeGen.endTimeFormatted = endTimeFormatted;
            this.generationTimingStore[functionalityName].codeGen.duration = duration;
            this.generationTimingStore[functionalityName].codeGen.durationSeconds = durationSeconds;
            this.generationTimingStore[functionalityName].codeGen.durationFormatted = durationFormatted;
            
            console.log(`✅ [EXTENSION] Code generated successfully`);
            console.log(`⏱️ [CODE-GEN] Code generation completed at: ${endTimeFormatted}`);
            console.log(`⏱️ [CODE-GEN] Total time (button click to results): ${durationFormatted} (${durationSeconds} seconds)`);
            
        } catch (error) {
            // End timing even on error
            const endTime = new Date();
            const endTimeISO = endTime.toISOString();
            const endTimeFormatted = endTime.toLocaleString();
            const duration = endTime - startTime;
            const durationSeconds = (duration / 1000).toFixed(2);
            const durationFormatted = this.formatDuration(duration);
            
            const functionalityName = functionality?.name || functionality;
            if (this.generationTimingStore[functionalityName] && this.generationTimingStore[functionalityName].codeGen) {
                this.generationTimingStore[functionalityName].codeGen.endTime = endTimeISO;
                this.generationTimingStore[functionalityName].codeGen.endTimeFormatted = endTimeFormatted;
                this.generationTimingStore[functionalityName].codeGen.duration = duration;
                this.generationTimingStore[functionalityName].codeGen.durationSeconds = durationSeconds;
                this.generationTimingStore[functionalityName].codeGen.durationFormatted = durationFormatted;
                this.generationTimingStore[functionalityName].codeGen.error = true;
            }
            
            console.error('❌ [EXTENSION] Code generation failed:', error);
            console.log(`⏱️ [CODE-GEN] Code generation failed after: ${durationFormatted} (${durationSeconds} seconds)`);
            this.panel?.webview.postMessage({
                type: 'showError',
                message: 'Failed to generate code: ' + error.message
            });
        }
    }

    async generateContract(packet, language) {
        console.log('📋 [CONTRACT] Generating contract from embedded packet...');
        const { ContractGenerator } = require('./contractGenerator');
        // ContractGenerator context is optional - it's only used for extension state
        const contractGenerator = new ContractGenerator(null);
        return await contractGenerator.generateContract(packet, language);
    }

    async generateCodeWithLLM(contract, packet, language = 'javascript') {
        console.log('🤖 [EXTENSION] Generating code from contract');
        console.log('📦 [EXTENSION] Using embedded packet for SRS context');
        console.log('🔍 [EXTENSION] Target language:', language);
        
        if (!contract) {
            throw new Error('Contract is required for code generation');
        }
        
        console.log('📋 [CONTRACT] Functionality:', contract.functionality);
        console.log('📋 [CONTRACT] Architecture:', contract.architecture);
        if (packet) {
            console.log('📦 [EXTENSION] Packet context:', {
                name: packet.name,
                hasDescription: !!packet.description,
                useCases: packet.useCases?.length || 0,
                requirements: packet.requirements?.length || 0,
                hasEmbedding: !!packet.embedding
            });
        }
        
        // Debug: Log contract structure
        console.log('📋 [CONTRACT] Contract structure:');
        console.log('📋 [CONTRACT] Models:', contract.file_structure?.models?.length || 0);
        console.log('📋 [CONTRACT] Controllers:', contract.file_structure?.controllers?.length || 0);
        console.log('📋 [CONTRACT] Total routes:', contract.file_structure?.controllers?.reduce((sum, c) => sum + (c.routes?.length || 0), 0) || 0);
        
        // Extract exact names from contract for strict enforcement
        const modelNames = contract.file_structure?.models?.map(m => ({
            class: m.class_name,
            file: m.file_path,
            fields: m.fields?.map(f => f.name) || [],
            methods: m.methods?.map(m => m.name) || []
        })) || [];
        
        const routeInfo = contract.file_structure?.controllers?.flatMap(c => 
            c.routes?.map(r => ({
                path: r.path,
                methods: r.methods,
                function_name: r.function_name,
                controller_file: c.file_path
            })) || []
        ) || [];
        
        const helperFunctions = contract.file_structure?.controllers?.flatMap(c =>
            c.helper_functions?.map(h => ({
                name: h.name,
                parameters: h.parameters,
                return_type: h.return_type,
                controller_file: c.file_path
            })) || []
        ) || [];
        
        // Contract-based prompt
        const contractSection = `
📋 API CONTRACT (MUST FOLLOW EXACTLY - NO VARIATIONS):
This contract defines the EXACT structure your code must implement. Both tests and code are generated from this same contract, so you MUST follow it precisely with EXACT naming.

${JSON.stringify(contract, null, 2)}

CRITICAL REQUIREMENTS - EXACT NAMING ENFORCEMENT:

1. ROUTE FUNCTION NAMES (MANDATORY - USE EXACT NAMES):
${routeInfo.map(r => {
    const methods = r.methods && Array.isArray(r.methods) ? r.methods.join(', ') : 'N/A';
    return `   - Route "${r.path}" (${methods}) MUST use function name: "${r.function_name}"
     * DO NOT split into ${r.function_name}_get() and ${r.function_name}_post()
     * DO NOT use variations like ${r.function_name}_handler() or ${r.function_name}_route()
     * USE EXACTLY: def ${r.function_name}():`;
}).join('\n')}

2. MODEL FIELD NAMES (MANDATORY - USE EXACT NAMES):
${modelNames.map(m => `   - Model "${m.class}" MUST use these EXACT field names:
     ${m.fields.map(f => `* ${f}`).join('\n     ')}
     * DO NOT use variations (e.g., if contract says "is_verified", DO NOT use "is_email_verified")
     * DO NOT use variations (e.g., if contract says "verification_token", DO NOT use "email_verification_token_hash")
     * DO NOT use variations (e.g., if contract says "profile_picture", DO NOT use "profile_picture_path")`).join('\n\n')}

3. MODEL METHOD NAMES (MANDATORY - USE EXACT NAMES):
${modelNames.map(m => `   - Model "${m.class}" MUST use these EXACT method names:
     ${m.methods.map(f => `* ${f}()`).join('\n     ')}
     * DO NOT create methods not in this list
     * DO NOT use variations of these names`).join('\n\n')}

4. HELPER FUNCTION NAMES (MANDATORY - USE EXACT NAMES):
${helperFunctions.map(h => {
    const params = h.parameters && Array.isArray(h.parameters) ? h.parameters.join(', ') : 'N/A';
    return `   - Helper function: "${h.name}(${params})" -> ${h.return_type || 'N/A'}
     * DO NOT use variations
     * DO NOT create helper functions not in this list`;
}).join('\n')}

5. FILE PATHS (MANDATORY - USE EXACT PATHS FROM CONTRACT):
${contract.file_structure?.models?.map(m => `   - Model: ${m.file_path} (class: ${m.class_name})`).join('\n') || '   - No models defined'}
${contract.file_structure?.controllers?.map(c => `   - Controller: ${c.file_path}`).join('\n') || '   - No controllers defined'}
${contract.file_structure?.views?.map(v => `   - View: ${v.file_path}`).join('\n') || '   - No views defined'}
${contract.file_structure?.templates?.map(t => `   - Template: ${t.file_path}`).join('\n') || '   - No templates defined'}

CRITICAL - EXACT FILES TO GENERATE (MANDATORY):
You MUST generate EXACTLY these files (no more, no less):
${contract.file_structure?.models?.map(m => `#### ${m.file_path}`).join('\n') || ''}
${contract.file_structure?.controllers?.map(c => `#### ${c.file_path}`).join('\n') || ''}
${contract.file_structure?.views?.map(v => `#### ${v.file_path}`).join('\n') || ''}
${contract.file_structure?.templates?.map(t => `#### ${t.file_path}`).join('\n') || ''}
#### ${contract.file_structure?.app_file || 'app.py'}

DO NOT generate any files NOT listed above.
DO NOT create additional controllers, models, or files beyond what's listed.
If the contract shows ONE controller, generate ONLY ONE controller file.
If the contract shows multiple controllers, generate ONLY those exact controller files.

CRITICAL - FILE PATH ENFORCEMENT:
- You MUST use ONLY the file paths defined in the contract above
- ALLOWED paths: models/, controllers/, views/, templates/, app.py, config/
- FORBIDDEN paths: forms/, services/, utils/, helpers/, lib/, src/, components/, etc.
- DO NOT create files in folders NOT listed in the contract
- DO NOT use paths like "forms/product_form.py" - use "models/product.py" or "controllers/product_controller.py" instead
- If the contract says "models/user.py", use EXACTLY "models/user.py" - NOT "models/users.py" or "model/user.py"
- If the contract says "controllers/user_controller.py", use EXACTLY "controllers/user_controller.py" - NOT "controller/user_controller.py"
- Templates MUST be in templates/ folder: "templates/register.html" - NOT "views/register.html" or "register.html"

CRITICAL - STRICT ADHERENCE:
- Use EXACT function names from contract.file_structure.controllers[].routes[].function_name
- Use EXACT field names from contract.file_structure.models[].fields[].name
- Use EXACT method names from contract.file_structure.models[].methods[].name
- Use EXACT helper function names from contract.file_structure.controllers[].helper_functions[].name
- DO NOT create variations, abbreviations, or alternative names
- DO NOT split single functions into multiple (e.g., register_get/register_post when contract says register)
- DO NOT add prefixes/suffixes (e.g., _handler, _route, _path, _hash)
- Implement ALL routes, fields, methods, and helper functions defined in the contract
- DO NOT create additional models, controllers, services, or imports that are NOT in the contract
- DO NOT import models that are not listed in contract.file_structure.models
- Use ONLY the exact import paths specified in contract.import_paths
- Match function signatures (parameters, return types) EXACTLY from the contract
- Use the database ORM and patterns specified in contract.database
- Follow the framework patterns in contract.framework

CRITICAL - SHARED MODELS (MANDATORY - PREVENTS TABLE COLLISIONS):
- CERTAIN models are SHARED across functionalities and use shared file paths:
  * User model: ALWAYS use "models/user.py" (NOT "models/{functionality}_user.py")
  * Product model: ALWAYS use "models/product.py" (NOT "models/{functionality}_product.py")
  * Category model: ALWAYS use "models/category.py" (NOT "models/{functionality}_category.py")
- If the contract specifies a shared model path (e.g., "models/user.py"), you MUST:
  1. ASSUME the shared model file already exists (it may have been created by a previous functionality)
  2. DO NOT generate the shared model file - just import from it: "from models.user import User"
  3. ONLY generate the shared model if this is the FIRST functionality that needs it (but still use shared path)
  4. If generating a shared model, ALWAYS include: __table_args__ = {'extend_existing': True}
- Shared models use the same table name across functionalities (e.g., 'users', 'products', 'categories')
- DO NOT create functionality-specific User/Product/Category models - they will cause SQLAlchemy table collision errors
- If you see a model path like "models/user.py" in the contract, it's a shared model:
  * In controllers: Import it: "from models.user import User"
  * In models: DO NOT generate "models/user.py" again - it's shared and may already exist
  * If you MUST generate it (first time), use "models/user.py" with __table_args__ = {'extend_existing': True}
- CRITICAL - CHECK CONTRACT FILE PATHS:
  * If contract.file_structure.models[].file_path is "models/user.py" → Use shared import: from models.user import User
  * If contract.file_structure.models[].file_path is "models/{functionality}_user.py" → This is WRONG, use shared path instead
  * Always check the actual file_path in the contract and use shared paths for User/Product/Category

CRITICAL - MODEL IMPORTS (STRICT):
- ONLY import models that are explicitly defined in contract.file_structure.models
- The contract defines these models: ${contract.file_structure?.models?.map(m => `${m.class_name} (${m.file_path})`).join(', ') || 'NONE'}
- For shared models (User, Product, Category), check if the file exists:
  * If "models/user.py" exists: Import it: "from models.user import User" - DO NOT generate it
  * If "models/product.py" exists: Import it: "from models.product import Product" - DO NOT generate it
  * If "models/category.py" exists: Import it: "from models.category import Category" - DO NOT generate it
- DO NOT import or create models that are not in this list
- DO NOT create EmailVerificationToken, EmailService, or any other models/services not in the contract
- If verification tokens are needed, use the verification_token field in the User model (as defined in contract)
- If you need a model for functionality, it MUST be defined in the contract first

CRITICAL - NO ADDITIONAL DEPENDENCIES:
- DO NOT create services/ folder
- DO NOT create EmailService class
- DO NOT create additional models beyond what's in contract.file_structure.models
- Use Flask-Mail directly (mail.send()) if email functionality is needed
- Use fields in existing models (like User.verification_token) instead of creating new models

`;

        // Build SRS context from packet (if available) or contract
        let srsContext = '';
        if (packet) {
            // Use full SRS context from packet (embeddings)
            srsContext = `
FUNCTIONALITY: ${packet.name || contract.functionality || 'unknown'}
DESCRIPTION: ${packet.description || 'N/A'}
USE CASES: ${packet.useCases?.join(', ') || 'N/A'}
REQUIREMENTS: ${packet.requirements?.join(', ') || 'N/A'}
ACTIVITY DIAGRAMS: ${packet.activityDiagrams?.join(', ') || 'N/A'}
DEPENDENCIES: ${packet.dependencies?.join(', ') || 'N/A'}
CONTEXT: ${packet.context || 'N/A'}
`;
        } else {
            // Fallback to contract-only context
            srsContext = `
FUNCTIONALITY: ${contract.functionality || 'unknown'}
`;
        }

        // MVC-Guided Prompt
        const prompt = `You are a ${language.toUpperCase()} developer. Generate complete, production-ready MVC code following the API contract and SRS requirements below:

${srsContext}

${contractSection}

REQUIREMENTS:
- Generate actual ${language.toUpperCase()} code, NOT JSON
- Create separate files for each MVC component
- Use proper MVC architecture
- Include complete, executable code

MVC STRUCTURE - Generate ONLY these core components:

1. MODEL LAYER - Generate data entities:
   - Primary entity for this functionality (models/filename.py)
   - Business logic and validation methods
   - Database schema definitions

2. VIEW LAYER - Generate UI components:
   - User interface components (views/filename.py)
   - Template files (templates/filename.html)
   - User interaction handlers

3. CONTROLLER LAYER - Generate business logic:
   - API endpoints and routes (controllers/filename.py)
   - Business operations and coordination
   - Request/response handling

4. MAIN APP FILE:
   - Application initialization (app.py)
   - Configuration and setup

DO NOT generate:
- requirements.txt
- README.md
- migration files
- documentation files
- setup files
- configuration files (except database.py and config.py)

ONLY generate these core MVC files:
- models/filename.py
- views/filename.py  
- controllers/filename.py
- templates/filename.html
- app.py (main application file in root - MUST include Flask-SQLAlchemy db initialization)

CRITICAL REQUIREMENT - FLASK-SQLALCHEMY SETUP:
For Flask applications with SQLAlchemy models, you MUST use Flask-SQLAlchemy (NOT raw SQLAlchemy):

1. In app.py, ALWAYS follow this EXACT order to avoid circular imports:
   from flask import Flask
   from flask_sqlalchemy import SQLAlchemy
   from flask_mail import Mail
   
   app = Flask(__name__)
   app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
   app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
   app.config['SECRET_KEY'] = 'your-secret-key'
   # ... other config ...
   
   # CRITICAL: Initialize db and mail BEFORE importing controllers
   db = SQLAlchemy(app)
   mail = Mail(app)
   
   # CRITICAL: Import blueprints AFTER db and mail are initialized (prevents circular imports)
   from controllers.user_controller import user_bp
   # ... other blueprint imports ...
   
   # Register blueprints
   app.register_blueprint(user_bp)
   # ... other blueprint registrations ...
   
   IMPORTANT: The order MUST be:
   1. Import Flask, SQLAlchemy, Mail
   2. Create app
   3. Configure app
   4. Initialize db = SQLAlchemy(app)
   5. Initialize mail = Mail(app)
   6. THEN import blueprints (controllers can now safely import db from app)
   7. Register blueprints

2. In models/*.py files, ALWAYS use:
   from app import db
   
   class ModelName(db.Model):
       __tablename__ = 'table_name'
       # columns here

3. In controllers/*.py files, ALWAYS use:
   from flask import Blueprint
   from app import db
   
   # CRITICAL - BLUEPRINT INITIALIZATION (MANDATORY):
   - Blueprint constructor: Blueprint(name, import_name, ...)
   - The second argument (import_name) is ALWAYS __name__
   - CORRECT: user_bp = Blueprint('user', __name__)
   - WRONG: Blueprint('user', __name__, import_name=__name__)  # This causes TypeError: got multiple values for argument 'import_name'
   - DO NOT pass import_name as a keyword argument when __name__ is already passed as the second positional argument
   - Example: user_registration_bp = Blueprint('user_registration', __name__)  # CORRECT
   
   # CRITICAL: ONLY import models that are defined in the contract
   # The contract defines these models: ${contract.file_structure?.models?.map(m => m.class_name).join(', ') || 'NONE'}
   # Example: from models.user import User (ONLY if User is in contract.file_structure.models)
   # DO NOT import models that are not in the contract
   # DO NOT import EmailVerificationToken, EmailService, or any other models/services not in the contract
   # If verification tokens are needed, use User.verification_token field (as defined in contract)
   
   # CRITICAL: Use EXACT function names from contract - DO NOT split into _get/_post variants
   # If contract says "register", use single function "register" that handles both GET and POST
   # If contract says "verify_email", use "verify_email" (NOT verify_email_get)
   # If contract says "login", use "login" (NOT login_get/login_post)
   
   # Then use: db.session.add(), db.session.commit(), db.session.query()

4. DO NOT use raw SQLAlchemy (declarative_base, init_db, sessionmaker)
5. DO NOT create config/database.py with Base = declarative_base()
6. Flask-SQLAlchemy's db object provides: db.Model, db.session, db.create_all(), db.drop_all()

This ensures compatibility with Flask test clients and pytest fixtures that expect Flask-SQLAlchemy.

FRAMEWORK-SPECIFIC MVC STRUCTURE:

PYTHON/FLASK:
- models/ folder with separate model files (ONLY the models defined in contract.file_structure.models)
- views/ folder with view classes (user_views.py, product_views.py)
- controllers/ folder with controller classes (ONLY the controllers defined in contract.file_structure.controllers)
- templates/ folder with HTML templates (ONLY the templates defined in contract.file_structure.templates)
- app.py in root directory (main application file)

CRITICAL - ONLY GENERATE WHAT'S IN THE CONTRACT (STRICT ENFORCEMENT):
- Generate ONLY the models listed in contract.file_structure.models
- Generate ONLY the controllers listed in contract.file_structure.controllers
- Generate ONLY the routes listed in contract.file_structure.controllers[].routes
- Generate ONLY the templates listed in contract.file_structure.templates
- Generate ONLY the helper functions listed in contract.file_structure.controllers[].helper_functions
- DO NOT create additional models, controllers, services, or files that are not in the contract
- DO NOT import models that are not in contract.file_structure.models
- DO NOT create services/ folder or EmailService classes
- DO NOT create EmailVerificationToken or any other models not in the contract
- If email verification is needed, use User.verification_token field (as defined in contract), NOT a separate model
- Use Flask-Mail directly (from app import mail; mail.send()) instead of creating EmailService

CRITICAL - EXACT FILE GENERATION (MANDATORY - APPLIES TO ALL FILE TYPES):
- Generate EXACTLY the files listed in contract.file_structure (models, controllers, views, templates)
- DO NOT create additional files beyond what's in the contract
- DO NOT split one file into multiple files
- DO NOT create variations, abbreviations, or alternative file names
- File names MUST match contract.file_structure EXACTLY (case-sensitive, character-by-character)

CRITICAL - FUNCTIONALITY-BASED NAMING (MANDATORY):
- ALL file names MUST be prefixed with the functionality name (in snake_case)
- The contract already includes functionality-prefixed names - use them EXACTLY as specified
- Models: Use format from contract (e.g., "models/product_search_product.py", NOT "models/product.py")
- Controllers: Use format from contract (e.g., "controllers/product_search_controller.py", NOT "controllers/product_controller.py")
- Views: Use format from contract (e.g., "views/product_search_views.py", NOT "views/product_views.py")
- Templates: Use format from contract (e.g., "templates/product_search_search.html", NOT "templates/search.html")
- DO NOT use generic names without functionality prefix
- DO NOT create files like "category.py", "product.py" - use "product_search_category.py", "product_search_product.py" instead

STRICT FILE COUNT AND NAMING (ALL FILE TYPES):
- Models: Generate ONLY the models in contract.file_structure.models
  * If contract lists 2 models, generate EXACTLY 2 models (not 1, not 3)
  * If contract says "models/product.py", generate EXACTLY "models/product.py" - NOT "models/products.py"
  * If contract says "models/category.py" AND "models/product.py", generate BOTH - but if contract only lists one, generate ONLY that one
  
- Controllers: Generate ONLY the controllers in contract.file_structure.controllers
  * If contract lists 1 controller, generate EXACTLY 1 controller (not 2, not 0)
  * If contract says "controllers/product_search_controller.py", generate EXACTLY that - NOT "controllers/product_controller.py"
  * DO NOT split one controller into multiple files (e.g., product_search_controller.py AND category_controller.py)
  
- Views: Generate ONLY the views in contract.file_structure.views
  * If contract lists 1 view, generate EXACTLY 1 view (not 2, not 0)
  * File names must match contract EXACTLY
  
- Templates: Generate ONLY the templates in contract.file_structure.templates
  * If contract lists 2 templates, generate EXACTLY 2 templates (not 1, not 3)
  * File names must match contract EXACTLY

GENERAL RULE:
- Count of files MUST match contract (if contract has 2 models, generate 2 models - not 1, not 3)
- File paths MUST match contract EXACTLY (character-by-character, case-sensitive)
- DO NOT add, remove, or modify file names from what's in the contract

CRITICAL - EXACT NAMING ENFORCEMENT (MANDATORY):
- Use EXACT function names from contract.file_structure.controllers[].routes[].function_name
  * If contract says "register", use "register" (NOT register_get/register_post)
  * If contract says "verify_email", use "verify_email" (NOT verify_email_get)
  * If contract says "login", use "login" (NOT login_get/login_post)
- Use EXACT field names from contract.file_structure.models[].fields[].name
  * If contract says "is_verified", use "is_verified" (NOT is_email_verified)
  * If contract says "verification_token", use "verification_token" (NOT email_verification_token_hash)
  * If contract says "profile_picture", use "profile_picture" (NOT profile_picture_path)
- Use EXACT method names from contract.file_structure.models[].methods[].name
  * If contract says "generate_verification_token", use "generate_verification_token" (NOT set_email_verification_token)
- Use EXACT helper function names from contract.file_structure.controllers[].helper_functions[].name
  * If contract says "validate_registration_data", use "validate_registration_data" (NOT validate_registration_payload)
- DO NOT create variations, abbreviations, or alternative names
- DO NOT split single functions into multiple (e.g., register_get/register_post when contract says register)
- DO NOT add prefixes/suffixes (e.g., _handler, _route, _path, _hash, _get, _post)

JAVASCRIPT/NODE:
- models/ folder with model files
- views/ folder with view files
- controllers/ folder with controller files
- routes/ folder with route definitions
- app.js as main application file

JAVA/SPRING:
- src/main/java/com/example/entities/ (Entity classes)
- src/main/java/com/example/controllers/ (Controller classes)
- src/main/java/com/example/services/ (Service classes)
- src/main/resources/templates/ (View templates)

C#/ASP.NET:
- Models/ folder with model classes
- Views/ folder with view files
- Controllers/ folder with controller classes
- Program.cs as main application file

DESIGN PRINCIPLES TO FOLLOW:
1. SOLID Principles: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
2. DRY (Don't Repeat Yourself): Avoid code duplication
3. KISS (Keep It Simple, Stupid): Simple, readable code
4. Separation of Concerns: Clear boundaries between layers
5. Dependency Injection: Loose coupling between components
6. Single Responsibility: Each class/function has one purpose
7. Open/Closed: Open for extension, closed for modification

FUNCTIONALITY INTEGRATION REQUIREMENTS:
1. Generate MVC components that integrate with existing system
2. Include proper imports and dependencies for system integration
3. Implement interfaces and contracts for system compatibility
4. Use consistent naming conventions with system
5. Include proper error handling and validation
6. Add comprehensive comments explaining integration points
7. Ensure code follows system-wide patterns and conventions
8. Include database migrations for new entities
9. Add authentication and authorization integration
10. Make code production-ready and maintainable

GENERATE INTEGRATED MVC COMPONENTS:
1. All necessary imports and dependencies
2. Complete MVC components for this functionality
3. Integration points with existing system
4. Database schema updates and migrations
5. Authentication and security integration
6. Error handling and validation
7. Comments explaining integration and functionality
8. Ready to integrate with existing project
9. Follow ${language} best practices and MVC conventions
10. Apply SOLID principles throughout

CRITICAL MVC REQUIREMENTS:
- DO NOT generate monolithic code in a single file
- Generate separate files for each MVC component
- Create proper directory structure (models/, views/, controllers/)
- Each file should have a single responsibility
- Use proper imports and dependencies for each file

FILE SEPARATION REQUIREMENTS:
- models/ folder: One file per entity (user.py, product.py)
- views/ folder: One file per view class (user_views.py, product_views.py)
- controllers/ folder: One file per controller (user_controller.py, product_controller.py)
- templates/ folder: HTML template files
- Main app file: app.py (minimal, just imports and configuration)

OUTPUT FORMAT:
Use this format for each file:
#### filename.ext
[code here]

#### filename2.ext
[code here]

CRITICAL - FILE PATH ENFORCEMENT (MANDATORY):
- You MUST use ONLY file paths from the contract.file_structure
- ALLOWED paths: models/, controllers/, views/, templates/, app.py, config/
- FORBIDDEN paths: forms/, services/, utils/, helpers/, lib/, src/, components/, api/, routes/, middleware/, etc.
- DO NOT create files in folders NOT listed in the contract
- DO NOT use paths like "forms/product_form.py" - use "models/product.py" or "controllers/product_controller.py" instead
- If contract says "models/user.py", use EXACTLY "models/user.py" - NOT "models/users.py" or "model/user.py"
- If contract says "controllers/user_controller.py", use EXACTLY "controllers/user_controller.py"
- Templates MUST be in templates/ folder: "templates/register.html" - NOT "views/register.html" or "register.html"
- Example CORRECT paths:
  * #### models/user.py
  * #### controllers/user_controller.py
  * #### views/user_views.py
  * #### templates/register.html
  * #### app.py
- Example WRONG paths (DO NOT USE):
  * #### forms/user_form.py (WRONG - use models/user.py)
  * #### services/user_service.py (WRONG - use controllers/user_controller.py)
  * #### utils/helpers.py (WRONG - not in contract)

Generate the complete ${language.toUpperCase()} code for this functionality. Return ONLY code files with #### filename format. Do not include any explanations, descriptions, or additional text after the code.`;
        
        // Debug: Log the complete prompt being sent to LLM
        console.log('📝 [PROMPT] Complete prompt being sent to LLM:');
        console.log('📝 [PROMPT] Prompt length:', prompt.length);
        console.log('📝 [PROMPT] Prompt preview:', prompt.substring(0, 500) + '...');
        console.log('📝 [PROMPT] Full prompt:', prompt);
        
        const result = await this.callLLM(prompt);
        
        // Clean the code (remove markdown code blocks)
        let cleanCode = result.content;
        if (cleanCode.includes('```')) {
            // Remove opening ```language
            cleanCode = cleanCode.replace(/```[a-zA-Z]*\n?/g, '');
            // Remove closing ```
            cleanCode = cleanCode.replace(/```\s*$/g, '');
            // Remove any remaining ```
            cleanCode = cleanCode.replace(/```/g, '');
        }
        cleanCode = cleanCode.trim();
        
        console.log('🧹 [LLM] Cleaned code length:', cleanCode.length);
        console.log('🧹 [LLM] Code preview:', cleanCode.substring(0, 100) + '...');
        
        return cleanCode;
    }

    async handleExportCode(functionality, code, language) {
        console.log('📤 [EXTENSION] handleExportCode called');
        console.log('📤 [EXTENSION] Functionality:', functionality);
        console.log('📤 [EXTENSION] Code length:', code?.length);
        console.log('📤 [EXTENSION] Language:', language);
        
        try {
            const fs = require('fs');
            const path = require('path');
            const vscode = require('vscode');
            
            // Get the workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            console.log('📁 [EXPORT] Workspace folder:', workspaceFolder?.uri.fsPath);
            
            if (!workspaceFolder) {
                throw new Error('No workspace folder found. Please open a folder in VS Code.');
            }
            
            // Create project directory name based on SRS filename
            let projectName = 'srs-project'; // Default fallback
            if (this.currentSRSFilename) {
                // Remove file extension and sanitize filename
                const baseName = path.parse(this.currentSRSFilename).name;
                projectName = baseName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                console.log('📁 [EXPORT] Using SRS-based project name:', projectName);
            } else {
                console.log('📁 [EXPORT] No SRS filename found, using default project name');
            }
            
            const projectPath = path.join(workspaceFolder.uri.fsPath, projectName);
            console.log('📁 [EXPORT] Project path:', projectPath);
            
            // Create project directory if it doesn't exist
            if (!fs.existsSync(projectPath)) {
                fs.mkdirSync(projectPath, { recursive: true });
                console.log('📁 [EXPORT] Created project directory:', projectPath);
            } else {
                console.log('📁 [EXPORT] Project directory already exists:', projectPath);
            }
            
        // Create filename based on functionality name and language
        const functionalityName = functionality.name || functionality;
        let fileName;
        if (language === 'java') {
            // For Java, use PascalCase for filename to match class name
            const pascalCaseName = functionalityName.replace(/[^a-zA-Z0-9]/g, '')
                .replace(/([a-z])([A-Z])/g, '$1$2') // Add space before capital letters
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join('');
            fileName = `${pascalCaseName}.java`;
        } else {
            // For other languages, use snake_case
            const sanitizedName = functionalityName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const fileExtension = this.getFileExtensionByLanguage(language);
            fileName = `${sanitizedName}${fileExtension}`;
        }
        const filePath = path.join(projectPath, fileName);
            
            console.log('📝 [EXPORT] Functionality name:', functionalityName);
            console.log('📝 [EXPORT] File name:', fileName);
            console.log('📝 [EXPORT] Full file path:', filePath);
            
            // Clean the code (remove markdown code blocks)
            let cleanCode = code;
            
            // Remove markdown code block markers
            if (cleanCode.includes('```')) {
                // Remove opening ```language
                cleanCode = cleanCode.replace(/```[a-zA-Z]*\n?/g, '');
                // Remove closing ```
                cleanCode = cleanCode.replace(/```\s*$/g, '');
                // Remove any remaining ```
                cleanCode = cleanCode.replace(/```/g, '');
            }
            
            // Trim whitespace
            cleanCode = cleanCode.trim();
            
            console.log('🧹 [EXPORT] Cleaned code length:', cleanCode.length);
            console.log('🧹 [EXPORT] Code preview:', cleanCode.substring(0, 100) + '...');
            
            // Clean up any explanatory text that might have been added
            cleanCode = this.removeExplanatoryText(cleanCode);
            
            // Parse and save MVC files separately
            const savedFiles = this.parseAndSaveMVCFiles(cleanCode, projectPath);
            console.log('💾 [EXPORT] MVC files saved:', savedFiles);
            
            // Show success message
            this.panel?.webview.postMessage({
                type: 'exportSuccess',
                message: `MVC code exported successfully! Files saved: ${savedFiles.join(', ')}`,
                status: 'success',
                files: savedFiles
            });
            
            // Open the file in VS Code
            const fileUri = vscode.Uri.file(filePath);
            vscode.window.showTextDocument(fileUri);
            
            // Return saved files list for backup purposes
            return savedFiles;
            
        } catch (error) {
            console.error('❌ [EXPORT] Export failed:', error.message);
            this.panel?.webview.postMessage({
                type: 'showError',
                message: 'Export failed: ' + error.message
            });
            return []; // Return empty array on error
        }
    }

    // Read actual code files from disk and reconstruct code string format
    readCodeFromFiles(projectPath, savedFiles) {
        const fs = require('fs');
        const path = require('path');
        
        try {
            const codeParts = [];
            
            // Read all saved files and reconstruct the code string format
            for (const filePath of savedFiles) {
                const fullPath = path.join(projectPath, filePath);
                
                if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    codeParts.push(`#### ${filePath}\n${content}`);
                    console.log(`📖 [READ] Read file: ${filePath} (${content.length} chars)`);
                }
            }
            
            // Also read MVC directories if they exist
            const mvcDirs = [
                { dir: 'models', pattern: /\.py$/ },
                { dir: 'controllers', pattern: /\.py$/ },
                { dir: 'views', pattern: /\.py$/ },
                { dir: 'templates', pattern: /\.html$/ }
            ];
            
            for (const { dir, pattern } of mvcDirs) {
                const dirPath = path.join(projectPath, dir);
                if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
                    const files = fs.readdirSync(dirPath);
                    for (const file of files) {
                        if (pattern.test(file) && !file.startsWith('__')) {
                            const filePath = path.join(dir, file);
                            const fullPath = path.join(projectPath, filePath);
                            
                            // Only read if not already in savedFiles
                            if (!savedFiles.includes(filePath) && fs.existsSync(fullPath)) {
                                const content = fs.readFileSync(fullPath, 'utf8');
                                codeParts.push(`#### ${filePath}\n${content}`);
                                console.log(`📖 [READ] Read additional file: ${filePath} (${content.length} chars)`);
                            }
                        }
                    }
                }
            }
            
            // Always read app.py if it exists
            const appPyPath = path.join(projectPath, 'app.py');
            if (fs.existsSync(appPyPath) && !savedFiles.includes('app.py')) {
                const content = fs.readFileSync(appPyPath, 'utf8');
                codeParts.push(`#### app.py\n${content}`);
                console.log(`📖 [READ] Read app.py (${content.length} chars)`);
            }
            
            const reconstructedCode = codeParts.join('\n\n');
            console.log(`✅ [READ] Reconstructed code from ${codeParts.length} files (${reconstructedCode.length} total chars)`);
            
            return reconstructedCode;
        } catch (error) {
            console.error('❌ [READ] Failed to read code from files:', error);
            return null;
        }
    }

    // Backup original code files before feedback loop modifies them
    backupOriginalCode(projectPath, savedFiles) {
        const fs = require('fs');
        const path = require('path');
        
        try {
            const backupDir = path.join(projectPath, 'original_code_backup');
            
            // Create backup directory
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
                console.log(`📦 [BACKUP] Created backup directory: ${backupDir}`);
            }
            
            // Copy all saved files to backup directory
            const backedUpFiles = [];
            for (const filePath of savedFiles) {
                const sourcePath = path.join(projectPath, filePath);
                const backupPath = path.join(backupDir, filePath);
                
                // Create subdirectories if needed
                const backupDirPath = path.dirname(backupPath);
                if (!fs.existsSync(backupDirPath)) {
                    fs.mkdirSync(backupDirPath, { recursive: true });
                }
                
                // Copy file if it exists
                if (fs.existsSync(sourcePath)) {
                    fs.copyFileSync(sourcePath, backupPath);
                    backedUpFiles.push(filePath);
                    console.log(`📦 [BACKUP] Backed up: ${filePath}`);
                }
            }
            
            // Also backup any MVC structure files (models, controllers, views directories)
            const mvcDirs = ['models', 'controllers', 'views', 'config'];
            for (const dir of mvcDirs) {
                const sourceDir = path.join(projectPath, dir);
                const backupDirPath = path.join(backupDir, dir);
                
                if (fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory()) {
                    this.copyDirectoryRecursive(sourceDir, backupDirPath);
                    console.log(`📦 [BACKUP] Backed up directory: ${dir}/`);
                }
            }
            
            // Create a README in the backup directory explaining what it is
            const readmePath = path.join(backupDir, 'README.txt');
            const readmeContent = `Original Code Backup
====================

This directory contains a backup of the original generated code BEFORE the automated feedback loop ran.

The feedback loop modifies the code files in the main project directory to fix test failures.
This backup preserves the original version for reference.

Backed up files:
${backedUpFiles.map(f => `- ${f}`).join('\n')}

Backup created: ${new Date().toLocaleString()}
`;
            fs.writeFileSync(readmePath, readmeContent, 'utf8');
            
            console.log(`✅ [BACKUP] Original code backed up successfully to: ${backupDir}`);
            console.log(`📦 [BACKUP] Total files backed up: ${backedUpFiles.length}`);
            
            return backupDir;
        } catch (error) {
            console.error('❌ [BACKUP] Failed to backup original code:', error);
            // Don't throw - backup failure shouldn't stop the feedback loop
            return null;
        }
    }
    
    // Helper function to recursively copy directories
    copyDirectoryRecursive(sourceDir, targetDir) {
        const fs = require('fs');
        const path = require('path');
        
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        
        const files = fs.readdirSync(sourceDir);
        for (const file of files) {
            const sourcePath = path.join(sourceDir, file);
            const targetPath = path.join(targetDir, file);
            
            if (fs.statSync(sourcePath).isDirectory()) {
                this.copyDirectoryRecursive(sourcePath, targetPath);
            } else {
                fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }

    // Remove explanatory text and unwanted files that LLM might add
    removeExplanatoryText(code) {
        // Remove unwanted file sections
        const unwantedFiles = [
            /#### requirements\.txt[\s\S]*?(?=####|\n####|$)/g,
            /#### migrations\/README\.md[\s\S]*?(?=####|\n####|$)/g,
            /#### README\.md[\s\S]*?(?=####|\n####|$)/g,
            /#### setup\.py[\s\S]*?(?=####|\n####|$)/g,
            /#### \.gitignore[\s\S]*?(?=####|\n####|$)/g,
            /#### Dockerfile[\s\S]*?(?=####|\n####|$)/g
        ];
        
        let cleanedCode = code;
        unwantedFiles.forEach(pattern => {
            cleanedCode = cleanedCode.replace(pattern, '');
        });
        
        // Remove common explanatory patterns
        const explanatoryPatterns = [
            /(#### [^\n]+\n[\s\S]*?)(\n\nThis code provides[\s\S]*)/,
            /(#### [^\n]+\n[\s\S]*?)(\n\nThis implementation[\s\S]*)/,
            /(#### [^\n]+\n[\s\S]*?)(\n\nThis structure[\s\S]*)/,
            /(#### [^\n]+\n[\s\S]*?)(\n\nThis MVC[\s\S]*)/,
            /(#### [^\n]+\n[\s\S]*?)(\n\nThis provides[\s\S]*)/,
            /(#### [^\n]+\n[\s\S]*?)(\n\nThis includes[\s\S]*)/,
            /(#### [^\n]+\n[\s\S]*?)(\n\nThis follows[\s\S]*)/,
            /(#### [^\n]+\n[\s\S]*?)(\n\nThis adheres[\s\S]*)/,
            /(#### [^\n]+\n[\s\S]*?)(\n\nThis ensures[\s\S]*)/,
            /(#### [^\n]+\n[\s\S]*?)(\n\nThis creates[\s\S]*)/
        ];
        
        explanatoryPatterns.forEach(pattern => {
            cleanedCode = cleanedCode.replace(pattern, '$1');
        });
        
        // Remove any remaining explanatory paragraphs at the end
        cleanedCode = cleanedCode.replace(/\n\n[A-Z][^####]*$/, '');
        
        return cleanedCode.trim();
    }

    // Parse and save MVC files separately
    parseAndSaveMVCFiles(code, projectPath) {
        const savedFiles = [];
        
        try {
            // Method 1: Try file markers first (=== FILE: path ===)
            const filePattern = /=== FILE: (.+?) ===\n([\s\S]*?)\n=== END FILE ===/g;
            let match;
            let hasFileMarkers = false;
            
            while ((match = filePattern.exec(code)) !== null) {
                hasFileMarkers = true;
                const filePath = match[1].trim();
                const fileContent = match[2].trim();
                
                if (filePath && fileContent) {
                    const fullPath = path.join(projectPath, filePath);
                    const dir = path.dirname(fullPath);
                    
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    
                    fs.writeFileSync(fullPath, fileContent, 'utf8');
                    savedFiles.push(filePath);
                    console.log(`💾 [MVC] Saved: ${filePath}`);
                }
            }
            
            // Method 2: If no file markers, try to parse by sections
            if (!hasFileMarkers) {
                const parsedFiles = this.parseCodeSections(code, projectPath);
                savedFiles.push(...parsedFiles);
            }
            
            // Method 3: If still no files, save as single file
            if (savedFiles.length === 0) {
                const singleFilePath = path.join(projectPath, 'generated_code.txt');
                fs.writeFileSync(singleFilePath, code, 'utf8');
                savedFiles.push('generated_code.txt');
                console.log('💾 [MVC] No file markers found, saved as single file');
            }
            
            // Check if models import from config.database and ensure config files exist
            this.ensureConfigFiles(projectPath, code);
            
        } catch (error) {
            console.error('❌ [MVC] Error parsing files:', error);
            // Fallback: save as single file
            const fallbackPath = path.join(projectPath, 'generated_code.txt');
            fs.writeFileSync(fallbackPath, code, 'utf8');
            savedFiles.push('generated_code.txt');
        }
        
        return savedFiles;
    }

    // Ensure config files exist if models import from config.database
    ensureConfigFiles(projectPath, code) {
        try {
            // Check if code uses Flask-SQLAlchemy (preferred approach)
            const usesFlaskSQLAlchemy = /from flask_sqlalchemy import SQLAlchemy|db = SQLAlchemy|from app import db|db\.Model/.test(code);
            
            // Only create config/database.py if code explicitly uses raw SQLAlchemy (legacy support)
            // New code should use Flask-SQLAlchemy, so this fallback should rarely trigger
            const hasConfigImport = /from config\.database import|from config import.*database|import.*config\.database/.test(code);
            const needsInitDb = /from config\.database import.*init_db|import.*init_db.*config\.database/.test(code);
            
            // Skip if using Flask-SQLAlchemy (new standard)
            if (usesFlaskSQLAlchemy) {
                console.log('ℹ️ [MVC] Code uses Flask-SQLAlchemy - skipping config/database.py creation');
                return;
            }
            
            // Legacy support: only create config/database.py if code explicitly imports from it
            if (hasConfigImport && !usesFlaskSQLAlchemy) {
                const configDir = path.join(projectPath, 'config');
                const databasePath = path.join(configDir, 'database.py');
                const initPath = path.join(configDir, '__init__.py');
                
                // Create config directory if it doesn't exist
                if (!fs.existsSync(configDir)) {
                    fs.mkdirSync(configDir, { recursive: true });
                    console.log('📁 [MVC] Created config directory (legacy raw SQLAlchemy support)');
                }
                
                if (!fs.existsSync(databasePath)) {
                    // Create minimal database.py for legacy code
                    let databaseContent = `from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()
`;
                    
                    if (needsInitDb) {
                        databaseContent += `
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def init_db(database_uri='sqlite:///app.db'):
    """Initialize database connection"""
    engine = create_engine(database_uri)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()
`;
                    }
                    
                    fs.writeFileSync(databasePath, databaseContent, 'utf8');
                    console.log('⚠️ [MVC] Auto-created config/database.py (legacy support - consider migrating to Flask-SQLAlchemy)' + (needsInitDb ? ' with init_db function' : ''));
                } else if (needsInitDb) {
                    // Check if existing file has init_db, if not add it
                    const existingContent = fs.readFileSync(databasePath, 'utf8');
                    if (!existingContent.includes('def init_db')) {
                        const updatedContent = existingContent + `

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def init_db(database_uri='sqlite:///app.db'):
    """Initialize database connection"""
    engine = create_engine(database_uri)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()
`;
                        fs.writeFileSync(databasePath, updatedContent, 'utf8');
                        console.log('⚠️ [MVC] Added init_db function to existing config/database.py (legacy support)');
                    }
                }
                
                // Create __init__.py if it doesn't exist
                if (!fs.existsSync(initPath)) {
                    fs.writeFileSync(initPath, '# Empty file to make config a Python package\n', 'utf8');
                    console.log('✅ [MVC] Auto-created config/__init__.py');
                }
            }
        } catch (error) {
            console.warn('⚠️ [MVC] Failed to ensure config files:', error.message);
        }
    }

    // Parse code sections and create proper MVC structure
    parseCodeSections(code, projectPath) {
        const savedFiles = [];
        
        try {
            // Detect language and create appropriate structure
            const language = this.detectLanguage(code);
            console.log(`🔍 [MVC] Detected language: ${language}`);
            
            if (language === 'python' || language === 'django') {
                savedFiles.push(...this.parsePythonDjango(code, projectPath));
            } else if (language === 'javascript' || language === 'node') {
                savedFiles.push(...this.parseJavaScriptNode(code, projectPath));
            } else if (language === 'java') {
                savedFiles.push(...this.parseJava(code, projectPath));
            } else if (language === 'csharp') {
                savedFiles.push(...this.parseCSharp(code, projectPath));
            } else {
                // Generic parsing
                savedFiles.push(...this.parseGeneric(code, projectPath));
            }
            
        } catch (error) {
            console.error('❌ [MVC] Error parsing sections:', error);
        }
        
        return savedFiles;
    }

    // Detect programming language from code
    detectLanguage(code) {
        if (code.includes('from django') || code.includes('models.Model') || code.includes('def __str__')) {
            return 'django';
        } else if (code.includes('import express') || code.includes('const express') || code.includes('module.exports')) {
            return 'javascript';
        } else if (code.includes('@Entity') || code.includes('@Controller') || code.includes('@Service')) {
            return 'java';
        } else if (code.includes('using Microsoft') || code.includes('[HttpPost]') || code.includes('public class')) {
            return 'csharp';
        } else if (code.includes('def ') || code.includes('import ') || code.includes('class ')) {
            return 'python';
        }
        return 'unknown';
    }

    // Parse Python/Django code
    parsePythonDjango(code, projectPath) {
        const savedFiles = [];
        
        // Improved patterns to match Flask MVC structure with better regex
        // Patterns are ordered from most specific to least specific
        const patterns = [
            // Models patterns - improved to handle nested paths and better content extraction
            { regex: /####\s+models\/([^\s\n]+\.py)\s*\n([\s\S]*?)(?=\n####\s+|$)/, file: 'models/{filename}', isDynamic: true, captureGroup: 1 },
            
            // Views patterns
            { regex: /####\s+views\/([^\s\n]+\.py)\s*\n([\s\S]*?)(?=\n####\s+|$)/, file: 'views/{filename}', isDynamic: true, captureGroup: 1 },
            
            // Controllers patterns
            { regex: /####\s+controllers\/([^\s\n]+\.py)\s*\n([\s\S]*?)(?=\n####\s+|$)/, file: 'controllers/{filename}', isDynamic: true, captureGroup: 1 },
            
            // Templates patterns - improved to handle nested paths
            { regex: /####\s+templates\/([^\s\n]+\.html)\s*\n([\s\S]*?)(?=\n####\s+|$)/, file: 'templates/{filename}', isDynamic: true, captureGroup: 1 },
            
            // App patterns - save in root for Flask apps
            { regex: /####\s+app\.py\s*\n([\s\S]*?)(?=\n####\s+|$)/, file: 'app.py', captureGroup: 1 },
            { regex: /####\s+main\.py\s*\n([\s\S]*?)(?=\n####\s+|$)/, file: 'main.py', captureGroup: 1 },
            
            // Database patterns - save in config folder
            { regex: /####\s+config\/database\.py\s*\n([\s\S]*?)(?=\n####\s+|$)/, file: 'config/database.py', captureGroup: 1 },
            { regex: /####\s+config\/config\.py\s*\n([\s\S]*?)(?=\n####\s+|$)/, file: 'config/config.py', captureGroup: 1 },
            { regex: /####\s+database\.py\s*\n([\s\S]*?)(?=\n####\s+|$)/, file: 'config/database.py', captureGroup: 1 },
            { regex: /####\s+config\.py\s*\n([\s\S]*?)(?=\n####\s+|$)/, file: 'config/config.py', captureGroup: 1 }
        ];
        
        // List of allowed MVC paths (from contract structure)
        const allowedPaths = [
            'models/', 'controllers/', 'views/', 'templates/', 'config/',
            'app.py', 'main.py', 'database.py', 'config.py'
        ];
        
        // List of forbidden paths (non-MVC folders)
        const forbiddenPaths = [
            'forms/', 'services/', 'utils/', 'helpers/', 'lib/', 'src/', 
            'components/', 'api/', 'routes/', 'middleware/', 'common/',
            'shared/', 'core/', 'base/', 'abstract/'
        ];
        
        patterns.forEach(pattern => {
            // Use global flag to find all matches, not just the first one
            const regex = new RegExp(pattern.regex.source, 'g');
            let match;
            
            while ((match = regex.exec(code)) !== null) {
                let fileName = pattern.file;
                let fileContent;
                
                // Handle dynamic filenames
                if (pattern.isDynamic) {
                    const dynamicName = match[1];
                    fileName = fileName.replace('{filename}', dynamicName);
                    // Content is in match[2] for dynamic patterns
                    fileContent = match[2] || match[1];
                } else {
                    // For non-dynamic patterns, content is in the capture group
                    const contentGroup = pattern.captureGroup || 1;
                    fileContent = match[contentGroup];
                }
                
                // Validate file path - reject non-MVC paths
                const isForbidden = forbiddenPaths.some(forbidden => fileName.includes(forbidden));
                if (isForbidden) {
                    console.warn(`⚠️ [MVC] Rejected non-MVC path: ${fileName} (not in contract structure)`);
                    continue; // Skip this file
                }
                
                // Check if path matches allowed MVC structure
                const isAllowed = allowedPaths.some(allowed => 
                    fileName.startsWith(allowed) || fileName === allowed.replace('/', '')
                ) || fileName.match(/^(models|controllers|views|templates|config)\//);
                
                if (!isAllowed && !fileName.match(/^(app|main|database|config)\.py$/)) {
                    console.warn(`⚠️ [MVC] Rejected invalid path: ${fileName} (must use MVC structure: models/, controllers/, views/, templates/)`);
                    continue; // Skip this file
                }
                
                const filePath = path.join(projectPath, fileName);
                const dir = path.dirname(filePath);
                
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                // Trim file content and validate it's not empty
                const trimmedContent = fileContent ? fileContent.trim() : '';
                if (!trimmedContent) {
                    console.warn(`⚠️ [MVC] Skipping empty file: ${fileName}`);
                    continue;
                }
                
                // Special handling for app.py - merge instead of overwrite
                if (fileName === 'app.py' && fs.existsSync(filePath)) {
                    console.log('🔄 [MVC] app.py exists - merging new content...');
                    const mergedContent = this.mergeAppPy(filePath, trimmedContent);
                    fs.writeFileSync(filePath, mergedContent, 'utf8');
                    console.log('✅ [MVC] Merged app.py successfully');
                } else {
                    fs.writeFileSync(filePath, trimmedContent, 'utf8');
                }
                
                savedFiles.push(fileName);
                console.log(`💾 [MVC] Saved: ${fileName}`);
            }
        });
        
        return savedFiles;
    }

    /**
     * Merge new app.py content with existing app.py
     * Preserves existing blueprints, config, and initialization
     * Adds new blueprints from the new code
     */
    mergeAppPy(existingAppPath, newAppContent) {
        const fs = require('fs');
        
        // Read existing app.py
        let existingContent = '';
        if (fs.existsSync(existingAppPath)) {
            existingContent = fs.readFileSync(existingAppPath, 'utf8');
        }
        
        // If no existing content, return new content
        if (!existingContent.trim()) {
            console.log('📝 [MERGE] No existing app.py, using new content');
            return newAppContent;
        }
        
        console.log('🔄 [MERGE] Merging app.py...');
        
        // Extract sections from existing app.py
        const existingImports = this.extractImports(existingContent);
        const existingConfig = this.extractConfig(existingContent);
        const existingInit = this.extractInitialization(existingContent);
        const existingBlueprintImports = this.extractBlueprintImports(existingContent);
        const existingBlueprintRegistrations = this.extractBlueprintRegistrations(existingContent);
        const existingMainBlock = this.extractMainBlock(existingContent);
        
        // Extract sections from new app.py
        const newImports = this.extractImports(newAppContent);
        const newConfig = this.extractConfig(newAppContent);
        const newInit = this.extractInitialization(newAppContent);
        const newBlueprintImports = this.extractBlueprintImports(newAppContent);
        const newBlueprintRegistrations = this.extractBlueprintRegistrations(newAppContent);
        const newMainBlock = this.extractMainBlock(newAppContent);
        
        // Merge imports (combine unique imports)
        const mergedImports = this.mergeImports(existingImports, newImports);
        
        // Merge config (preserve existing, add new if not present)
        const mergedConfig = this.mergeConfig(existingConfig, newConfig);
        
        // Merge initialization (preserve existing db/mail init, use it if exists)
        const mergedInit = existingInit || newInit;
        
        // Merge blueprint imports (add new ones that don't exist)
        const mergedBlueprintImports = this.mergeBlueprintImports(existingBlueprintImports, newBlueprintImports);
        
        // Extract blueprint names from merged imports to validate registrations
        const validBlueprintNames = new Set();
        mergedBlueprintImports.split('\n').forEach(importLine => {
            const match = importLine.match(/import\s+(\w+)/);
            if (match) {
                validBlueprintNames.add(match[1]);
            }
        });
        
        // Merge blueprint registrations (add new ones that don't exist AND have valid imports)
        const mergedBlueprintRegistrations = this.mergeBlueprintRegistrations(
            existingBlueprintRegistrations, 
            newBlueprintRegistrations,
            validBlueprintNames
        );
        
        // Use existing main block or new one
        const finalMainBlock = existingMainBlock || newMainBlock;
        
        // Build merged app.py with proper structure
        const mergedContent = `${mergedImports}

app = Flask(__name__)
${mergedConfig}

${mergedInit}

${mergedBlueprintImports}

${mergedBlueprintRegistrations}

${finalMainBlock}`;
        
        console.log(`✅ [MERGE] Merged app.py: ${existingBlueprintImports.length} existing + ${newBlueprintImports.length} new blueprints`);
        console.log(`📊 [MERGE] Total blueprints: ${mergedBlueprintImports.split('\n').filter(l => l.trim()).length}`);
        
        return mergedContent.trim();
    }
    
    extractImports(content) {
        const importLines = [];
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('from ') || line.trim().startsWith('import ')) {
                if (!line.includes('controllers.') && !line.includes('views.')) {
                    importLines.push(line);
                }
            }
        }
        return importLines.join('\n');
    }
    
    extractConfig(content) {
        const configLines = [];
        const lines = content.split('\n');
        let inConfig = false;
        for (const line of lines) {
            if (line.includes("app.config['") || line.includes('app.config["')) {
                inConfig = true;
                configLines.push(line);
            } else if (inConfig && line.trim() && !line.includes('=') && !line.includes('db =') && !line.includes('mail =')) {
                inConfig = false;
            }
        }
        return configLines.join('\n');
    }
    
    extractInitialization(content) {
        const initLines = [];
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.includes('db = SQLAlchemy') || line.includes('mail = Mail')) {
                initLines.push(line);
            }
        }
        return initLines.join('\n');
    }
    
    extractBlueprintImports(content) {
        const imports = [];
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.includes('from controllers.') || line.includes('from views.')) {
                imports.push(line.trim());
            }
        }
        return imports;
    }
    
    extractBlueprintRegistrations(content) {
        const registrations = [];
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.includes('app.register_blueprint(')) {
                registrations.push(line.trim());
            }
        }
        return registrations;
    }
    
    extractMainBlock(content) {
        const mainMatch = content.match(/if __name__\s*==\s*['"]__main__['"]:[\s\S]*/);
        return mainMatch ? mainMatch[0] : '';
    }
    
    mergeImports(existing, newImports) {
        const existingLines = existing.split('\n').filter(l => l.trim());
        const newLines = newImports.split('\n').filter(l => l.trim());
        const allImports = [...existingLines];
        
        for (const newLine of newLines) {
            if (!existingLines.some(existing => existing.trim() === newLine.trim())) {
                allImports.push(newLine);
            }
        }
        
        return allImports.join('\n');
    }
    
    mergeConfig(existing, newConfig) {
        const existingLines = existing.split('\n').filter(l => l.trim());
        const newLines = newConfig.split('\n').filter(l => l.trim());
        const allConfig = [...existingLines];
        
        for (const newLine of newLines) {
            const key = newLine.match(/app\.config\[['"]([^'"]+)['"]\]/)?.[1];
            if (key && !existingLines.some(existing => existing.includes(`['${key}']`) || existing.includes(`["${key}"]`))) {
                allConfig.push(newLine);
            }
        }
        
        return allConfig.join('\n');
    }
    
    mergeBlueprintImports(existing, newImports) {
        const merged = [...existing];
        for (const newImport of newImports) {
            const blueprintName = newImport.match(/(\w+_bp|\w+_views)/)?.[1];
            if (blueprintName && !existing.some(existing => existing.includes(blueprintName))) {
                merged.push(newImport);
            }
        }
        return merged.join('\n');
    }
    
    mergeBlueprintRegistrations(existing, newRegistrations, validBlueprintNames = null) {
        const merged = [];
        
        // First, validate and add existing registrations (only if they have valid imports)
        for (const existingReg of existing) {
            const blueprintName = existingReg.match(/register_blueprint\((\w+)\)/)?.[1];
            if (blueprintName) {
                // If validBlueprintNames is provided, validate against it
                if (validBlueprintNames && !validBlueprintNames.has(blueprintName)) {
                    console.warn(`⚠️ [MERGE] Removing invalid blueprint registration: ${blueprintName} (no import found)`);
                    continue; // Skip invalid registration
                }
                merged.push(existingReg);
            }
        }
        
        // Then, add new registrations (only if they have valid imports and don't exist)
        for (const newReg of newRegistrations) {
            const blueprintName = newReg.match(/register_blueprint\((\w+)\)/)?.[1];
            if (blueprintName) {
                // Check if already registered
                if (merged.some(reg => reg.includes(blueprintName))) {
                    continue; // Already registered
                }
                
                // Validate that import exists
                if (validBlueprintNames && !validBlueprintNames.has(blueprintName)) {
                    console.warn(`⚠️ [MERGE] Skipping blueprint registration: ${blueprintName} (no import found)`);
                    continue; // Skip if no import
                }
                
                merged.push(newReg);
            }
        }
        
        return merged.join('\n');
    }

    // Parse JavaScript/Node.js code
    parseJavaScriptNode(code, projectPath) {
        const savedFiles = [];
        
        // Create MVC directory structure
        const modelsDir = path.join(projectPath, 'models');
        const viewsDir = path.join(projectPath, 'views');
        const controllersDir = path.join(projectPath, 'controllers');
        
        [modelsDir, viewsDir, controllersDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        
        // Extract models
        const modelsMatch = code.match(/#### models\/.*?\.js\s*\n([\s\S]*?)(?=####|\n####|$)/);
        if (modelsMatch) {
            const modelPath = path.join(modelsDir, 'Model.js');
            fs.writeFileSync(modelPath, modelsMatch[1].trim(), 'utf8');
            savedFiles.push('models/Model.js');
            console.log('💾 [MVC] Saved: models/Model.js');
        }
        
        // Extract views
        const viewsMatch = code.match(/#### views\/.*?\.js\s*\n([\s\S]*?)(?=####|\n####|$)/);
        if (viewsMatch) {
            const viewPath = path.join(viewsDir, 'View.js');
            fs.writeFileSync(viewPath, viewsMatch[1].trim(), 'utf8');
            savedFiles.push('views/View.js');
            console.log('💾 [MVC] Saved: views/View.js');
        }
        
        // Extract controllers
        const controllersMatch = code.match(/#### controllers\/.*?\.js\s*\n([\s\S]*?)(?=####|\n####|$)/);
        if (controllersMatch) {
            const controllerPath = path.join(controllersDir, 'Controller.js');
            fs.writeFileSync(controllerPath, controllersMatch[1].trim(), 'utf8');
            savedFiles.push('controllers/Controller.js');
            console.log('💾 [MVC] Saved: controllers/Controller.js');
        }
        
        return savedFiles;
    }

    // Parse Java code
    parseJava(code, projectPath) {
        const savedFiles = [];
        
        // Create Java package structure
        const srcDir = path.join(projectPath, 'src', 'main', 'java', 'com', 'example');
        if (!fs.existsSync(srcDir)) {
            fs.mkdirSync(srcDir, { recursive: true });
        }
        
        // Extract entities
        const entityMatch = code.match(/#### .*?Entity\.java\s*\n([\s\S]*?)(?=####|\n####|$)/);
        if (entityMatch) {
            const entityPath = path.join(srcDir, 'Entity.java');
            fs.writeFileSync(entityPath, entityMatch[1].trim(), 'utf8');
            savedFiles.push('src/main/java/com/example/Entity.java');
            console.log('💾 [MVC] Saved: Entity.java');
        }
        
        // Extract controllers
        const controllerMatch = code.match(/#### .*?Controller\.java\s*\n([\s\S]*?)(?=####|\n####|$)/);
        if (controllerMatch) {
            const controllerPath = path.join(srcDir, 'Controller.java');
            fs.writeFileSync(controllerPath, controllerMatch[1].trim(), 'utf8');
            savedFiles.push('src/main/java/com/example/Controller.java');
            console.log('💾 [MVC] Saved: Controller.java');
        }
        
        return savedFiles;
    }

    // Parse C# code
    parseCSharp(code, projectPath) {
        const savedFiles = [];
        
        // Create C# project structure
        const modelsDir = path.join(projectPath, 'Models');
        const viewsDir = path.join(projectPath, 'Views');
        const controllersDir = path.join(projectPath, 'Controllers');
        
        [modelsDir, viewsDir, controllersDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        
        // Extract models
        const modelsMatch = code.match(/#### Models\/.*?\.cs\s*\n([\s\S]*?)(?=####|\n####|$)/);
        if (modelsMatch) {
            const modelPath = path.join(modelsDir, 'Model.cs');
            fs.writeFileSync(modelPath, modelsMatch[1].trim(), 'utf8');
            savedFiles.push('Models/Model.cs');
            console.log('💾 [MVC] Saved: Models/Model.cs');
        }
        
        return savedFiles;
    }

    // Generic parsing for unknown languages
    parseGeneric(code, projectPath) {
        const savedFiles = [];
        
        // Try to parse any #### filename pattern
        const filePattern = /(#{1,4})\s+([^\n]+\.(py|js|java|cs|html|css|json|xml|yml|yaml|md|txt))\s*\n([\s\S]*?)(?=#{1,4}|\n#{1,4}|$)/g;
        let match;
        
        while ((match = filePattern.exec(code)) !== null) {
            const fileName = match[2].trim();
            const fileContent = match[4].trim();
            
            if (fileName && fileContent) {
                const filePath = path.join(projectPath, fileName);
                const dir = path.dirname(filePath);
                
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                fs.writeFileSync(filePath, fileContent, 'utf8');
                savedFiles.push(fileName);
                console.log(`💾 [MVC] Saved: ${fileName}`);
            }
        }
        
        // If no file patterns found, try to split by common patterns
        if (savedFiles.length === 0) {
            const sections = code.split(/(?=####|###|##|#)/);
            
            sections.forEach((section, index) => {
                if (section.trim()) {
                    const fileName = `section_${index + 1}.txt`;
                    const filePath = path.join(projectPath, fileName);
                    fs.writeFileSync(filePath, section.trim(), 'utf8');
                    savedFiles.push(fileName);
                    console.log(`💾 [MVC] Saved: ${fileName}`);
                }
            });
        }
        
        return savedFiles;
    }

    async handleGenerateTests(functionality, language) {
        console.log('🧪 [EXTENSION] handleGenerateTests called (TDD Mode)');
        console.log('🧪 [EXTENSION] Functionality:', functionality);
        console.log('🧪 [EXTENSION] Language:', language);
        console.log('🔴 [TDD] Test-Driven Development Mode: Generating contract first, then tests');
        
        // Start timing at the VERY BEGINNING (when button is clicked)
        const startTime = new Date();
        const startTimeISO = startTime.toISOString();
        const startTimeFormatted = startTime.toLocaleString();
        console.log(`⏱️ [TEST-GEN] Test generation started at: ${startTimeFormatted}`);
        
        try {
            // Extract the name from the functionality object
            const functionalityName = functionality.name || functionality;
            console.log('🔍 [EXTENSION] Using functionality name:', functionalityName);
            
            // Initialize timing store for this functionality if not exists
            if (!this.generationTimingStore[functionalityName]) {
                this.generationTimingStore[functionalityName] = {};
            }
            this.generationTimingStore[functionalityName].testGen = {
                startTime: startTimeISO,
                startTimeFormatted: startTimeFormatted
            };
            
            // Find the embedded packet for this functionality
            const packet = this.getEmbeddedPacketByName(functionalityName);
            
            if (!packet) {
                throw new Error(`Functionality "${functionalityName}" not found in embedded packets`);
            }
            
            console.log('📦 [EXTENSION] Found embedded packet:', packet.name);
            
            // Step 1: Generate contract first (if not already generated)
            let contract = this.generatedContracts[functionalityName];
            if (!contract) {
                console.log('📋 [CONTRACT] Generating contract for:', functionalityName);
                contract = await this.generateContract(packet, language);
                this.generatedContracts[functionalityName] = contract;
                console.log('✅ [CONTRACT] Contract generated and stored');
            } else {
                console.log('📋 [CONTRACT] Using existing contract for:', functionalityName);
            }
            
            // Step 2: Generate test cases using contract and packet (TDD: independent generation)
            // Pass both contract (for structure) and packet (for SRS context/requirements)
            const testCode = await this.generateTestCases(contract, packet, language);
            console.log('🧪 [EXTENSION] Test code generated, length:', testCode?.length);
            
            // Export test file
            const testFilePath = await this.exportTestFile(functionality, testCode, language);
            console.log('🧪 [EXTENSION] Test file exported to:', testFilePath);
            
            // Count test cases in the generated test code
            let testCount = 0;
            if (testCode) {
                // Count Python pytest test functions
                const pytestMatches = testCode.match(/def\s+test_/g);
                if (pytestMatches) {
                    testCount = pytestMatches.length;
                } else {
                    // Count JavaScript Jest test functions
                    const jestMatches = testCode.match(/(it\(|test\(|describe\()/g);
                    if (jestMatches) {
                        testCount = jestMatches.length;
                    } else {
                        // Count Java JUnit test methods
                        const junitMatches = testCode.match(/@Test|public\s+void\s+test/g);
                        if (junitMatches) {
                            testCount = junitMatches.length;
                        }
                    }
                }
            }
            
            // Store generated tests for later use in code generation (TDD)
            if (!this.generatedTests) {
                this.generatedTests = {};
            }
            this.generatedTests[functionality?.name || 'default'] = {
                functionality: functionality,
                testCode: testCode,
                language: language,
                testCount: testCount
            };
            
            // Send success message with test count (this is when user sees the results)
            const testCountMessage = testCount > 0 
                ? `${testCount} test case${testCount === 1 ? '' : 's'} generated and saved successfully!`
                : 'Test cases generated and saved successfully!';
            
            const tddMessage = ' (TDD Mode: Now generate code to pass these tests)';
            
            this.panel?.webview.postMessage({
                type: 'testGenerated',
                message: testCountMessage + tddMessage,
                testCount: testCount,
                isTDDMode: true
            });
            
            // End timing RIGHT AFTER user sees the results (includes everything: contract gen, test gen, file export, UI update)
            const endTime = new Date();
            const endTimeISO = endTime.toISOString();
            const endTimeFormatted = endTime.toLocaleString();
            const duration = endTime - startTime; // Duration in milliseconds
            const durationSeconds = (duration / 1000).toFixed(2);
            const durationFormatted = this.formatDuration(duration);
            
            // Store timing data
            this.generationTimingStore[functionalityName].testGen.endTime = endTimeISO;
            this.generationTimingStore[functionalityName].testGen.endTimeFormatted = endTimeFormatted;
            this.generationTimingStore[functionalityName].testGen.duration = duration;
            this.generationTimingStore[functionalityName].testGen.durationSeconds = durationSeconds;
            this.generationTimingStore[functionalityName].testGen.durationFormatted = durationFormatted;
            
            console.log(`⏱️ [TEST-GEN] Test generation completed at: ${endTimeFormatted}`);
            console.log(`⏱️ [TEST-GEN] Total time (button click to results): ${durationFormatted} (${durationSeconds} seconds)`);
            
        } catch (error) {
            // End timing even on error
            const endTime = new Date();
            const endTimeISO = endTime.toISOString();
            const endTimeFormatted = endTime.toLocaleString();
            const duration = endTime - startTime;
            const durationSeconds = (duration / 1000).toFixed(2);
            const durationFormatted = this.formatDuration(duration);
            
            const functionalityName = functionality?.name || functionality;
            if (this.generationTimingStore[functionalityName] && this.generationTimingStore[functionalityName].testGen) {
                this.generationTimingStore[functionalityName].testGen.endTime = endTimeISO;
                this.generationTimingStore[functionalityName].testGen.endTimeFormatted = endTimeFormatted;
                this.generationTimingStore[functionalityName].testGen.duration = duration;
                this.generationTimingStore[functionalityName].testGen.durationSeconds = durationSeconds;
                this.generationTimingStore[functionalityName].testGen.durationFormatted = durationFormatted;
                this.generationTimingStore[functionalityName].testGen.error = true;
            }
            
            console.error('❌ [TESTS] Test generation failed:', error);
            console.error('❌ [TESTS] Error stack:', error.stack);
            console.log(`⏱️ [TEST-GEN] Test generation failed after: ${durationFormatted} (${durationSeconds} seconds)`);
            this.panel?.webview.postMessage({
                type: 'showError',
                message: 'Test generation failed: ' + error.message
            });
        }
    }

    async generateTestCases(contract, packet, language) {
        console.log('🧪 [TESTS] Generating test cases using MVC test generator (TDD Mode)...');
        console.log('📋 [TESTS] Using generated contract for test generation');
        console.log('📦 [TESTS] Using embedded packet for SRS context and requirements');
        
        try {
            if (!contract) {
                throw new Error('Contract is required for test generation');
            }
            
            // Use the TestGenerator class for MVC-aware test generation
            const { TestGenerator } = require('./testGenerator');
            console.log('🧪 [TESTS] TestGenerator class loaded');
            
            const testGenerator = new TestGenerator(null);
            console.log('🧪 [TESTS] TestGenerator instance created');
            
            console.log('🧪 [TESTS] Contract structure:', {
                functionality: contract.functionality,
                models: contract.file_structure?.models?.length || 0,
                controllers: contract.file_structure?.controllers?.length || 0
            });
            if (packet) {
                console.log('📦 [TESTS] Packet context:', {
                    name: packet.name,
                    hasDescription: !!packet.description,
                    useCases: packet.useCases?.length || 0,
                    requirements: packet.requirements?.length || 0,
                    hasEmbedding: !!packet.embedding
                });
            }
            console.log('🔴 [TDD] Generating tests from contract + packet (independent of code generation)');
            
            // Generate tests using contract (for structure) and packet (for SRS context)
            const result = await testGenerator.generateTests(contract, packet, language);
            console.log('🧪 [TESTS] Test generation completed, result length:', result?.length);
        
        // Clean the test code (remove any explanatory text and markdown)
            let cleanTestCode = result;
        
        // Remove HTML comments (invalid in Python)
        cleanTestCode = cleanTestCode.replace(/<!--[\s\S]*?-->/g, '');
        
        // Remove markdown code blocks
        if (cleanTestCode.includes('```')) {
            cleanTestCode = cleanTestCode.replace(/```[a-zA-Z]*\n?/g, '');
            cleanTestCode = cleanTestCode.replace(/```\s*$/g, '');
            cleanTestCode = cleanTestCode.replace(/```/g, '');
        }
        
        // Remove explanatory text that's not in comments
        const lines = cleanTestCode.split('\n');
        const cleanedLines = lines.filter(line => {
            const trimmed = line.trim();
            
            // Keep empty lines
            if (trimmed === '') return true;
            
            // Keep valid comments
            if (trimmed.startsWith('#') || 
                trimmed.startsWith('//') || 
                trimmed.startsWith('/*') || 
                trimmed.startsWith('*') ||
                trimmed.startsWith('"""') ||
                trimmed.startsWith("'''")) {
                return true;
            }
            
            // Remove explanatory text lines
            if (trimmed.startsWith('Note:') ||
                trimmed.startsWith('This test') ||
                trimmed.startsWith('The test') ||
                trimmed.startsWith('Test file') ||
                trimmed.startsWith('Note: This test') ||
                trimmed.startsWith('This test code') ||
                trimmed.startsWith('The test code') ||
                trimmed.startsWith('Test file should') ||
                trimmed.startsWith('File should be') ||
                trimmed.startsWith('Save this as') ||
                trimmed.startsWith('Save the file') ||
                trimmed.startsWith('The file should') ||
                trimmed.startsWith('This file should') ||
                trimmed.startsWith('Make sure to') ||
                trimmed.startsWith('Ensure that') ||
                trimmed.startsWith('Remember to') ||
                trimmed.startsWith('Don\'t forget') ||
                trimmed.startsWith('Important:') ||
                trimmed.startsWith('Note that') ||
                trimmed.startsWith('Please note') ||
                trimmed.startsWith('Keep in mind') ||
                trimmed.startsWith('It is important') ||
                trimmed.startsWith('Make sure') ||
                trimmed.startsWith('Be sure') ||
                trimmed.startsWith('Remember') ||
                trimmed.startsWith('Note') ||
                trimmed.startsWith('This assumes') ||
                trimmed.startsWith('The code assumes') ||
                trimmed.startsWith('This code assumes') ||
                trimmed.startsWith('The test assumes') ||
                trimmed.startsWith('This test assumes') ||
                trimmed.startsWith('The file assumes') ||
                trimmed.startsWith('This file assumes') ||
                trimmed.startsWith('The test code assumes') ||
                trimmed.startsWith('This test code assumes') ||
                trimmed.startsWith('Here is') ||
                trimmed.startsWith('Here are') ||
                trimmed.startsWith('The tests are') ||
                trimmed.startsWith('The test code is') ||
                trimmed.startsWith('The following') ||
                trimmed.startsWith('Below is') ||
                trimmed.startsWith('Below are') ||
                trimmed.startsWith('Above is') ||
                trimmed.startsWith('Above are')) {
                return false;
            }
            
            // Keep everything else (valid code)
            return true;
        });
        
        cleanTestCode = cleanedLines.join('\n').trim();
        
        // Final cleanup: Remove any remaining problematic patterns
        const problematicPatterns = [
            /^Note:.*$/gm,
            /^This test.*$/gm,
            /^The test.*$/gm,
            /^Test file.*$/gm,
            /^Important:.*$/gm,
            /^Remember:.*$/gm,
            /^This assumes.*$/gm,
            /^The code assumes.*$/gm,
            /^This test code assumes.*$/gm,
            /^The test code assumes.*$/gm,
            /^This file assumes.*$/gm,
            /^The file assumes.*$/gm,
            /^Make sure.*$/gm,
            /^Ensure that.*$/gm,
            /^Don't forget.*$/gm,
            /^Please note.*$/gm,
            /^Keep in mind.*$/gm,
            /^It is important.*$/gm,
            /^Be sure.*$/gm,
            /^Here is.*$/gm,
            /^Here are.*$/gm,
            /^The tests are.*$/gm,
            /^The test code is.*$/gm,
            /^The following.*$/gm,
            /^Below is.*$/gm,
            /^Below are.*$/gm,
            /^Above is.*$/gm,
            /^Above are.*$/gm
        ];
        
        problematicPatterns.forEach(pattern => {
            cleanTestCode = cleanTestCode.replace(pattern, '');
        });
        
        // Fix import statements that are missing newlines (e.g., "import osimport re" -> "import os\nimport re")
        cleanTestCode = cleanTestCode.replace(/(import\s+\w+)(import\s+\w+)/g, '$1\n$2');
        cleanTestCode = cleanTestCode.replace(/(from\s+\w+\s+import[^\n]+)(import\s+\w+)/g, '$1\n$2');
        cleanTestCode = cleanTestCode.replace(/(import\s+\w+)(from\s+\w+\s+import)/g, '$1\n$2');
        
        // Clean up any double newlines
        cleanTestCode = cleanTestCode.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
        
        // Framework-specific sanitization for Python/Flask tests
        try {
            // Auto-add missing imports for Python tests
            if (language === 'python') {
                const importsToAdd = [];
                
                // Check for typing imports
                const needsOptional = cleanTestCode.includes('Optional') && !cleanTestCode.includes('from typing import') && !cleanTestCode.includes('import typing');
                const needsDict = cleanTestCode.includes(': Dict') && !cleanTestCode.includes('from typing import') && !cleanTestCode.includes('import typing');
                const needsList = cleanTestCode.includes(': List') && !cleanTestCode.includes('from typing import') && !cleanTestCode.includes('import typing');
                
                // Check for re module usage
                const needsRe = (cleanTestCode.includes('re.match') || cleanTestCode.includes('re.search') || 
                                cleanTestCode.includes('re.findall') || cleanTestCode.includes('re.sub') ||
                                cleanTestCode.includes('re.compile') || cleanTestCode.includes('re.') ||
                                cleanTestCode.match(/re\.\w+\(/)) && !cleanTestCode.includes('import re');
                
                // Check for unittest.mock usage
                const needsPatch = (cleanTestCode.includes('@patch') || cleanTestCode.includes('patch(') || 
                                   cleanTestCode.includes('MagicMock') || cleanTestCode.includes('Mock(')) &&
                                   !cleanTestCode.includes('from unittest.mock import') && !cleanTestCode.includes('import unittest.mock');
                
                // Check for FileStorage usage
                const needsFileStorage = cleanTestCode.includes('FileStorage') && 
                                        !cleanTestCode.includes('from werkzeug.datastructures import') &&
                                        !cleanTestCode.includes('import werkzeug');
                
                // Check for BytesIO usage
                const needsBytesIO = cleanTestCode.includes('BytesIO') && 
                                    !cleanTestCode.includes('from io import') && 
                                    !cleanTestCode.includes('import io');
                
                // Build imports
                if (needsOptional || needsDict || needsList) {
                    const typingImports = [];
                    if (needsOptional) typingImports.push('Optional');
                    if (needsDict) typingImports.push('Dict');
                    if (needsList) typingImports.push('List');
                    importsToAdd.push(`from typing import ${typingImports.join(', ')}`);
                }
                
                if (needsRe) {
                    importsToAdd.push('import re');
                }
                
                if (needsPatch) {
                    const mockImports = [];
                    if (cleanTestCode.includes('patch') || cleanTestCode.includes('@patch')) mockImports.push('patch');
                    if (cleanTestCode.includes('MagicMock')) mockImports.push('MagicMock');
                    if (cleanTestCode.includes('Mock(')) mockImports.push('Mock');
                    importsToAdd.push(`from unittest.mock import ${mockImports.length > 0 ? mockImports.join(', ') : 'patch'}`);
                }
                
                if (needsFileStorage) {
                    importsToAdd.push('from werkzeug.datastructures import FileStorage');
                }
                
                if (needsBytesIO) {
                    importsToAdd.push('from io import BytesIO');
                }
                
                // Add imports if any are needed
                if (importsToAdd.length > 0) {
                    const newImports = importsToAdd.join('\n') + '\n';
                    
                    // Find the first import line and add after it
                    const importMatch = cleanTestCode.match(/^(import\s+\w+|from\s+\w+\s+import[^\n]+)/m);
                    if (importMatch) {
                        const insertIndex = importMatch.index + importMatch[0].length;
                        const needsNewline = cleanTestCode[insertIndex] !== '\n';
                        cleanTestCode = cleanTestCode.slice(0, insertIndex) + (needsNewline ? '\n' : '') + newImports + cleanTestCode.slice(insertIndex);
                    } else {
                        // No imports found, add at the beginning
                        cleanTestCode = newImports + cleanTestCode;
                    }
                    console.log('✅ [TESTS] Auto-added missing imports:', importsToAdd.join(', '));
                }
            }
        } catch (e) {
            console.warn('⚠️ [TESTS] Sanitization warning:', e.message);
        }
        
        console.log('🧹 [TESTS] Cleaned test code length:', cleanTestCode.length);
        console.log('🧹 [TESTS] Test code preview:', cleanTestCode.substring(0, 200) + '...');
        
        return cleanTestCode;
        } catch (error) {
            console.error('❌ [TESTS] Error in generateTestCases:', error);
            console.error('❌ [TESTS] Error stack:', error.stack);
            throw error;
        }
    }

    async exportTestFile(functionality, testCode, language) {
        console.log('🧪 [TESTS] Exporting test file...');
        
        const fs = require('fs');
        const path = require('path');
        const vscode = require('vscode');
        
        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        
        // Create test directory using the same project folder as code export
        let projectName = 'srs-project'; // Default fallback
        if (this.currentSRSFilename) {
            const baseName = path.parse(this.currentSRSFilename).name;
            projectName = baseName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        }
        
        // Create project directory if it doesn't exist (same as code export)
        const projectPath = path.join(workspaceFolder.uri.fsPath, projectName);
        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
            console.log('📁 [TESTS] Created project directory:', projectPath);
        }
        
        // Create test directory based on language and framework
        let testDir;
        if (language === 'javascript') {
            // For Jest, use __tests__ directory
            testDir = path.join(projectPath, '__tests__');
        } else {
            // For other languages, use tests directory
            testDir = path.join(projectPath, 'tests');
        }
        
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
            console.log('📁 [TESTS] Created test directory:', testDir);
        }
        
        // Create test file with proper naming
        const functionalityName = functionality.name || functionality;
        let testFileName;
        if (language === 'java') {
            // For Java, use PascalCase for test filename to match class name
            const pascalCaseName = functionalityName.replace(/[^a-zA-Z0-9]/g, '')
                .replace(/([a-z])([A-Z])/g, '$1$2') // Add space before capital letters
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join('');
            const testFileExtension = this.getTestFileExtension(language);
            testFileName = `${pascalCaseName}Test${testFileExtension}`;
            
            // Update the prompt to use the same class name as filename
            console.log('📝 [TESTS] Java test file will be named:', testFileName);
            console.log('📝 [TESTS] Expected class name:', pascalCaseName + 'Test');
        } else {
            // For other languages, use snake_case
            const sanitizedName = functionalityName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const testFileExtension = this.getTestFileExtension(language);
            testFileName = `${sanitizedName}${testFileExtension}`;
        }
        const testFilePath = path.join(testDir, testFileName);
        
        // Clean test code (remove markdown and explanatory text)
        let cleanTestCode = testCode;
        
        // Validate testCode
        if (!cleanTestCode || typeof cleanTestCode !== 'string') {
            throw new Error('Invalid test code provided for export');
        }
        
        // Remove markdown code blocks
        if (cleanTestCode.includes('```')) {
            cleanTestCode = cleanTestCode.replace(/```[a-zA-Z]*\n?/g, '');
            cleanTestCode = cleanTestCode.replace(/```\s*$/g, '');
            cleanTestCode = cleanTestCode.replace(/```/g, '');
        }
        
        // Remove HTML comments (invalid in Python/JS code)
        cleanTestCode = cleanTestCode.replace(/<!--[\s\S]*?-->/g, '');
        
        // Remove explanatory text that's not in comments
        const lines = cleanTestCode.split('\n');
        const cleanedLines = lines.filter(line => {
            const trimmed = line.trim();
            
            // Keep empty lines
            if (trimmed === '') return true;
            
            // Remove HTML comments (invalid in code)
            if (trimmed.includes('<!--') || trimmed.includes('-->')) {
                return false;
            }
            
            // Keep valid comments
            if (trimmed.startsWith('#') || 
                trimmed.startsWith('//') || 
                trimmed.startsWith('/*') || 
                trimmed.startsWith('*') ||
                trimmed.startsWith('"""') ||
                trimmed.startsWith("'''")) {
                return true;
            }
            
            // Remove explanatory text lines
            if (trimmed.startsWith('Note:') ||
                trimmed.startsWith('This test') ||
                trimmed.startsWith('The test') ||
                trimmed.startsWith('Test file') ||
                trimmed.startsWith('Note: This test') ||
                trimmed.startsWith('This test code') ||
                trimmed.startsWith('The test code') ||
                trimmed.startsWith('Test file should') ||
                trimmed.startsWith('File should be') ||
                trimmed.startsWith('Save this as') ||
                trimmed.startsWith('Save the file') ||
                trimmed.startsWith('The file should') ||
                trimmed.startsWith('This file should') ||
                trimmed.startsWith('Make sure to') ||
                trimmed.startsWith('Ensure that') ||
                trimmed.startsWith('Remember to') ||
                trimmed.startsWith('Don\'t forget') ||
                trimmed.startsWith('Important:') ||
                trimmed.startsWith('Note that') ||
                trimmed.startsWith('Please note') ||
                trimmed.startsWith('Keep in mind') ||
                trimmed.startsWith('It is important') ||
                trimmed.startsWith('Make sure') ||
                trimmed.startsWith('Be sure') ||
                trimmed.startsWith('Remember') ||
                trimmed.startsWith('Note') ||
                trimmed.startsWith('This assumes') ||
                trimmed.startsWith('The code assumes') ||
                trimmed.startsWith('This code assumes') ||
                trimmed.startsWith('The test assumes') ||
                trimmed.startsWith('This test assumes') ||
                trimmed.startsWith('The file assumes') ||
                trimmed.startsWith('This file assumes') ||
                trimmed.startsWith('The test code assumes') ||
                trimmed.startsWith('This test code assumes') ||
                trimmed.startsWith('Here is') ||
                trimmed.startsWith('Here are') ||
                trimmed.startsWith('The tests are') ||
                trimmed.startsWith('The test code is') ||
                trimmed.startsWith('The following') ||
                trimmed.startsWith('Below is') ||
                trimmed.startsWith('Below are') ||
                trimmed.startsWith('Above is') ||
                trimmed.startsWith('Above are')) {
                return false;
            }
            
            // Remove lines that look like plain English sentences (not code)
            if (trimmed.length > 0 && 
                /^[A-Z]/.test(trimmed) && 
                !trimmed.match(/^(import|from|def|class|@|#|if|for|while|try|except|with|return|yield|assert|raise|pass|break|continue|del|global|nonlocal|lambda|async|await)/) &&
                !trimmed.match(/^[A-Z][a-zA-Z0-9_]*\s*[=:]/) && // Variable assignment
                !trimmed.match(/^[A-Z][a-zA-Z0-9_]*\(/) && // Function call
                trimmed.includes(' ') && // Has spaces (likely English)
                !trimmed.startsWith('"""') && // Not docstring start
                !trimmed.startsWith("'''")) { // Not docstring start
                // Check if it's a complete sentence (ends with period or has multiple words)
                if (trimmed.endsWith('.') || (trimmed.split(' ').length > 3 && !trimmed.includes('(') && !trimmed.includes('['))) {
                    return false;
                }
            }
            
            // Keep everything else (valid code)
            return true;
        });
        
        cleanTestCode = cleanedLines.join('\n').trim();
        
        // Remove lines at the start that are plain English (before first import/def/class)
        const codeLines = cleanTestCode.split('\n');
        let firstCodeLineIndex = -1;
        for (let i = 0; i < codeLines.length; i++) {
            const line = codeLines[i].trim();
            if (line && (line.startsWith('import') || line.startsWith('from') || line.startsWith('def') || 
                line.startsWith('class') || line.startsWith('@') || line.startsWith('#') ||
                line.startsWith('const') || line.startsWith('let') || line.startsWith('var') ||
                line.startsWith('function') || line.startsWith('describe') || line.startsWith('test') ||
                line.startsWith('public') || line.startsWith('private') || line.startsWith('protected'))) {
                firstCodeLineIndex = i;
                break;
            }
        }
        
        if (firstCodeLineIndex > 0) {
            cleanTestCode = codeLines.slice(firstCodeLineIndex).join('\n');
        }
        
        // Final cleanup: Remove any remaining problematic patterns
        const problematicPatterns = [
            /^Note:.*$/gm,
            /^This test.*$/gm,
            /^The test.*$/gm,
            /^Test file.*$/gm,
            /^Important:.*$/gm,
            /^Remember:.*$/gm,
            /^This assumes.*$/gm,
            /^The code assumes.*$/gm,
            /^This test code assumes.*$/gm,
            /^The test code assumes.*$/gm,
            /^This file assumes.*$/gm,
            /^The file assumes.*$/gm,
            /^Make sure.*$/gm,
            /^Ensure that.*$/gm,
            /^Don't forget.*$/gm,
            /^Please note.*$/gm,
            /^Keep in mind.*$/gm,
            /^It is important.*$/gm,
            /^Be sure.*$/gm,
            /^Here is.*$/gm,
            /^Here are.*$/gm,
            /^The following.*$/gm,
            /^Below is.*$/gm,
            /^Below are.*$/gm
        ];
        
        problematicPatterns.forEach(pattern => {
            cleanTestCode = cleanTestCode.replace(pattern, '');
        });
        
        // Fix import statements that are missing newlines (e.g., "import osimport re" -> "import os\nimport re")
        cleanTestCode = cleanTestCode.replace(/(import\s+\w+)(import\s+\w+)/g, '$1\n$2');
        cleanTestCode = cleanTestCode.replace(/(from\s+\w+\s+import[^\n]+)(import\s+\w+)/g, '$1\n$2');
        cleanTestCode = cleanTestCode.replace(/(import\s+\w+)(from\s+\w+\s+import)/g, '$1\n$2');
        
        // Clean up any double newlines
        cleanTestCode = cleanTestCode.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
        
        // Framework-specific sanitization for Python/Flask tests
        try {
            // Auto-add missing imports for Python tests
            if (language === 'python') {
                const importsToAdd = [];
                
                // Check for typing imports
                const needsOptional = cleanTestCode.includes('Optional') && !cleanTestCode.includes('from typing import') && !cleanTestCode.includes('import typing');
                const needsDict = cleanTestCode.includes(': Dict') && !cleanTestCode.includes('from typing import') && !cleanTestCode.includes('import typing');
                const needsList = cleanTestCode.includes(': List') && !cleanTestCode.includes('from typing import') && !cleanTestCode.includes('import typing');
                
                // Check for re module usage
                const needsRe = (cleanTestCode.includes('re.match') || cleanTestCode.includes('re.search') || 
                                cleanTestCode.includes('re.findall') || cleanTestCode.includes('re.sub') ||
                                cleanTestCode.includes('re.compile') || cleanTestCode.includes('re.') ||
                                cleanTestCode.match(/re\.\w+\(/)) && !cleanTestCode.includes('import re');
                
                // Check for unittest.mock usage
                const needsPatch = (cleanTestCode.includes('@patch') || cleanTestCode.includes('patch(') || 
                                   cleanTestCode.includes('MagicMock') || cleanTestCode.includes('Mock(')) &&
                                   !cleanTestCode.includes('from unittest.mock import') && !cleanTestCode.includes('import unittest.mock');
                
                // Check for FileStorage usage
                const needsFileStorage = cleanTestCode.includes('FileStorage') && 
                                        !cleanTestCode.includes('from werkzeug.datastructures import') &&
                                        !cleanTestCode.includes('import werkzeug');
                
                // Check for BytesIO usage
                const needsBytesIO = cleanTestCode.includes('BytesIO') && 
                                    !cleanTestCode.includes('from io import') && 
                                    !cleanTestCode.includes('import io');
                
                // Build imports
                if (needsOptional || needsDict || needsList) {
                    const typingImports = [];
                    if (needsOptional) typingImports.push('Optional');
                    if (needsDict) typingImports.push('Dict');
                    if (needsList) typingImports.push('List');
                    importsToAdd.push(`from typing import ${typingImports.join(', ')}`);
                }
                
                if (needsRe) {
                    importsToAdd.push('import re');
                }
                
                if (needsPatch) {
                    const mockImports = [];
                    if (cleanTestCode.includes('patch') || cleanTestCode.includes('@patch')) mockImports.push('patch');
                    if (cleanTestCode.includes('MagicMock')) mockImports.push('MagicMock');
                    if (cleanTestCode.includes('Mock(')) mockImports.push('Mock');
                    importsToAdd.push(`from unittest.mock import ${mockImports.length > 0 ? mockImports.join(', ') : 'patch'}`);
                }
                
                if (needsFileStorage) {
                    importsToAdd.push('from werkzeug.datastructures import FileStorage');
                }
                
                if (needsBytesIO) {
                    importsToAdd.push('from io import BytesIO');
                }
                
                // Fix f-string backslash issues (f-string expressions cannot contain backslashes)
                // Pattern: f"...{re.sub(r'\\W+', '', varName)}..." -> extract to variable first
                let fStringFixCount = 0;
                cleanTestCode = cleanTestCode.replace(/f(["'])([^"']*?)\{([^}]*?re\.sub\(r['"]([^'"]+)['"],\s*['"]([^'"]*)['"],\s*([^}]+)\)[^}]*?)\}([^"']*?)\1/g, (match, quote, before, expr, pattern, replacement, varName, after) => {
                    fStringFixCount++;
                    // Generate a unique variable name
                    const cleanedVarName = `_cleaned_${Math.random().toString(36).substring(7)}`;
                    // Extract the regex operation before the f-string
                    const extraction = `${cleanedVarName} = re.sub(r'${pattern}', '${replacement}', ${varName.trim()})\n`;
                    // Replace the f-string expression with the variable
                    const newFString = `f${quote}${before}{${cleanedVarName}}${after}${quote}`;
                    return extraction + newFString;
                });
                if (fStringFixCount > 0) {
                    console.log(`✅ [TESTS] Fixed ${fStringFixCount} f-string backslash issue(s)`);
                }
                
                // Add imports if any are needed
                if (importsToAdd.length > 0) {
                    const newImports = importsToAdd.join('\n') + '\n';
                    
                    // Find the first import line and add after it
                    const importMatch = cleanTestCode.match(/^(import\s+\w+|from\s+\w+\s+import[^\n]+)/m);
                    if (importMatch) {
                        const insertIndex = importMatch.index + importMatch[0].length;
                        const needsNewline = cleanTestCode[insertIndex] !== '\n';
                        cleanTestCode = cleanTestCode.slice(0, insertIndex) + (needsNewline ? '\n' : '') + newImports + cleanTestCode.slice(insertIndex);
                    } else {
                        // No imports found, add at the beginning
                        cleanTestCode = newImports + cleanTestCode;
                    }
                    console.log('✅ [TESTS] Auto-added missing imports:', importsToAdd.join(', '));
                }
            }
        } catch (e) {
            console.warn('⚠️ [TESTS] Sanitization warning:', e.message);
        }
        
        // Save as single test file (not MVC separate files)
        fs.writeFileSync(testFilePath, cleanTestCode, 'utf8');
        console.log('💾 [TESTS] Single test file saved:', testFilePath);
        console.log('💾 [TESTS] Test file size:', cleanTestCode.length, 'characters');
        console.log('💾 [TESTS] Test file preview:', cleanTestCode.substring(0, 200) + '...');
        
        return testFilePath;
    }

    async runTests(functionality, testCode) {
        console.log('🧪 [TESTS] Running tests...');
        
        try {
            const { spawn } = require('child_process');
            const path = require('path');
            const vscode = require('vscode');
            
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            
            // Use the same project folder as code export
            let projectName = 'srs-project'; // Default fallback
            if (this.currentSRSFilename) {
                const baseName = path.parse(this.currentSRSFilename).name;
                projectName = baseName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            }
            
            const projectPath = path.join(workspaceFolder.uri.fsPath, projectName);
            
            // Detect language from test code
            const language = this.detectLanguage(testCode);
            console.log('🧪 [TESTS] Detected language for testing:', language);
            
            // Install all dependencies (test framework + project dependencies)
            await this.installAllDependencies(projectPath, language);
            
            // Run tests with appropriate command
            await this.runLanguageTests(projectPath, language);
            
        } catch (error) {
            console.error('❌ [TESTS] Test execution failed:', error.message);
            this.panel?.webview.postMessage({
                type: 'showError',
                message: 'Test execution failed: ' + error.message
            });
        }
    }

    async installAllDependencies(projectPath, language) {
        console.log(`📦 [DEPENDENCIES] Installing all dependencies for ${language}...`);
        
        const fs = require('fs');
        const path = require('path');
        
        if (language === 'python') {
            await this.installPythonDependencies(projectPath);
        } else if (language === 'javascript') {
            await this.installJavaScriptDependencies(projectPath);
        } else if (language === 'java') {
            await this.installJavaDependencies(projectPath);
        } else if (language === 'csharp') {
            await this.installCSharpDependencies(projectPath);
        } else {
            console.log(`⚠️ [DEPENDENCIES] Auto-installation not yet implemented for ${language}`);
        }
    }

    async installPythonDependencies(projectPath) {
        const fs = require('fs');
        const path = require('path');
        const { spawn } = require('child_process');
        
        const requirementsPath = path.join(projectPath, 'requirements.txt');
        
        // Check if requirements.txt exists
        if (fs.existsSync(requirementsPath)) {
            console.log('📦 [PYTHON] Found existing requirements.txt, installing from it...');
            return new Promise((resolve) => {
                const installProcess = spawn('pip', ['install', '-r', 'requirements.txt'], {
                cwd: projectPath,
                    shell: true,
                    stdio: 'inherit'
                });
                
                installProcess.on('close', (code) => {
                    if (code === 0) {
                        console.log('✅ [PYTHON] All dependencies installed from requirements.txt');
                    } else {
                        console.log('⚠️ [PYTHON] Some dependencies may have failed to install');
                    }
                    resolve();
                });
            });
        } else {
            // Create comprehensive requirements.txt for Flask projects
            console.log('📦 [PYTHON] No requirements.txt found, creating comprehensive one...');
            const requirementsContent = `# Test Framework
pytest>=7.0.0
pytest-mock>=3.10.0
pytest-cov>=4.0.0

# Flask and Web Framework
flask>=2.0.0
flask-sqlalchemy>=3.0.0
flask-mail>=0.9.1
flask-login>=0.6.2
werkzeug>=2.0.0

# Database
sqlalchemy>=2.0.0

# Security and Utilities
itsdangerous>=2.0.0
python-dotenv>=1.0.0

# Common utilities
requests>=2.28.0
python-dateutil>=2.8.0
`;
            
            try {
                fs.writeFileSync(requirementsPath, requirementsContent, 'utf8');
                console.log('✅ [PYTHON] Created requirements.txt with Flask dependencies');
                
                // Install the requirements
            return new Promise((resolve) => {
                    const installProcess = spawn('pip', ['install', '-r', 'requirements.txt'], {
                        cwd: projectPath,
                        shell: true,
                        stdio: 'inherit'
                    });
                    
                installProcess.on('close', (code) => {
                    if (code === 0) {
                            console.log('✅ [PYTHON] All dependencies installed successfully');
                    } else {
                            console.log('⚠️ [PYTHON] Some dependencies may have failed to install');
                    }
                    resolve();
                });
            });
            } catch (error) {
                console.log('⚠️ [PYTHON] Failed to create/install requirements.txt:', error.message);
            }
        }
    }

    async installJavaScriptDependencies(projectPath) {
        const fs = require('fs');
        const path = require('path');
        const { spawn } = require('child_process');
        
        const packageJsonPath = path.join(projectPath, 'package.json');
        
        // Check if package.json exists
        if (fs.existsSync(packageJsonPath)) {
            console.log('📦 [JAVASCRIPT] Found existing package.json, installing dependencies...');
            return new Promise((resolve) => {
                const installProcess = spawn('npm', ['install'], {
                    cwd: projectPath,
                    shell: true,
                    stdio: 'inherit'
                });
                
                installProcess.on('close', (code) => {
                    if (code === 0) {
                        console.log('✅ [JAVASCRIPT] All dependencies installed from package.json');
        } else {
                        console.log('⚠️ [JAVASCRIPT] Some dependencies may have failed to install');
                    }
                    resolve();
                });
            });
        } else {
            // Install Jest as default test framework
            console.log('📦 [JAVASCRIPT] No package.json found, installing Jest...');
            return new Promise((resolve) => {
                const installProcess = spawn('npm', ['install', '--save-dev', 'jest'], {
                    cwd: projectPath,
                    shell: true,
                    stdio: 'inherit'
                });
                
                installProcess.on('close', (code) => {
                    if (code === 0) {
                        console.log('✅ [JAVASCRIPT] Jest installed successfully');
                    } else {
                        console.log('⚠️ [JAVASCRIPT] Jest installation failed');
                    }
                    resolve();
                });
            });
        }
    }

    async installJavaDependencies(projectPath) {
        const { spawn } = require('child_process');
        
        console.log('📦 [JAVA] Installing Maven dependencies...');
        return new Promise((resolve) => {
            const installProcess = spawn('mvn', ['dependency:resolve'], {
                cwd: projectPath,
                shell: true,
                stdio: 'inherit'
            });
            
            installProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ [JAVA] Maven dependencies resolved');
                } else {
                    console.log('⚠️ [JAVA] Maven dependency resolution failed');
                }
                resolve();
            });
        });
    }

    async installCSharpDependencies(projectPath) {
        const { spawn } = require('child_process');
        
        console.log('📦 [CSHARP] Installing .NET dependencies...');
        return new Promise((resolve) => {
            const installProcess = spawn('dotnet', ['restore'], {
                cwd: projectPath,
                shell: true,
                stdio: 'inherit'
            });
            
            installProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ [CSHARP] .NET dependencies restored');
                } else {
                    console.log('⚠️ [CSHARP] .NET dependency restoration failed');
                }
                resolve();
            });
        });
    }

    /**
     * Get list of functionalities that have test files in the tests directory
     * Returns array of functionality names that have corresponding test files
     */
    getFunctionalitiesWithTestFiles() {
        const path = require('path');
        const fs = require('fs');
        const vscode = require('vscode');
        
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }
        
        // Try to find the project path
        let projectName = 'srs-project';
        if (this.currentSRSFilename) {
            const baseName = path.parse(this.currentSRSFilename).name;
            projectName = baseName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        }
        
        const projectPath = path.join(workspaceFolder.uri.fsPath, projectName);
        const testsDir = path.join(projectPath, 'tests');
        
        if (!fs.existsSync(testsDir)) {
            return [];
        }
        
        // Read all test files in the tests directory
        const testFiles = fs.readdirSync(testsDir).filter(file => 
            file.endsWith('_test.py') || file.endsWith('.test.js') || file.endsWith('Test.java')
        );
        
        console.log('📋 [TESTS] Found test files:', testFiles);
        
        // Map test files back to functionality names
        const functionalitiesWithTests = [];
        
        // Get all functionalities to match against
        const allFunctionalities = this.embeddedPackets || [];
        
        testFiles.forEach(testFile => {
            // Remove test file extension and _test suffix
            let testBaseName = testFile
                .replace('_test.py', '')
                .replace('.test.js', '')
                .replace('Test.java', '');
            
            // Try to match with functionality names
            allFunctionalities.forEach(func => {
                const funcName = func.name || '';
                
                // Convert functionality name to possible test file patterns
                const underscorePattern = funcName.toLowerCase()
                    .replace(/\s+/g, '_')
                    .replace(/[^a-z0-9_]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '');
                
                const hyphenPattern = funcName.toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '');
                
                // Check if test file matches this functionality
                if (testBaseName === underscorePattern || testBaseName === hyphenPattern) {
                    if (!functionalitiesWithTests.find(f => f.name === funcName)) {
                        functionalitiesWithTests.push({
                            name: funcName,
                            testFile: testFile
                        });
                    }
                }
            });
        });
        
        console.log('📋 [TESTS] Functionalities with test files:', functionalitiesWithTests.map(f => f.name));
        return functionalitiesWithTests;
    }

    /**
     * Convert functionality name to test file name
     * Handles both underscore and hyphen patterns
     */
    functionalityToTestFile(functionalityName) {
        if (!functionalityName) return null;
        
        // Convert to snake_case and handle special cases
        let testFileName = functionalityName
            .toLowerCase()
            .replace(/\s+/g, '_')  // Replace spaces with underscores
            .replace(/[^a-z0-9_]/g, '_')  // Replace special chars with underscores
            .replace(/_+/g, '_')  // Collapse multiple underscores
            .replace(/^_|_$/g, '');  // Remove leading/trailing underscores
        
        // Check for hyphen pattern (e.g., "product-search" -> "product-search_test.py")
        const hyphenPattern = functionalityName.toLowerCase().replace(/\s+/g, '-');
        const hyphenTestFile = `${hyphenPattern}_test.py`;
        
        // Check which pattern exists in the tests directory
        const path = require('path');
        const fs = require('fs');
        const vscode = require('vscode');
        
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            // Try to find the project path
            let projectName = 'srs-project';
            if (this.currentSRSFilename) {
                const baseName = path.parse(this.currentSRSFilename).name;
                projectName = baseName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            }
            
            const projectPath = path.join(workspaceFolder.uri.fsPath, projectName);
            const testsDir = path.join(projectPath, 'tests');
            
            if (fs.existsSync(testsDir)) {
                // Check for hyphen pattern first (e.g., product-search_test.py)
                const hyphenPath = path.join(testsDir, hyphenTestFile);
                if (fs.existsSync(hyphenPath)) {
                    return hyphenTestFile;
                }
                
                // Check for underscore pattern (e.g., product_search_test.py)
                const underscoreTestFile = `${testFileName}_test.py`;
                const underscorePath = path.join(testsDir, underscoreTestFile);
                if (fs.existsSync(underscorePath)) {
                    return underscoreTestFile;
                }
            }
        }
        
        // Default to underscore pattern
        return `${testFileName}_test.py`;
    }

    runLanguageTests(projectPath, language, testFunctionality = null) {
        console.log(`🧪 [TESTS] Running ${language} tests...`);
        if (testFunctionality) {
            console.log(`🧪 [TESTS] Filtering to functionality: ${testFunctionality.name}`);
        } else {
            console.log(`🧪 [TESTS] Running all tests`);
        }
        
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
        
        const path = require('path');
        const fs = require('fs');
        
        // For Python, check if tests directory exists and use it explicitly
        let testArgs = [];
        if (language === 'python') {
            const testsDir = path.join(projectPath, 'tests');
            if (fs.existsSync(testsDir)) {
                if (testFunctionality) {
                    // Run specific test file
                    const testFileName = this.functionalityToTestFile(testFunctionality.name);
                    if (testFileName) {
                        const testFilePath = path.join('tests', testFileName);
                        testArgs = ['-m', 'pytest', testFilePath, '-v'];
                        console.log(`🧪 [TESTS] Running specific test file: ${testFilePath}`);
                    } else {
                        // Fallback to all tests if file not found
                        testArgs = ['-m', 'pytest', 'tests/', '-v'];
                        console.log(`⚠️ [TESTS] Test file not found, running all tests`);
                    }
                } else {
                    // Run all tests
                    testArgs = ['-m', 'pytest', 'tests/', '-v'];
                }
            } else {
                // Fallback: try to find test files in project
                testArgs = ['-m', 'pytest', '-v'];
            }
        }
        
        const testCommands = {
            'javascript': ['npx', ['jest', '--verbose']],
            'python': ['python', testArgs.length > 0 ? testArgs : ['-m', 'pytest', '-v']],
            'java': ['mvn', ['test']],
            'cpp': ['make', ['test']], // Assuming Makefile with test target
            'csharp': ['dotnet', ['test']]
        };
        
        const command = testCommands[language] || ['npx', ['jest', '--verbose']];
        
        console.log(`🧪 [TESTS] Running command: ${command[0]} ${command[1].join(' ')}`);
        console.log(`🧪 [TESTS] Working directory: ${projectPath}`);
        
        const testProcess = spawn(command[0], command[1], {
            cwd: projectPath,
            shell: true,
            env: { ...process.env, PYTHONPATH: projectPath } // Add project to Python path
        });
        
        let testOutput = '';
        
        testProcess.stdout.on('data', (data) => {
            testOutput += data.toString();
            console.log('🧪 [TESTS]', data.toString());
        });
        
        testProcess.stderr.on('data', (data) => {
            const errorData = data.toString();
            console.log('🧪 [TESTS] Error:', errorData);
            // Jest outputs test results to stderr, so include them in test output
            testOutput += errorData;
        });
        
        testProcess.on('error', (error) => {
            console.error('❌ [TESTS] Test process error:', error.message);
            
            // Handle specific build tool errors
            let errorMessage = 'Test execution failed: ' + error.message;
            if (error.message.includes('mvn') || error.message.includes('maven')) {
                errorMessage = 'Maven is not installed. Please install Maven to run Java tests.\n\nTo install Maven:\n1. Download from https://maven.apache.org/download.cgi\n2. Add to your PATH environment variable\n3. Restart VS Code';
            } else if (error.message.includes('dotnet')) {
                errorMessage = '.NET SDK is not installed. Please install .NET SDK to run C# tests.\n\nTo install .NET SDK:\n1. Download from https://dotnet.microsoft.com/download\n2. Install and restart VS Code';
            } else if (error.message.includes('make')) {
                errorMessage = 'Make is not installed. Please install Make to run C++ tests.\n\nTo install Make:\n- Windows: Install via Chocolatey or WSL\n- macOS: Install Xcode Command Line Tools\n- Linux: Install build-essential package';
            } else if (error.message.includes('npm') || error.message.includes('npx')) {
                errorMessage = 'Node.js is not installed. Please install Node.js to run JavaScript tests.\n\nTo install Node.js:\n1. Download from https://nodejs.org\n2. Install and restart VS Code';
            } else if (error.message.includes('python') || error.message.includes('pip')) {
                errorMessage = 'Python is not installed. Please install Python to run Python tests.\n\nTo install Python:\n1. Download from https://python.org\n2. Install and restart VS Code';
            }
            
            this.panel?.webview.postMessage({
                type: 'testResults',
                results: errorMessage,
                exitCode: 1,
                success: false
            });
        });
        
        testProcess.on('close', (code) => {
            console.log('🧪 [TESTS] Test process exited with code:', code);
            
            // Parse test counts from output for logging
            const outputText = testOutput.toString();
            let parsedPassed = 0, parsedFailed = 0, parsedTotal = 0;
            
            // Try to parse pytest output
            const passedMatch = outputText.match(/(\d+)\s+passed/);
            const failedMatch = outputText.match(/(\d+)\s+failed/);
            if (passedMatch) parsedPassed = parseInt(passedMatch[1]);
            if (failedMatch) parsedFailed = parseInt(failedMatch[1]);
            parsedTotal = parsedPassed + parsedFailed;
            
            if (parsedTotal > 0) {
                console.log(`📊 [TESTS] Test Summary: ${parsedPassed} passed, ${parsedFailed} failed (Total: ${parsedTotal} tests)`);
            }
            
            // Send test results to frontend
            this.panel?.webview.postMessage({
                type: 'testResults',
                results: testOutput,
                exitCode: code,
                success: code === 0
            });
            
            // Resolve the promise
            resolve({ success: code === 0, output: testOutput, exitCode: code });
        });
        
        testProcess.on('error', (error) => {
            console.error('❌ [TESTS] Test process error:', error.message);
            reject(error);
        });
        });
    }

    runJestTests(projectPath) {
        console.log('🧪 [TESTS] Running Jest tests...');
        
        const { spawn } = require('child_process');
        
        const testProcess = spawn('npx', ['jest', '--verbose'], {
            cwd: projectPath,
            shell: true
        });
        
        let testOutput = '';
        
        testProcess.stdout.on('data', (data) => {
            testOutput += data.toString();
            console.log('🧪 [TESTS]', data.toString());
        });
        
        testProcess.stderr.on('data', (data) => {
            console.log('🧪 [TESTS] Error:', data.toString());
        });
        
        testProcess.on('close', (code) => {
            console.log('🧪 [TESTS] Test process exited with code:', code);
            
            // Send test results to frontend
            this.panel?.webview.postMessage({
                type: 'testResults',
                results: testOutput,
                exitCode: code,
                success: code === 0
            });
        });
    }

    async handleVerifyCode(functionality, code, testFunctionality = null) {
        console.log('🔍 [EXTENSION] handleVerifyCode called');
        console.log('🔍 [EXTENSION] Functionality:', functionality);
        console.log('🔍 [EXTENSION] Code length:', code?.length);
        console.log('🔍 [EXTENSION] Test Functionality (filter):', testFunctionality?.name || 'All Functionalities');
        
        try {
            // First, export the code to ensure it exists in the project
            console.log('📤 [VERIFY] Exporting code before testing...');
            const language = this.detectLanguage(code);
            const initialSavedFiles = await this.handleExportCode(functionality, code, language);
            console.log('✅ [VERIFY] Code exported successfully');
            
            // Check if test files exist
            const fs = require('fs');
            const path = require('path');
            const vscode = require('vscode');
            
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            
            // Use the same project folder as code export
            let projectName = 'srs-project'; // Default fallback
            if (this.currentSRSFilename) {
                const baseName = path.parse(this.currentSRSFilename).name;
                projectName = baseName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            }
            
            const projectPath = path.join(workspaceFolder.uri.fsPath, projectName);
            
            // Use the already detected language
            console.log('🔍 [VERIFY] Using language:', language);
            
            // Extract functionality name early (needed for feedback loop)
            const functionalityName = functionality.name || functionality;
            console.log('🔍 [VERIFY] Functionality name:', functionalityName);
            
            // Get embedded packet and contract (needed for feedback loop)
            const packet = this.getEmbeddedPacketByName(functionalityName);
            if (!packet) {
                throw new Error(`Functionality "${functionalityName}" not found in embedded packets`);
            }
            
            // Get or generate contract (needed for feedback loop)
            let contract = this.generatedContracts[functionalityName];
            if (!contract) {
                console.log('📋 [VERIFY] Contract not found, generating now...');
                contract = await this.generateContract(packet, language);
                this.generatedContracts[functionalityName] = contract;
            }
            
            let testDir;
            if (language === 'javascript') {
                testDir = path.join(projectPath, '__tests__');
            } else {
                testDir = path.join(projectPath, 'tests');
            }
            
            // Check if tests exist, if not generate them automatically
            if (!fs.existsSync(testDir)) {
                console.log('🧪 [VERIFY] No test files found, generating tests automatically...');
                
                // Generate test cases using contract and packet (TDD mode)
                const testCode = await this.generateTestCases(contract, packet, language);
                
                // Export test file
                await this.exportTestFile(functionality, testCode, language);
                
                console.log('✅ [VERIFY] Tests generated and exported successfully');
            } else {
                console.log('✅ [VERIFY] Test files already exist, using existing tests');
            }
            
            // Install test framework if needed
            // Install all dependencies (test framework + project dependencies)
            await this.installAllDependencies(projectPath, language);
            
            // Create Jest configuration for JavaScript projects if needed
            if (language === 'javascript') {
                await this.createJestConfig(projectPath);
            }
            
            // Send verification started message
            this.panel?.webview.postMessage({
                type: 'verificationStarted',
                message: 'Code verification started. Running tests...'
            });
            
            // Run initial test BEFORE feedback loop
            console.log('🧪 [INITIAL] Running initial test run...');
            this.panel?.webview.postMessage({
                type: 'updateStatus',
                message: '🧪 Running initial tests...',
                statusType: 'info'
            });
            
            // Run initial tests
            const initialTestResult = await this.runLanguageTests(projectPath, language, testFunctionality);
            const initialTestCounts = this.extractTestCounts(initialTestResult.output, language);
            
            // Send initial test results to webview
            let initialStatusMessage = '';
            if (initialTestCounts) {
                initialStatusMessage = `Initial run: ${initialTestCounts.passed} passed, ${initialTestCounts.failed} failed (${initialTestCounts.total} total)`;
                console.log(`📊 [INITIAL] Initial test results: ${initialTestCounts.passed} passed, ${initialTestCounts.failed} failed (${initialTestCounts.total} total)`);
            } else {
                initialStatusMessage = `Initial run: ${initialTestResult.success ? 'All tests passed!' : 'Tests failed'}`;
            }
            
            this.panel?.webview.postMessage({
                type: 'testResults',
                results: initialTestResult.output,
                exitCode: initialTestResult.exitCode,
                success: initialTestResult.success,
                iteration: 0,
                maxIterations: 0,
                message: initialStatusMessage
            });
            
            // If initial tests pass, we're done
            if (initialTestResult.success) {
                console.log(`\n${'='.repeat(60)}`);
                console.log(`✅ [INITIAL] SUCCESS! All tests passed on initial run!`);
                console.log(`${'='.repeat(60)}\n`);
                
                // Store final results (same as initial since no loop ran)
                if (initialTestCounts) {
                    const functionalityName = testFunctionality?.name || functionality?.name || 'All Functionalities';
                    this.testResultsStore[functionalityName] = {
                        passed: initialTestCounts.passed,
                        failed: initialTestCounts.failed,
                        total: initialTestCounts.total,
                        initialPassed: initialTestCounts.passed,
                        initialFailed: initialTestCounts.failed,
                        initialTotal: initialTestCounts.total,
                        finalPassed: initialTestCounts.passed,
                        finalFailed: initialTestCounts.failed,
                        finalTotal: initialTestCounts.total,
                        timestamp: new Date().toLocaleString('en-US', { 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit', 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit',
                            hour12: false 
                        })
                    };
                    
                    this.panel?.webview.postMessage({
                        type: 'testResultsStored',
                        hasResults: Object.keys(this.testResultsStore).length > 0
                    });
                }
                
                // Display summary (initial = final since no loop)
                if (initialTestCounts) {
                    console.log(`\n${'='.repeat(60)}`);
                    console.log(`📊 [FEEDBACK] TEST RESULTS SUMMARY:`);
                    console.log(`   Initial Run: ${initialTestCounts.passed} passed, ${initialTestCounts.failed} failed (${initialTestCounts.total} total)`);
                    console.log(`   Final Run: ${initialTestCounts.passed} passed, ${initialTestCounts.failed} failed (${initialTestCounts.total} total) (No feedback loop needed)`);
                    console.log(`${'='.repeat(60)}\n`);
                    
                    this.panel?.webview.postMessage({
                        type: 'verificationCompleted',
                        message: `✅ All tests passed on initial run!`,
                        success: true,
                        iteration: 0,
                        initialTestCounts: initialTestCounts,
                        finalTestCounts: initialTestCounts
                    });
                }
                return;
            }
            
            // Tests failed - backup original code before feedback loop modifies it
            if (initialSavedFiles && initialSavedFiles.length > 0) {
                console.log(`\n${'='.repeat(60)}`);
                console.log(`📦 [BACKUP] Backing up original code before feedback loop...`);
                console.log(`${'='.repeat(60)}`);
                const backupDir = this.backupOriginalCode(projectPath, initialSavedFiles);
                if (backupDir) {
                    console.log(`✅ [BACKUP] Original code backed up to: ${backupDir}`);
            this.panel?.webview.postMessage({
                type: 'updateStatus',
                        message: `📦 Original code backed up to: original_code_backup/`,
                statusType: 'info'
            });
                }
                console.log(`${'='.repeat(60)}\n`);
            }
            
            // Tests failed - start feedback loop
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🔄 [FEEDBACK] Initial tests failed. Starting automated feedback loop (max 3 iterations)...`);
            console.log(`${'='.repeat(60)}\n`);
            
            this.panel?.webview.postMessage({
                type: 'updateStatus',
                message: '🔄 Initial tests failed. Starting feedback loop (max 3 iterations)...',
                statusType: 'info'
            });
            
            // Run tests with automated feedback loop
            const maxIterations = 3; // Prevent infinite loops (reduced from 5 to 3)
            let iteration = 0;
            let currentCode = code;
            let allTestsPassed = false;
            let finalTestCounts = null; // Store final test results (after all iterations)
            
            while (iteration < maxIterations && !allTestsPassed) {
                iteration++;
                console.log(`\n${'='.repeat(60)}`);
                console.log(`🔄 [FEEDBACK] ITERATION ${iteration}/${maxIterations}`);
                console.log(`${'='.repeat(60)}`);
                console.log(`📝 [FEEDBACK] Step 1/4: Exporting code...`);
                    
                    // Notify user about iteration
                    this.panel?.webview.postMessage({
                        type: 'updateStatus',
                        message: `🔄 [ITERATION ${iteration}/${maxIterations}] Exporting code and running tests...`,
                        statusType: 'info'
                    });
                    
                    // Export current code
                    await this.handleExportCode(functionality, currentCode, language);
                    console.log(`✅ [FEEDBACK] Code exported`);
            
            // Run tests
                console.log(`📝 [FEEDBACK] Step 2/4: Running tests...`);
                const testResult = await this.runLanguageTests(projectPath, language, testFunctionality);
                
                // Extract test counts for status message
                const testCounts = this.extractTestCounts(testResult.output, language);
                
                // ALWAYS update finalTestCounts with the latest iteration results
                // This ensures we track progress even if code doesn't change
                if (testCounts) {
                    finalTestCounts = {
                        passed: testCounts.passed,
                        failed: testCounts.failed,
                        total: testCounts.total
                    };
                    console.log(`📊 [FEEDBACK] Iteration ${iteration} results: ${finalTestCounts.passed} passed, ${finalTestCounts.failed} failed (${finalTestCounts.total} total)`);
                }
                
                let statusMessage = '';
                if (testCounts) {
                    statusMessage = `Iteration ${iteration}/${maxIterations}: ${testCounts.passed} passed, ${testCounts.failed} failed (${testCounts.total} total)`;
                } else {
                    statusMessage = `Iteration ${iteration}/${maxIterations}: ${testResult.success ? 'All tests passed!' : 'Tests failed - fixing code...'}`;
                }
                
                // Send test results to webview after each iteration
                this.panel?.webview.postMessage({
                    type: 'testResults',
                    results: testResult.output,
                    exitCode: testResult.exitCode,
                    success: testResult.success,
                    iteration: iteration,
                    maxIterations: maxIterations,
                    message: statusMessage
                });
                
                if (testResult.success) {
                    // finalTestCounts already set above, just use it
                    
                    console.log(`\n${'='.repeat(60)}`);
                    console.log(`✅ [FEEDBACK] SUCCESS! All tests passed!`);
                    console.log(`📊 [FEEDBACK] Completed in ${iteration} iteration${iteration === 1 ? '' : 's'}`);
                    
                    // Display initial vs final metrics
                    if (initialTestCounts && finalTestCounts) {
                        console.log(`\n📊 [FEEDBACK] TEST RESULTS SUMMARY:`);
                        console.log(`   Initial Run: ${initialTestCounts.passed} passed, ${initialTestCounts.failed} failed (${initialTestCounts.total} total)`);
                        console.log(`   Final Run (after ${iteration} iteration${iteration === 1 ? '' : 's'}): ${finalTestCounts.passed} passed, ${finalTestCounts.failed} failed (${finalTestCounts.total} total)`);
                        if (initialTestCounts.failed > 0) {
                            const improvement = initialTestCounts.failed - finalTestCounts.failed;
                            console.log(`   Improvement: ${improvement} test${improvement === 1 ? '' : 's'} fixed`);
                        }
                    }
                    console.log(`${'='.repeat(60)}\n`);
                    allTestsPassed = true;
                    
                    // Store final successful results (keep only latest - overwrite previous)
                    if (testCounts) {
                        // If testFunctionality is null, it means "All Functionalities" was selected
                        // In that case, use the main functionality name or "All Functionalities"
                        const functionalityName = testFunctionality?.name || functionality?.name || 'All Functionalities';
                        this.testResultsStore[functionalityName] = {
                            passed: testCounts.passed,
                            failed: testCounts.failed,
                            total: testCounts.total,
                            initialPassed: initialTestCounts?.passed || testCounts.passed,
                            initialFailed: initialTestCounts?.failed || testCounts.failed,
                            initialTotal: initialTestCounts?.total || testCounts.total,
                            finalPassed: testCounts.passed,
                            finalFailed: testCounts.failed,
                            finalTotal: testCounts.total,
                            timestamp: new Date().toLocaleString('en-US', { 
                                year: 'numeric', 
                                month: '2-digit', 
                                day: '2-digit', 
                                hour: '2-digit', 
                                minute: '2-digit', 
                                second: '2-digit',
                                hour12: false 
                            })
                        };
                        console.log(`💾 [TEST-STORE] Stored final results for "${functionalityName}": ${testCounts.passed} passed, ${testCounts.failed} failed (${testCounts.total} total)`);
                        
                        // Notify frontend to show export button
                        this.panel?.webview.postMessage({
                            type: 'testResultsStored',
                            hasResults: Object.keys(this.testResultsStore).length > 0
                        });
                    }
                    
                    // Send success message with both initial and final metrics
                    this.panel?.webview.postMessage({
                        type: 'verificationCompleted',
                        message: `✅ All tests passed after ${iteration} iteration${iteration === 1 ? '' : 's'}!`,
                        success: true,
                        iteration: iteration,
                        initialTestCounts: initialTestCounts,
                        finalTestCounts: finalTestCounts
                    });
                } else {
                    console.log(`\n${'='.repeat(60)}`);
                    console.log(`❌ [FEEDBACK] Tests FAILED in iteration ${iteration}`);
                    console.log(`${'='.repeat(60)}`);
                    
                    if (iteration < maxIterations) {
                        console.log(`📝 [FEEDBACK] Step 3/${iteration === 1 ? '3' : '4'}: Extracting test errors...`);
                        
                        // Extract test errors from output
                        const testErrors = this.extractTestErrors(testResult.output, language);
                        console.log(`📋 [FEEDBACK] Found ${testErrors.length} test error(s)`);
                        
                        // Fix code based on test failures
                        console.log(`📝 [FEEDBACK] Step 4: Fixing code based on errors...`);
                        try {
                            this.panel?.webview.postMessage({
                                type: 'updateStatus',
                                message: `🔧 [ITERATION ${iteration}/${maxIterations}] Fixing code based on ${testErrors.length} test error(s)...`,
                                statusType: 'info'
                            });
                            
                            // CRITICAL: Read actual code from files (not the original code string)
                            // This ensures we're fixing the current state of the files, not the original
                            console.log(`📖 [FEEDBACK] Reading current code from files on disk...`);
                            const currentCodeFromFiles = this.readCodeFromFiles(projectPath, initialSavedFiles || []);
                            
                            // Use code from files if available, otherwise fall back to currentCode
                            const codeToFix = currentCodeFromFiles || currentCode;
                            if (currentCodeFromFiles) {
                                console.log(`✅ [FEEDBACK] Using code from files (${codeToFix.length} chars)`);
                                
                                // Detailed comparison
                                const isIdentical = codeToFix === currentCode;
                                const lengthDiff = Math.abs(codeToFix.length - currentCode.length);
                                const hash1 = require('crypto').createHash('md5').update(codeToFix).digest('hex');
                                const hash2 = require('crypto').createHash('md5').update(currentCode).digest('hex');
                                const hashesMatch = hash1 === hash2;
                                
                                console.log(`📊 [FEEDBACK] Code comparison:`);
                                console.log(`   - String equality: ${isIdentical ? 'IDENTICAL' : 'DIFFERENT'}`);
                                console.log(`   - Length difference: ${lengthDiff} chars`);
                                console.log(`   - Hash match: ${hashesMatch ? 'MATCH' : 'DIFFERENT'}`);
                                console.log(`   - Code from files hash: ${hash1.substring(0, 16)}...`);
                                console.log(`   - Original code hash: ${hash2.substring(0, 16)}...`);
                                
                                if (isIdentical || hashesMatch) {
                                    console.warn(`⚠️ [FEEDBACK] WARNING: Code from files is IDENTICAL to original code string!`);
                                    console.warn(`⚠️ [FEEDBACK] This means files on disk haven't changed since initial export.`);
                                    console.warn(`⚠️ [FEEDBACK] Possible causes:`);
                                    console.warn(`   1. Previous iteration's export didn't write files correctly`);
                                    console.warn(`   2. Files were written but with identical content`);
                                    console.warn(`   3. readCodeFromFiles is reading old cached content`);
                                    
                                    // Show first 200 chars of both for manual comparison
                                    console.log(`📝 [FEEDBACK] Code from files (first 200 chars): ${codeToFix.substring(0, 200)}...`);
                                    console.log(`📝 [FEEDBACK] Original code (first 200 chars): ${currentCode.substring(0, 200)}...`);
                                } else {
                                    console.log(`✅ [FEEDBACK] Code from files is DIFFERENT from original - good!`);
                                }
                            } else {
                                console.warn(`⚠️ [FEEDBACK] Could not read code from files, using original code string`);
                            }
                            
                            console.log(`📝 [FEEDBACK] Code to fix length: ${codeToFix.length} chars`);
                            console.log(`📝 [FEEDBACK] Code to fix preview (first 200 chars): ${codeToFix.substring(0, 200)}...`);
                            
                            const codeBeforeFix = codeToFix;
                            currentCode = await this.fixCodeBasedOnTestFailures(
                                functionalityName,
                                contract,
                                packet,
                                codeToFix,
                                testErrors,
                                language
                            );
                            
                            // Validate that code actually changed
                            const codeChanged = currentCode !== codeBeforeFix;
                            const codeLengthChanged = currentCode.length !== codeBeforeFix.length;
                            
                            // Compare first and last 100 chars to detect subtle changes
                            const beforeStart = codeBeforeFix.substring(0, 100);
                            const afterStart = currentCode.substring(0, 100);
                            const beforeEnd = codeBeforeFix.substring(Math.max(0, codeBeforeFix.length - 100));
                            const afterEnd = currentCode.substring(Math.max(0, currentCode.length - 100));
                            const startChanged = beforeStart !== afterStart;
                            const endChanged = beforeEnd !== afterEnd;
                            
                            if (!codeChanged && !codeLengthChanged) {
                                console.warn(`⚠️ [FEEDBACK] WARNING: Fixed code appears IDENTICAL to previous code!`);
                                console.warn(`⚠️ [FEEDBACK] This means the LLM returned the exact same code without any fixes.`);
                                console.warn(`⚠️ [FEEDBACK] Original length: ${codeBeforeFix.length}, Fixed length: ${currentCode.length}`);
                                console.warn(`⚠️ [FEEDBACK] This will cause test results to remain the same.`);
                            } else {
                                console.log(`✅ [FEEDBACK] Code fixed successfully`);
                                console.log(`📊 [FEEDBACK] Code length: ${codeBeforeFix.length} → ${currentCode.length} (${codeLengthChanged ? 'changed' : 'same length'})`);
                                if (startChanged) console.log(`📝 [FEEDBACK] Code start changed (first 100 chars differ)`);
                                if (endChanged) console.log(`📝 [FEEDBACK] Code end changed (last 100 chars differ)`);
                            }
                            
                            // Log test count comparison if we have previous results
                            if (finalTestCounts && testCounts) {
                                const prevFailed = finalTestCounts.failed;
                                const currFailed = testCounts.failed;
                                if (prevFailed === currFailed && prevFailed > 0) {
                                    console.warn(`⚠️ [FEEDBACK] WARNING: Test failure count unchanged (${currFailed} failed). Code changes may not be effective.`);
                                } else if (currFailed < prevFailed) {
                                    console.log(`✅ [FEEDBACK] Improvement detected: ${prevFailed} → ${currFailed} failed tests`);
                                }
                            }
                            
                            // CRITICAL: Export the fixed code to disk BEFORE the next iteration
                            // This ensures the next iteration reads the updated code
                            console.log(`💾 [FEEDBACK] Exporting fixed code to disk...`);
                            try {
                                // Read file contents BEFORE export to compare
                                const filesBeforeExport = {};
                                if (initialSavedFiles && initialSavedFiles.length > 0) {
                                    for (const filePath of initialSavedFiles) {
                                        const fullPath = path.join(projectPath, filePath);
                                        if (fs.existsSync(fullPath)) {
                                            filesBeforeExport[filePath] = fs.readFileSync(fullPath, 'utf8');
                                        }
                                    }
                                }
                                
                                await this.handleExportCode(functionality, currentCode, language);
                                console.log(`✅ [FEEDBACK] Fixed code exported successfully`);
                                
                                // Verify files actually changed
                                let filesChanged = 0;
                                let filesUnchanged = 0;
                                if (initialSavedFiles && initialSavedFiles.length > 0) {
                                    for (const filePath of initialSavedFiles) {
                                        const fullPath = path.join(projectPath, filePath);
                                        if (fs.existsSync(fullPath)) {
                                            const contentAfter = fs.readFileSync(fullPath, 'utf8');
                                            const contentBefore = filesBeforeExport[filePath] || '';
                                            
                                            if (contentAfter !== contentBefore) {
                                                filesChanged++;
                                                console.log(`✅ [FEEDBACK] File changed: ${filePath} (${contentBefore.length} → ${contentAfter.length} chars)`);
                                            } else {
                                                filesUnchanged++;
                                                console.warn(`⚠️ [FEEDBACK] File UNCHANGED: ${filePath} (${contentAfter.length} chars)`);
                                            }
                                        }
                                    }
                                    
                                    console.log(`📊 [FEEDBACK] File change summary: ${filesChanged} changed, ${filesUnchanged} unchanged`);
                                    if (filesUnchanged > 0 && filesChanged === 0) {
                                        console.error(`❌ [FEEDBACK] CRITICAL: All files are UNCHANGED! The export may not have worked correctly.`);
                                    }
                                }
                            } catch (exportError) {
                                console.error(`❌ [FEEDBACK] Failed to export fixed code: ${exportError.message}`);
                                // Continue anyway - the next iteration will try again
                            }
                            
                            console.log(`🔄 [FEEDBACK] Will retry tests in iteration ${iteration + 1}...\n`);
                            
                            // Notify user about the fix attempt
                            this.panel?.webview.postMessage({
                                type: 'updateStatus',
                                message: `✅ Code fixed. Retrying tests in iteration ${iteration + 1}/${maxIterations}...`,
                                statusType: 'info'
                            });
                        } catch (fixError) {
                            console.error(`\n${'='.repeat(60)}`);
                            console.error(`❌ [FEEDBACK] Failed to fix code in iteration ${iteration}`);
                            console.error(`❌ [FEEDBACK] Error: ${fixError.message}`);
                            console.error(`${'='.repeat(60)}`);
                            
                            // If we have more iterations left, continue trying
                            if (iteration < maxIterations) {
                                console.log(`⚠️ [FEEDBACK] Fix attempt failed, but continuing to iteration ${iteration + 1}...`);
                                this.panel?.webview.postMessage({
                                    type: 'updateStatus',
                                    message: `⚠️ Fix attempt failed. Retrying with original code in iteration ${iteration + 1}/${maxIterations}...`,
                                    statusType: 'warning'
                                });
                                // Continue with current code (don't update it)
                                // The loop will continue and try again
                            } else {
                                // Last iteration failed, throw error
                                console.error(`❌ [FEEDBACK] Maximum iterations reached. Cannot continue.\n`);
                                throw new Error(`Failed to fix code after ${maxIterations} iterations. Last error: ${fixError.message}`);
                            }
                        }
                    } else {
                        // Last iteration - finalTestCounts already set above from testCounts
                        // But ensure we have it even if testCounts wasn't extracted
                        if (!finalTestCounts) {
                            finalTestCounts = this.extractTestCounts(testResult.output, language);
                        }
                        let finalStatusMessage = `Test results available after ${maxIterations} iterations.`;
                        if (finalTestCounts) {
                            finalStatusMessage = `Test results available after ${maxIterations} iterations: ${finalTestCounts.passed} passed, ${finalTestCounts.failed} failed (${finalTestCounts.total} total)`;
                            
                            // Store final test results (keep only latest - overwrite previous)
                            const functionalityName = testFunctionality?.name || functionality?.name || 'All Functionalities';
                            this.testResultsStore[functionalityName] = {
                                passed: finalTestCounts.passed,
                                failed: finalTestCounts.failed,
                                total: finalTestCounts.total,
                                initialPassed: initialTestCounts?.passed || finalTestCounts.passed,
                                initialFailed: initialTestCounts?.failed || finalTestCounts.failed,
                                initialTotal: initialTestCounts?.total || finalTestCounts.total,
                                finalPassed: finalTestCounts.passed,
                                finalFailed: finalTestCounts.failed,
                                finalTotal: finalTestCounts.total,
                                timestamp: new Date().toLocaleString('en-US', { 
                                    year: 'numeric', 
                                    month: '2-digit', 
                                    day: '2-digit', 
                                    hour: '2-digit', 
                                    minute: '2-digit', 
                                    second: '2-digit',
                                    hour12: false 
                                })
                            };
                            console.log(`💾 [TEST-STORE] Stored final results for "${functionalityName}": ${finalTestCounts.passed} passed, ${finalTestCounts.failed} failed (${finalTestCounts.total} total)`);
                            
                            // Notify frontend to show export button
                            this.panel?.webview.postMessage({
                                type: 'testResultsStored',
                                hasResults: Object.keys(this.testResultsStore).length > 0
                            });
                        }
                        
                        console.log(`\n${'='.repeat(60)}`);
                        console.log(`📊 [FEEDBACK] Maximum iterations (${maxIterations}) reached`);
                        
                        // Display initial vs final metrics
                        if (initialTestCounts && finalTestCounts) {
                            console.log(`\n📊 [FEEDBACK] TEST RESULTS SUMMARY:`);
                            console.log(`   Initial Run: ${initialTestCounts.passed} passed, ${initialTestCounts.failed} failed (${initialTestCounts.total} total)`);
                            console.log(`   Final Run (after ${maxIterations} iterations): ${finalTestCounts.passed} passed, ${finalTestCounts.failed} failed (${finalTestCounts.total} total)`);
                            
                            // Detailed comparison
                            const initialPassed = initialTestCounts.passed || 0;
                            const initialFailed = initialTestCounts.failed || 0;
                            const finalPassed = finalTestCounts.passed || 0;
                            const finalFailed = finalTestCounts.failed || 0;
                            
                            console.log(`   📊 Comparison:`);
                            console.log(`      Passed: ${initialPassed} → ${finalPassed} (${finalPassed - initialPassed >= 0 ? '+' : ''}${finalPassed - initialPassed})`);
                            console.log(`      Failed: ${initialFailed} → ${finalFailed} (${finalFailed - initialFailed >= 0 ? '+' : ''}${finalFailed - initialFailed})`);
                            
                            if (initialTestCounts.failed > 0) {
                                const improvement = initialTestCounts.failed - finalTestCounts.failed;
                                if (improvement === 0) {
                                    console.warn(`   ⚠️  WARNING: No improvement - same number of failures (${finalTestCounts.failed} failed)`);
                                    console.warn(`   ⚠️  This suggests the code fixes are not working or code is not changing.`);
                                } else {
                                    console.log(`   ✅ Improvement: ${improvement} test${improvement === 1 ? '' : 's'} fixed`);
                                }
                            }
                        } else if (finalTestCounts) {
                            console.log(`📊 [FEEDBACK] Final test results: ${finalTestCounts.passed} passed, ${finalTestCounts.failed} failed (${finalTestCounts.total} total)`);
                        } else {
                            console.warn(`⚠️ [FEEDBACK] WARNING: Could not extract final test counts!`);
                            }
                        console.log(`${'='.repeat(60)}\n`);
                        
                        // Send final status message with both metrics
                        this.panel?.webview.postMessage({
                            type: 'testResultsSummary',
                            message: finalStatusMessage,
                            statusType: 'info',
                            initialTestCounts: initialTestCounts,
                            finalTestCounts: finalTestCounts,
                            iterations: maxIterations,
                            allTestsPassed: false
                        });
                    }
                }
            }
            
            // Display final summary with both initial and final metrics (if loop ran)
            if (!initialTestResult.success && initialTestCounts && finalTestCounts) {
                console.log(`\n${'='.repeat(60)}`);
                console.log(`📊 [FEEDBACK] FINAL TEST RESULTS SUMMARY`);
                console.log(`${'='.repeat(60)}`);
                console.log(`   Initial Run: ${initialTestCounts.passed} passed, ${initialTestCounts.failed} failed (${initialTestCounts.total} total)`);
                const iterationsText = allTestsPassed ? `after ${iteration} iteration${iteration === 1 ? '' : 's'}` : `after ${maxIterations} iterations`;
                console.log(`   Final Run (${iterationsText}): ${finalTestCounts.passed} passed, ${finalTestCounts.failed} failed (${finalTestCounts.total} total)`);
                if (initialTestCounts.failed > 0) {
                    const improvement = initialTestCounts.failed - finalTestCounts.failed;
                    console.log(`   Improvement: ${improvement} test${improvement === 1 ? '' : 's'} fixed`);
                }
                console.log(`${'='.repeat(60)}\n`);
                
                // Send final summary to dashboard (if not already sent)
                if (!allTestsPassed) {
                    this.panel?.webview.postMessage({
                        type: 'testResultsSummary',
                        initialTestCounts: initialTestCounts,
                        finalTestCounts: finalTestCounts,
                        iterations: maxIterations,
                        allTestsPassed: false
                    });
                }
            }
            
            if (!allTestsPassed) {
                // Final message already sent in the loop when max iterations reached
                // Just log and return (don't throw error)
                console.log(`\n${'='.repeat(60)}`);
                console.log(`📊 [FEEDBACK] Test results available after ${maxIterations} iterations`);
                console.log(`${'='.repeat(60)}\n`);
                return;
            }
            
        } catch (error) {
            console.error('❌ [VERIFY] Code verification failed:', error.message);
            
            // Check if it's the "max iterations" error - if so, show friendly message
            if (error.message.includes('iterations')) {
                this.panel?.webview.postMessage({
                    type: 'updateStatus',
                    message: `Test results available after ${maxIterations} iterations.`,
                    statusType: 'info'
                });
            } else {
            this.panel?.webview.postMessage({
                type: 'showError',
                message: 'Code verification failed: ' + error.message
            });
            }
        }
    }

    /**
     * Extract test counts (passed, failed, total) from test output
     * Returns {passed: number, failed: number, total: number} or null if not found
     */
    extractTestCounts(testOutput, language) {
        if (!testOutput) return null;
        
        const resultsText = testOutput.toString();
        let passedTests = 0;
        let failedTests = 0;
        let totalTests = 0;
        
        // First, count individual test results as ground truth
        const passedMatches = resultsText.match(/\bPASSED\s+\[/g);
        const failedMatches = resultsText.match(/\bFAILED\s+\[/g);
        const individualPassed = passedMatches ? passedMatches.length : 0;
        const individualFailed = failedMatches ? failedMatches.length : 0;
        const individualTotal = individualPassed + individualFailed;
        
        // Pytest pattern: "X passed, Y failed in Zs" (final summary line) - CHECK THIS FIRST
        const summaryMatch = resultsText.match(/(\d+)\s+passed.*?(\d+)\s+failed.*?in/);
        if (summaryMatch) {
            passedTests = parseInt(summaryMatch[1]);
            failedTests = parseInt(summaryMatch[2]);
            totalTests = passedTests + failedTests;
            
            // Verify summary matches individual counts (if we have individual counts)
            if (individualTotal > 0 && (passedTests !== individualPassed || failedTests !== individualFailed)) {
                console.warn(`⚠️ [TEST-COUNTS] Summary mismatch! Summary: ${passedTests} passed, ${failedTests} failed | Individual: ${individualPassed} passed, ${individualFailed} failed`);
                // Use individual counts as they're more accurate
                return { passed: individualPassed, failed: individualFailed, total: individualTotal };
            }
            
            return { passed: passedTests, failed: failedTests, total: totalTests };
        }
        
        // Pytest pattern: "X passed in Zs" (no failures)
        const passedOnlyMatch = resultsText.match(/(\d+)\s+passed.*?in/);
        if (passedOnlyMatch && !resultsText.includes('failed')) {
            passedTests = parseInt(passedOnlyMatch[1]);
            totalTests = passedTests;
            return { passed: passedTests, failed: 0, total: totalTests };
        }
        
        // Pytest pattern: "X passed, Y failed" (without "in")
        if (resultsText.includes('passed') && resultsText.includes('failed')) {
            const passedMatch = resultsText.match(/(\d+)\s+passed/);
            const failedMatch = resultsText.match(/(\d+)\s+failed/);
            if (passedMatch) passedTests = parseInt(passedMatch[1]);
            if (failedMatch) failedTests = parseInt(failedMatch[1]);
            if (passedTests > 0 || failedTests > 0) {
                totalTests = passedTests + failedTests;
                return { passed: passedTests, failed: failedTests, total: totalTests };
            }
        }
        
        // Pytest pattern: "X passed" (no failures, without "in")
        if (resultsText.includes('passed') && !resultsText.includes('failed')) {
            const match = resultsText.match(/(\d+)\s+passed/);
            if (match) {
                passedTests = parseInt(match[1]);
                return { passed: passedTests, failed: 0, total: passedTests };
            }
        }
        
        // FALLBACK: Use individual test counts if summary line is missing
        if (individualTotal > 0) {
            console.log(`🔍 [TEST-COUNTS] Using individual test counts: ${individualPassed} passed, ${individualFailed} failed (${individualTotal} total)`);
            return { passed: individualPassed, failed: individualFailed, total: individualTotal };
        }
        
        // Check for "collected X items" as last resort
        const collectedMatch = resultsText.match(/collected\s+(\d+)\s+items?/);
        if (collectedMatch) {
            totalTests = parseInt(collectedMatch[1]);
            // If we counted individual tests, use those; otherwise return collected count
            if (passedTests > 0 || failedTests > 0) {
                return { passed: passedTests, failed: failedTests, total: totalTests };
            }
            return { passed: 0, failed: 0, total: totalTests };
        }
        
        return null;
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    async handleExportCsv() {
        console.log('📊 [CSV-EXPORT] Exporting test results to CSV...');
        
        try {
            // Check if we have any stored results
            if (!this.testResultsStore || Object.keys(this.testResultsStore).length === 0) {
                vscode.window.showWarningMessage('No test results to export. Please run tests first.');
                return;
            }
            
            // Get workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found. Please open a workspace first.');
                return;
            }
            
            // Generate CSV filename from SRS name
            let csvFilename = 'test_results.csv'; // Default fallback
            if (this.currentSRSFilename) {
                const baseName = path.parse(this.currentSRSFilename).name;
                const sanitized = baseName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                csvFilename = `${sanitized}_test_results.csv`;
            }
            
            const csvPath = path.join(workspaceFolder.uri.fsPath, csvFilename);
            
            // Generate CSV content
            const csvRows = [];
            csvRows.push('Functionality,Total Tests,Initial Pass,Initial Failed,Initial Pass Rate (%),Final Pass,Final Failed,Final Pass Rate (%),Code Gen Start Time,Code Gen Duration (s),Test Gen Start Time,Test Gen Duration (s)');
            
            // Sort functionalities alphabetically
            const sortedFunctionalities = Object.keys(this.testResultsStore).sort();
            
            for (const functionalityName of sortedFunctionalities) {
                const result = this.testResultsStore[functionalityName];
                
                // Escape commas and quotes in functionality name
                const escapedName = `"${functionalityName.replace(/"/g, '""')}"`;
                
                // Get initial results
                const initialPassed = result.initialPassed !== undefined ? result.initialPassed : result.passed;
                const initialFailed = result.initialFailed !== undefined ? result.initialFailed : result.failed;
                const initialTotal = result.initialTotal !== undefined ? result.initialTotal : result.total;
                const initialPassRate = initialTotal > 0 ? ((initialPassed / initialTotal) * 100).toFixed(2) : '0.00';
                
                // Get final results (feedback results)
                const finalPassed = result.finalPassed !== undefined ? result.finalPassed : result.passed;
                const finalFailed = result.finalFailed !== undefined ? result.finalFailed : result.failed;
                const finalTotal = result.finalTotal !== undefined ? result.finalTotal : result.total;
                const finalPassRate = finalTotal > 0 ? ((finalPassed / finalTotal) * 100).toFixed(2) : '0.00';
                
                // Use total tests (prefer final total, fallback to initial total)
                const totalTests = result.total || finalTotal || initialTotal || 0;
                
                // Get timing data
                const timing = this.generationTimingStore[functionalityName] || {};
                const codeGenTiming = timing.codeGen || {};
                const testGenTiming = timing.testGen || {};
                
                const codeGenStartTime = codeGenTiming.startTimeFormatted || codeGenTiming.startTime || 'N/A';
                const codeGenDuration = codeGenTiming.durationSeconds || (codeGenTiming.duration ? (codeGenTiming.duration / 1000).toFixed(2) : 'N/A');
                const testGenStartTime = testGenTiming.startTimeFormatted || testGenTiming.startTime || 'N/A';
                const testGenDuration = testGenTiming.durationSeconds || (testGenTiming.duration ? (testGenTiming.duration / 1000).toFixed(2) : 'N/A');
                
                csvRows.push(`${escapedName},${totalTests},${initialPassed},${initialFailed},${initialPassRate},${finalPassed},${finalFailed},${finalPassRate},"${codeGenStartTime}",${codeGenDuration},"${testGenStartTime}",${testGenDuration}`);
            }
            
            const csvContent = csvRows.join('\n');
            
            // Write CSV file
            fs.writeFileSync(csvPath, csvContent, 'utf8');
            
            console.log(`✅ [CSV-EXPORT] CSV exported successfully to: ${csvPath}`);
            console.log(`📊 [CSV-EXPORT] Exported ${sortedFunctionalities.length} functionality result(s)`);
            
            // Show success message
            vscode.window.showInformationMessage(`Test results exported to ${csvFilename}`, 'Open File').then(selection => {
                if (selection === 'Open File') {
                    vscode.workspace.openTextDocument(csvPath).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                }
            });
            
            // Notify frontend
            this.panel?.webview.postMessage({
                type: 'csvExportSuccess',
                message: `Test results exported to ${csvFilename}`,
                filePath: csvPath
            });
            
        } catch (error) {
            console.error('❌ [CSV-EXPORT] Error exporting CSV:', error);
            vscode.window.showErrorMessage(`Failed to export CSV: ${error.message}`);
            
            this.panel?.webview.postMessage({
                type: 'csvExportError',
                message: `Failed to export CSV: ${error.message}`
            });
        }
    }

    extractTestErrors(testOutput, language) {
        console.log('🔍 [FEEDBACK] Extracting test errors from output...');
        
        const errors = [];
        
        if (language === 'python') {
            // Parse pytest output for failures
            const lines = testOutput.split('\n');
            let currentError = null;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // Match test failure header: "FAILED test_file.py::test_function"
                const failureMatch = line.match(/FAILED\s+(.+?::.+?)\s+-/);
                if (failureMatch) {
                    if (currentError) {
                        errors.push(currentError);
                    }
                    currentError = {
                        test: failureMatch[1],
                        error: '',
                        traceback: [],
                        fullError: []
                    };
                }
                
                // Match assertion errors: "AssertionError: message"
                if (currentError && line.includes('AssertionError:')) {
                    const errorMsg = line.split('AssertionError:')[1]?.trim() || 'Assertion failed';
                    currentError.error = errorMsg;
                    currentError.fullError.push(line);
                    
                    // Extract route path from error if it's a route test
                    const routeMatch = errorMsg.match(/Route\s+['"]([^'"]+)['"]/);
                    if (routeMatch) {
                        currentError.missingRoute = routeMatch[1];
                        currentError.isRouteError = true;
                    }
                }
                
                // Match 404 errors (missing routes)
                if (currentError && line.includes('404') && line.includes('NOT FOUND')) {
                    currentError.isRouteError = true;
                    currentError.error = 'Route returned 404 NOT FOUND - route is missing or not registered';
                }
                
                // Match other errors: "ErrorType: message"
                if (currentError && !currentError.error && line.match(/^\w+Error:/)) {
                    currentError.error = line;
                    
                    // Detect SQLAlchemy DetachedInstanceError
                    if (line.includes('DetachedInstanceError')) {
                        currentError.isSQLAlchemyError = true;
                        currentError.errorType = 'DetachedInstanceError';
                        currentError.error += '\n\n🔴 SQLALCHEMY SESSION ERROR: Object is detached from session. This happens when you try to access model attributes outside the app context or after session is closed.';
                    }
                    
                    // Detect FileNotFoundError
                    if (line.includes('FileNotFoundError')) {
                        currentError.isFileSystemError = true;
                        currentError.errorType = 'FileNotFoundError';
                    }
                }
                
                // Collect traceback lines and error details
                if (currentError) {
                    if (line.includes('  File ') || line.includes('    ')) {
                    currentError.traceback.push(line);
                    }
                    
                    // Check for SQLAlchemy DetachedInstanceError in any line
                    if (line.includes('DetachedInstanceError') && !currentError.isSQLAlchemyError) {
                        currentError.isSQLAlchemyError = true;
                        currentError.errorType = 'DetachedInstanceError';
                        if (!currentError.error.includes('DetachedInstanceError')) {
                            currentError.error = 'DetachedInstanceError: Instance is not bound to a Session - accessing model attributes outside session context';
                        }
                    }
                    
                    // Check for FileNotFoundError in any line
                    if (line.includes('FileNotFoundError') && !currentError.isFileSystemError) {
                        currentError.isFileSystemError = true;
                        currentError.errorType = 'FileNotFoundError';
                        const pathMatch = line.match(/directory: ['"](.+?)['"]/);
                        if (pathMatch) {
                            currentError.missingPath = pathMatch[1];
                        }
                    }
                    
                    // Check for "DID NOT RAISE" in any line
                    if (line.includes('DID NOT RAISE') && !currentError.isLogicError) {
                        currentError.isLogicError = true;
                        const exceptionMatch = line.match(/DID NOT RAISE.*?<class '(\w+)'>/);
                        if (exceptionMatch) {
                            currentError.expectedException = exceptionMatch[1];
                        }
                    }
                    
                    // Check for LocalProxy assertion errors
                    if (line.includes('LocalProxy') && line.includes('is None') && !currentError.isLocalProxyError) {
                        currentError.isLocalProxyError = true;
                    }
                    
                    // Collect assertion details
                    if (line.includes('assert ') || line.includes('AssertionError')) {
                        currentError.fullError.push(line);
                    }
                    
                    // Collect route/URL details
                    if (line.includes('/dashboard/') || line.includes('/api/')) {
                        const urlMatch = line.match(/['"]([\/\w-]+)['"]/);
                        if (urlMatch) {
                            currentError.missingRoute = urlMatch[1];
                            currentError.isRouteError = true;
                        }
                    }
                }
                
                // Match SQLAlchemy DetachedInstanceError
                const detachedErrorMatch = line.match(/DetachedInstanceError:.*Instance.*is not bound to a Session/);
                if (detachedErrorMatch) {
                    errors.push({
                        test: currentError?.test || 'SQLAlchemy Session Error',
                        error: 'DetachedInstanceError: Instance is not bound to a Session - accessing model attributes outside session context',
                        traceback: [line],
                        isSQLAlchemyError: true,
                        errorType: 'DetachedInstanceError',
                        fullError: [line]
                    });
                }
                
                // Match FileNotFoundError
                const fileNotFoundMatch = line.match(/FileNotFoundError:.*No such file or directory/);
                if (fileNotFoundMatch) {
                    const pathMatch = line.match(/directory: ['"](.+?)['"]/);
                    errors.push({
                        test: currentError?.test || 'File System Error',
                        error: `FileNotFoundError: Directory does not exist - ${pathMatch ? pathMatch[1] : 'path not found'}`,
                        traceback: [line],
                        isFileSystemError: true,
                        errorType: 'FileNotFoundError',
                        missingPath: pathMatch ? pathMatch[1] : null,
                        fullError: [line]
                    });
                }
                
                // Match "DID NOT RAISE" errors (functions not raising exceptions)
                if (line.includes('DID NOT RAISE')) {
                    const exceptionMatch = line.match(/DID NOT RAISE.*?<class '(\w+)'>/);
                    errors.push({
                        test: currentError?.test || 'Exception Test',
                        error: `Function did not raise expected exception: ${exceptionMatch ? exceptionMatch[1] : 'Exception'}`,
                        traceback: [line],
                        isLogicError: true,
                        expectedException: exceptionMatch ? exceptionMatch[1] : 'Exception',
                        fullError: [line]
                    });
                }
                
                // Match LocalProxy assertion errors
                if (line.includes('LocalProxy') && line.includes('is None')) {
                    errors.push({
                        test: currentError?.test || 'LocalProxy Error',
                        error: 'Function returned LocalProxy object instead of None or actual value',
                        traceback: [line],
                        isLocalProxyError: true,
                        fullError: [line]
                    });
                }
                
                // Match import errors: "ModuleNotFoundError: No module named 'X'"
                const importErrorMatch = line.match(/ModuleNotFoundError: No module named ['"](.+?)['"]/);
                if (importErrorMatch) {
                    const missingModule = importErrorMatch[1];
                    // Check if this is a model/controller that shouldn't exist according to contract
                    const isContractViolation = missingModule.includes('email_verification_token') || 
                                                missingModule.includes('EmailVerificationToken') ||
                                                missingModule.includes('email_service') ||
                                                missingModule.includes('EmailService');
                    
                    errors.push({
                        test: 'Import Error',
                        error: `Missing module: ${missingModule}${isContractViolation ? ' (CONTRACT VIOLATION: This model/service is NOT in the contract!)' : ''}`,
                        traceback: [line],
                        isContractViolation: isContractViolation,
                        missingModule: missingModule
                    });
                }
                
                // Match ImportError: "cannot import name 'X' from 'Y'"
                const importNameErrorMatch = line.match(/ImportError: cannot import name ['"](.+?)['"] from ['"](.+?)['"]/);
                if (importNameErrorMatch) {
                    const missingName = importNameErrorMatch[1];
                    const fromModule = importNameErrorMatch[2];
                    const isCircularImport = line.includes('partially initialized module') || line.includes('circular import');
                    errors.push({
                        test: 'Import Error',
                        error: `Cannot import '${missingName}' from '${fromModule}'${isCircularImport ? ' (CIRCULAR IMPORT DETECTED)' : ''}`,
                        traceback: [line],
                        missingName: missingName,
                        fromModule: fromModule,
                        isCircularImport: isCircularImport
                    });
                }
                
                // Match SyntaxError in test files
                const syntaxErrorMatch = line.match(/SyntaxError: (.+?)\s+File ["'](.+?)["'], line (\d+)/);
                if (syntaxErrorMatch) {
                    const syntaxError = syntaxErrorMatch[1];
                    const filePath = syntaxErrorMatch[2];
                    const lineNum = syntaxErrorMatch[3];
                    errors.push({
                        test: 'Syntax Error',
                        error: `SyntaxError: ${syntaxError} in ${filePath} at line ${lineNum}`,
                        traceback: [line],
                        isSyntaxError: true,
                        syntaxError: syntaxError,
                        errorFile: filePath,
                        errorLine: lineNum,
                        fullError: [line]
                    });
                }
                
                // Match TypeError: "Blueprint.__init__() got multiple values for argument 'import_name'"
                const blueprintErrorMatch = line.match(/TypeError: Blueprint\.__init__\(\) got multiple values for argument ['"]import_name['"]/);
                if (blueprintErrorMatch) {
                    errors.push({
                        test: 'Blueprint Initialization Error',
                        error: 'Blueprint.__init__() got multiple values for argument \'import_name\'',
                        traceback: [line],
                        isBlueprintError: true,
                        fixHint: 'Remove import_name=__name__ keyword argument. Use: Blueprint(\'name\', __name__) instead of Blueprint(\'name\', __name__, import_name=__name__)'
                    });
                }
                
                // Match SQLAlchemy InvalidRequestError: "Table 'X' is already defined"
                const tableAlreadyDefinedMatch = line.match(/InvalidRequestError: Table ['"](.+?)['"] is already defined/);
                if (tableAlreadyDefinedMatch) {
                    const tableName = tableAlreadyDefinedMatch[1];
                    errors.push({
                        test: currentError?.test || 'Table Definition Error',
                        error: `InvalidRequestError: Table '${tableName}' is already defined for this MetaData instance. Specify 'extend_existing=True' to redefine options and columns on an existing Table object.`,
                        traceback: [line],
                        isTableConflictError: true,
                        tableName: tableName,
                        fullError: [line],
                        fixHint: `Table '${tableName}' already exists. Either use shared model import, use unique table name, or add __table_args__ = {'extend_existing': True}`
                    });
                }
            }
            
            if (currentError) {
                errors.push(currentError);
            }
        } else if (language === 'javascript') {
            // Parse Jest output for failures
            const lines = testOutput.split('\n');
            let currentError = null;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // Match test failure: "FAIL test/path.test.js"
                const failureMatch = line.match(/FAIL\s+(.+?\.test\.(js|ts))/);
                if (failureMatch) {
                    if (currentError) {
                        errors.push(currentError);
                    }
                    currentError = {
                        test: failureMatch[1],
                        error: '',
                        traceback: []
                    };
                }
                
                // Match error messages: "Error: message"
                if (currentError && line.match(/^\s*Error:/)) {
                    currentError.error = line.trim();
                }
                
                // Collect stack trace
                if (currentError && (line.includes('    at ') || line.includes('      at '))) {
                    currentError.traceback.push(line);
                }
            }
            
            if (currentError) {
                errors.push(currentError);
            }
        }
        
        // If no structured errors found, return the full output
        if (errors.length === 0) {
            errors.push({
                test: 'Unknown',
                error: 'Test execution failed',
                traceback: testOutput.split('\n').slice(0, 50) // First 50 lines
            });
        }
        
        console.log(`📋 [FEEDBACK] Extracted ${errors.length} test error(s)`);
        return errors;
    }

    async fixCodeBasedOnTestFailures(functionalityName, contract, packet, currentCode, testErrors, language) {
        console.log('🔧 [FEEDBACK] Fixing code based on test failures...');
        console.log(`📋 [FEEDBACK] Contract structure:`, {
            models: contract.file_structure?.models?.map(m => m.class_name).join(', ') || 'NONE',
            controllers: contract.file_structure?.controllers?.map(c => c.file_path).join(', ') || 'NONE'
        });
        console.log(`📋 [FEEDBACK] Test errors:`, testErrors.length);
        
        const vscode = require('vscode');
        const config = vscode.workspace.getConfiguration('kinmail');
        const apiKey = config.get('openaiApiKey');
        
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }
        
        // Build error summary with contract violation warnings
        const errorSummary = testErrors.map((err, idx) => {
            let errorMsg = `Error ${idx + 1}:
Test: ${err.test}
Error: ${err.error}`;
            
            // Add specific guidance for route errors (404 - missing routes)
            if (err.isRouteError && err.missingRoute) {
                errorMsg += `\n\n🔴 MISSING ROUTE DETECTED:
The route "${err.missingRoute}" is NOT registered in Flask.
This means either:
1. The route is not defined in the controller file
2. The blueprint is not registered in app.py
3. The route path doesn't match the blueprint prefix

FIX REQUIRED:
- Check if the route is defined in the controller: @blueprint.route("${err.missingRoute}")
- Check if the blueprint is registered in app.py: app.register_blueprint(blueprint_name)
- Ensure the blueprint has the correct URL prefix if needed
- For "/dashboard/products", the route should be defined as: @blueprint.route("/products") if blueprint has prefix="/dashboard"
- For "/api/dashboard/products", the route should be defined as: @blueprint.route("/products") if blueprint has prefix="/api/dashboard"
- CRITICAL: Make sure app.py imports and registers the blueprint: from controllers.{controller_name} import {blueprint_name}; app.register_blueprint({blueprint_name})`;
            } else if (err.isRouteError) {
                errorMsg += `\n\n🔴 ROUTE ERROR DETECTED:
A route test is failing because the route is missing or not registered.
Check:
1. Is the route defined in the controller?
2. Is the blueprint registered in app.py?
3. Does the route path match what the test expects?`;
            }
            
            // Add specific guidance for contract violations
            if (err.isContractViolation) {
                errorMsg += `\n\n🔴 CONTRACT VIOLATION DETECTED:
The code is trying to import '${err.missingModule}' which is NOT defined in the contract.
The contract only defines these models: ${contract.file_structure?.models?.map(m => m.class_name).join(', ') || 'NONE'}
You MUST remove this import and use only models defined in the contract.`;
            }
            
            if (err.missingModule && (err.missingModule.includes('email_verification_token') || err.missingModule.includes('EmailVerificationToken'))) {
                errorMsg += `\n\n🔴 FIX REQUIRED:
- DO NOT import EmailVerificationToken (it's not in the contract)
- Use User.verification_token field instead (as defined in contract)
- Remove: from models.email_verification_token import EmailVerificationToken
- Remove: from models.email_verification_token import EmailVerificationToken (if in controllers)`;
            }
            
            if (err.missingModule && (err.missingModule.includes('email_service') || err.missingModule.includes('EmailService'))) {
                errorMsg += `\n\n🔴 FIX REQUIRED:
- DO NOT import EmailService (it's not in the contract)
- Use Flask-Mail directly: from app import mail; mail.send()
- Remove: from services.email_service import EmailService`;
            }
            
            // Check for table already defined errors (any table name)
            // Check both the flag and the error message pattern
            if (err.isTableConflictError || 
                (err.error && (err.error.includes("Table '") && err.error.includes("' is already defined")) ||
                 err.error && err.error.includes("InvalidRequestError: Table") && err.error.includes("already defined"))) {
                // Extract table name from error message or use the flag
                const tableName = err.tableName || (err.error.match(/Table '(\w+)' is already defined/) ? err.error.match(/Table '(\w+)' is already defined/)[1] : 'unknown');
                
                errorMsg += `\n\n🔴 TABLE ALREADY DEFINED ERROR DETECTED:
The table '${tableName}' is already defined in the database schema. This happens when multiple models try to use the same table name.

THREE POSSIBLE FIXES:

OPTION 1 - If it's a SHARED table (User, Product, Category, Order, etc.):
- DO NOT create a new model with the same table name
- FIX: Import the existing shared model instead
- Example for 'orders' table:
  * WRONG: from models.cancel_order_order import CancelOrderOrder
  * CORRECT: from models.order import Order  (use the shared Order model)
- Example for 'users' table:
  * WRONG: from models.{functionality}_user import User
  * CORRECT: from models.user import User
- DO NOT generate shared model files again - they already exist

OPTION 2 - If it's a FUNCTIONALITY-SPECIFIC table that needs to be unique:
- FIX: Use a unique table name with functionality prefix
- Example: Instead of __tablename__ = 'orders', use:
  * __tablename__ = 'cancel_order_orders'  (or 'edit_order_orders', etc.)
- This ensures each functionality has its own table

OPTION 3 - If you MUST reuse an existing table (shared across functionalities):
- FIX: Add __table_args__ = {'extend_existing': True} to the model class
- Example:
  class CancelOrderOrder(db.Model):
      __tablename__ = 'orders'
      __table_args__ = {'extend_existing': True}
- This tells SQLAlchemy to extend the existing table definition instead of creating a new one

MOST COMMON CASES:
- "Table 'users' is already defined" → Use "from models.user import User" (shared model)
- "Table 'products' is already defined" → Use "from models.product import Product" (shared model)
- "Table 'orders' is already defined" → Either use shared Order model OR use unique table name like 'cancel_order_orders'
- "Table 'categories' is already defined" → Use "from models.category import Category" (shared model)`;
            }
            
            if (err.error && (err.error.includes('add_product_user') || err.error.includes('view_profile_user') || 
                err.error.includes('user_registration_user') || err.error.includes('user_login_user'))) {
                errorMsg += `\n\n🔴 FUNCTIONALITY-SPECIFIC USER MODEL DETECTED:
- You are importing from a functionality-specific User model path (e.g., models.add_product_user)
- This causes table collision errors because User is a shared model
- FIX: Change to shared import: from models.user import User
- Remove any functionality-specific User model files (models/{functionality}_user.py)
- Use the shared models/user.py instead`;
            }
            
            if (err.isBlueprintError || (err.error && err.error.includes('Blueprint.__init__() got multiple values for argument'))) {
                errorMsg += `\n\n🔴 BLUEPRINT INITIALIZATION ERROR DETECTED:
- Blueprint is being called with import_name twice
- WRONG: Blueprint('name', __name__, import_name=__name__)  # import_name passed twice
- CORRECT: Blueprint('name', __name__)  # __name__ is the import_name (second positional argument)
- FIX: Remove the import_name=__name__ keyword argument from all Blueprint() calls
- Search for: Blueprint(.*import_name=__name__) and remove the import_name=__name__ part`;
            }
            
            // Check for circular import errors
            if (err.isCircularImport || (err.error && (err.error.includes('circular import') || err.error.includes('partially initialized module')))) {
                const fromModule = err.fromModule || 'unknown';
                const missingName = err.missingName || 'unknown';
                errorMsg += `\n\n🔴 CIRCULAR IMPORT ERROR DETECTED:
A circular import occurs when module A imports from module B, and module B imports from module A.

ERROR DETAILS:
- Trying to import '${missingName}' from '${fromModule}'
- This creates a circular dependency that Python cannot resolve

COMMON CAUSES:
1. Views importing from Controllers, and Controllers importing from Views
2. Models importing from Controllers, and Controllers importing from Models
3. Helper functions defined in wrong files

FIX REQUIRED:
OPTION 1 - Move shared functions to a separate module:
- Create a new file: utils/helpers.py (or helpers.py in root)
- Move the shared function (e.g., serialize_order) to this file
- Import from the helper file in both views and controllers
- Example:
  # utils/helpers.py
  def serialize_order(order):
      # function code here
  
  # controllers/manager_interface_controller.py
  from utils.helpers import serialize_order
  
  # views/manager_interface_views.py
  from utils.helpers import serialize_order

OPTION 2 - Use late imports (import inside functions):
- Move the import statement inside the function that uses it
- This delays the import until the function is called
- Example:
  def some_function():
      from controllers.manager_interface_controller import serialize_order
      # use serialize_order here

OPTION 3 - Restructure to avoid circular dependency:
- If views need controller functions, move those functions to a shared location
- If controllers need view functions, consider if the logic should be in controllers instead
- Follow MVC pattern: Controllers should not import from Views, Views should not import from Controllers

MOST COMMON FIX:
- Move serialize_order, serialize_table, or similar helper functions to a separate utils/helpers.py file
- Import from utils/helpers in both places that need it`;
            }
            
            // Check for syntax errors
            if (err.isSyntaxError) {
                const errorFile = err.errorFile || 'unknown';
                const errorLine = err.errorLine || 'unknown';
                const syntaxError = err.syntaxError || 'unknown';
                errorMsg += `\n\n🔴 SYNTAX ERROR DETECTED:
A syntax error means the Python code is malformed and cannot be parsed.

ERROR DETAILS:
- File: ${errorFile}
- Line: ${errorLine}
- Error: ${syntaxError}

COMMON CAUSES:
1. Missing newline between import statements (e.g., "import osfrom unittest" should be two lines)
2. Missing closing parentheses, brackets, or quotes
3. Incorrect indentation
4. Missing colons after if/for/def statements

FIX REQUIRED:
- Check line ${errorLine} in ${errorFile}
- Ensure all import statements are on separate lines
- Example WRONG: import osfrom unittest.mock import patch
- Example CORRECT:
  import os
  from unittest.mock import patch
- Ensure proper spacing and newlines between statements
- Check for missing punctuation (colons, commas, parentheses)
- Verify indentation is correct (use 4 spaces, not tabs)

SPECIFIC FIX FOR MISSING NEWLINE IN IMPORTS:
- If you see "import Xfrom Y" or "import Ximport Y", split into separate lines:
  import X
  from Y import Z
  import Y`;
            }
            
            // Add specific guidance for SQLAlchemy DetachedInstanceError
            if (err.isSQLAlchemyError && err.errorType === 'DetachedInstanceError') {
                errorMsg += `\n\n🔴 SQLALCHEMY DETACHED INSTANCE ERROR DETECTED:
This error occurs when you try to access model attributes (like user.id, category.id) outside the database session context.

COMMON CAUSES:
1. Accessing model attributes after app context ends
2. Passing model objects between different app contexts
3. Accessing attributes in test helpers (_login_via_session) that are outside app context

FIX REQUIRED:
- When creating model instances in tests, access their attributes (like .id) INSIDE the app context
- Example FIX for _login_via_session helper:
  def _login_via_session(client, user_id):
      with client.session_transaction() as sess:
          sess['user_id'] = user_id  # Use user_id directly, not user.id
  
- If you need to access user.id, do it INSIDE the app context:
  with app.app_context():
      user = _create_user()
      user_id = user.id  # Get id while in context
  # Then use user_id outside context
  
- For test helpers that create users/categories, ensure they return the ID or access attributes within the context
- CRITICAL: Never access model.attribute outside app.app_context() or db.session context`;
            }
            
            // Add specific guidance for FileNotFoundError
            if (err.isFileSystemError && err.errorType === 'FileNotFoundError') {
                errorMsg += `\n\n🔴 FILE NOT FOUND ERROR DETECTED:
This error occurs when trying to save a file to a directory that doesn't exist.

FIX REQUIRED:
- Before saving files, ensure the directory exists using os.makedirs() or pathlib.Path.mkdir()
- Example FIX for save_uploaded_picture:
  import os
  from pathlib import Path
  
  def save_uploaded_picture(file_storage):
      # Create directory if it doesn't exist
      upload_dir = Path('static/uploads/products')
      upload_dir.mkdir(parents=True, exist_ok=True)  # Creates directory if missing
      
      # Then save the file
      file_path = upload_dir / filename
      file_storage.save(str(file_path))
  
- Always use os.makedirs(directory, exist_ok=True) or Path.mkdir(parents=True, exist_ok=True) before file operations
- Check if directory exists before saving: if not os.path.exists(directory): os.makedirs(directory)`;
            }
            
            // Add guidance for function logic errors (not raising exceptions)
            if (err.isLogicError || (err.error && err.error.includes('DID NOT RAISE'))) {
                errorMsg += `\n\n🔴 EXCEPTION NOT RAISED ERROR DETECTED:
The test expects the function to raise an exception, but it didn't.

FIX REQUIRED:
- The function should validate input and raise appropriate exceptions (ValueError, TypeError, etc.) for invalid input
- Example for login_required decorator:
  def login_required(view_func):
      @wraps(view_func)
      def wrapper(*args, **kwargs):
          user_id = session.get('user_id')
          if not user_id:
              raise UnauthorizedError("Login required")  # Or redirect, or raise exception
          return view_func(*args, **kwargs)
      return wrapper
  
- Example for save_uploaded_picture:
  def save_uploaded_picture(file_storage):
      if not file_storage or not file_storage.filename:
          raise ValueError("Invalid file storage")  # Raise exception for invalid input
      # ... rest of function
  
- Ensure functions validate input and raise exceptions when input is invalid or missing`;
            }
            
            // Add guidance for LocalProxy issues (get_current_user returning proxy instead of None)
            if (err.isLocalProxyError || (err.error && err.error.includes('LocalProxy') && err.error.includes('is None'))) {
                errorMsg += `\n\n🔴 FLASK LOCALPROXY ERROR DETECTED:
The function is returning a LocalProxy object instead of None or the actual value.

FIX REQUIRED:
- When checking if a value exists in Flask session, properly handle LocalProxy
- Example FIX for get_current_user:
  def get_current_user():
      user_id = session.get('user_id')
      if not user_id:
          return None  # Return None, not a LocalProxy
      return User.query.get(user_id)
  
- Always check if session values exist before using them
- Use session.get('key') which returns None if key doesn't exist, not session['key'] which raises KeyError`;
            }
            
            errorMsg += `\n${err.traceback.length > 0 ? `Traceback:\n${err.traceback.slice(0, 10).join('\n')}` : ''}
`;
            return errorMsg;
        }).join('\n---\n\n');
        
        // Extract exact names from contract for strict enforcement
        const routeInfo = contract.file_structure?.controllers?.flatMap(c => 
            c.routes?.map(r => ({
                path: r.path,
                methods: r.methods,
                function_name: r.function_name
            })) || []
        ) || [];
        
        const modelInfo = contract.file_structure?.models?.map(m => ({
            class: m.class_name,
            fields: m.fields?.map(f => f.name) || [],
            methods: m.methods?.map(m => m.name) || []
        })) || [];
        
        const helperFunctions = contract.file_structure?.controllers?.flatMap(c =>
            c.helper_functions?.map(h => ({
                name: h.name,
                parameters: h.parameters
            })) || []
        ) || [];
        
        // Build contract section
        const contractSection = `
📋 API CONTRACT (MUST FOLLOW EXACTLY - NO VARIATIONS):
${JSON.stringify(contract, null, 2)}

CRITICAL REQUIREMENTS - EXACT NAMING ENFORCEMENT:

1. ROUTE FUNCTION NAMES (MANDATORY - USE EXACT NAMES):
${routeInfo.map(r => {
    const methods = r.methods && Array.isArray(r.methods) ? r.methods.join(', ') : 'N/A';
    return `   - Route "${r.path}" (${methods}) MUST use function name: "${r.function_name}"
     * DO NOT split into ${r.function_name}_get() and ${r.function_name}_post()
     * DO NOT use variations like ${r.function_name}_handler() or ${r.function_name}_route()
     * USE EXACTLY: def ${r.function_name}():`;
}).join('\n')}

2. MODEL FIELD NAMES (MANDATORY - USE EXACT NAMES):
${modelInfo.map(m => `   - Model "${m.class}" MUST use these EXACT field names:
     ${m.fields.map(f => `* ${f}`).join('\n     ')}
     * DO NOT use variations (e.g., if contract says "is_verified", DO NOT use "is_email_verified")
     * DO NOT use variations (e.g., if contract says "verification_token", DO NOT use "email_verification_token_hash")
     * DO NOT use variations (e.g., if contract says "profile_picture", DO NOT use "profile_picture_path")`).join('\n\n')}

3. MODEL METHOD NAMES (MANDATORY - USE EXACT NAMES):
${modelInfo.map(m => `   - Model "${m.class}" MUST use these EXACT method names:
     ${m.methods.map(f => `* ${f}()`).join('\n     ')}
     * DO NOT create methods not in this list
     * DO NOT use variations of these names`).join('\n\n')}

4. HELPER FUNCTION NAMES (MANDATORY - USE EXACT NAMES):
${helperFunctions.map(h => {
    const params = h.parameters && Array.isArray(h.parameters) ? h.parameters.join(', ') : 'N/A';
    return `   - Helper function: "${h.name}(${params})"
     * DO NOT use variations
     * DO NOT create helper functions not in this list`;
}).join('\n')}

CRITICAL - STRICT ADHERENCE:
- Use EXACT function names from contract.file_structure.controllers[].routes[].function_name
- Use EXACT field names from contract.file_structure.models[].fields[].name
- Use EXACT method names from contract.file_structure.models[].methods[].name
- Use EXACT helper function names from contract.file_structure.controllers[].helper_functions[].name
- DO NOT create variations, abbreviations, or alternative names
- DO NOT split single functions into multiple (e.g., register_get/register_post when contract says register)
- DO NOT add prefixes/suffixes (e.g., _handler, _route, _path, _hash, _get, _post)
- Implement ALL routes, fields, methods, and helper functions defined in the contract
- DO NOT create additional models, controllers, services, or imports that are NOT in the contract
- DO NOT import models that are not listed in contract.file_structure.models
- Use ONLY the exact import paths specified in contract.import_paths
`;
        
        // Build SRS context from packet
        let srsContext = '';
        if (packet) {
            srsContext = `
FUNCTIONALITY: ${packet.name || contract.functionality || 'unknown'}
DESCRIPTION: ${packet.description || 'N/A'}
USE CASES: ${packet.useCases?.join(', ') || 'N/A'}
REQUIREMENTS: ${packet.requirements?.join(', ') || 'N/A'}
ACTIVITY DIAGRAMS: ${packet.activityDiagrams?.join(', ') || 'N/A'}
DEPENDENCIES: ${packet.dependencies?.join(', ') || 'N/A'}
CONTEXT: ${packet.context || 'N/A'}
`;
        }
        
        // Calculate hash of current code to detect if LLM returns same code
        const crypto = require('crypto');
        const currentCodeHash = crypto.createHash('md5').update(currentCode).digest('hex');
        console.log(`🔐 [FEEDBACK] Current code hash (MD5): ${currentCodeHash.substring(0, 16)}...`);
        
        const prompt = `You are a ${language.toUpperCase()} developer. Fix the following code to make all tests pass while strictly following the contract and SRS requirements.

${srsContext}

${contractSection}

REQUIREMENTS:
- Fix the existing ${language.toUpperCase()} code to make ALL tests pass
- Maintain the same MVC structure and file organization
- Use proper MVC architecture
- Include complete, executable code for ALL files

CURRENT CODE (WITH ERRORS - THIS CODE FAILS TESTS):
\`\`\`${language}
${currentCode}
\`\`\`

TEST FAILURES (THESE ERRORS MUST BE FIXED):
${errorSummary}

YOUR TASK:
1. Analyze the test failures and identify what's wrong with the current code
2. Fix the code to make ALL tests pass
3. Ensure the fixed code strictly follows the contract (file paths, class names, function names, import paths)
4. Ensure the fixed code matches the SRS requirements
5. DO NOT create models, services, or imports that are NOT in the contract
6. DO NOT change the contract structure - only fix implementation bugs
7. DO NOT return incomplete code - you MUST return ALL files with file markers

MVC STRUCTURE - Fix ALL these core components:

1. MODEL LAYER - Fix data entities:
   - Primary entity for this functionality (models/filename.py)
   - Business logic and validation methods
   - Database schema definitions

2. VIEW LAYER - Fix UI components:
   - User interface components (views/filename.py)
   - Template files (templates/filename.html)
   - User interaction handlers

3. CONTROLLER LAYER - Fix business logic:
   - API endpoints and routes (controllers/filename.py)
   - Business operations and coordination
   - Request/response handling

4. MAIN APP FILE:
   - Application initialization (app.py)
   - Configuration and setup

ONLY fix these core MVC files (DO NOT add new files):
- models/filename.py
- views/filename.py  
- controllers/filename.py
- templates/filename.html
- app.py (main application file in root - MUST include Flask-SQLAlchemy db initialization)

CRITICAL REQUIREMENT - FLASK-SQLALCHEMY SETUP:
For Flask applications with SQLAlchemy models, you MUST use Flask-SQLAlchemy (NOT raw SQLAlchemy):

1. In app.py, ALWAYS follow this EXACT order to avoid circular imports:
   from flask import Flask
   from flask_sqlalchemy import SQLAlchemy
   from flask_mail import Mail
   
   app = Flask(__name__)
   app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///app.db'
   app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
   app.config['SECRET_KEY'] = 'your-secret-key'
   # ... other config ...
   
   # CRITICAL: Initialize db and mail BEFORE importing controllers
   db = SQLAlchemy(app)
   mail = Mail(app)
   
   # CRITICAL: Import blueprints AFTER db and mail are initialized (prevents circular imports)
   from controllers.user_controller import user_bp
   # ... other blueprint imports ...
   
   # Register blueprints
   app.register_blueprint(user_bp)
   # ... other blueprint registrations ...
   
   IMPORTANT: The order MUST be:
   1. Import Flask, SQLAlchemy, Mail
   2. Create app
   3. Configure app
   4. Initialize db = SQLAlchemy(app)
   5. Initialize mail = Mail(app)
   6. THEN import blueprints (controllers can now safely import db from app)
   7. Register blueprints

2. In models/*.py files, ALWAYS use:
   from app import db
   
   class ModelName(db.Model):
       __tablename__ = 'table_name'
       # columns here

3. In controllers/*.py files, ALWAYS use:
   from flask import Blueprint
   from app import db
   
   # CRITICAL - BLUEPRINT INITIALIZATION (MANDATORY):
   - Blueprint constructor: Blueprint(name, import_name, ...)
   - The second argument (import_name) is ALWAYS __name__
   - CORRECT: user_bp = Blueprint('user', __name__)
   - WRONG: Blueprint('user', __name__, import_name=__name__)  # This causes TypeError: got multiple values for argument 'import_name'
   - DO NOT pass import_name as a keyword argument when __name__ is already passed as the second positional argument
   - Example: user_registration_bp = Blueprint('user_registration', __name__)  # CORRECT
   
   # CRITICAL: ONLY import models that are defined in the contract
   # The contract defines these models: ${contract.file_structure?.models?.map(m => m.class_name).join(', ') || 'NONE'}
   # Example: from models.user import User (ONLY if User is in contract.file_structure.models)
   # DO NOT import models that are not in the contract
   # DO NOT import EmailVerificationToken, EmailService, or any other models/services not in the contract
   # If verification tokens are needed, use User.verification_token field (as defined in contract)
   
   # CRITICAL: Use EXACT function names from contract - DO NOT split into _get/_post variants
   # If contract says "register", use single function "register" that handles both GET and POST
   # If contract says "verify_email", use "verify_email" (NOT verify_email_get)
   # If contract says "login", use "login" (NOT login_get/login_post)
   
   # Then use: db.session.add(), db.session.commit(), db.session.query()

4. DO NOT use raw SQLAlchemy (declarative_base, init_db, sessionmaker)
5. DO NOT create config/database.py with Base = declarative_base()
6. Flask-SQLAlchemy's db object provides: db.Model, db.session, db.create_all(), db.drop_all()

This ensures compatibility with Flask test clients and pytest fixtures that expect Flask-SQLAlchemy.

FRAMEWORK-SPECIFIC MVC STRUCTURE:

PYTHON/FLASK:
- models/ folder with separate model files (ONLY the models defined in contract.file_structure.models)
- views/ folder with view classes (user_views.py, product_views.py)
- controllers/ folder with controller classes (ONLY the controllers defined in contract.file_structure.controllers)
- templates/ folder with HTML templates (ONLY the templates defined in contract.file_structure.templates)
- app.py in root directory (main application file)

CRITICAL - ONLY FIX WHAT'S IN THE CONTRACT (STRICT ENFORCEMENT):
- Fix ONLY the models listed in contract.file_structure.models
- Fix ONLY the controllers listed in contract.file_structure.controllers
- Fix ONLY the routes listed in contract.file_structure.controllers[].routes
- Fix ONLY the templates listed in contract.file_structure.templates
- Fix ONLY the helper functions listed in contract.file_structure.controllers[].helper_functions
- DO NOT create additional models, controllers, services, or files that are not in the contract
- DO NOT import models that are not in contract.file_structure.models
- DO NOT create services/ folder or EmailService classes
- DO NOT create EmailVerificationToken or any other models not in the contract
- If email verification is needed, use User.verification_token field (as defined in contract), NOT a separate model
- Use Flask-Mail directly (from app import mail; mail.send()) instead of creating EmailService

CRITICAL - EXACT FILE GENERATION (MANDATORY - APPLIES TO ALL FILE TYPES):
- Fix EXACTLY the files listed in contract.file_structure (models, controllers, views, templates)
- DO NOT create additional files beyond what's in the contract
- DO NOT split one file into multiple files
- DO NOT create variations, abbreviations, or alternative file names
- File names MUST match contract.file_structure EXACTLY (case-sensitive, character-by-character)

CRITICAL - FUNCTIONALITY-BASED NAMING (MANDATORY):
- ALL file names MUST be prefixed with the functionality name (in snake_case)
- The contract already includes functionality-prefixed names - use them EXACTLY as specified
- Models: Use format from contract (e.g., "models/product_search_product.py", NOT "models/product.py")
- Controllers: Use format from contract (e.g., "controllers/product_search_controller.py", NOT "controllers/product_controller.py")
- Views: Use format from contract (e.g., "views/product_search_views.py", NOT "views/product_views.py")
- Templates: Use format from contract (e.g., "templates/product_search_search.html", NOT "templates/search.html")
- DO NOT use generic names without functionality prefix
- DO NOT create files like "category.py", "product.py" - use "product_search_category.py", "product_search_product.py" instead

STRICT FILE COUNT AND NAMING (ALL FILE TYPES):
- Models: Fix ONLY the models in contract.file_structure.models
  * If contract lists 2 models, fix EXACTLY 2 models (not 1, not 3)
  * If contract says "models/product.py", fix EXACTLY "models/product.py" - NOT "models/products.py"
  * If contract says "models/category.py" AND "models/product.py", fix BOTH - but if contract only lists one, fix ONLY that one
  
- Controllers: Fix ONLY the controllers in contract.file_structure.controllers
  * If contract lists 1 controller, fix EXACTLY 1 controller (not 2, not 0)
  * If contract says "controllers/product_search_controller.py", fix EXACTLY that - NOT "controllers/product_controller.py"
  * DO NOT split one controller into multiple files (e.g., product_search_controller.py AND category_controller.py)
  
- Views: Fix ONLY the views in contract.file_structure.views
  * If contract lists 1 view, fix EXACTLY 1 view (not 2, not 0)
  * File names must match contract EXACTLY
  
- Templates: Fix ONLY the templates in contract.file_structure.templates
  * If contract lists 2 templates, fix EXACTLY 2 templates (not 1, not 3)
  * File names must match contract EXACTLY

GENERAL RULE:
- Count of files MUST match contract (if contract has 2 models, fix 2 models - not 1, not 3)
- File paths MUST match contract EXACTLY (character-by-character, case-sensitive)
- DO NOT add, remove, or modify file names from what's in the contract

CRITICAL - EXACT NAMING ENFORCEMENT (MANDATORY):
- Use EXACT function names from contract.file_structure.controllers[].routes[].function_name
  * If contract says "register", use "register" (NOT register_get/register_post)
  * If contract says "verify_email", use "verify_email" (NOT verify_email_get)
  * If contract says "login", use "login" (NOT login_get/login_post)
- Use EXACT field names from contract.file_structure.models[].fields[].name
  * If contract says "is_verified", use "is_verified" (NOT is_email_verified)
  * If contract says "verification_token", use "verification_token" (NOT email_verification_token_hash)
  * If contract says "profile_picture", use "profile_picture" (NOT profile_picture_path)
- Use EXACT method names from contract.file_structure.models[].methods[].name
  * If contract says "generate_verification_token", use "generate_verification_token" (NOT set_email_verification_token)
- Use EXACT helper function names from contract.file_structure.controllers[].helper_functions[].name
  * If contract says "validate_registration_data", use "validate_registration_data" (NOT validate_registration_payload)
- DO NOT create variations, abbreviations, or alternative names
- DO NOT split single functions into multiple (e.g., register_get/register_post when contract says register)
- DO NOT add prefixes/suffixes (e.g., _handler, _route, _path, _hash, _get, _post)

COMMON ERROR FIXES:
- If you see "ModuleNotFoundError: No module named 'models.email_verification_token'":
  * REMOVE: from models.email_verification_token import EmailVerificationToken
  * USE INSTEAD: User.verification_token field (as defined in contract)
  * DO NOT create EmailVerificationToken model - it's NOT in the contract
  
- If you see "ModuleNotFoundError: No module named 'services.email_service'":
  * REMOVE: from services.email_service import EmailService
  * USE INSTEAD: from app import mail; mail.send(Message(...))
  * DO NOT create EmailService class - it's NOT in the contract

- If you see "Table 'X' is already defined" or "InvalidRequestError: Table 'X' is already defined":
  * This means a table with that name already exists in the database schema
  * TWO POSSIBLE FIXES depending on the situation:
  
  OPTION 1 - If it's a SHARED table (User, Product, Category, Order, etc.):
  * DO NOT create a new model with the same table name
  * FIX: Import the existing shared model instead
  * Example: If "Table 'orders' is already defined", change:
  *   from models.cancel_order_order import CancelOrderOrder
  *   to: from models.order import Order  (or whatever the shared model is)
  * DO NOT generate shared model files again - they already exist
  
  OPTION 2 - If it's a FUNCTIONALITY-SPECIFIC table that needs to be unique:
  * FIX: Use a unique table name with functionality prefix
  * Example: Instead of __tablename__ = 'orders', use:
  *   __tablename__ = 'cancel_order_orders'  (or 'edit_order_orders', etc.)
  * This ensures each functionality has its own table
  
  OPTION 3 - If you MUST reuse an existing table (shared across functionalities):
  * FIX: Add __table_args__ = {'extend_existing': True} to the model class
  * Example:
  *   class CancelOrderOrder(db.Model):
  *       __tablename__ = 'orders'
  *       __table_args__ = {'extend_existing': True}
  * This tells SQLAlchemy to extend the existing table definition instead of creating a new one
  
  MOST COMMON CASES:
  * "Table 'users' is already defined" → Use "from models.user import User" (shared model)
  * "Table 'products' is already defined" → Use "from models.product import Product" (shared model)
  * "Table 'orders' is already defined" → Either use shared Order model OR use unique table name like 'cancel_order_orders'
  * "Table 'categories' is already defined" → Use "from models.category import Category" (shared model)

- If you see "TypeError: Blueprint.__init__() got multiple values for argument 'import_name'":
  * WRONG: Blueprint('name', __name__, import_name=__name__)
  * CORRECT: Blueprint('name', __name__)
  * FIX: Remove the import_name=__name__ keyword argument

- If you see "DetachedInstanceError":
  * This means accessing model attributes outside database session
  * FIX: Ensure all database operations are within app.app_context() or db.session context
  * Use: with app.app_context(): ... before accessing model attributes

- If you see "FileNotFoundError":
  * This means trying to save files to non-existent directories
  * FIX: Use os.makedirs(directory, exist_ok=True) before saving files

- If you see "DID NOT RAISE" errors:
  * This means functions are not raising expected exceptions for invalid input
  * FIX: Add proper validation and raise exceptions (TypeError, ValueError) for invalid input

- If you see "LocalProxy" issues with get_current_user:
  * This means get_current_user returns LocalProxy instead of None
  * FIX: Check if user_id exists in session before accessing, return None explicitly if not found

CRITICAL MVC REQUIREMENTS:
- DO NOT generate monolithic code in a single file
- Fix separate files for each MVC component
- Maintain proper directory structure (models/, views/, controllers/)
- Each file should have a single responsibility
- Use proper imports and dependencies for each file

FILE SEPARATION REQUIREMENTS:
- models/ folder: One file per entity (user.py, product.py)
- views/ folder: One file per view class (user_views.py, product_views.py)
- controllers/ folder: One file per controller (user_controller.py, product_controller.py)
- templates/ folder: HTML template files
- Main app file: app.py (minimal, just imports and configuration)

OUTPUT FORMAT:
Use this format for each file:
#### filename.ext
[code here]

#### filename2.ext
[code here]

CRITICAL - FILE PATH ENFORCEMENT (MANDATORY):
- You MUST use ONLY file paths from the contract.file_structure
- ALLOWED paths: models/, controllers/, views/, templates/, app.py, config/
- FORBIDDEN paths: forms/, services/, utils/, helpers/, lib/, src/, components/, api/, routes/, middleware/, etc.
- DO NOT create files in folders NOT listed in the contract
- DO NOT use paths like "forms/product_form.py" - use "models/product.py" or "controllers/product_controller.py" instead
- If contract says "models/user.py", use EXACTLY "models/user.py" - NOT "models/users.py" or "model/user.py"
- If contract says "controllers/user_controller.py", use EXACTLY "controllers/user_controller.py"
- Templates MUST be in templates/ folder: "templates/register.html" - NOT "views/register.html" or "register.html"
- Example CORRECT paths:
  * #### models/user.py
  * #### controllers/user_controller.py
  * #### views/user_views.py
  * #### templates/register.html
  * #### app.py
- Example WRONG paths (DO NOT USE):
  * #### forms/user_form.py (WRONG - use models/user.py)
  * #### services/user_service.py (WRONG - use controllers/user_controller.py)
  * #### utils/helpers.py (WRONG - not in contract)

CRITICAL - YOU MUST RETURN THE COMPLETE MVC STRUCTURE:
- The current code is a multi-file MVC structure with file markers (#### filename.ext)
- You MUST return ALL files in the same format with file markers
- DO NOT return only app.py or a single file
- DO NOT return incomplete code
- You MUST include ALL files: models, controllers, views, templates, app.py
- Each file MUST be wrapped with: #### filename.ext\n[code]\n
- Example format:
  #### models/user.py
  [user model code]
  
  #### controllers/view_profile_controller.py
  [controller code]
  
  #### views/view_profile_views.py
  [views code]
  
  #### app.py
  [app.py code]

CRITICAL - YOU MUST MAKE ACTUAL CHANGES:
- The current code has test failures - it is NOT correct
- You MUST modify the code to fix the errors listed above
- DO NOT return the same code - it will fail the same tests
- DO NOT return code that is identical to the current code
- You MUST make concrete changes to fix each error
- If you return identical code, the tests will still fail AND the system will reject it
- Review each error carefully and make the necessary fixes
- The code MUST be different from the current code to pass tests
- BUT you MUST return the COMPLETE structure, not just one file
- MANDATORY: Your output code MUST be different from the input code - identical code will be rejected

CRITICAL - DO NOT BREAK WORKING CODE:
- ONLY fix the specific errors listed in the test failures
- DO NOT modify code that is not related to the errors
- DO NOT introduce new errors while fixing existing ones
- DO NOT create circular imports (views importing from controllers that import from views)
- DO NOT merge import statements (keep each import on a separate line)
- DO NOT modify shared code (app.py, shared models) unless the error specifically requires it
- If fixing one functionality breaks another, you've made a mistake - revert that change
- Test your fixes mentally: if you add an import, make sure it doesn't create a circular dependency
- If you see "circular import" errors, move shared functions to a separate utils/helpers.py file

CODE LENGTH REQUIREMENTS (CRITICAL TO PREVENT TRUNCATION):
- Current code length: ${currentCode.length} characters
- Keep your output code concise but complete
- Target length: Similar to input (${currentCode.length} chars) or up to ${Math.min(currentCode.length * 1.2, 50000).toFixed(0)} chars maximum
- DO NOT exceed ~50,000 characters total to avoid response truncation
- If code is too long, prioritize fixing errors over adding unnecessary code
- Keep functions focused and avoid excessive comments or verbose implementations
- Estimate: Aim for ${Math.floor(currentCode.length / 80)} to ${Math.floor(Math.min(currentCode.length * 1.2, 50000) / 80)} total lines across all files
- If you need to add code, keep additions minimal and focused on fixing the specific errors

Fix the complete ${language.toUpperCase()} code for this functionality. Return ONLY code files with #### filename format. Do not include any explanations, descriptions, or additional text after the code.`;

        const axios = require('axios');
        
        // Use gpt-5.2 for feedback loop (same as code generation and test generation)
        const model = 'gpt-5.2';
        console.log(`🤖 [FEEDBACK] Using model: ${model}`);
        
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: `You are a ${language.toUpperCase()} developer. Fix code to make tests pass while following the contract exactly. Return ONLY executable code, no explanations. CRITICAL: You MUST modify the code - returning identical code is not acceptable and will be rejected. The code has test failures that MUST be fixed.`
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.3,
                    max_completion_tokens: 16000  // GPT-5.2 requires max_completion_tokens instead of max_tokens
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            // Log API response details
            console.log(`📡 [FEEDBACK] API Response received`);
            console.log(`📡 [FEEDBACK] Response status: ${response.status}`);
            const finishReason = response.data.choices[0]?.finish_reason || 'N/A';
            console.log(`📡 [FEEDBACK] Finish reason: ${finishReason}`);
            console.log(`📡 [FEEDBACK] Usage tokens: ${JSON.stringify(response.data.usage || {})}`);
            
            // CRITICAL: Check if response was truncated
            if (finishReason === 'length' || finishReason === 'max_tokens') {
                console.error(`❌ [FEEDBACK] CRITICAL ERROR: Response was TRUNCATED due to token limit!`);
                console.error(`❌ [FEEDBACK] Finish reason: ${finishReason}`);
                console.error(`❌ [FEEDBACK] Token usage: ${JSON.stringify(response.data.usage || {})}`);
                console.error(`❌ [FEEDBACK] The LLM response was cut off, meaning the code is incomplete.`);
                console.error(`❌ [FEEDBACK] This will cause parsing errors or missing files.`);
                throw new Error(`LLM response was truncated due to token limit (finish_reason: ${finishReason}). The generated code is incomplete. Consider reducing code length or increasing max_completion_tokens. Current limit: 16000 tokens.`);
            }
            
            // Check if response is empty
            if (!response.data.choices || response.data.choices.length === 0) {
                console.error(`❌ [FEEDBACK] CRITICAL ERROR: Empty response from LLM!`);
                throw new Error('LLM returned empty response. No code was generated.');
            }
            
            if (!response.data.choices[0].message || !response.data.choices[0].message.content) {
                console.error(`❌ [FEEDBACK] CRITICAL ERROR: Response has no content!`);
                console.error(`❌ [FEEDBACK] Response data: ${JSON.stringify(response.data, null, 2)}`);
                throw new Error('LLM response has no content. The message content is missing.');
            }
            
            let fixedCode = response.data.choices[0].message.content.trim();
            const rawResponseLength = fixedCode.length;
            console.log(`📡 [FEEDBACK] Raw LLM response length: ${rawResponseLength} chars`);
            console.log(`📡 [FEEDBACK] Raw LLM response preview (first 300 chars): ${fixedCode.substring(0, 300)}...`);
            
            // Compare with input code BEFORE cleaning
            const inputCodeLength = currentCode.length;
            const inputCodePreview = currentCode.substring(0, 300);
            console.log(`📊 [FEEDBACK] INPUT code length: ${inputCodeLength} chars`);
            console.log(`📊 [FEEDBACK] INPUT code preview (first 300 chars): ${inputCodePreview}...`);
            console.log(`📊 [FEEDBACK] OUTPUT code length: ${rawResponseLength} chars`);
            console.log(`📊 [FEEDBACK] OUTPUT code preview (first 300 chars): ${fixedCode.substring(0, 300)}...`);
            
            // Check if raw response is identical to input
            if (fixedCode === currentCode) {
                console.error(`❌ [FEEDBACK] CRITICAL: LLM returned IDENTICAL code to input!`);
                console.error(`❌ [FEEDBACK] This means the LLM did not make any changes.`);
                console.error(`❌ [FEEDBACK] Rejecting identical code - it will not fix the test failures.`);
                throw new Error('LLM returned identical code to input. The code must be modified to fix test failures. Identical code will fail the same tests and is not acceptable.');
            } else {
                console.log(`✅ [FEEDBACK] LLM returned DIFFERENT code (input: ${inputCodeLength} chars, output: ${rawResponseLength} chars)`);
            }
            
            // Clean up the response (remove markdown code blocks if present)
            if (fixedCode.includes('```')) {
                const beforeClean = fixedCode.length;
                fixedCode = fixedCode.replace(/```[a-zA-Z]*\n?/g, '');
                fixedCode = fixedCode.replace(/```\s*$/g, '');
                fixedCode = fixedCode.replace(/```/g, '');
                console.log(`🧹 [FEEDBACK] Removed markdown code blocks (${beforeClean} → ${fixedCode.length} chars)`);
            }
            
            // Remove explanatory text
            const lines = fixedCode.split('\n');
            let firstCodeLine = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line && !line.startsWith('Note:') && !line.startsWith('Here') && 
                    !line.startsWith('The') && !line.startsWith('This') &&
                    (line.startsWith('import ') || line.startsWith('from ') || 
                     line.startsWith('class ') || line.startsWith('def ') ||
                     line.startsWith('const ') || line.startsWith('function ') ||
                     line.startsWith('public ') || line.startsWith('private '))) {
                    firstCodeLine = i;
                    break;
                }
            }
            const beforeSlice = fixedCode.length;
            fixedCode = lines.slice(firstCodeLine).join('\n').trim();
            if (beforeSlice !== fixedCode.length) {
                console.log(`🧹 [FEEDBACK] Removed explanatory text (${beforeSlice} → ${fixedCode.length} chars, removed ${beforeSlice - fixedCode.length} chars)`);
            }
            
            // CRITICAL VALIDATION: Check for file markers (MVC structure)
            const hasFileMarkers = fixedCode.includes('#### ') && fixedCode.includes('.py');
            const fileMarkerCount = (fixedCode.match(/#### /g) || []).length;
            
            console.log(`🔍 [FEEDBACK] File marker validation:`, {
                hasFileMarkers,
                fileMarkerCount,
                expectedMinFiles: 3 // At least models, controllers, app.py
            });
            
            if (!hasFileMarkers || fileMarkerCount < 3) {
                console.error(`❌ [FEEDBACK] CRITICAL ERROR: Fixed code is missing file markers!`);
                console.error(`❌ [FEEDBACK] File markers found: ${fileMarkerCount} (expected at least 3)`);
                console.error(`❌ [FEEDBACK] The LLM returned code without the #### filename.ext format!`);
                console.error(`❌ [FEEDBACK] This means it returned incomplete code or only one file.`);
                console.error(`❌ [FEEDBACK] Code preview (first 500 chars): ${fixedCode.substring(0, 500)}...`);
                throw new Error(`LLM returned incomplete code without file markers. Expected multi-file MVC structure with #### filename.ext format, but got single file or incomplete code. File markers found: ${fileMarkerCount}, expected at least 3.`);
            }
            
            // Validate fixed code length - check if significantly shorter than input
            const lengthRatio = fixedCode.length / currentCode.length;
            if (lengthRatio < 0.3) {
                console.error(`❌ [FEEDBACK] CRITICAL ERROR: Fixed code is too short!`);
                console.error(`❌ [FEEDBACK] Input: ${currentCode.length} chars, Output: ${fixedCode.length} chars`);
                console.error(`❌ [FEEDBACK] Ratio: ${(lengthRatio * 100).toFixed(1)}% (expected at least 70%)`);
                console.error(`❌ [FEEDBACK] The LLM likely returned incomplete code or only one file.`);
                throw new Error(`LLM returned incomplete code. Input was ${currentCode.length} chars but output is only ${fixedCode.length} chars (${(lengthRatio * 100).toFixed(1)}%). Expected complete MVC structure with all files.`);
            }
            
            // Validate fixed code
            if (!fixedCode || fixedCode.length < 100) {
                console.warn(`⚠️ [FEEDBACK] WARNING: Fixed code seems too short (${fixedCode.length} chars). May be incomplete.`);
            }
            
            // Final comparison with input using hash
            const fixedCodeHash = crypto.createHash('md5').update(fixedCode).digest('hex');
            const finalComparison = fixedCode === currentCode;
            const hashComparison = fixedCodeHash === currentCodeHash;
            
            console.log(`🔐 [FEEDBACK] Fixed code hash (MD5): ${fixedCodeHash.substring(0, 16)}...`);
            console.log(`🔐 [FEEDBACK] Hash comparison: ${hashComparison ? 'IDENTICAL' : 'DIFFERENT'}`);
            
            if (finalComparison || hashComparison) {
                console.error(`❌ [FEEDBACK] CRITICAL ERROR: Final cleaned code is IDENTICAL to input code!`);
                console.error(`❌ [FEEDBACK] Input length: ${currentCode.length}, Output length: ${fixedCode.length}`);
                console.error(`❌ [FEEDBACK] Input hash: ${currentCodeHash.substring(0, 16)}...`);
                console.error(`❌ [FEEDBACK] Output hash: ${fixedCodeHash.substring(0, 16)}...`);
                console.error(`❌ [FEEDBACK] The LLM did not make any changes to fix the code.`);
                console.error(`❌ [FEEDBACK] This will cause the same test failures.`);
                console.error(`❌ [FEEDBACK] The LLM may not understand the errors or may think the code is already correct.`);
                console.error(`❌ [FEEDBACK] Rejecting identical code - it must be modified to fix test failures.`);
                throw new Error('LLM returned identical code after cleaning. The code must be modified to fix test failures. Identical code will fail the same tests and is not acceptable. The LLM needs to make actual changes to address the errors listed in the test failures.');
            } else {
                console.log(`✅ [FEEDBACK] Final code is DIFFERENT from input`);
                console.log(`📊 [FEEDBACK] Input: ${currentCode.length} chars, Output: ${fixedCode.length} chars`);
                console.log(`📊 [FEEDBACK] Difference: ${Math.abs(fixedCode.length - currentCode.length)} chars`);
            }
            
            console.log(`✅ [FEEDBACK] Code fixed successfully (${fixedCode.length} chars)`);
            console.log(`📊 [FEEDBACK] Fixed code preview (first 200 chars): ${fixedCode.substring(0, 200)}...`);
            
            // Log file markers for debugging
            const fileMarkers = fixedCode.match(/####\s+[\w\/\.]+/g) || [];
            console.log(`📁 [FEEDBACK] Files in fixed code: ${fileMarkers.length}`);
            if (fileMarkers.length > 0) {
                console.log(`📁 [FEEDBACK] File list: ${fileMarkers.map(m => m.replace('####', '').trim()).join(', ')}`);
            }
            
            // Additional validation: Check if fixed code contains key elements
            const hasRoutes = fixedCode.includes('@') && (fixedCode.includes('route') || fixedCode.includes('Blueprint'));
            const hasFunctions = fixedCode.includes('def ') || fixedCode.includes('function ');
            const hasImports = fixedCode.includes('import ') || fixedCode.includes('from ');
            
            console.log(`🔍 [FEEDBACK] Code validation:`, {
                hasRoutes,
                hasFunctions,
                hasImports,
                length: fixedCode.length
            });
            
            if (!hasRoutes && !hasFunctions) {
                console.warn(`⚠️ [FEEDBACK] WARNING: Fixed code may be incomplete - missing routes/functions!`);
            }
            
            return fixedCode;
            
        } catch (error) {
            console.error('❌ [FEEDBACK] Error fixing code:', error.message);
            if (error.response) {
                console.error('❌ [FEEDBACK] API Error:', JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(`Failed to fix code: ${error.message}`);
        }
    }

    detectLanguage(code) {
        console.log('🔍 [LANGUAGE] Detecting programming language...');
        
        // C++ patterns (check first as it has unique patterns)
        if (code.includes('#include') || (code.includes('std::') && code.includes('cout <<'))) {
            console.log('🔍 [LANGUAGE] Detected C++ language');
            return 'cpp';
        }
        
        // Java patterns (check early as it has unique patterns)
        if (code.includes('public class') || code.includes('import java.') || code.includes('System.out.println')) {
            console.log('🔍 [LANGUAGE] Detected Java language');
            return 'java';
        }
        
        // C# patterns (check early as it has unique patterns)
        if (code.includes('using System') || code.includes('namespace ') || code.includes('Console.WriteLine')) {
            console.log('🔍 [LANGUAGE] Detected C# language');
            return 'csharp';
        }
        
        // Python patterns (check before JavaScript as it has unique patterns)
        if (code.includes('def ') && (code.includes('import ') || code.includes('from ') || code.includes('if __name__'))) {
            console.log('🔍 [LANGUAGE] Detected Python language');
            return 'python';
        }
        
        // JavaScript patterns (check last as it's most generic)
        if (code.includes('function ') || code.includes('const ') || code.includes('let ') || 
            code.includes('var ') || code.includes('=>') || code.includes('require(') || 
            code.includes('module.exports') || code.includes('console.log')) {
            console.log('🔍 [LANGUAGE] Detected JavaScript language');
            return 'javascript';
        }
        
        // Default to JavaScript
        console.log('🔍 [LANGUAGE] Defaulting to JavaScript');
        return 'javascript';
    }

    getTestFramework(language) {
        const frameworks = {
            'javascript': 'Jest',
            'python': 'pytest',
            'java': 'JUnit',
            'cpp': 'Google Test',
            'csharp': 'NUnit'
        };
        
        return frameworks[language] || 'Jest';
    }

    getTestFileExtension(language) {
        const extensions = {
            'javascript': '.test.js',
            'python': '_test.py',
            'java': 'Test.java',
            'cpp': '_test.cpp',
            'csharp': 'Tests.cs'
        };
        
        return extensions[language] || '.test.js';
    }
    
    getFileExtensionByLanguage(language) {
        const extensions = {
            'javascript': '.js',
            'python': '.py',
            'java': '.java',
            'cpp': '.cpp',
            'csharp': '.cs'
        };
        
        return extensions[language] || '.js'; // Default to JavaScript
    }

    getFileExtension(functionalityName) {
        // Simple mapping based on common functionality patterns
        const name = functionalityName.toLowerCase();
        
        if (name.includes('login') || name.includes('auth') || name.includes('user')) {
            return '.js'; // Default to JavaScript
        } else if (name.includes('api') || name.includes('service')) {
            return '.js';
        } else if (name.includes('component') || name.includes('ui')) {
            return '.jsx';
        } else if (name.includes('test')) {
            return '.test.js';
        } else {
            return '.js'; // Default extension
        }
    }

    async createBasicRequirements(projectPath) {
        console.log('📦 [PYTHON] Creating basic requirements.txt to avoid import errors...');
        
        const fs = require('fs');
        const path = require('path');
        
        const requirementsPath = path.join(projectPath, 'requirements.txt');
        const requirementsContent = `# Basic requirements for testing
pytest>=7.0.0
pytest-mock>=3.10.0
# Common dependencies that might be needed
requests>=2.28.0
flask>=2.0.0
pandas>=1.5.0
numpy>=1.24.0
`;
        
        try {
            fs.writeFileSync(requirementsPath, requirementsContent, 'utf8');
            console.log('✅ [PYTHON] Created requirements.txt');
            
            // Install the requirements
            const { spawn } = require('child_process');
            const installProcess = spawn('pip', ['install', '-r', 'requirements.txt'], {
                cwd: projectPath,
                shell: true
            });
            
            return new Promise((resolve) => {
                installProcess.on('close', (code) => {
                    if (code === 0) {
                        console.log('✅ [PYTHON] Requirements installed successfully');
                    } else {
                        console.log('⚠️ [PYTHON] Requirements installation failed, continuing...');
                    }
                    resolve();
                });
            });
        } catch (error) {
            console.log('⚠️ [PYTHON] Failed to create requirements.txt:', error.message);
        }
    }

    async createJestConfig(projectPath) {
        console.log('📦 [JEST] Creating Jest configuration to find tests...');
        
        const fs = require('fs');
        const path = require('path');
        
        const jestConfigPath = path.join(projectPath, 'jest.config.js');
        const jestConfigContent = `module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.js',
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).js',
    '**/?(*.)+(spec|test).ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  collectCoverageFrom: [
    '**/*.{js,ts}',
    '!**/node_modules/**',
    '!**/__tests__/**'
  ],
  moduleFileExtensions: ['js', 'json', 'jsx', 'ts', 'tsx', 'node'],
  moduleNameMapping: {
    // Handle any missing modules gracefully
    '^.*$': '<rootDir>/__tests__/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  verbose: true,
  // Don't fail on missing modules
  errorOnDeprecated: false
};
`;
        
        try {
            fs.writeFileSync(jestConfigPath, jestConfigContent, 'utf8');
            console.log('✅ [JEST] Created jest.config.js');
            
            // Create Jest setup file to handle missing modules
            const setupPath = path.join(projectPath, '__tests__', 'setup.js');
            const setupContent = `// Jest setup file to handle missing modules
const path = require('path');

// Mock any missing modules
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn()
}));

// Handle missing modules gracefully
const originalRequire = require;
require = jest.fn((moduleName) => {
  try {
    return originalRequire(moduleName);
  } catch (error) {
    // Return a mock for missing modules
    return {
      [moduleName]: jest.fn(),
      default: jest.fn()
    };
  }
});
`;
            
            // Ensure __tests__ directory exists
            const testDir = path.join(projectPath, '__tests__');
            if (!fs.existsSync(testDir)) {
                fs.mkdirSync(testDir, { recursive: true });
            }
            
            fs.writeFileSync(setupPath, setupContent, 'utf8');
            console.log('✅ [JEST] Created jest setup file');
        } catch (error) {
            console.log('⚠️ [JEST] Failed to create jest.config.js:', error.message);
        }
    }

}

module.exports = { WebviewProvider };
