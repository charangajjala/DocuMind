"""Configuration management utilities."""

import os
from typing import Any, Dict, Optional
from pathlib import Path

try:
    from dotenv import load_dotenv
    DOTENV_AVAILABLE = True
except ImportError:
    DOTENV_AVAILABLE = False

from ..core.interfaces import ConfigurationProvider
from ..core.exceptions import ConfigurationError


class EnvironmentConfigProvider(ConfigurationProvider):
    """Configuration provider that reads from environment variables and config files."""
    
    def __init__(self, config_file_path: Optional[str] = None):
        """Initialize with optional config file path."""
        if config_file_path is None:
            # Look for .env file in project root or config directory
            from pathlib import Path
            project_root = Path(__file__).parent.parent.parent.parent
            env_paths = [
                project_root / ".env",
                project_root / "config" / ".env"
            ]
            for env_path in env_paths:
                if env_path.exists():
                    config_file_path = str(env_path)
                    break
        
        self.config_file_path = config_file_path
        self._config_cache: Dict[str, Any] = {}
        self._load_config()
    
    def _load_config(self) -> None:
        """Load configuration from environment and files."""
        # Load from .env file if found and dotenv is available
        if self.config_file_path and DOTENV_AVAILABLE:
            load_dotenv(self.config_file_path)
        
        # Default configuration
        self._config_cache = {
            'GOOGLE_APPLICATION_CREDENTIALS': os.getenv('GOOGLE_APPLICATION_CREDENTIALS'),
            'GOOGLE_CLOUD_PROJECT': os.getenv('GOOGLE_CLOUD_PROJECT'),
            'DOCUMENT_AI_PROCESSOR_ID': os.getenv('DOCUMENT_AI_PROCESSOR_ID'),
            'DOCUMENT_AI_LOCATION': os.getenv('DOCUMENT_AI_LOCATION', 'us'),
            'AZURE_OPENAI_API_KEY': os.getenv('AZURE_OPENAI_API_KEY'),
            'AZURE_OPENAI_ENDPOINT': os.getenv('AZURE_OPENAI_ENDPOINT'),
            'AZURE_OPENAI_DEPLOYMENT_NAME': os.getenv('AZURE_OPENAI_DEPLOYMENT_NAME', 'gpt-4o'),
            'AZURE_OPENAI_API_VERSION': os.getenv('AZURE_OPENAI_API_VERSION', '2024-05-13'),
            'API_HOST': os.getenv('API_HOST', '0.0.0.0'),
            'API_PORT': int(os.getenv('API_PORT', '8000')),
            'STREAMLIT_HOST': os.getenv('STREAMLIT_HOST', '0.0.0.0'),
            'STREAMLIT_PORT': int(os.getenv('STREAMLIT_PORT', '8501')),
            'LOG_LEVEL': os.getenv('LOG_LEVEL', 'INFO'),
            'MAX_IMAGE_SIZE': int(os.getenv('MAX_IMAGE_SIZE', '41943040')),  # 40MB for Google Document AI online OCR
            'ALLOWED_IMAGE_TYPES': os.getenv('ALLOWED_IMAGE_TYPES', 'jpg,jpeg,png,pdf,tiff').split(','),
            'OCR_CONFIDENCE_THRESHOLD': float(os.getenv('OCR_CONFIDENCE_THRESHOLD', '0.8')),
            
            # Image Processing Configuration
            'MAX_IMAGE_WIDTH': int(os.getenv('MAX_IMAGE_WIDTH', '4096')),
            'MAX_IMAGE_HEIGHT': int(os.getenv('MAX_IMAGE_HEIGHT', '4096')),
            'ENHANCE_IMAGE': os.getenv('ENHANCE_IMAGE', 'false').lower() == 'true',
            # Optional model-specific Azure OpenAI configs (per-model overrides)
            # Example expected keys:
            #  AZURE_OPENAI_API_KEY_GPT_40, AZURE_OPENAI_ENDPOINT_GPT_40, AZURE_OPENAI_DEPLOYMENT_NAME_GPT_40
            #  AZURE_OPENAI_API_KEY_GPT_O4_MINI, ...
            #  AZURE_OPENAI_API_KEY_GPT_5_MINI, ...
            #  AZURE_OPENAI_API_KEY_GPT_5_NANO, ...
            'AZURE_OPENAI_API_KEY_GPT_40': os.getenv('AZURE_OPENAI_API_KEY_GPT_40'),
            'AZURE_OPENAI_ENDPOINT_GPT_40': os.getenv('AZURE_OPENAI_ENDPOINT_GPT_40'),
            'AZURE_OPENAI_DEPLOYMENT_NAME_GPT_40': os.getenv('AZURE_OPENAI_DEPLOYMENT_NAME_GPT_40'),
            'AZURE_OPENAI_API_VERSION_GPT_40': os.getenv('AZURE_OPENAI_API_VERSION_GPT_40'),

            'AZURE_OPENAI_API_KEY_GPT_O4_MINI': os.getenv('AZURE_OPENAI_API_KEY_GPT_O4_MINI'),
            'AZURE_OPENAI_ENDPOINT_GPT_O4_MINI': os.getenv('AZURE_OPENAI_ENDPOINT_GPT_O4_MINI'),
            'AZURE_OPENAI_DEPLOYMENT_NAME_GPT_O4_MINI': os.getenv('AZURE_OPENAI_DEPLOYMENT_NAME_GPT_O4_MINI'),
            'AZURE_OPENAI_API_VERSION_GPT_O4_MINI': os.getenv('AZURE_OPENAI_API_VERSION_GPT_O4_MINI'),

            'AZURE_OPENAI_API_KEY_GPT_5_MINI': os.getenv('AZURE_OPENAI_API_KEY_GPT_5_MINI'),
            'AZURE_OPENAI_ENDPOINT_GPT_5_MINI': os.getenv('AZURE_OPENAI_ENDPOINT_GPT_5_MINI'),
            'AZURE_OPENAI_DEPLOYMENT_NAME_GPT_5_MINI': os.getenv('AZURE_OPENAI_DEPLOYMENT_NAME_GPT_5_MINI'),
            'AZURE_OPENAI_API_VERSION_GPT_5_MINI': os.getenv('AZURE_OPENAI_API_VERSION_GPT_5_MINI'),

            'AZURE_OPENAI_API_KEY_GPT_5_NANO': os.getenv('AZURE_OPENAI_API_KEY_GPT_5_NANO'),
            'AZURE_OPENAI_ENDPOINT_GPT_5_NANO': os.getenv('AZURE_OPENAI_ENDPOINT_GPT_5_NANO'),
            'AZURE_OPENAI_DEPLOYMENT_NAME_GPT_5_NANO': os.getenv('AZURE_OPENAI_DEPLOYMENT_NAME_GPT_5_NANO'),
            'AZURE_OPENAI_API_VERSION_GPT_5_NANO': os.getenv('AZURE_OPENAI_API_VERSION_GPT_5_NANO'),
        }
        
        # Load from config file if specified and dotenv not available
        if self.config_file_path and Path(self.config_file_path).exists() and not DOTENV_AVAILABLE:
            self._load_from_file()
    
    def _load_from_file(self) -> None:
        """Load configuration from file (simple key=value format)."""
        try:
            with open(self.config_file_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        self._config_cache[key.strip()] = value.strip()
        except Exception as e:
            raise ConfigurationError(f"Failed to load config file: {str(e)}")
    
    def get_config(self, key: str, default: Any = None) -> Any:
        """Get configuration value by key."""
        return self._config_cache.get(key, default)
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value by key (alias for get_config)."""
        return self.get_config(key, default)
    
    def get_required(self, key: str) -> Any:
        """Get a required configuration value, raises exception if not found."""
        value = self.get_config(key)
        if value is None:
            raise ConfigurationError(f"Required configuration key '{key}' not found")
        return value
    
    def get_all_config(self) -> Dict[str, Any]:
        """Get all configuration values."""
        return self._config_cache.copy()

    # --- LLM model helpers ---
    def _normalize_model_key(self, model_key: str) -> str:
        # Convert 'gpt-4o' -> 'GPT_4O', 'gpt-o4-mini' -> 'GPT_O4_MINI', 'gpt-5-nano' -> 'GPT_5_NANO'
        return model_key.upper().replace('-', '_')

    def get_llm_model_config(self, model_key: str) -> Dict[str, Any]:
        """Return Azure OpenAI config for a specific model key, falling back to global keys.

        Expected env keys for a given model suffix S:
          AZURE_OPENAI_API_KEY_S, AZURE_OPENAI_ENDPOINT_S, AZURE_OPENAI_DEPLOYMENT_NAME_S, AZURE_OPENAI_API_VERSION_S
        """
        suffix = self._normalize_model_key(model_key)
        api_key = self.get_config(f'AZURE_OPENAI_API_KEY_{suffix}') or self.get_config('AZURE_OPENAI_API_KEY')
        endpoint = self.get_config(f'AZURE_OPENAI_ENDPOINT_{suffix}') or self.get_config('AZURE_OPENAI_ENDPOINT')
        deployment = self.get_config(f'AZURE_OPENAI_DEPLOYMENT_NAME_{suffix}') or self.get_config('AZURE_OPENAI_DEPLOYMENT_NAME')
        api_version = self.get_config(f'AZURE_OPENAI_API_VERSION_{suffix}') or self.get_config('AZURE_OPENAI_API_VERSION', '2025-01-01-preview')
        return {
            'api_key': api_key,
            'endpoint': endpoint,
            'deployment': deployment,
            'api_version': api_version,
        }

    def list_available_llm_models(self, candidates: Optional[list] = None) -> Dict[str, Dict[str, Any]]:
        """Return a mapping of model_key -> config for all candidates that are fully configured."""
        if candidates is None:
            candidates = ['gpt-40', 'gpt-o4-mini', 'gpt-5-mini', 'gpt-5-nano']
        available: Dict[str, Dict[str, Any]] = {}
        for key in candidates:
            cfg = self.get_llm_model_config(key)
            if cfg.get('api_key') and cfg.get('endpoint') and cfg.get('deployment'):
                available[key] = cfg
        return available
    
    def validate_required_config(self) -> None:
        """Validate that all required configuration is present."""
        required_keys = [
            'GOOGLE_CLOUD_PROJECT',
            'DOCUMENT_AI_PROCESSOR_ID'
        ]
        
        # GOOGLE_APPLICATION_CREDENTIALS is optional when using ADC
        missing_keys = []
        for key in required_keys:
            if not self.get_config(key):
                missing_keys.append(key)
        
        if missing_keys:
            raise ConfigurationError(
                f"Missing required configuration: {', '.join(missing_keys)}"
            )
