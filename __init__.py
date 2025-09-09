from glob import glob
import json
import os
import shutil
import re
import random

import execution

from .py.log import log
from .py.config import get_config_value
from .py.server.draekz_server import *

from .py.seed import DraekzSeed
from .py.lora_loader import DraekzLoraLoader
from .py.json_get_value import DraekzJsonGetValue
from .py.resolutions import DraekzResolutions
from .py.resolution_multiply import DraekzResolutionMultiply
from .py.resolution_by_ratio import DraekzResolutionsByRatio
from .py.llm_prompt import DraekzLLMPrompt
from .py.llm_options import DraekzLLMOptions

NODE_CLASS_MAPPINGS = {
    DraekzSeed.NAME: DraekzSeed,
    DraekzLoraLoader.NAME: DraekzLoraLoader,
    DraekzJsonGetValue.NAME: DraekzJsonGetValue,
    DraekzResolutions.NAME: DraekzResolutions,
    DraekzResolutionMultiply.NAME: DraekzResolutionMultiply,
    DraekzResolutionsByRatio.NAME: DraekzResolutionsByRatio,
    DraekzLLMPrompt.NAME: DraekzLLMPrompt,
    DraekzLLMOptions.NAME: DraekzLLMOptions,
}

# WEB_DIRECTORY is the comfyui nodes directory that ComfyUI will link and auto-load.
WEB_DIRECTORY = "./web/comfyui"

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
DIR_WEB = os.path.abspath(f'{THIS_DIR}/{WEB_DIRECTORY}')
DIR_PY = os.path.abspath(f'{THIS_DIR}/py')

__all__ = ['NODE_CLASS_MAPPINGS', 'WEB_DIRECTORY']

NOT_NODES = ['constants', 'log', 'utils', 'draekz', 'draekz_server', 'config']

nodes = []
for file in glob(os.path.join(DIR_PY, '*.py')) + glob(os.path.join(DIR_WEB, '*.js')):
    name = os.path.splitext(os.path.basename(file))[0]
    if name in NOT_NODES or name in nodes:
        continue
    if name.startswith('_') or name.startswith('base') or 'utils' in name:
        continue
    nodes.append(name)
    if name == 'display_any':
        nodes.append('display_int')

print()
log(f'Loaded {len(nodes)} nodes.', color='BRIGHT_GREEN')
print()
