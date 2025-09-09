import json

from .constants import get_category, get_name
from .log import log_node_warn

NODE_NAME = get_name('JSON Get Value')

class DraekzJsonGetValue:
    NAME = NODE_NAME
    CATEGORY = get_category()

    @classmethod
    def INPUT_TYPES(s):
        """
        Defines the input types for the node.
        - json_string: The string containing the JSON object (from another node).
        - property_name: The name of the property (key) to look for (widget input).
        """
        return {
            "required": {
                # This input is now a pure socket, expecting a connection from another node.
                "json_string": ("STRING", {"forceInput": True}),
                # This input remains a widget on the node to type into.
                "property_name": ("STRING", {"multiline": False, "default": "example_key"}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("value",)
    FUNCTION = "get_value"

    def get_value(self, json_string: str, property_name: str):
        """
        Parses the JSON string, finds the value for the given property_name, and returns it as a string.
        """
        try:
            # Attempt to parse the input string into a Python dictionary
            data = json.loads(json_string)
            if not isinstance(data, dict):
                return (f"Error: JSON string does not represent an object.",)

            # Use the .get() method to safely retrieve the value.
            # If the property_name is not found, it returns the default value (the second argument).
            value = data.get(property_name, f"Error: Property '{property_name}' not found.")

            # Convert the retrieved value to a string before returning
            # If the value is a dictionary or list, pretty-print it.
            if isinstance(value, (dict, list)):
                return (json.dumps(value, indent=2),)
            else:
                return (str(value),)

        except json.JSONDecodeError:
            # Handle cases where the input string is not valid JSON
            return ("Error: Invalid JSON format provided.",)
        except Exception as e:
            # Catch any other unexpected errors during processing
            return (f"An unexpected error occurred: {e}",)