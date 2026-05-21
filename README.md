# Kinmail SRS to Code - MVC Architecture Extension (v2.0)

An AI-powered VS Code extension that generates complete, production-ready MVC (Model-View-Controller) code from Software Requirements Specifications (SRS) documents.

> **Note:** This is version 2.0 of the Kinmail SRS to Code extension. **Test generation and code verification features are currently in development and testing phase**. These features are being actively refined and improved.

## Features

- 📋 **SRS Document Upload** - Support for PDF, DOCX, and TXT files
- 🎯 **Interactive Dashboard** - Visual interface to manage requirements and features
- 💻 **MVC Code Generation** - Generate complete MVC applications for Python, JavaScript, Java, C#, and C++ with proper framework-specific architecture
- 🧪 **Hybrid Test Generation** - Generate comprehensive test suites based on both SRS requirements and actual generated code
- ✅ **Code Verification** - Validate generated code with syntax checking and automated testing
- 🔄 **Iterative Development** - Generate code for individual features as needed

## Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd kinmail-vscode-extension-mvc
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Open the project in VS Code:
   ```bash
   code .
   ```

4. Press `F5` to run the extension in a new Extension Development Host window

## Configuration

Before using the extension, configure your OpenAI API key:

1. Open VS Code Settings (`Ctrl/Cmd + ,`)
2. Search for "Kinmail"
3. Set your OpenAI API Key in the `kinmail.openaiApiKey` setting

### Optional Settings

- `kinmail.model` - Choose between `gpt-4`, `gpt-4-turbo`, or `gpt-3.5-turbo` (default: `gpt-4-turbo`)
- `kinmail.autoTest` - Automatically generate tests for generated code (default: `true`)
- `kinmail.autoVerify` - Automatically verify generated code (default: `true`)

## Sample SRS documents

This repository includes three evaluation SRS documents under `srs/`:

| File | Domain |
|------|--------|
| `srs/kinmail_srs.pdf` | E-commerce (Kinmail) |
| `srs/dineout_srs.pdf` | Restaurant management (Dineout) |
| `srs/human_srs.pdf` | Healthcare (Human) |

Upload any of these via **Kinmail: Upload SRS Document**, or open the PDF in the editor and use the explorer context menu.

## Usage

### 1. Upload SRS Document

- Use the command palette (`Ctrl/Cmd + Shift + P`)
- Run "Kinmail: Upload SRS Document"
- Select your SRS file (PDF, DOCX, or TXT), or use a sample from `srs/`

### 2. View Dashboard

- Open the Kinmail panel in the Activity Bar
- Or run "Kinmail: Open Kinmail Dashboard"

### 3. Generate Code

- Select a feature from the dashboard
- Choose your programming language:
  - **Python** - Flask MVC with SQLAlchemy
  - **JavaScript** - Node.js/Express MVC
  - **Java** - Spring Boot MVC
  - **C#** - ASP.NET Core MVC
  - **C++** - Custom MVC framework
- Click "Generate Code" to create MVC implementation
- The extension will automatically:
  - Generate models, views, and controllers for the selected language
  - Create proper framework setup (Flask-SQLAlchemy for Python, Express for JavaScript, etc.)
  - Generate comprehensive test suites
  - Verify code quality

### 4. Generate Tests

- After generating code, click "Generate Tests"
- Tests are generated based on both SRS requirements and actual code structure
- Tests use proper imports from generated files (no code duplication)

### 5. Verify Code

- Click "Verify Code" to run tests and validate implementation
- View test results in the dashboard

## Architecture

The extension generates code following MVC architecture for all supported languages:

### Python (Flask)
- **Models** (`models/`) - Data entities using Flask-SQLAlchemy
- **Views** (`views/`) - Route handlers and view logic
- **Controllers** (`controllers/`) - Business logic and request handling
- **Templates** (`templates/`) - HTML templates
- **Config** (`config/`) - Database and application configuration

### JavaScript (Node.js/Express)
- **Models** - Data models and schemas
- **Views** - Route handlers and middleware
- **Controllers** - Business logic layer

