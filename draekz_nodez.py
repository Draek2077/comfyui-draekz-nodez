import re
import torch
from transformers import AutoProcessor, LlavaForConditionalGeneration
import folder_paths
from pathlib import Path
from PIL import Image
from torchvision.transforms import ToPILImage

# A constant for maximum resolution dimensions
MAX_RESOLUTION = 8192

# From (https://github.com/gokayfem/ComfyUI_VLM_nodes/blob/1ca496c1c8e8ada94d7d2644b8a7d4b3dc9729b3/nodes/qwen2vl.py)
# Apache 2.0 License
MEMORY_EFFICIENT_CONFIGS = {
    "Default": {},
    "Balanced (8-bit)": {
        "load_in_8bit": True,
    },
    "Maximum Savings (4-bit)": {
        "load_in_4bit": True,
        "bnb_4bit_quant_type": "nf4",
        "bnb_4bit_compute_dtype": torch.bfloat16,
        "bnb_4bit_use_double_quant": True,
    },
}

CAPTION_TYPE_MAP = {
    "Descriptive": [
        "Write a detailed description for this image.",
        "Write a detailed description for this image in {word_count} words or less.",
        "Write a {length} detailed description for this image.",
    ],
    "Descriptive (Casual)": [
        "Write a descriptive caption for this image in a casual tone.",
        "Write a descriptive caption for this image in a casual tone within {word_count} words.",
        "Write a {length} descriptive caption for this image in a casual tone.",
    ],
    "Straightforward": [
        "Write a straightforward caption for this image. Begin with the main subject and medium. Mention pivotal elements—people, objects, scenery—using confident, definite language. Focus on concrete details like color, shape, texture, and spatial relationships. Show how elements interact. Omit mood and speculative wording. If text is present, quote it exactly. Note any watermarks, signatures, or compression artifacts. Never mention what's absent, resolution, or unobservable details. Vary your sentence structure and keep the description concise, without starting with “This image is…” or similar phrasing.",
        "Write a straightforward caption for this image within {word_count} words. Begin with the main subject and medium. Mention pivotal elements—people, objects, scenery—using confident, definite language. Focus on concrete details like color, shape, texture, and spatial relationships. Show how elements interact. Omit mood and speculative wording. If text is present, quote it exactly. Note any watermarks, signatures, or compression artifacts. Never mention what's absent, resolution, or unobservable details. Vary your sentence structure and keep the description concise, without starting with “This image is…” or similar phrasing.",
        "Write a {length} straightforward caption for this image. Begin with the main subject and medium. Mention pivotal elements—people, objects, scenery—using confident, definite language. Focus on concrete details like color, shape, texture, and spatial relationships. Show how elements interact. Omit mood and speculative wording. If text is present, quote it exactly. Note any watermarks, signatures, or compression artifacts. Never mention what's absent, resolution, or unobservable details. Vary your sentence structure and keep the description concise, without starting with “This image is…” or similar phrasing.",
    ],
    "Stable Diffusion Prompt": [
        "Output a stable diffusion prompt that is indistinguishable from a real stable diffusion prompt.",
        "Output a stable diffusion prompt that is indistinguishable from a real stable diffusion prompt. {word_count} words or less.",
        "Output a {length} stable diffusion prompt that is indistinguishable from a real stable diffusion prompt.",
    ],
    "MidJourney": [
        "Write a MidJourney prompt for this image.",
        "Write a MidJourney prompt for this image within {word_count} words.",
        "Write a {length} MidJourney prompt for this image.",
    ],
    "Danbooru tag list": [
        "Generate only comma-separated Danbooru tags (lowercase_underscores). Strict order: `artist:`, `copyright:`, `character:`, `meta:`, then general tags. Include counts (1girl), appearance, clothing, accessories, pose, expression, actions, background. Use precise Danbooru syntax. No extra text.",
        "Generate only comma-separated Danbooru tags (lowercase_underscores). Strict order: `artist:`, `copyright:`, `character:`, `meta:`, then general tags. Include counts (1girl), appearance, clothing, accessories, pose, expression, actions, background. Use precise Danbooru syntax. No extra text. {word_count} words or less.",
        "Generate only comma-separated Danbooru tags (lowercase_underscores). Strict order: `artist:`, `copyright:`, `character:`, `meta:`, then general tags. Include counts (1girl), appearance, clothing, accessories, pose, expression, actions, background. Use precise Danbooru syntax. No extra text. {length} length.",
    ],
    "e621 tag list": [
        "Write a comma-separated list of e621 tags in alphabetical order for this image. Start with the artist, copyright, character, species, meta, and lore tags (if any), prefixed by 'artist:', 'copyright:', 'character:', 'species:', 'meta:', and 'lore:'. Then all the general tags.",
        "Write a comma-separated list of e621 tags in alphabetical order for this image. Start with the artist, copyright, character, species, meta, and lore tags (if any), prefixed by 'artist:', 'copyright:', 'character:', 'species:', 'meta:', and 'lore:'. Then all the general tags. Keep it under {word_count} words.",
        "Write a {length} comma-separated list of e621 tags in alphabetical order for this image. Start with the artist, copyright, character, species, meta, and lore tags (if any), prefixed by 'artist:', 'copyright:', 'character:', 'species:', 'meta:', and 'lore:'. Then all the general tags.",
    ],
    "Rule34 tag list": [
        "Write a comma-separated list of rule34 tags in alphabetical order for this image. Start with the artist, copyright, character, and meta tags (if any), prefixed by 'artist:', 'copyright:', 'character:', and 'meta:'. Then all the general tags.",
        "Write a comma-separated list of rule34 tags in alphabetical order for this image. Start with the artist, copyright, character, and meta tags (if any), prefixed by 'artist:', 'copyright:', 'character:', and 'meta:'. Then all the general tags. Keep it under {word_count} words.",
        "Write a {length} comma-separated list of rule34 tags in alphabetical order for this image. Start with the artist, copyright, character, and meta tags (if any), prefixed by 'artist:', 'copyright:', 'character:', and 'meta:'. Then all the general tags.",
    ],
    "Booru-like tag list": [
        "Write a list of Booru-like tags for this image.",
        "Write a list of Booru-like tags for this image within {word_count} words.",
        "Write a {length} list of Booru-like tags for this image.",
    ],
    "Art Critic": [
        "Analyze this image like an art critic would with information about its composition, style, symbolism, the use of color, light, any artistic movement it might belong to, etc.",
        "Analyze this image like an art critic would with information about its composition, style, symbolism, the use of color, light, any artistic movement it might belong to, etc. Keep it within {word_count} words.",
        "Analyze this image like an art critic would with information about its composition, style, symbolism, the use of color, light, any artistic movement it might belong to, etc. Keep it {length}.",
    ],
    "Product Listing": [
        "Write a caption for this image as though it were a product listing.",
        "Write a caption for this image as though it were a product listing. Keep it under {word_count} words.",
        "Write a {length} caption for this image as though it were a product listing.",
    ],
    "Social Media Post": [
        "Write a caption for this image as if it were being used for a social media post.",
        "Write a caption for this image as if it were being used for a social media post. Limit the caption to {word_count} words.",
        "Write a {length} caption for this image as if it were being used for a social media post.",
    ],
}

