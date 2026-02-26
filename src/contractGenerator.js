const vscode = require('vscode');
const axios = require('axios');

class ContractGenerator {
    constructor(context) {
        this.context = context;
    }

    /**
     * Check if a model is a shared model (User, Product, Category)
     * Shared models should use shared paths (models/user.py) instead of functionality-specific paths
     */
    isSharedModel(className, filePath) {
        const sharedModels = ['User', 'Product', 'Category'];
        const isSharedClassName = sharedModels.includes(className);
        const isSharedPath = filePath === 'models/user.py' || 
                            filePath === 'models/product.py' || 
                            filePath === 'models/category.py';
        return isSharedClassName || isSharedPath;
    }

    /**
     * Normalize model file path to use shared paths for shared models
     */
    normalizeModelPath(className, filePath, functionalityName) {
        // If it's a shared model, force shared path
        if (this.isSharedModel(className, filePath)) {
            if (className === 'User') return 'models/user.py';
            if (className === 'Product') return 'models/product.py';
            if (className === 'Category') return 'models/category.py';
        }
        // Otherwise, use the provided path (may be functionality-specific)
        return filePath;
    }

    /**
     * Update import_paths based on actual file_structure paths
     * This ensures tests use correct imports with functionality-based naming
     * Also enforces shared model paths for User, Product, Category
     */
    updateImportPaths(contract) {
        if (!contract.file_structure || !contract.import_paths) {
            return contract;
        }
        
        const updated = JSON.parse(JSON.stringify(contract)); // Deep clone
        
        // Update models import paths - generate actual import statements
        // CRITICAL: Normalize shared models to use shared paths
        if (updated.file_structure.models && updated.file_structure.models.length > 0) {
            // Normalize model file paths for shared models
            updated.file_structure.models.forEach(model => {
                const normalizedPath = this.normalizeModelPath(
                    model.class_name, 
                    model.file_path, 
                    contract.functionality
                );
                if (normalizedPath !== model.file_path) {
                    console.log(`🔄 [CONTRACT] Normalizing shared model: ${model.class_name} from ${model.file_path} to ${normalizedPath}`);
                    model.file_path = normalizedPath;
                }
            });
            
            // Generate actual import examples from file paths (now normalized)
            const modelImports = updated.file_structure.models.map(model => {
                const filePath = model.file_path; // e.g., "models/user.py" (shared) or "models/product_search_product.py"
                const modulePath = filePath.replace('.py', '').replace(/\//g, '.'); // e.g., "models.user" or "models.product_search_product"
                const className = model.class_name; // e.g., "User" or "Product"
                return `from ${modulePath} import ${className}`;
            });
            // Store all model imports for reference
            if (modelImports.length > 0) {
                updated.import_paths.models = modelImports[0]; // Use first as template
                updated.import_paths.models_all = modelImports; // Store all for test generator
            }
        }
        
        // Update controllers import paths
        if (updated.file_structure.controllers && updated.file_structure.controllers.length > 0) {
            const controller = updated.file_structure.controllers[0]; // Use first controller
            const filePath = controller.file_path; // e.g., "controllers/product_search_controller.py"
            const modulePath = filePath.replace('.py', '').replace(/\//g, '.'); // e.g., "controllers.product_search_controller"
            
            // Get blueprint name if available
            const blueprintName = controller.blueprint?.name || `${contract.functionality?.replace(/-/g, '_') || 'bp'}_bp`;
            
            // Generate import for blueprint
            updated.import_paths.controllers = `from ${modulePath} import ${blueprintName}`;
            
            // Generate imports for helper functions if any
            if (controller.helper_functions && controller.helper_functions.length > 0) {
                const helperNames = controller.helper_functions.map(h => h.name).join(', ');
                updated.import_paths.helper_functions = `from ${modulePath} import ${helperNames}`;
            }
        }
        
        // Update views import paths
        if (updated.file_structure.views && updated.file_structure.views.length > 0) {
            const view = updated.file_structure.views[0]; // Use first view
            const filePath = view.file_path; // e.g., "views/product_search_views.py"
            const modulePath = filePath.replace('.py', '').replace(/\//g, '.'); // e.g., "views.product_search_views"
            
            if (view.functions && view.functions.length > 0) {
                const functionNames = view.functions.map(f => f.name).join(', ');
                updated.import_paths.views = `from ${modulePath} import ${functionNames}`;
            } else {
                updated.import_paths.views = `from ${modulePath} import *`;
            }
        }
        
        console.log('✅ [CONTRACT] Updated import_paths based on file_structure');
        console.log('📋 [CONTRACT] Import paths:', JSON.stringify(updated.import_paths, null, 2));
        
        return updated;
    }

    /**
     * Compress contract JSON to reduce size while keeping all essential information
     * Removes defaults, empty arrays, and redundant fields
     */
    compressContract(contract) {
        const compressed = JSON.parse(JSON.stringify(contract)); // Deep clone
        
        // Compress models
        if (compressed.file_structure?.models) {
            compressed.file_structure.models = compressed.file_structure.models.map(model => {
                const compressedModel = {
                    file_path: model.file_path,
                    class_name: model.class_name
                };
                
                // Only include table_name if different from inferred plural
                const inferredTable = model.class_name.toLowerCase() + 's';
                if (model.table_name && model.table_name !== inferredTable) {
                    compressedModel.table_name = model.table_name;
                }
                
                // Compress fields: remove nullable:false, primary_key:false (defaults)
                if (model.fields) {
                    compressedModel.fields = model.fields.map(field => {
                        const compressedField = { name: field.name, type: field.type };
                        // Only include if true or non-default
                        if (field.primary_key === true) compressedField.primary_key = true;
                        if (field.unique === true) compressedField.unique = true;
                        if (field.nullable === true) compressedField.nullable = true;
                        if (field.default !== undefined) compressedField.default = field.default;
                        if (field.index === true) compressedField.index = true;
                        return compressedField;
                    });
                }
                
                // Compress methods: remove return_type:"None" (default)
                if (model.methods) {
                    compressedModel.methods = model.methods.map(method => {
                        const compressedMethod = {
                            name: method.name,
                            parameters: method.parameters
                        };
                        // Only include return_type if not "None"
                        if (method.return_type && method.return_type !== 'None') {
                            compressedMethod.return_type = method.return_type;
                        }
                        return compressedMethod;
                    });
                }
                
                return compressedModel;
            });
        }
        
        // Compress controllers
        if (compressed.file_structure?.controllers) {
            compressed.file_structure.controllers = compressed.file_structure.controllers.map(controller => {
                const compressedController = {
                    file_path: controller.file_path
                };
                
                // Only include blueprint if it exists
                if (controller.blueprint) {
                    compressedController.blueprint = controller.blueprint;
                }
                
                // Compress routes: remove return_type:"Response" (default), empty parameters
                if (controller.routes) {
                    compressedController.routes = controller.routes.map(route => {
                        const compressedRoute = {
                            path: route.path,
                            methods: route.methods,
                            function_name: route.function_name
                        };
                        // Only include if not empty
                        if (route.parameters && route.parameters.length > 0) {
                            compressedRoute.parameters = route.parameters;
                        }
                        // Only include if not "Response" (default)
                        if (route.return_type && route.return_type !== 'Response') {
                            compressedRoute.return_type = route.return_type;
                        }
                        // Include request/response details if present
                        if (route.request) compressedRoute.request = route.request;
                        if (route.response) compressedRoute.response = route.response;
                        if (route.error_responses) compressedRoute.error_responses = route.error_responses;
                        return compressedRoute;
                    });
                }
                
                // Compress helper functions: remove return_type:"None"
                if (controller.helper_functions && controller.helper_functions.length > 0) {
                    compressedController.helper_functions = controller.helper_functions.map(helper => {
                        const compressedHelper = {
                            name: helper.name,
                            parameters: helper.parameters
                        };
                        // Only include return_type if not "None"
                        if (helper.return_type && helper.return_type !== 'None') {
                            compressedHelper.return_type = helper.return_type;
                        }
                        return compressedHelper;
                    });
                }
                
                return compressedController;
            });
        }
        
        // Remove empty views array
        if (compressed.file_structure?.views) {
            const nonEmptyViews = compressed.file_structure.views.filter(view => 
                view.functions && view.functions.length > 0
            );
            if (nonEmptyViews.length > 0) {
                compressed.file_structure.views = nonEmptyViews;
            } else {
                delete compressed.file_structure.views;
            }
        }
        
        // Compress templates: only keep file_path and route
        if (compressed.file_structure?.templates) {
            compressed.file_structure.templates = compressed.file_structure.templates.map(template => ({
                file_path: template.file_path,
                route: template.route
            }));
        }
        
        // Remove services if empty or can be inferred
        if (compressed.file_structure?.services) {
            const nonEmptyServices = compressed.file_structure.services.filter(service =>
                service.methods && service.methods.length > 0
            );
            if (nonEmptyServices.length > 0) {
                compressed.file_structure.services = nonEmptyServices.map(service => ({
                    file_path: service.file_path,
                    class_name: service.class_name,
                    methods: service.methods.map(m => ({
                        name: m.name,
                        parameters: m.parameters,
                        ...(m.return_type && m.return_type !== 'None' ? { return_type: m.return_type } : {})
                    }))
                }));
            } else {
                delete compressed.file_structure.services;
            }
        }
        
        // Compress database section: remove defaults
        if (compressed.database) {
            const db = compressed.database;
            // Only keep essential, non-default values
            const essentialDb = {
                orm: db.orm,
                session: db.session,
                query_pattern: db.query_pattern
            };
            if (db.db_instance_name && db.db_instance_name !== 'db') {
                essentialDb.db_instance_name = db.db_instance_name;
            }
            if (db.create_all) essentialDb.create_all = db.create_all;
            if (db.drop_all) essentialDb.drop_all = db.drop_all;
            if (db.migrations === true) essentialDb.migrations = true;
            compressed.database = essentialDb;
        }
        
        // Compress framework section: remove defaults
        if (compressed.framework) {
            const fw = compressed.framework;
            const essentialFw = {
                name: fw.name,
                test_client: fw.test_client
            };
            if (fw.blueprints === true) essentialFw.blueprints = true;
            if (fw.fixtures && fw.fixtures.length > 0) essentialFw.fixtures = fw.fixtures;
            if (fw.mail) essentialFw.mail = fw.mail;
            compressed.framework = essentialFw;
        }
        
        // Compress extensions section: only if non-standard
        if (compressed.extensions) {
            const ext = compressed.extensions;
            if (ext.file_path && ext.file_path !== 'extensions.py') {
                // Keep if non-standard
            } else if (ext.objects && ext.objects.length > 0) {
                // Keep essential objects only
                compressed.extensions = {
                    file_path: ext.file_path || 'extensions.py',
                    objects: ext.objects.map(obj => ({
                        name: obj.name,
                        type: obj.type
                    }))
                };
            } else {
                delete compressed.extensions;
            }
        }
        
        // Compress security section: only keep if non-standard
        if (compressed.security) {
            // Keep security info as it's important
            const sec = compressed.security;
            const essentialSec = {};
            if (sec.password_hashing) essentialSec.password_hashing = sec.password_hashing;
            if (sec.token) essentialSec.token = sec.token;
            if (Object.keys(essentialSec).length > 0) {
                compressed.security = essentialSec;
            } else {
                delete compressed.security;
            }
        }
        
        // Compress email_authentication_dependency: only if non-standard
        if (compressed.email_authentication_dependency) {
            const email = compressed.email_authentication_dependency;
            const essentialEmail = {};
            if (email.provider && email.provider !== 'Flask-Mail') essentialEmail.provider = email.provider;
            if (email.message_sender) essentialEmail.message_sender = email.message_sender;
            if (email.verification_subject) essentialEmail.verification_subject = email.verification_subject;
            if (email.verification_url_path) essentialEmail.verification_url_path = email.verification_url_path;
            if (email.verification_url_query_param && email.verification_url_query_param !== 'token') {
                essentialEmail.verification_url_query_param = email.verification_url_query_param;
            }
            if (Object.keys(essentialEmail).length > 0) {
                compressed.email_authentication_dependency = essentialEmail;
            } else {
                delete compressed.email_authentication_dependency;
            }
        }
        
        // Compress application_contract: remove defaults
        if (compressed.application_contract) {
            const app = compressed.application_contract;
            const essentialApp = {};
            if (app.app_factory && app.app_factory.enabled === true) {
                essentialApp.app_factory = app.app_factory;
            }
            if (app.app_globals) essentialApp.app_globals = app.app_globals;
            if (app.config_keys_required && app.config_keys_required.length > 0) {
                essentialApp.config_keys_required = app.config_keys_required;
            }
            if (app.blueprint_registration && app.blueprint_registration.length > 0) {
                essentialApp.blueprint_registration = app.blueprint_registration;
            }
            if (Object.keys(essentialApp).length > 0) {
                compressed.application_contract = essentialApp;
            } else {
                delete compressed.application_contract;
            }
        }
        
        // Compress behavioral_requirements: keep as is (important)
        // (No compression needed - this is essential info)
        
        // Compress api_behavior: remove verbose nested structures, keep only essential
        if (compressed.api_behavior) {
            const api = compressed.api_behavior;
            const essentialApi = {};
            
            // Keep content_types if non-standard
            if (api.content_types && Object.keys(api.content_types).length > 0) {
                essentialApi.content_types = api.content_types;
            }
            
            // Compress route behaviors: remove verbose nested structures
            Object.keys(api).forEach(key => {
                if (key === 'content_types') return; // Already handled
                
                const routeBehavior = api[key];
                if (typeof routeBehavior === 'object' && routeBehavior !== null) {
                    const compressedRoute = {};
                    
                    // Keep success/failure but compress nested structures
                    if (routeBehavior.success) {
                        compressedRoute.success = {
                            status_code: routeBehavior.success.status_code,
                            ...(routeBehavior.success.redirect_location ? { redirect_location: routeBehavior.success.redirect_location } : {}),
                            ...(routeBehavior.success.side_effects ? { side_effects: routeBehavior.success.side_effects } : {}),
                            ...(routeBehavior.success.created_user_state ? { created_user_state: routeBehavior.success.created_user_state } : {})
                        };
                    }
                    
                    if (routeBehavior.failure) {
                        compressedRoute.failure = {
                            status_code: routeBehavior.failure.status_code,
                            ...(routeBehavior.failure.renders_template ? { renders_template: routeBehavior.failure.renders_template } : {}),
                            ...(routeBehavior.failure.error_format ? { error_format: routeBehavior.failure.error_format } : {}),
                            ...(routeBehavior.failure.status_values ? { status_values: routeBehavior.failure.status_values } : {})
                        };
                    }
                    
                    // Compress form_fields: remove verbose validation details, keep only essential
                    if (routeBehavior.form_fields) {
                        compressedRoute.form_fields = routeBehavior.form_fields.map(field => {
                            const compressedField = {
                                name: field.name,
                                type: field.type,
                                required: field.required
                            };
                            // Only include if non-default
                            if (field.min_length && field.min_length !== 0) compressedField.min_length = field.min_length;
                            if (field.max_length) compressedField.max_length = field.max_length;
                            if (field.pattern) compressedField.pattern = field.pattern;
                            if (field.format) compressedField.format = field.format;
                            if (field.allowed && field.allowed.length > 0) compressedField.allowed = field.allowed;
                            if (field.allowed_mimetypes && field.allowed_mimetypes.length > 0) compressedField.allowed_mimetypes = field.allowed_mimetypes;
                            if (field.max_bytes) compressedField.max_bytes = field.max_bytes;
                            return compressedField;
                        });
                    }
                    
                    // Keep other essential fields
                    if (routeBehavior.uniqueness_constraints) compressedRoute.uniqueness_constraints = routeBehavior.uniqueness_constraints;
                    if (routeBehavior.token_rules) compressedRoute.token_rules = routeBehavior.token_rules;
                    
                    if (Object.keys(compressedRoute).length > 0) {
                        essentialApi[key] = compressedRoute;
                    }
                }
            });
            
            if (Object.keys(essentialApi).length > 0) {
                compressed.api_behavior = essentialApi;
            } else {
                delete compressed.api_behavior;
            }
        }
        
        // Compress dependencies: keep only non-standard
        if (compressed.dependencies) {
            const deps = compressed.dependencies;
            const essentialDeps = {};
            Object.keys(deps).forEach(key => {
                const dep = deps[key];
                if (typeof dep === 'object' && dep !== null) {
                    // Only keep if it has non-standard values
                    const hasNonStandard = Object.keys(dep).some(k => {
                        const value = dep[k];
                        // Check if it's a standard/default value
                        if (k === 'mail_extension' && value === 'Flask-Mail') return false;
                        if (k === 'mail_instance_name' && value === 'mail') return false;
                        if (k === 'message_class_import' && value === 'from flask_mail import Message') return false;
                        if (k === 'sender_config_key' && value === 'MAIL_DEFAULT_SENDER') return false;
                        return true;
                    });
                    if (hasNonStandard || Object.keys(dep).length > 0) {
                        essentialDeps[key] = dep;
                    }
                }
            });
            if (Object.keys(essentialDeps).length > 0) {
                compressed.dependencies = essentialDeps;
            } else {
                delete compressed.dependencies;
            }
        }
        
        return compressed;
    }

    async generateContract(packet, language = 'python') {
        try {
            if (!packet) {
                throw new Error('Packet parameter is required for contract generation');
            }
            
            const config = vscode.workspace.getConfiguration('kinmail');
            const apiKey = config.get('openaiApiKey');
            
            if (!apiKey) {
                throw new Error('OpenAI API key not configured');
            }

            const functionalityName = packet.name || 'unknown_functionality';
            
            console.log('📋 [CONTRACT] Generating contract for:', functionalityName);
            console.log('📋 [CONTRACT] Language:', language);
            
            // Build comprehensive SRS context
            const srsContext = `
FUNCTIONALITY: ${packet.name}
DESCRIPTION: ${packet.description || 'N/A'}
USE CASES: ${packet.useCases?.join(', ') || 'N/A'}
REQUIREMENTS: ${packet.requirements?.join(', ') || 'N/A'}
ACTIVITY DIAGRAMS: ${packet.activityDiagrams?.join(', ') || 'N/A'}
DEPENDENCIES: ${packet.dependencies?.join(', ') || 'N/A'}
CONTEXT: ${packet.context || 'N/A'}
`;

            const prompt = `You are a software architect. Generate a detailed API contract/specification for the following functionality in ${language.toUpperCase()} using MVC architecture.

${srsContext}

CRITICAL: Generate a JSON contract that defines the EXACT structure that both test cases and code implementation must follow. This contract will be used to generate tests and code independently, so it must be precise and complete.

Generate a JSON contract with the following structure:

{
  "functionality": "functionality_name",
  "language": "${language}",
  "architecture": "MVC",
  "file_structure": {
    "models": [
      {
        "file_path": "models/user.py",
        "class_name": "User",
        "table_name": "users",
        "fields": [
          {"name": "id", "type": "Integer", "primary_key": true, "nullable": false},
          {"name": "email", "type": "String(120)", "unique": true, "nullable": false},
          {"name": "username", "type": "String(80)", "unique": true, "nullable": false}
        ],
        "methods": [
          {"name": "set_password", "parameters": ["password"], "return_type": "None"},
          {"name": "check_password", "parameters": ["password"], "return_type": "bool"}
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
            "function_name": "register",
            "parameters": [],
            "return_type": "Response"
          }
        ],
        "helper_functions": [
          {
            "name": "send_verification_email",
            "parameters": ["user", "token"],
            "return_type": "None"
          }
        ]
      }
    ],
    "views": [
      {
        "file_path": "views/user_views.py",
        "functions": []
      }
    ],
    "templates": [
      {
        "file_path": "templates/register.html",
        "route": "/register"
      }
    ],
    "app_file": "app.py"
  },
  "import_paths": {
    "models": "from models.{model_name} import {ModelName}",
    "controllers": "from controllers.{controller_name} import {function_name}",
    "app": "from app import app, db, mail"
  },
  "database": {
    "orm": "Flask-SQLAlchemy",
    "session": "db.session",
    "query_pattern": "Model.query.filter_by()"
  },
  "framework": {
    "name": "Flask",
    "test_client": "app.test_client()",
    "fixtures": ["client", "app_context"]
  }
}

REQUIREMENTS:
1. Be SPECIFIC about file paths, class names, function names, route paths
2. Define ALL models, controllers, routes, and helper functions needed
3. Specify exact import paths that tests and code should use
4. Include all model fields with types and constraints
5. Define all route endpoints with HTTP methods
6. Specify function signatures (parameters and return types)
7. Use consistent naming conventions (snake_case for functions, PascalCase for classes)
8. Ensure the contract is complete and unambiguous

CRITICAL - SHARED MODELS (MANDATORY - PREVENTS TABLE COLLISIONS):
- CERTAIN models are SHARED across multiple functionalities and MUST use a shared path:
  * User model: ALWAYS use "models/user.py" (NOT "models/{functionality}_user.py")
  * Product model: ALWAYS use "models/product.py" (NOT "models/{functionality}_product.py")
  * Category model: ALWAYS use "models/category.py" (NOT "models/{functionality}_category.py")
- These shared models use the same table name across functionalities (e.g., 'users', 'products', 'categories')
- If a functionality needs a User, Product, or Category model, use the shared path in the contract
- DO NOT create functionality-specific User/Product/Category models - they will cause SQLAlchemy table collision errors
- When generating the contract, if the functionality requires a User, Product, or Category model:
  * Use the shared path: "models/user.py", "models/product.py", or "models/category.py"
  * DO NOT prefix with functionality name for these shared entities
  * The table_name should be the standard plural (e.g., 'users', 'products', 'categories')

CRITICAL - FUNCTIONALITY-BASED NAMING (for non-shared models):
- For models that are NOT shared (User, Product, Category), ALL file names MUST be prefixed with the functionality name (in snake_case)
- Convert functionality name to snake_case (e.g., "Product Search" → "product_search")
- Models: Use format "models/{functionality}_{entity}.py" (e.g., "models/product_search_review.py", "models/product_search_rating.py")
- Controllers: Use format "controllers/{functionality}_controller.py" (e.g., "controllers/product_search_controller.py")
- Views: Use format "views/{functionality}_views.py" (e.g., "views/product_search_views.py")
- Templates: Use format "templates/{functionality}_{page}.html" (e.g., "templates/product_search_search.html")
- Example: For "Product Search" functionality:
  * Shared models: "models/user.py", "models/product.py" (if needed)
  * Functionality-specific models: "models/product_search_review.py" (if needed)
  * Controller: "controllers/product_search_controller.py"
  * Views: "views/product_search_views.py"
  * Templates: "templates/product_search_search.html"

CRITICAL - FILE STRUCTURE (MINIMAL AND FOCUSED):
- Prefer MINIMAL file structure - only create files that are truly necessary
- Models: Only create separate model files if they represent distinct, independent entities
  * If functionality needs Product and Category, create both models BUT prefer ONE controller that uses both
  * Example: For "Product Search", create models/product.py AND models/category.py, but use ONE controller: controllers/product_search_controller.py
  
- Controllers: Prefer ONE controller per functionality
  * Only create multiple controllers if the functionality truly requires separate, independent domains
  * If functionality needs multiple models, they should typically be in ONE controller
  * Example: For "Product Search" functionality, use ONE controller: "controllers/product_search_controller.py" that handles both product search AND category listing (if needed)
  * DO NOT create separate controllers like "product_search_controller.py" AND "category_controller.py" for a single functionality
  
- Views: Prefer ONE view file per functionality (unless truly necessary to separate)
- Templates: Only create templates that are actually needed for the functionality

GENERAL RULE:
- Keep file count minimal - only create files that serve distinct purposes
- If multiple related entities can be handled in one controller, prefer that approach
- Only split into multiple files if there's a clear architectural reason (e.g., very large files, completely independent domains)

COMPRESSION GUIDELINES (to reduce contract size):
- Omit nullable:false (it's the default - only include nullable:true)
- Omit primary_key:false (only include primary_key:true)
- Omit return_type:"Response" for routes (it's the default)
- Omit return_type:"None" for methods/functions (it's the default)
- Omit empty parameters arrays: [] (assume empty if not specified)
- Omit table_name if it's just the plural of class_name (e.g., User → users)
- Omit empty views arrays or functions arrays
- Only include non-default values to keep contract compact

Generate ONLY the JSON contract, no explanations or markdown formatting.`;

            console.log('📋 [CONTRACT] Making LLM API call for contract generation...');
            console.log('📋 [CONTRACT] Model: gpt-5.2');
            console.log('📋 [CONTRACT] Prompt length:', prompt.length);
            
            let response;
            try {
                response = await axios.post(
                    'https://api.openai.com/v1/chat/completions',
                    {
                        model: 'gpt-5.2',
                        messages: [
                            {
                                role: 'system',
                                content: 'You are a software architect specializing in API contract design. Generate precise, complete JSON contracts that define the exact structure for code and test generation.'
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        temperature: 0.3, // Lower temperature for more consistent contracts
                        max_completion_tokens: 8000  // GPT-5.2 requires max_completion_tokens instead of max_tokens
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            } catch (apiError) {
                console.error('❌ [CONTRACT] API Request Error Details:');
                if (apiError.response) {
                    console.error('❌ [CONTRACT] Status:', apiError.response.status);
                    console.error('❌ [CONTRACT] Status Text:', apiError.response.statusText);
                    console.error('❌ [CONTRACT] Error Data:', JSON.stringify(apiError.response.data, null, 2));
                    console.error('❌ [CONTRACT] Request Model:', 'gpt-5.2');
                    
                    // Check if it's a model error
                    if (apiError.response.data?.error?.message) {
                        const errorMsg = apiError.response.data.error.message.toLowerCase();
                        if (errorMsg.includes('model') || errorMsg.includes('invalid')) {
                            console.error('❌ [CONTRACT] Model name may be invalid. Try using: gpt-4o, gpt-4-turbo, or gpt-4');
                        }
                    }
                } else if (apiError.request) {
                    console.error('❌ [CONTRACT] No response received from API');
                } else {
                    console.error('❌ [CONTRACT] Request setup error:', apiError.message);
                }
                throw apiError;
            }

            if (!response.data || !response.data.choices || response.data.choices.length === 0) {
                console.error('❌ [CONTRACT] Empty response structure from API');
                console.error('❌ [CONTRACT] Response data:', JSON.stringify(response.data, null, 2));
                throw new Error('Empty response from API');
            }

            const choice = response.data.choices[0];
            const finishReason = choice.finish_reason;
            console.log('📋 [CONTRACT] Finish reason:', finishReason);
            console.log('📋 [CONTRACT] Response usage:', JSON.stringify(response.data.usage || {}));
            console.log('📋 [CONTRACT] Response status:', response.status);
            
            // Log the full choice object for debugging
            if (!choice.message || !choice.message.content) {
                console.error('❌ [CONTRACT] Full choice object:', JSON.stringify(choice, null, 2));
                console.error('❌ [CONTRACT] Full response data:', JSON.stringify(response.data, null, 2));
            }
            
            // Check finish reason - if it's "length", the response was truncated
            if (finishReason === 'length') {
                console.error('❌ [CONTRACT] Response was truncated due to token limit!');
                console.error('❌ [CONTRACT] Consider reducing prompt size or increasing max_completion_tokens');
            }
            
            // Check if content exists
            if (!choice.message || !choice.message.content) {
                console.error('❌ [CONTRACT] No content in response!');
                console.error('❌ [CONTRACT] Choice object:', JSON.stringify(choice, null, 2));
                throw new Error('API returned empty content. Finish reason: ' + (finishReason || 'unknown'));
            }
            
            const content = choice.message.content;
            console.log('📋 [CONTRACT] Raw response length:', content.length);
            
            if (!content || content.length === 0) {
                console.error('❌ [CONTRACT] Content is empty or null!');
                console.error('❌ [CONTRACT] Full response data:', JSON.stringify(response.data, null, 2));
                throw new Error('API returned empty content. Finish reason: ' + (finishReason || 'unknown'));
            }

            // Extract JSON from response (handle markdown code blocks)
            let contractJson = content.trim();
            
            // Check if content is actually empty after trim
            if (!contractJson || contractJson.length === 0) {
                console.error('❌ [CONTRACT] Content is empty after trimming!');
                console.error('❌ [CONTRACT] Finish reason:', finishReason);
                console.error('❌ [CONTRACT] Response usage:', JSON.stringify(response.data.usage || {}));
                console.error('❌ [CONTRACT] Full response:', JSON.stringify(response.data, null, 2));
                
                if (finishReason === 'length') {
                    throw new Error('Response was truncated due to token limit. Try reducing prompt size or increasing max_completion_tokens (currently 8000).');
                } else {
                    throw new Error('API returned empty content. Finish reason: ' + (finishReason || 'unknown'));
                }
            }
            
            // Remove markdown code blocks if present
            if (contractJson.startsWith('```json')) {
                contractJson = contractJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (contractJson.startsWith('```')) {
                contractJson = contractJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            // Check again after removing markdown
            contractJson = contractJson.trim();
            if (!contractJson || contractJson.length === 0) {
                console.error('❌ [CONTRACT] Content is empty after removing markdown!');
                console.error('❌ [CONTRACT] Original content (first 500 chars):', content.substring(0, 500));
                throw new Error('Content became empty after removing markdown code blocks');
            }

            // Parse JSON
            let contract;
            try {
                contract = JSON.parse(contractJson);
            } catch (parseError) {
                console.error('❌ [CONTRACT] JSON parse error:', parseError);
                console.error('❌ [CONTRACT] Contract JSON (first 1000 chars):', contractJson.substring(0, 1000));
                console.error('❌ [CONTRACT] Contract JSON (last 500 chars):', contractJson.substring(Math.max(0, contractJson.length - 500)));
                console.error('❌ [CONTRACT] Contract JSON length:', contractJson.length);
                console.error('❌ [CONTRACT] Finish reason:', finishReason);
                
                // If finish reason is 'length', the JSON might be incomplete
                if (finishReason === 'length') {
                    throw new Error('JSON was truncated due to token limit. Try reducing prompt size or increasing max_completion_tokens (currently 8000). Original error: ' + parseError.message);
                }
                
                throw new Error('Failed to parse contract JSON: ' + parseError.message);
            }

            // Update import_paths based on actual file_structure (ensures functionality-based naming works)
            contract = this.updateImportPaths(contract);
            
            // Compress contract to reduce size while keeping essential info
            const originalSize = JSON.stringify(contract).length;
            contract = this.compressContract(contract);
            const compressedSize = JSON.stringify(contract).length;
            const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
            console.log(`📦 [CONTRACT] Compressed: ${originalSize} → ${compressedSize} chars (${compressionRatio}% reduction)`);

            console.log('✅ [CONTRACT] Contract generated successfully');
            console.log('📋 [CONTRACT] Contract structure:', {
                functionality: contract.functionality,
                models: contract.file_structure?.models?.length || 0,
                controllers: contract.file_structure?.controllers?.length || 0,
                routes: contract.file_structure?.controllers?.reduce((sum, c) => sum + (c.routes?.length || 0), 0) || 0
            });
            
            // Display full contract in console for debugging
            console.log('\n' + '='.repeat(80));
            console.log('📋 [CONTRACT] FULL CONTRACT STRUCTURE:');
            console.log('='.repeat(80));
            console.log(JSON.stringify(contract, null, 2));
            console.log('='.repeat(80) + '\n');
            
            // Display formatted summary
            console.log('📋 [CONTRACT] CONTRACT SUMMARY:');
            console.log(`  Functionality: ${contract.functionality || 'N/A'}`);
            console.log(`  Language: ${contract.language || 'N/A'}`);
            console.log(`  Architecture: ${contract.architecture || 'N/A'}`);
            console.log(`  App File: ${contract.file_structure?.app_file || 'N/A'}`);
            
            if (contract.file_structure?.models && contract.file_structure.models.length > 0) {
                console.log(`\n  MODELS (${contract.file_structure.models.length}):`);
                contract.file_structure.models.forEach((model, idx) => {
                    console.log(`    ${idx + 1}. ${model.class_name} (${model.file_path})`);
                    console.log(`       Fields: ${model.fields?.map(f => f.name).join(', ') || 'NONE'}`);
                    console.log(`       Methods: ${model.methods?.map(m => m.name + '()').join(', ') || 'NONE'}`);
                });
            }
            
            if (contract.file_structure?.controllers && contract.file_structure.controllers.length > 0) {
                console.log(`\n  CONTROLLERS (${contract.file_structure.controllers.length}):`);
                contract.file_structure.controllers.forEach((controller, idx) => {
                    console.log(`    ${idx + 1}. ${controller.file_path}`);
                    if (controller.routes && controller.routes.length > 0) {
                        console.log(`       Routes:`);
                        controller.routes.forEach(route => {
                            const methods = route.methods && Array.isArray(route.methods) 
                                ? route.methods.join(', ') 
                                : 'N/A';
                            console.log(`         - ${route.path} (${methods}) → ${route.function_name}()`);
                        });
                    }
                    if (controller.helper_functions && controller.helper_functions.length > 0) {
                        console.log(`       Helper Functions:`);
                        controller.helper_functions.forEach(helper => {
                            const params = helper.parameters && Array.isArray(helper.parameters)
                                ? helper.parameters.join(', ')
                                : 'N/A';
                            console.log(`         - ${helper.name}(${params})`);
                        });
                    }
                });
            }
            
            if (contract.file_structure?.views && contract.file_structure.views.length > 0) {
                console.log(`\n  VIEWS (${contract.file_structure.views.length}):`);
                contract.file_structure.views.forEach((view, idx) => {
                    console.log(`    ${idx + 1}. ${view.file_path}`);
                });
            }
            
            if (contract.file_structure?.templates && contract.file_structure.templates.length > 0) {
                console.log(`\n  TEMPLATES (${contract.file_structure.templates.length}):`);
                contract.file_structure.templates.forEach((template, idx) => {
                    console.log(`    ${idx + 1}. ${template.file_path} (route: ${template.route || 'N/A'})`);
                });
            }
            
            console.log('\n' + '='.repeat(80) + '\n');

            return contract;

        } catch (error) {
            console.error('❌ [CONTRACT] Error generating contract:', error);
            if (error.response) {
                console.error('❌ [CONTRACT] API Error Status:', error.response.status);
                console.error('❌ [CONTRACT] API Error Data:', JSON.stringify(error.response.data, null, 2));
                console.error('❌ [CONTRACT] Request Config:', {
                    model: error.config?.data ? JSON.parse(error.config.data)?.model : 'unknown',
                    url: error.config?.url
                });
            } else if (error.request) {
                console.error('❌ [CONTRACT] Request made but no response received');
            }
            throw error;
        }
    }
}

module.exports = { ContractGenerator };
