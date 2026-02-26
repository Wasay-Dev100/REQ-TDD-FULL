const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');

class SRSManager {
    constructor(context) {
        this.context = context;
        this.parsedSRS = null;
    }

    async parseSRS(fileUri) {
        try {
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const filePath = fileUri.fsPath;
            const fileExtension = path.extname(filePath).toLowerCase();
            
            let functionalities = [];
            
            if (fileExtension === '.pdf') {
                const base64Content = Buffer.from(fileContent).toString('base64');
                functionalities = await this.parsePDFWithLLM(base64Content, path.basename(filePath));
            } else if (fileExtension === '.txt') {
                const textContent = Buffer.from(fileContent).toString('utf8');
                functionalities = await this.extractFunctionalitiesFromText(textContent);
            } else if (fileExtension === '.docx') {
                const textContent = await this.extractTextFromDocx(fileContent);
                functionalities = await this.extractFunctionalitiesFromText(textContent);
            } else {
                const textContent = Buffer.from(fileContent).toString('utf8');
                functionalities = await this.extractFunctionalitiesFromText(textContent);
            }
            
            if (functionalities.length === 0) {
                throw new Error('No functionalities found in SRS document. Please ensure the document contains functional requirements.');
            }
            
            this.parsedSRS = {
                content: Buffer.from(fileContent).toString('utf8'),
                functionalities: functionalities
            };
            
            return this.parsedSRS;
        } catch (error) {
            throw new Error(`Failed to parse SRS: ${error.message}`);
        }
    }

    async parsePDFWithLLM(base64Content, filename) {
        try {
            const pdfParse = require('pdf-parse');
            const buffer = Buffer.from(base64Content, 'base64');
            const data = await pdfParse(buffer);
            const pdfText = data.text;
            
            if (pdfText && pdfText.length > 100) {
                return await this.extractFunctionalitiesFromText(pdfText);
            } else {
                return await this.extractFunctionalitiesFromBase64(base64Content);
            }
        } catch (error) {
            console.log('PDF parsing failed, trying base64 approach:', error.message);
            return await this.extractFunctionalitiesFromBase64(base64Content);
        }
    }

