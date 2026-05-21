# Contract Generation - Where and What

## Where Contracts Are Generated

### Location in Code:
1. **Generator Class**: `src/contractGenerator.js` → `ContractGenerator.generateContract()`
2. **Called From**: `src/webviewProvider.js` → `WebviewProvider.generateContract()`
3. **Storage**: In-memory only → `this.generatedContracts = {}` (JavaScript object)

### When Generated:
- **NOT** when SRS is uploaded
- **NOT** when embeddings are created
- **YES** when you click "Generate Tests" (generated first, then tests)
- **YES** when you click "Generate Code" (generated if missing)
- **YES** when you click "Run Tests" (generated if missing)

### Storage Location:
- **Currently**: Only in memory (`this.generatedContracts` object)
- **NOT saved to disk** - lost when VS Code restarts
- **Per functionality**: Each functionality gets its own contract

## What Is a Contract?

A **contract** is a **JSON specification** that defines the EXACT structure that both tests and code must follow. It's like a blueprint or API specification.

### Contract Structure:
```json
{
  "functionality": "user_registration",
  "language": "python",
  "architecture": "MVC",
  "file_structure": {
    "models": [
      {
        "file_path": "models/user.py",
        "class_name": "User",
        "fields": [
          {"name": "email", "type": "String(120)", "unique": true}
        ],
        "methods": [
          {"name": "set_password", "parameters": ["password"]}
        ]
      }
    ],
    "controllers": [
      {
        "file_path": "controllers/user_controller.py",
        "routes": [
          {
            "path": "/register",
            "methods": ["GET", "POST"],
            "function_name": "register"
          }
        ],
        "helper_functions": [
          {"name": "send_verification_email", "parameters": ["user", "token"]}
        ]
      }
    ],
    "views": [...],
    "templates": [...]
  },
  "import_paths": {...},
  "database": {...},
  "framework": {...}
}
```

### Purpose:
1. **Single Source of Truth**: Both tests and code are generated from the same contract
2. **Exact Naming**: Defines exact function names, field names, file paths
3. **Structure Definition**: Defines models, controllers, routes, templates
4. **Alignment**: Ensures tests and code match even though generated independently

### What You See in Console:
The formatted summary shows:
- Functionality name
- Models with fields and methods
- Controllers with routes and helper functions
- Views and templates
- Full JSON structure

## Current Limitation:
- Contracts are **only in memory** - not persisted to disk
- Lost when VS Code restarts
- Regenerated each time (but should be the same if SRS is the same)

## Potential Improvement:
Could save contracts to disk (e.g., `contracts/user_registration.json`) for:
- Persistence across VS Code restarts
- Debugging and inspection
- Version control
- Manual editing if needed
