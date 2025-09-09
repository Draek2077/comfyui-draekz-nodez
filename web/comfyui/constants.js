import { SERVICE as CONFIG_SERVICE } from "./services/config_service.js";
export function addDraekz(str) {
    return str + " (draekz)";
}
export function stripDraekz(str) {
    return str.replace(/\s*\(draekz\)$/, "");
}
export const NodeTypesString = {
    ANY_SWITCH: addDraekz("Any Switch"),
    CONTEXT: addDraekz("Context"),
    CONTEXT_BIG: addDraekz("Context Big"),
    CONTEXT_SWITCH: addDraekz("Context Switch"),
    CONTEXT_SWITCH_BIG: addDraekz("Context Switch Big"),
    CONTEXT_MERGE: addDraekz("Context Merge"),
    CONTEXT_MERGE_BIG: addDraekz("Context Merge Big"),
    DYNAMIC_CONTEXT: addDraekz("Dynamic Context"),
    DYNAMIC_CONTEXT_SWITCH: addDraekz("Dynamic Context Switch"),
    DISPLAY_ANY: addDraekz("Display Any"),
    IMAGE_OR_LATENT_SIZE: addDraekz("Image or Latent Size"),
    NODE_MODE_RELAY: addDraekz("Mute / Bypass Relay"),
    NODE_MODE_REPEATER: addDraekz("Mute / Bypass Repeater"),
    FAST_MUTER: addDraekz("Fast Muter"),
    FAST_BYPASSER: addDraekz("Fast Bypasser"),
    FAST_GROUPS_MUTER: addDraekz("Fast Groups Muter"),
    FAST_GROUPS_BYPASSER: addDraekz("Fast Groups Bypasser"),
    FAST_ACTIONS_BUTTON: addDraekz("Fast Actions Button"),
    LABEL: addDraekz("Label"),
    POWER_PRIMITIVE: addDraekz("Power Primitive"),
    POWER_PROMPT: addDraekz("Power Prompt"),
    POWER_PROMPT_SIMPLE: addDraekz("Power Prompt - Simple"),
    POWER_PUTER: addDraekz("Power Puter"),
    POWER_CONDUCTOR: addDraekz("Power Conductor"),
    SDXL_EMPTY_LATENT_IMAGE: addDraekz("SDXL Empty Latent Image"),
    SDXL_POWER_PROMPT_POSITIVE: addDraekz("SDXL Power Prompt - Positive"),
    SDXL_POWER_PROMPT_NEGATIVE: addDraekz("SDXL Power Prompt - Simple / Negative"),
    POWER_LORA_LOADER: addDraekz("Lora Loader"),
    KSAMPLER_CONFIG: addDraekz("KSampler Config"),
    NODE_COLLECTOR: addDraekz("Node Collector"),
    REROUTE: addDraekz("Reroute"),
    RANDOM_UNMUTER: addDraekz("Random Unmuter"),
    SEED: addDraekz("Seed"),
    BOOKMARK: addDraekz("Bookmark"),
    IMAGE_COMPARER: addDraekz("Image Comparer"),
    IMAGE_INSET_CROP: addDraekz("Image Inset Crop"),
};
const UNRELEASED_KEYS = {
    [NodeTypesString.DYNAMIC_CONTEXT]: "dynamic_context",
    [NodeTypesString.DYNAMIC_CONTEXT_SWITCH]: "dynamic_context",
    [NodeTypesString.POWER_CONDUCTOR]: "power_conductor",
};
export function getNodeTypeStrings() {
    const unreleasedKeys = Object.keys(UNRELEASED_KEYS);
    return Object.values(NodeTypesString)
        .map((i) => stripDraekz(i))
        .filter((i) => {
        if (unreleasedKeys.includes(i)) {
            return !!CONFIG_SERVICE.getConfigValue(`unreleased.${UNRELEASED_KEYS[i]}.enabled`);
        }
        return true;
    })
        .sort();
}
