"""Configuration validation and loading tests"""

import pytest
import tempfile
from pathlib import Path
import sys
import yaml
sys.path.append(str(Path(__file__).parent.parent.parent))

# Skip all tests in this module - ConfigLoader not yet implemented in sanitized version
pytestmark = pytest.mark.skip(reason="ConfigLoader not included in sanitized MBIE extraction")

try:
    from core.config_loader import ConfigLoader
except ImportError:
    ConfigLoader = None


@pytest.fixture
def temp_config_dir():
    """Create temporary directory with test configs"""
    with tempfile.TemporaryDirectory() as tmpdir:
        config_dir = Path(tmpdir)
        
        # Create valid config
        valid_config = {
            'model': {
                'name': 'sentence-transformers/all-MiniLM-L6-v2',
                'device': 'cpu',
                'batch_size': 4
            },
            'storage': {
                'memory_bank_root': '/tmp/test',
                'index_path': '/tmp/test/index',
                'cache_path': '/tmp/test/cache'
            },
            'chunking': {
                'small_file_lines': 400,
                'medium_file_lines': 600,
                'chunk_size': 512,
                'chunk_overlap': 50
            },
            'search': {
                'top_k': 10,
                'relevance_threshold': 0.7,
                'hybrid_alpha': 0.7
            },
            'domains': {
                'business': {
                    'files': ['business*.md'],
                    'boost': 1.2,
                    'keywords': ['business', 'strategy']
                }
            }
        }
        
        config_file = config_dir / "config.yml"
        with open(config_file, 'w') as f:
            yaml.dump(valid_config, f)
            
        yield config_dir


def test_config_loading(temp_config_dir):
    """Test successful configuration loading"""
    config_file = temp_config_dir / "config.yml"
    loader = ConfigLoader()
    
    config = loader.load_config(config_file)
    
    # Verify structure
    assert 'model' in config
    assert 'storage' in config
    assert 'chunking' in config
    assert 'search' in config
    assert 'domains' in config
    
    # Verify values
    assert config['model']['name'] == 'sentence-transformers/all-MiniLM-L6-v2'
    assert config['model']['device'] == 'cpu'
    assert config['storage']['memory_bank_root'] == '/tmp/test'


def test_config_validation(temp_config_dir):
    """Test configuration validation"""
    loader = ConfigLoader()
    
    # Test missing required sections
    invalid_config = {'model': {'name': 'test'}}
    
    config_file = temp_config_dir / "invalid.yml" 
    with open(config_file, 'w') as f:
        yaml.dump(invalid_config, f)
    
    with pytest.raises(ValueError, match="Missing required configuration"):
        loader.load_config(config_file)


def test_path_resolution(temp_config_dir):
    """Test path resolution to absolute paths"""
    # Create config with relative paths
    relative_config = {
        'model': {
            'name': 'sentence-transformers/all-MiniLM-L6-v2',
            'device': 'cpu',
            'batch_size': 4
        },
        'storage': {
            'memory_bank_root': './memory-bank',
            'index_path': './index',
            'cache_path': './cache'
        },
        'chunking': {
            'small_file_lines': 400,
            'medium_file_lines': 600,
            'chunk_size': 512,
            'chunk_overlap': 50
        },
        'search': {
            'top_k': 10,
            'relevance_threshold': 0.7,
            'hybrid_alpha': 0.7
        },
        'domains': {}
    }
    
    config_file = temp_config_dir / "relative.yml"
    with open(config_file, 'w') as f:
        yaml.dump(relative_config, f)
    
    loader = ConfigLoader()
    config = loader.load_config(config_file)
    
    # Paths should be converted to absolute
    assert Path(config['storage']['memory_bank_root']).is_absolute()
    assert Path(config['storage']['index_path']).is_absolute()
    assert Path(config['storage']['cache_path']).is_absolute()


