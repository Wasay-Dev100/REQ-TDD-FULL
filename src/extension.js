const vscode = require('vscode');
const { WebviewProvider } = require('./webviewProvider');
const { SRSManager } = require('./srsManager');
const { CodeGenerator } = require('./codeGenerator');
const { TestGenerator } = require('./testGenerator');
const { CodeVerifier } = require('./codeVerifier');

function activate(context) {
    try {
        console.log('Kinmail SRS to Code extension is now active!');
        vscode.window.showInformationMessage('Kinmail extension activated!');
        
            const testCommand = vscode.commands.registerCommand('kinmail.test', () => {
            vscode.window.showInformationMessage('Kinmail extension is working!');
        });
        context.subscriptions.push(testCommand);

        const testApiCommand = vscode.commands.registerCommand('kinmail.testApi', async () => {
        try {
            console.log('🧪 [EXTENSION] Testing API connection...');
            if (!webviewProvider) {
                webviewProvider = WebviewProvider.getInstance(context.extensionUri);
            }
            const testResponse = await webviewProvider.callOpenAI('Say "API test successful"');
            console.log('✅ [EXTENSION] API test successful:', testResponse);
            vscode.window.showInformationMessage('API Test: ' + testResponse);
        } catch (error) {
            console.error('❌ [EXTENSION] API test failed:', error);
                vscode.window.showErrorMessage('API Test Failed: ' + error.message);
            }
        });
        context.subscriptions.push(testApiCommand);

        const srsManager = new SRSManager(context);
        const codeGenerator = new CodeGenerator(context);
        const testGenerator = new TestGenerator(context);
        const codeVerifier = new CodeVerifier(context);
        
        let webviewProvider;
        try {
            webviewProvider = WebviewProvider.getInstance(context.extensionUri);
        } catch (error) {
            console.error('❌ [EXTENSION] Failed to create WebviewProvider:', error);
            vscode.window.showWarningMessage(`Webview initialization warning: ${error.message}. Some features may not work.`);
            // Continue with other commands even if webview fails
        }
        
        const openDashboard = vscode.commands.registerCommand('kinmail.openDashboard', () => {
        try {
            console.log('Opening dashboard...');
            if (!webviewProvider) {
                webviewProvider = WebviewProvider.getInstance(context.extensionUri);
            }
            webviewProvider.createOrShow();
            console.log('Dashboard opened');
        } catch (error) {
            console.error('❌ [EXTENSION] Error opening dashboard:', error);
                vscode.window.showErrorMessage(`Failed to open dashboard: ${error.message}`);
            }
        });

        const uploadSRS = vscode.commands.registerCommand('kinmail.uploadSRS', async () => {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: {
                'Documents': ['pdf', 'docx', 'txt'],
                'All Files': ['*']
            }
        });

        if (fileUri && fileUri[0]) {
            try {
                await srsManager.parseSRS(fileUri[0]);
                vscode.window.showInformationMessage('SRS document parsed successfully!');
                if (webviewProvider) {
                    webviewProvider.createOrShow();
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to parse SRS: ${error}`);
            }
        }
        });

        const generateFeature = vscode.commands.registerCommand('kinmail.generateFeature', async () => {
        const features = await srsManager.getAvailableFeatures();
        if (features.length === 0) {
            vscode.window.showWarningMessage('No SRS document loaded. Please upload an SRS first.');
            return;
        }

        const selectedFeature = await vscode.window.showQuickPick(
            features.map(f => ({ label: f.title, description: f.description, feature: f })),
            { placeHolder: 'Select a feature to generate' }
        );

        if (selectedFeature) {
            try {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Generating code...",
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0, message: "Analyzing requirements..." });
                    
                    const code = await codeGenerator.generateCode(selectedFeature.feature);
                    progress.report({ increment: 50, message: "Generating code..." });
                    
                    const fileName = `${selectedFeature.feature.id.toLowerCase().replace(/-/g, '_')}.py`;
                    const filePath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, fileName);
                    
                    await vscode.workspace.fs.writeFile(filePath, Buffer.from(code));
                    progress.report({ increment: 100, message: "Code generated successfully!" });
                    
                    const doc = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(doc);
                });

                // Generate tests if enabled
                const config = vscode.workspace.getConfiguration('kinmail');
                if (config.get('autoTest')) {
                    const tests = await testGenerator.generateTests(selectedFeature.feature);
                    const testFileName = `test_${selectedFeature.feature.id.toLowerCase().replace(/-/g, '_')}.py`;
                    const testFilePath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, testFileName);
                    
                    await vscode.workspace.fs.writeFile(testFilePath, Buffer.from(tests));
                }

                // Verify code if enabled
                if (config.get('autoVerify')) {
                    await codeVerifier.verifyCode(selectedFeature.feature);
                }

            } catch (error) {
                vscode.window.showErrorMessage(`Failed to generate code: ${error}`);
            }
        }
        });

        const runTests = vscode.commands.registerCommand('kinmail.runTests', async () => {
        try {
            await codeVerifier.runTests();
            vscode.window.showInformationMessage('Tests completed successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Tests failed: ${error}`);
        }
        });

        const verifyCode = vscode.commands.registerCommand('kinmail.verifyCode', async () => {
        try {
            const results = await codeVerifier.verifyAllCode();
            vscode.window.showInformationMessage(`Code verification completed. ${results.passed} passed, ${results.failed} failed.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Verification failed: ${error}`);
        }
        });

        context.subscriptions.push(
            openDashboard,
            uploadSRS,
            generateFeature,
            runTests,
            verifyCode
        );

        const config = vscode.workspace.getConfiguration('kinmail');
        const apiKey = config.get('openaiApiKey');
        if (!apiKey) {
            vscode.window.showWarningMessage(
                'Kinmail: OpenAI API key not configured. Please set it in settings.',
                'Open Settings'
            ).then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'kinmail.openaiApiKey');
                }
            });
        }
    } catch (error) {
        console.error('❌ [EXTENSION] Fatal error during activation:', error);
        vscode.window.showErrorMessage(`Extension activation failed: ${error.message}. Check Developer Console for details.`);
    }
}

function deactivate() {
    console.log('Kinmail SRS to Code extension is now deactivated');
}

module.exports = {
    activate,
    deactivate
};