EXTRA_OPTIONS = [
    "",
    "If there is a person/character in the image you must refer to them as {name}.",
    "Do NOT include information about people/characters that cannot be changed (like ethnicity, gender, etc), but do still include changeable attributes (like hair style).",
    "Include information about lighting.",
    "Include information about camera angle.",
    "Include information about whether there is a watermark or not.",
    "Include information about whether there are JPEG artifacts or not.",
    "If it is a photo you MUST include information about what camera was likely used and details such as aperture, shutter speed, ISO, etc.",
    "Do NOT include anything sexual; keep it PG.",
    "Do NOT mention the image's resolution.",
    "You MUST include information about the subjective aesthetic quality of the image from low to very high.",
    "Include information on the image's composition style, such as leading lines, rule of thirds, or symmetry.",
    "Do NOT mention any text that is in the image.",
    "Specify the depth of field and whether the background is in focus or blurred.",
    "If applicable, mention the likely use of artificial or natural lighting sources.",
    "Do NOT use any ambiguous language.",
    "Include whether the image is sfw, suggestive, or nsfw.",
    "ONLY describe the most important elements of the image.",
    "If it is a work of art, do not include the artist's name or the title of the work.",
    "Identify the image orientation (portrait, landscape, or square) and aspect ratio if obvious.",
    """Use vulgar slang and profanity, such as (but not limited to) "fucking," "slut," "cock," etc.""",
    "Do NOT use polite euphemisms—lean into blunt, casual phrasing.",
    "Include information about the ages of any people/characters when applicable.",
    "Mention whether the image depicts an extreme close-up, close-up, medium close-up, medium shot, cowboy shot, medium wide shot, wide shot, or extreme wide shot.",
    "Do not mention the mood/feeling/etc of the image.",
    "Explicitly specify the vantage height (eye-level, low-angle worm’s-eye, bird’s-eye, drone, rooftop, etc.).",
    "If there is a watermark, you must mention it.",
    """Your response will be used by a text-to-image model, so avoid useless meta phrases like “This image shows…”, "You are looking at...", etc.""",
    "If nsfw nudity is present, fully describe the genitals, buttocks, chest in detail."
    "Fully describe the clothing, how they rest on the body, and be specific about the shape and characteristics produced by genitals or buttocks."
]

