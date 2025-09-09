import folder_paths

# All nodes started from code provided thanks to SeargeDP
# See license details in the main LICENSE.searge_llm file
# https://github.com/SeargeDP/ComfyUI_Searge_LLM

from .constants import get_category, get_name

NODE_NAME = get_name('LLM Options')

class DraekzLLMOptions:
    NAME = NODE_NAME
    CATEGORY = get_category()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "temperature": ("FLOAT", {"default": 1.0, "min": 0.1, "step": 0.05}),
                "top_p": ("FLOAT", {"default": 0.9, "min": 0.1, "step": 0.05}),
                "top_k": ("INT", {"default": 50, "min": 0}),
                "repetition_penalty": ("FLOAT", {"default": 1.2, "min": 0.1, "step": 0.05}),
            }
        }

    FUNCTION = "main"
    RETURN_TYPES = ("DRAEKZLLMCONFIG",)
    RETURN_NAMES = ("options_config",)

    def main(self, temperature=1.0, top_p=0.9, top_k=50, repetition_penalty=1.2):
        options_config = {
            "temperature": temperature,
            "top_p": top_p,
            "top_k": top_k,
            "repeat_penalty": repetition_penalty,
        }
        return (options_config,)