### Java (Spring Boot)
- **Models** - Entity classes with JPA annotations
- **Views** - REST controllers and service layers
- **Controllers** - Business logic and data access

### C# (ASP.NET Core)
- **Models** - Entity classes and data models
- **Views** - Razor views and view models
- **Controllers** - MVC controllers and API controllers

### C++
- **Models** - Data structures and classes
- **Views** - UI components and rendering
- **Controllers** - Request handling and business logic

### Code Generation Features

- **Framework-Specific Setup** - Proper initialization for each language/framework
- **Database Integration** - SQLAlchemy (Python), Sequelize/TypeORM (JavaScript), JPA (Java), Entity Framework (C#)
- **Date Parsing** - Automatic conversion of form date strings to appropriate date objects
- **Error Handling** - Proper exception handling for database integrity errors
- **Route Management** - Only redirects to existing routes

### Test Generation Features

- **Hybrid Approach** - Tests validate both SRS requirements and actual code structure
- **No Code Duplication** - Tests import from actual generated files
- **Proper Mocking** - Email sending and external dependencies are properly mocked
- **Date Handling** - Tests use date objects when creating model instances directly

## Commands

- `kinmail.openDashboard` - Open the main dashboard
- `kinmail.uploadSRS` - Upload an SRS document
- `kinmail.generateFeature` - Generate code for a selected feature
- `kinmail.runTests` - Run generated tests
- `kinmail.verifyCode` - Verify generated code quality
- `kinmail.testApi` - Test OpenAI API connection

## Development

### Prerequisites

- Node.js 16+
- VS Code 1.74+
- OpenAI API key

### Project Structure

```
kinmail-vscode-extension-mvc/
├── src/
│   ├── extension.js          # Main extension entry point
│   ├── webviewProvider.js    # Dashboard UI and message handling
│   ├── codeGenerator.js      # LLM-based code generation
│   ├── testGenerator.js      # Hybrid test generation
│   ├── srsManager.js         # SRS document parsing
│   └── webview/              # Dashboard HTML/CSS
├── package.json
└── README.md
```

### Building

This extension uses JavaScript (not TypeScript), so no compilation is needed. Simply:

1. Install dependencies: `npm install`
2. Press `F5` in VS Code to run in development mode

## Technical Details

### Code Generation

- Uses GPT-4-turbo for code generation (supports 128k token context)
- Generates production-ready MVC code with proper error handling for all supported languages
- Automatically handles framework-specific setup, date parsing, database configuration, and route management
- Language-specific best practices and patterns

### Test Generation (In Development)

- Hybrid testing approach: validates SRS requirements against generated code
- Tests import from actual generated files (no duplication)
- Proper mocking for email, file uploads, and external dependencies
- Framework-specific test setup (actively being developed):
  - **Python**: pytest with Flask test client ✅ (Most mature)
  - **JavaScript**: Jest with Express test utilities 🚧 (In development)
  - **Java**: JUnit with Spring Boot test framework 🚧 (In development)
  - **C#**: xUnit/NUnit with ASP.NET Core test host 🚧 (In development)
  - **C++**: Custom test framework integration 🚧 (In development)

### Supported Languages

- **Python** - Flask MVC with SQLAlchemy
- **JavaScript** - Node.js/Express MVC
- **Java** - Spring Boot MVC
- **C#** - ASP.NET Core MVC
- **C++** - Custom MVC framework

## Status & Roadmap

**Current Version:** 2.0

### Development Status

- ✅ **Code Generation** - Fully functional for all supported languages
- 🚧 **Test Generation** - In active development and testing phase
- 🚧 **Code Verification** - In active development and testing phase

### Known Limitations

- Test generation is most mature for Python (pytest), other languages are in development
- Code verification features are being refined and tested
- Some edge cases in SRS parsing may need manual review
- Test execution and verification may have limitations for non-Python languages

### Planned Improvements

- Enhanced test generation for all languages (currently focused on Python)
- Improved code verification accuracy and coverage
- Better error handling and user feedback
- Additional framework support
- Performance optimizations

## License

MIT License - see LICENSE file for details.