def test_domain_validation(temp_config_dir):
    """Test domain configuration validation"""
    loader = ConfigLoader()
    
    # Valid domain config
    valid_domains = {
        'business': {
            'files': ['business*.md'],
            'boost': 1.2,
            'keywords': ['business', 'strategy']
        },
        'technical': {
            'files': ['tech*.md', 'architecture*.md'],
            'boost': 1.1,
            'keywords': ['system', 'code', 'api']
        }
    }
    
    assert loader.validate_domains(valid_domains) == True
    
    # Invalid domain config - missing required fields
    invalid_domains = {
        'business': {
            'files': ['business*.md']
            # Missing boost and keywords
        }
    }
    
    with pytest.raises(ValueError, match="Domain configuration missing"):
        loader.validate_domains(invalid_domains)
    
    # Invalid boost value
    invalid_boost = {
        'business': {
            'files': ['business*.md'],
            'boost': 'invalid',  # Should be float
            'keywords': ['business']
        }
    }
    
    with pytest.raises(ValueError, match="Domain boost must be"):
        loader.validate_domains(invalid_boost)


def test_model_validation():
    """Test model configuration validation"""
    loader = ConfigLoader()
    
    # Valid model config
    valid_model = {
        'name': 'sentence-transformers/all-MiniLM-L6-v2',
        'device': 'cpu',
        'batch_size': 32
    }
    
    assert loader.validate_model_config(valid_model) == True
    
    # Invalid device
    invalid_device = {
        'name': 'sentence-transformers/all-MiniLM-L6-v2',
        'device': 'invalid',
        'batch_size': 32
    }
    
    with pytest.raises(ValueError, match="Invalid device"):
        loader.validate_model_config(invalid_device)
    
    # Invalid batch size
    invalid_batch = {
        'name': 'sentence-transformers/all-MiniLM-L6-v2',
        'device': 'cpu',
        'batch_size': 0
    }
    
    with pytest.raises(ValueError, match="Batch size must be"):
        loader.validate_model_config(invalid_batch)


def test_config_defaults():
    """Test default value application"""
    loader = ConfigLoader()
    
    # Minimal config
    minimal_config = {
        'model': {
            'name': 'sentence-transformers/all-MiniLM-L6-v2'
        },
        'storage': {
            'memory_bank_root': '/tmp/test'
        }
    }
    
    config = loader.apply_defaults(minimal_config)
    
    # Should have default values applied
    assert config['model']['device'] == 'cpu'
    assert config['model']['batch_size'] == 32
    assert config['chunking']['small_file_lines'] == 400
    assert config['search']['top_k'] == 10


def test_environment_variable_substitution(temp_config_dir):
    """Test environment variable substitution in config"""
    import os
    
    # Set test environment variable
    os.environ['MEMORY_BANK_ROOT'] = '/custom/path'
    
    # Create config with environment variable
    env_config = {
        'model': {
            'name': 'sentence-transformers/all-MiniLM-L6-v2',
            'device': 'cpu',
            'batch_size': 4
        },
        'storage': {
            'memory_bank_root': '${MEMORY_BANK_ROOT}',
            'index_path': '${MEMORY_BANK_ROOT}/index',
            'cache_path': './cache'
        },
        'chunking': {
            'small_file_lines': 400,
            'medium_file_lines': 600,
            'chunk_size': 512,
            'chunk_overlap': 50
        },
        'search': {
            'top_k': 10,
            'relevance_threshold': 0.7,
            'hybrid_alpha': 0.7
        },
        'domains': {}
    }
    
    config_file = temp_config_dir / "env.yml"
    with open(config_file, 'w') as f:
        yaml.dump(env_config, f)
    
    loader = ConfigLoader()
    config = loader.load_config(config_file)
    
    # Environment variable should be substituted
    assert config['storage']['memory_bank_root'] == '/custom/path'
    assert config['storage']['index_path'] == '/custom/path/index'
    
    # Clean up
    del os.environ['MEMORY_BANK_ROOT']


def test_config_file_not_found():
    """Test handling of missing config file"""
    loader = ConfigLoader()
    
    with pytest.raises(FileNotFoundError, match="Configuration file not found"):
        loader.load_config("nonexistent.yml")


def test_invalid_yaml_syntax(temp_config_dir):
    """Test handling of invalid YAML syntax"""
    loader = ConfigLoader()
    
    # Create file with invalid YAML
    invalid_file = temp_config_dir / "invalid.yml"
    with open(invalid_file, 'w') as f:
        f.write("model:\n  name: test\n    invalid_indentation: value")
    
    with pytest.raises(yaml.YAMLError):
        loader.load_config(invalid_file)