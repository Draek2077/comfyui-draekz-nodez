import importlib
import os
import folder_paths

# All nodes started from code provided thanks to SeargeDP
# See license details in the main LICENSE.searge_llm file
# https://github.com/SeargeDP/ComfyUI_Searge_LLM

from .constants import get_category, get_name

NODE_NAME = get_name('LLM Prompt')

GLOBAL_MODELS_DIR = os.path.join(folder_paths.models_dir, "llm_gguf")

DEFAULT_INSTRUCTIONS = 'You are an expert prompt engineer for the FLUX text-to-image model, which uses two text encoders: CLIP-L and T5-XXL. Your task is to take a users simple prompt and rewrite it into an optimized JSON object that leverages the unique strengths of each encoder.  ## Instructions:  1.  **For the `"CLIP_L"` property:** This prompt should focus on the **core subjects, objects, visual style, and overall composition**. It works best with descriptive keywords and phrases, separated by commas. Focus on *what* to see. 2.  **For the `"T5XXL"` property:** This prompt must be a **detailed, grammatically correct sentence** that describes the scene in a more narrative way. It excels at understanding complex relationships between objects, specific actions, and intricate details. Focus on *how* everything comes together in the scene.  ## Example:  **User Prompt:** `a knight fighting a dragon`  **Your Output:** {   "CLIP_L": "epic fantasy painting, a knight in shining armor, a fearsome red dragon, castle in the background, dramatic lighting, highly detailed, cinematic",   "T5XXL": "A cinematic, highly detailed fantasy painting of a knight in shining armor bravely fighting a fearsome red dragon in front of a distant castle under a dramatically lit sky." }  ## Constraints:  - Your final response must **only** be the raw JSON object. - Do not include any explanations, markdown formatting, or any other text.  ---  Now, process the following prompt: "{prompt}"'

# Dynamically import either the CUDA or the standard version of llama_cpp
try:
    Llama = importlib.import_module("llama_cpp_cuda").Llama
    print("Draekz LLM: llama_cpp_cuda loaded.")
except ImportError:
    Llama = importlib.import_module("llama_cpp").Llama
    print("Draekz LLM: llama_cpp loaded.")

