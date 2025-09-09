# All nodes started from code provided thanks to wallish77
# See license details in the main LICENSE file
# https://github.com/wallish77/wlsh_nodes

from .constants import get_category, get_name

# A constant for maximum resolution dimensions
MAX_RESOLUTION = 8192

NODE_NAME = get_name('Resolution Multiply')

class DraekzResolutionMultiply:
    NAME = NODE_NAME
    CATEGORY = get_category()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "width": ("INT", {"default": 1024, "min": 16, "max": MAX_RESOLUTION, "forceInput": True}),
                "height": ("INT", {"default": 1024, "min": 16, "max": MAX_RESOLUTION, "forceInput": True}),
                "multiplier": ("FLOAT", {"default": 1.5, "min": 0.1, "max": 16.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("INT", "INT",)
    RETURN_NAMES = ("width", "height",)
    FUNCTION = "multiply"

    def multiply(self, width, height, multiplier):
        adj_width = int(width * multiplier)
        adj_height = int(height * multiplier)
        return (adj_width, adj_height,)