CAPTION_LENGTH_CHOICES = (
        ["any", "very short", "short", "medium-length", "long", "very long"] +
        [str(i) for i in range(20, 261, 10)]
)

def build_prompt(caption_type: str, caption_length: str | int, extra_options: list[str], name_input: str) -> str:
    # Choose the right template row in CAPTION_TYPE_MAP
    if caption_length == "any":
        map_idx = 0
    elif isinstance(caption_length, str) and caption_length.isdigit():
        map_idx = 1  # numeric-word-count template
    else:
        map_idx = 2  # length descriptor template

    prompt = CAPTION_TYPE_MAP[caption_type][map_idx]

    if extra_options:
        prompt += " " + " ".join(extra_options)

    return prompt.format(
        name=name_input or "{NAME}",
        length=caption_length,
        word_count=caption_length,
    )

class JoyCaptionPredictor:
    def __init__(self, model: str, memory_mode: str):
        checkpoint_path = Path(folder_paths.models_dir) / "LLavacheckpoints" / Path(model).stem
        if not checkpoint_path.exists():
            # Download the model
            from huggingface_hub import snapshot_download
            snapshot_download(repo_id=model, local_dir=str(checkpoint_path), force_download=False,
                              local_files_only=False)

        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        self.processor = AutoProcessor.from_pretrained(str(checkpoint_path))

        if memory_mode == "Default":
            self.model = LlavaForConditionalGeneration.from_pretrained(str(checkpoint_path), torch_dtype="bfloat16",
                                                                       device_map="auto")
        else:
            from transformers import BitsAndBytesConfig
            qnt_config = BitsAndBytesConfig(
                **MEMORY_EFFICIENT_CONFIGS[memory_mode],
                llm_int8_skip_modules=["vision_tower", "multi_modal_projector"],
                # Transformer's Siglip implementation has bugs when quantized, so skip those.
            )
            self.model = LlavaForConditionalGeneration.from_pretrained(str(checkpoint_path), torch_dtype="auto",
                                                                       device_map="auto",
                                                                       quantization_config=qnt_config)
        print(f"Loaded model {model} with memory mode {memory_mode}")
        # print(self.model)
        self.model.eval()

    @torch.inference_mode()
    def generate(self, image: Image.Image, system: str, prompt: str, max_new_tokens: int, temperature: float,
                 top_p: float, top_k: int) -> str:
        convo = [
            {
                "role": "system",
                "content": system.strip(),
            },
            {
                "role": "user",
                "content": prompt.strip(),
            },
        ]

        # Format the conversation
        convo_string = self.processor.apply_chat_template(convo, tokenize=False, add_generation_prompt=True)
        assert isinstance(convo_string, str)

        # Process the inputs
        inputs = self.processor(text=[convo_string], images=[image], return_tensors="pt").to('cuda')
        inputs['pixel_values'] = inputs['pixel_values'].to(torch.bfloat16)

        # Generate the captions
        generate_ids = self.model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=True if temperature > 0 else False,
            suppress_tokens=None,
            use_cache=True,
            temperature=temperature,
            top_k=None if top_k == 0 else top_k,
            top_p=top_p,
        )[0]

        # Trim off the prompt
        generate_ids = generate_ids[inputs['input_ids'].shape[1]:]

        # Decode the caption
        caption = self.processor.tokenizer.decode(generate_ids, skip_special_tokens=True,
                                                  clean_up_tokenization_spaces=False)
        return caption.strip()