class DraekzLLMPrompt:
    NAME = NODE_NAME
    CATEGORY = get_category()

    # Class-level cache for the loaded model. This will persist between runs.
    CACHED_MODELS = {}

    @classmethod
    def INPUT_TYPES(cls):
        model_options = []
        if os.path.isdir(GLOBAL_MODELS_DIR):
            gguf_files = [file for file in os.listdir(GLOBAL_MODELS_DIR) if file.endswith('.gguf')]
            model_options.extend(gguf_files)

        return {
            "required": {
                "text": ("STRING", {"multiline": True, "dynamicPrompts": True, "default": ""}),
                "random_seed": ("INT", {"default": 1234567890, "min": 0, "max": 0xffffffffffffffff}),
                "model": (model_options,),
                "max_tokens": ("INT", {"default": 4096, "min": 1, "max": 8192}),
                "apply_instructions": ("BOOLEAN", {"default": True}),
                "instructions": ("STRING", {"multiline": False, "default": DEFAULT_INSTRUCTIONS}),
            },
            "optional": {
                "options_config": ("DRAEKZLLMCONFIG",),
            }
        }

    FUNCTION = "main"
    RETURN_TYPES = ("STRING", "STRING",)
    RETURN_NAMES = ("generated", "original",)

    def main(self, text, random_seed, model, max_tokens, apply_instructions, instructions, options_config=None):
        model_path = os.path.join(GLOBAL_MODELS_DIR, model)
        model_to_use = None

        # --- Caching Logic ---
        # Check if the requested model is already loaded in our cache.
        if model in self.CACHED_MODELS:
            model_to_use = self.CACHED_MODELS[model]
            print(f"Draekz LLM: Using cached model '{model}'")
        else:
            # If the model is not cached, clear the cache to free up memory from other models.
            if self.CACHED_MODELS:
                print(f"Draekz LLM: Clearing cached models to load a new one.")
                self.CACHED_MODELS.clear()

            # Load the new model from the file path.
            print(f"Draekz LLM: Loading model '{model}'. This may take a moment...")

            model_to_use = Llama(
                model_path=model_path,
                n_gpu_layers=-1,  # Offload all possible layers to GPU
                seed=random_seed,
                verbose=False,  # Suppress verbose output from llama.cpp
                n_ctx=2048,  # Context window size
            )

            # Store the newly loaded model in the cache.
            self.CACHED_MODELS[model] = model_to_use
            print(f"Draekz LLM: Model '{model}' loaded and cached.")
        # --- End Caching Logic ---

        if not model.endswith(".gguf"):
            return ("NOT A GGUF MODEL", text)

        generate_kwargs = {
            'max_tokens': max_tokens,
            'temperature': 1.0,
            'top_p': 0.9,
            'top_k': 50,
            'repeat_penalty': 1.2
        }

        if options_config:
            for option in ['temperature', 'top_p', 'top_k', 'repeat_penalty']:
                if option in options_config:
                    generate_kwargs[option] = options_config[option]

        if apply_instructions:
            req = instructions.replace("{prompt}", text) if "{prompt}" in instructions else f"{instructions} {text}"
            messages = [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user",
                 "content": "An image generation prompt is a single paragraph summary to describe the subject and style of an image. It includes a description of the kind of image, the subject of the image, and some description of the image medium and style in the form of short keyword.\n\nCreate an image generation prompt for the subject \"a creepy creature shadow in the dark in a dimly lit tunnel\" in the style \"digital art illustration with intricate details\"."},
                {"role": "assistant",
                 "content": "Image Description: A digitally crafted illustration portrays a chilling scene within a dimly lit, cavernous tunnel. The dominant subject of the image is a mysterious creature, its form subtly discernible only as a menacing shadow on the walls of the tunnel. Its elongated silhouette suggests a serpentine creature with sharp protrusions and an ominous aura. The creature's eyes, a pair of glowing orbs, appear eerily human-like yet alien. The tunnel is riddled with intricate details that enhance the eerie atmosphere: dust particles floating lazily in the feeble light, ancient and crumbling stone, water droplets sparkling on the damp walls, and a hauntingly beautiful, bioluminescent fungi growing in the shadows. The dimly lit environment is highlighted by strategically placed light sources that create dramatic chiaroscuro effects, casting an unsettling and atmospheric glow on the scene. Digital Art Illustration with Intricate Details (Dark, Atmospheric, Suspenseful)"},
                {"role": "user", "content": "Now compile the description and style into a single paragraph summary"},
                {"role": "assistant",
                 "content": "Digital art illustration featuring a dark, atmospheric, and suspenseful scene within a dimly lit, cavernous tunnel. The subject of the image is a mysterious creature, depicted only as a menacing shadow on the walls, with elongated silhouette and sharp protrusions. The creature's eyes, a pair of glowing orbs, appear eerily human-like yet alien. The tunnel is adorned with intricate details, such as dust particles, ancient crumbling stone, water droplets, and a hauntingly beautiful bioluminescent fungi growing in the shadows. Dramatic chiaroscuro effects are created through strategically placed light sources, casting an unsettling and atmospheric glow on the scene."},
                {"role": "user", "content": "create a detailed summary without the title or style"},
                {"role": "assistant",
                 "content": "A dimly lit, cavernous tunnel is the setting for this chilling digital illustration. A mysterious creature lurks in the shadows, its elongated silhouette suggestive of a serpentine creature with sharp protrusions and an ominous aura. The creature's eyes, a pair of glowing orbs, appear eerily human-like yet alien. The tunnel is riddled with intricate details that enhance the eerie atmosphere: dust particles floating lazily in the feeble light, ancient and crumbling stone, water droplets sparkling on the damp walls, and a hauntingly beautiful, bioluminescent fungi growing in the shadows. Dramatic chiaroscuro effects are created through strategically placed light sources, casting an unsettling and atmospheric glow on the scene."},
                {"role": "user",
                 "content": "Generate a prompt from \"magical garden, sitting on a blue_bench, Disney Princess in pink_dress, blonde_hair, portrait, Pixar, Disney style, photorealistic, high details, detailed skin, pores, freckles\""},
                {"role": "assistant",
                 "content": "In a captivating, Pixar-inspired, Disney-style, photorealistic portrait, a magical garden unfolds as a breathtaking backdrop. The subject of the image is a Disney Princess, dressed elegantly in a pink gown with flowing fabric, sitting serenely on a blue bench. The princess boasts long, blonde hair and a radiant smile. The garden is meticulously detailed, with vibrant, enchanted flora and fauna, as well as whimsical details like sparkling fairy lights and a picturesque waterfall. The princess is highlighted against the lush, detailed foliage, with a focus on the high-definition details of her porcelain skin, visible freckles, and the intricacies of her elegant gown. The image is rendered in the captivating, photorealistic style that exemplifies both the Disney and Pixar brands, capturing the princess's timeless beauty and the magic of her enchanting surroundings."},
                {"role": "user", "content": req},
            ]
        else:
            messages = [
                {"role": "system",
                 "content": "You are a helpful assistant. Try your best to give the best response possible to the user."},
                {"role": "user",
                 "content": f"Create a detailed visually descriptive caption of this description, which will be used as a prompt for a text to image AI system (caption only, no instructions like \"create an image\").Remove any mention of digital artwork or artwork style. Give detailed visual descriptions of the character(s), including ethnicity, skin tone, expression etc. Imagine using keywords for a still for someone who has aphantasia. Describe the image style, e.g. any photographic or art styles / techniques utilized. Make sure to fully describe all aspects of the cinematography, with abundant technical details and visual descriptions. If there is more than one image, combine the elements and characters from all of the images creatively into a single cohesive composition with a single background, inventing an interaction between the characters. Be creative in combining the characters into a single cohesive scene. Focus on two primary characters (or one) and describe an interesting interaction between them, such as a hug, a kiss, a fight, giving an object, an emotional reaction / interaction. If there is more than one background in the images, pick the most appropriate one. Your output is only the caption itself, no comments or extra formatting. The caption is in a single long paragraph. If you feel the images are inappropriate, invent a new scene / characters inspired by these. Additionally, incorporate a specific movie director's visual style and describe the lighting setup in detail, including the type, color, and placement of light sources to create the desired mood and atmosphere. Always frame the scene, including details about the film grain, color grading, and any artifacts or characteristics specific. Compress the output to be concise while retaining key visual details. MAX OUTPUT SIZE no more than 250 characters.\nDescription : {text}"},
            ]

        llm_result = model_to_use.create_chat_completion(messages, **generate_kwargs)

        return (llm_result['choices'][0]['message']['content'].strip(), text)
