import re

# A constant for maximum resolution dimensions
MAX_RESOLUTION = 8192

class Draekz_Resolution_Multiply:
    """
    Multiplies the given width and height by a specified factor.
    """
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
    CATEGORY = "Draekz/Utils"

    def multiply(self, width, height, multiplier):
        adj_width = int(width * multiplier)
        adj_height = int(height * multiplier)
        return (adj_width, adj_height,)

class Draekz_Resolutions_By_Ratio:
    """
    Calculates width and height based on a selected aspect ratio and a given length for the shorter side,
    ensuring the dimensions are multiples of 8.
    """
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
    CATEGORY = "Draekz/Utils"

    def get_resolutions(self, aspect_ratio, direction, short_side):
        x, y = map(int, aspect_ratio.split(':'))
        ratio = x / y
        long_side = short_side * ratio
        # Round the long side up to the nearest multiple of 8
        long_side = (int(long_side) + 7) & ~7
        
        width, height = (long_side, short_side) if direction == "landscape" else (short_side, long_side)
        return (width, height)

import re

import re

class Draekz_Flux_Resolutions:
    """
    Provides a single, sorted dropdown list of recommended resolutions for the FLUX model.
    The list is ordered by VRAM tier, then by total pixel count.
    """
    FLUX_DATA = {
        "8GB VRAM": {
            "1:1": [(1024, 1024)], "4:3": [(1152, 896)], "3:4": [(896, 1152)], "3:2": [(1152, 768)], "2:3": [(768, 1152)],
            "16:10": [(1216, 768)], "10:16": [(768, 1216)], "16:9": [(1280, 720)], "9:16": [(720, 1280)], "2:1": [(1344, 672)], "1:2": [(672, 1344)]
        },
        "12GB VRAM": {
            "1:1": [(1024, 1024)], "4:3": [(1152, 896)], "3:4": [(896, 1152)], "3:2": [(1280, 864)], "2:3": [(864, 1280)],
            "16:10": [(1280, 800)], "10:16": [(800, 1280)], "16:9": [(1344, 768)], "9:16": [(768, 1344)], "2:1": [(1472, 736)], "1:2": [(736, 1472)]
        },
        "16GB VRAM": {
            "1:1": [(1152, 1152)], "4:3": [(1344, 1024)], "3:4": [(1024, 1344)], "3:2": [(1408, 928)], "2:3": [(928, 1408)],
            "16:10": [(1472, 928)], "10:16": [(928, 1472)], "16:9": [(1536, 864)], "9:16": [(864, 1536)], "2:1": [(1600, 800)], "1:2": [(800, 1600)]
        },
        "24GB VRAM": {
            "1:1": [(1280, 1280)], "4:3": [(1472, 1152)], "3:4": [(1152, 1472)], "3:2": [(1536, 1024)], "2:3": [(1024, 1536)],
            "16:10": [(1600, 1024)], "10:16": [(1024, 1600)], "16:9": [(1664, 928)], "9:16": [(928, 1664)], "2:1": [(1792, 896)], "1:2": [(896, 1792)]
        },
        "32GB VRAM": {
            "1:1": [(1408, 1408)], "4:3": [(1536, 1216)], "3:4": [(1216, 1536)], "3:2": [(1664, 1120)], "2:3": [(1120, 1664), (1536, 2304)],
            "16:10": [(1664, 1024)], "10:16": [(1024, 1664)], "16:9": [(1792, 1024)], "9:16": [(1024, 1792)], "2:1": [(1920, 960)], "1:2": [(960, 1920)]
        },
        "96GB VRAM (Pro)": {
            "1:1": [(2048, 2048)], "4:3": [(2304, 1792)], "3:4": [(1792, 2304)], "3:2": [(2496, 1664)], "2:3": [(1664, 2496), (1536, 2304)],
            "16:10": [(2560, 1600)], "10:16": [(1600, 2560)], "16:9": [(2560, 1440)], "9:16": [(1440, 2560)], "2:1": [(2816, 1408)], "1:2": [(1408, 2816)]
        },
    }

    @classmethod
    def INPUT_TYPES(cls):
        # Create an intermediate list of tuples for sorting
        sortable_list = []
        
        # Define the desired order for VRAM tiers
        vram_order = {tier: i for i, tier in enumerate(cls.FLUX_DATA.keys())}

        for vram_tier, ratios in cls.FLUX_DATA.items():
            for ratio_str, resolutions_list in ratios.items():
                for dims in resolutions_list:
                    width, height = dims
                    total_pixels = width * height
                    # The final string that will be displayed in the dropdown
                    label = f"{vram_tier}: {width}x{height} ({ratio_str})"
                    # Append a tuple with sorting keys and the final label
                    sortable_list.append((vram_order[vram_tier], total_pixels, label))
        
        # Sort the list: first by VRAM tier index, then by total pixels
        sortable_list.sort(key=lambda x: (x[0], x[1]))
        
        # Extract the sorted labels to create the final dropdown list
        resolution_strings = [item[2] for item in sortable_list]

        return {"required": {"resolution_preset": (resolution_strings,)}}

    RETURN_TYPES = ("INT", "INT",)
    RETURN_NAMES = ("width", "height",)
    FUNCTION = "get_resolution"
    CATEGORY = "Draekz/Flux"

    def get_resolution(self, resolution_preset):
        # Regex reliably extracts the width and height from the selected string
        match = re.search(r'(\d+)x(\d+)', resolution_preset)
        if match:
            return (int(match.group(1)), int(match.group(2)))
        # Fallback to a default value if parsing fails for any reason
        return (1024, 1024)
    
# A dictionary that maps class names to object instances for ComfyUI to use
NODE_CLASS_MAPPINGS = {
    "Draekz Resolution Multiply": Draekz_Resolution_Multiply,
    "Draekz Resolutions By Ratio": Draekz_Resolutions_By_Ratio,
    "Draekz Flux Resolutions": Draekz_Flux_Resolutions,
}

# A dictionary that maps class names to user-friendly display names for the ComfyUI menu
NODE_DISPLAY_NAME_MAPPINGS = {
    "Draekz Resolution Multiply": "Resolution Multiplier (Draekz)",
    "Draekz Resolutions By Ratio": "Resolutions by Ratio (Draekz)",
    "Draekz Flux Resolutions": "FLUX Recommended Resolutions (Draekz)",
}