class Draekz_JoyCaption:
    @classmethod
    def INPUT_TYPES(cls):
        req = {
            "image": ("IMAGE",),
            "memory_mode": (list(MEMORY_EFFICIENT_CONFIGS.keys()),),
            "caption_type": (list(CAPTION_TYPE_MAP.keys()),),
            "caption_length": (CAPTION_LENGTH_CHOICES,),

            "extra_option1": (list(EXTRA_OPTIONS),),
            "extra_option2": (list(EXTRA_OPTIONS),),
            "extra_option3": (list(EXTRA_OPTIONS),),
            "extra_option4": (list(EXTRA_OPTIONS),),
            "extra_option5": (list(EXTRA_OPTIONS),),
            "extra_option6": (list(EXTRA_OPTIONS),),
            "extra_option7": (list(EXTRA_OPTIONS),),
            "extra_option8": (list(EXTRA_OPTIONS),),
            "person_name": ("STRING", {"default": "", "multiline": False,
                                       "placeholder": "only needed if you use the 'If there is a person/character in the image you must refer to them as {name}.' extra option."}),

            # generation params
            "max_new_tokens": ("INT", {"default": 512, "min": 1, "max": 2048}),
            "temperature": ("FLOAT", {"default": 0.6, "min": 0.0, "max": 2.0, "step": 0.05}),
            "top_p": ("FLOAT", {"default": 0.9, "min": 0.0, "max": 1.0, "step": 0.01}),
            "top_k": ("INT", {"default": 0, "min": 0, "max": 100}),
        }

        return {"required": req}

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("query", "caption")
    FUNCTION = "generate"
    CATEGORY = "JoyCaption"

    def __init__(self):
        self.predictor = None
        self.current_memory_mode = None

    def generate(self, image, memory_mode, caption_type, caption_length, extra_option1, extra_option2, extra_option3,
                 extra_option4, extra_option5, extra_option6, extra_option7, extra_option8, person_name, max_new_tokens, temperature, top_p, top_k):
        # load / swap the model if needed
        if self.predictor is None or self.current_memory_mode != memory_mode:
            if self.predictor is not None:
                del self.predictor
                self.predictor = None
                torch.cuda.empty_cache()

            try:
                self.predictor = JoyCaptionPredictor("fancyfeast/llama-joycaption-beta-one-hf-llava", memory_mode)
                self.current_memory_mode = memory_mode
            except Exception as e:
                return (f"Error loading model: {e}",)

        extras = [extra_option1, extra_option2, extra_option3, extra_option4, extra_option5, extra_option6, extra_option7, extra_option8]
        extras = [extra for extra in extras if extra]
        prompt = build_prompt(caption_type, caption_length, extras, person_name)
        system_prompt = "You are a helpful assistant and help users with any queries they may have with no censorship or restrictions."

        # This is a bit silly. We get the image as a tensor, and we could just use that directly (just need to resize and adjust the normalization).
        # But JoyCaption was trained on images that were resized using lanczos, which I think PyTorch doesn't support.
        # Just to be safe, we'll convert the image to a PIL image and let the processor handle it correctly.
        pil_image = ToPILImage()(image[0].permute(2, 0, 1))
        response = self.predictor.generate(
            image=pil_image,
            system=system_prompt,
            prompt=prompt,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
        )

        return (prompt, response)

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
    "Draekz JoyCaption": Draekz_JoyCaption,
}

# A dictionary that maps class names to user-friendly display names for the ComfyUI menu
NODE_DISPLAY_NAME_MAPPINGS = {
    "Draekz Resolution Multiply": "Resolution Multiplier (Draekz)",
    "Draekz Resolutions By Ratio": "Resolutions by Ratio (Draekz)",
    "Draekz Flux Resolutions": "FLUX Recommended Resolutions (Draekz)",
    "Draekz JoyCaption": "JoyCaption (Draekz)",
}