    async extractTextFromDocx(fileContent) {
        try {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer: fileContent });
            return result.value;
        } catch (error) {
            throw new Error(`Failed to extract text from DOCX: ${error.message}`);
        }
    }

    async extractFunctionalitiesFromText(text) {
        const config = vscode.workspace.getConfiguration('kinmail');
        const apiKey = config.get('openaiApiKey');
        
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Please set it in VS Code settings.');
        }

        const textChunks = this.splitTextIntoChunks(text, 8000);
        const allFunctionalities = [];
        
        // Prepare data structure to save chunks and extracted functionalities
        const chunkAnalysisData = [];
        
        for (let i = 0; i < textChunks.length; i++) {
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
                const response = await axios.post('https://api.openai.com/v1/chat/completions', {
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
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                let jsonContent = response.data.choices[0].message.content.trim();
                
                if (jsonContent.includes('```json')) {
                    jsonContent = jsonContent.replace(/```json\s*/, '').replace(/\s*```$/, '');
                } else if (jsonContent.includes('```')) {
                    jsonContent = jsonContent.replace(/```\s*/, '').replace(/\s*```$/, '');
                }
                
                jsonContent = jsonContent.replace(/^```.*$/gm, '').trim();
                
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
                    allFunctionalities.push(...functionalities);
                }
            } catch (error) {
                console.log(`Error processing text chunk ${i + 1}: ${error.message}`);
                
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
        console.log(`💾 [SRS-MANAGER] Preparing to save chunk analysis (${chunkAnalysisData.length} chunks)...`);
        await this.saveChunkAnalysis(chunkAnalysisData);
        console.log(`💾 [SRS-MANAGER] Chunk analysis save completed`);
        
        // Deduplicate functionalities by name (case-insensitive)
        const seen = new Set();
        const uniqueFunctionalities = [];
        for (const func of allFunctionalities) {
            try {
                if (!func || typeof func !== 'object') {
                    console.log(`⚠️ [SRS-MANAGER] Skipping invalid functionality object`);
                    continue;
                }
                const nameKey = func.name?.toLowerCase()?.trim();
                if (nameKey && !seen.has(nameKey)) {
                    seen.add(nameKey);
                    uniqueFunctionalities.push(func);
                } else if (nameKey) {
                    console.log(`⚠️ [SRS-MANAGER] Duplicate functionality skipped: "${func.name}"`);
                } else {
                    console.log(`⚠️ [SRS-MANAGER] Skipping functionality with missing or invalid name`);
                }
            } catch (error) {
                console.log(`⚠️ [SRS-MANAGER] Error processing functionality: ${error.message}`);
            }
        }
        
        console.log(`✅ [SRS-MANAGER] Unique functionalities after deduplication: ${uniqueFunctionalities.length}`);
        return uniqueFunctionalities;
    }

    async saveChunkAnalysis(chunkAnalysisData) {
        console.log(`💾 [SRS-MANAGER] saveChunkAnalysis called with ${chunkAnalysisData.length} chunks`);
        try {
            // Get workspace folder
            const workspaceFolders = vscode.workspace.workspaceFolders;
            console.log(`💾 [SRS-MANAGER] Workspace folders: ${workspaceFolders ? workspaceFolders.length : 0}`);
            if (!workspaceFolders || workspaceFolders.length === 0) {
                console.log('⚠️ [SRS-MANAGER] No workspace folder found, skipping chunk analysis save');
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
            console.log(`💾 [SRS-MANAGER] Attempting to save chunk analysis...`);
            console.log(`💾 [SRS-MANAGER] Workspace path: ${workspacePath}`);
            console.log(`💾 [SRS-MANAGER] File name: ${fileName}`);
            console.log(`💾 [SRS-MANAGER] Full path: ${filePath}`);
            console.log(`💾 [SRS-MANAGER] Analysis text length: ${analysisText.length} characters`);
            
            fs.writeFileSync(filePath, analysisText, 'utf8');
            console.log(`✅ [SRS-MANAGER] Chunk analysis saved successfully to: ${filePath}`);
            
            // Verify file was created
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                console.log(`✅ [SRS-MANAGER] File verified: ${stats.size} bytes`);
            } else {
                console.error(`❌ [SRS-MANAGER] File was not created at: ${filePath}`);
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
                        console.error(`❌ [SRS-MANAGER] Failed to open file: ${err.message}`);
                        vscode.window.showErrorMessage(`Failed to open file: ${err.message}`);
                    });
                } else if (selection === 'Show in Explorer') {
                    // Open file in system file explorer
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
                            console.error(`❌ [SRS-MANAGER] Failed to show in explorer: ${error.message}`);
                        }
                    });
                }
            });
        } catch (error) {
            console.error(`❌ [SRS-MANAGER] Failed to save chunk analysis: ${error.message}`);
            console.error(`❌ [SRS-MANAGER] Stack trace: ${error.stack}`);
            // Show error to user
            vscode.window.showErrorMessage(`Failed to save chunk analysis: ${error.message}`);
            // Don't throw - this is a non-critical feature
        }
    }

    async extractFunctionalitiesFromBase64(base64Content) {
        const config = vscode.workspace.getConfiguration('kinmail');
        const apiKey = config.get('openaiApiKey');
        
        if (!apiKey) {
            throw new Error('OpenAI API key not configured.');
        }

        // Prepare chunk data for saving (even though we're using base64, we'll save it as a single chunk)
        const chunkAnalysisData = [];
        const base64Preview = base64Content.substring(0, 10000);
        const fullBase64Length = base64Content.length;

        const prompt = `You are an expert SRS analyst. Extract functionality packets from this PDF document.

CRITICAL INSTRUCTIONS:
- Return ONLY a valid JSON array
- No explanations, no markdown, no additional text
- Each functionality must be a complete, implementable feature

REQUIRED JSON FORMAT:
[
  {
    "name": "Feature Name",
    "description": "Detailed description",
    "useCases": ["Use case 1", "Use case 2"],
    "activityDiagrams": [],
    "context": "",
    "requirements": ["Req 1", "Req 2"],
    "dependencies": []
  }
]

BASE64 PDF CONTENT (first 10000 chars):
${base64Preview}...

EXTRACT FUNCTIONALITIES:`;

        try {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert software analyst. Extract functionalities from SRS documents.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 4000
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            let jsonContent = response.data.choices[0].message.content.trim();
            
            if (jsonContent.includes('```json')) {
                jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (jsonContent.includes('```')) {
                jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            const functionalities = JSON.parse(jsonContent);
            const functionalitiesArray = Array.isArray(functionalities) ? functionalities : [];
            
            // Store chunk data for saving (base64 content as single chunk)
            chunkAnalysisData.push({
                chunkNumber: 1,
                totalChunks: 1,
                chunkContent: `[BASE64 PDF CONTENT - Preview of first 10000 chars]\n${base64Preview}\n\n[Full base64 length: ${fullBase64Length} characters]`,
                extractedFunctionalities: functionalitiesArray,
                chunkLength: fullBase64Length,
                isBase64: true
            });
            
            // Save chunk analysis
            console.log(`💾 [SRS-MANAGER] Preparing to save base64 chunk analysis...`);
            await this.saveChunkAnalysis(chunkAnalysisData);
            console.log(`💾 [SRS-MANAGER] Base64 chunk analysis save completed`);
            
            return functionalitiesArray;
        } catch (error) {
            console.log(`Error processing base64 content: ${error.message}`);
            
            // Store chunk even if extraction failed
            chunkAnalysisData.push({
                chunkNumber: 1,
                totalChunks: 1,
                chunkContent: `[BASE64 PDF CONTENT - Preview of first 10000 chars]\n${base64Preview}\n\n[Full base64 length: ${fullBase64Length} characters]`,
                extractedFunctionalities: [],
                error: error.message,
                chunkLength: fullBase64Length,
                isBase64: true
            });
            
            // Save chunk analysis even on error
            try {
                await this.saveChunkAnalysis(chunkAnalysisData);
            } catch (saveError) {
                console.error(`Failed to save chunk analysis on error: ${saveError.message}`);
            }
            
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

    async getAvailableFeatures() {
        if (!this.parsedSRS) {
            return [];
        }
        
        return this.parsedSRS.functionalities.map(func => ({
            id: func.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || `feature-${Math.random().toString(36).substr(2, 9)}`,
            title: func.name || 'Untitled Feature',
            description: func.description || '',
            useCases: func.useCases || [],
            requirements: func.requirements || [],
            context: func.context || '',
            dependencies: func.dependencies || [],
            activityDiagrams: func.activityDiagrams || []
        }));
    }
}

module.exports = { SRSManager };











