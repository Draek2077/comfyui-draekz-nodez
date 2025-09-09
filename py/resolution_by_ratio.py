# All nodes started from code provided thanks to wallish77
# See license details in the main LICENSE file
# https://github.com/wallish77/wlsh_nodes

from .constants import get_category, get_name

# A constant for maximum resolution dimensions
MAX_RESOLUTION = 8192

NODE_NAME = get_name('Resolution By Ratio')

class DraekzResolutionsByRatio:
    NAME = NODE_NAME
    CATEGORY = get_category()

    aspects = ["1:1", "5:4", "4:3", "3:2", "16:10", "16:9", "21:9", "2:1", "3:1"]
    direction = ["landscape", "portrait"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "aspect_ratio": (cls.aspects,),
                "direction": (cls.direction,),
                "short_side": ("INT", {"default": 1024, "min": 64, "max": MAX_RESOLUTION, "step": 8})
            }
        }

    RETURN_TYPES = ("INT", "INT",)
    RETURN_NAMES = ("width", "height",)
    FUNCTION = "get_resolutions"

    def get_resolutions(self, aspect_ratio, direction, short_side):
        x, y = map(int, aspect_ratio.split(':'))
        ratio = x / y
        long_side = short_side * ratio
        # Round the long side up to the nearest multiple of 8
        long_side = (int(long_side) + 7) & ~7

        width, height = (long_side, short_side) if direction == "landscape" else (short_side, long_side)
        return (width, height)
