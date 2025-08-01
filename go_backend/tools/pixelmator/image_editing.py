"""
Pixelmator Pro client for image editing automation via AppleScript.
"""

import subprocess
import os
from typing import Dict, Any, List, Optional, Tuple


def _run_applescript(script: str) -> str:
    """
    Execute AppleScript command and return result.

    Args:
        script: AppleScript code to execute

    Returns:
        str: Output from AppleScript execution

    Raises:
        RuntimeError: If AppleScript execution fails
    """
    try:
        result = subprocess.run(
            ['osascript', '-e', script],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"AppleScript failed: {e.stderr.strip()}") from e


def open_document(filepath: str) -> Dict[str, Any]:
    """
    Open an image file in Pixelmator Pro.

    Args:
        filepath: Full path to the image file

    Returns:
        Dict[str, Any]: Document info with id, width, height, name

    Raises:
        FileNotFoundError: If file doesn't exist
        RuntimeError: If Pixelmator Pro fails to open the file
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    script = f'tell application "Pixelmator Pro" to open POSIX file "{filepath}"'
    doc_id = _run_applescript(script)

    # Get document info after opening
    return get_document_info()


def get_document_info() -> Dict[str, Any]:
    """
    Get information about the currently active document.

    Returns:
        Dict[str, Any]: Document properties including id, name, width, height, resolution, color_profile

    Raises:
        RuntimeError: If no document is open
    """
    try:
        # Get basic document properties
        width_script = 'tell application "Pixelmator Pro" to get width of front document'
        height_script = 'tell application "Pixelmator Pro" to get height of front document'
        name_script = 'tell application "Pixelmator Pro" to get name of front document'
        id_script = 'tell application "Pixelmator Pro" to get id of front document'

        width = float(_run_applescript(width_script))
        height = float(_run_applescript(height_script))
        name = _run_applescript(name_script)
        doc_id = _run_applescript(id_script)

        # Try to get resolution and color profile (these might not always be available)
        try:
            resolution_script = 'tell application "Pixelmator Pro" to get resolution of front document'
            resolution = float(_run_applescript(resolution_script))
        except RuntimeError:
            resolution = 72.0  # Default DPI

        try:
            profile_script = 'tell application "Pixelmator Pro" to get color profile of front document'
            color_profile = _run_applescript(profile_script)
        except RuntimeError:
            color_profile = "sRGB"  # Default profile

        return {
            "id": doc_id,
            "name": name,
            "width": int(width),
            "height": int(height),
            "resolution": resolution,
            "color_profile": color_profile
        }

    except RuntimeError as e:
        if "front document" in str(e):
            raise RuntimeError("No document is currently open in Pixelmator Pro") from e
        raise


def get_layers() -> List[Dict[str, Any]]:
    """
    Get all layers in the current document.

    Returns:
        List[Dict[str, Any]]: List of layer dictionaries with name, type, visible, opacity, blend_mode

    Raises:
        RuntimeError: If no document is open
    """
    try:
        # Get layer names
        names_script = 'tell application "Pixelmator Pro" to get name of every layer of front document'
        names_result = _run_applescript(names_script)
        
        if names_result == "":
            return []

        # Parse layer names (they come as comma-separated string)
        layer_names = [name.strip() for name in names_result.split(',')]

        layers = []
        for name in layer_names:
            try:
                # Get layer properties
                visible_script = f'tell application "Pixelmator Pro" to get visible of layer "{name}" of front document'
                opacity_script = f'tell application "Pixelmator Pro" to get opacity of layer "{name}" of front document'
                
                visible = _run_applescript(visible_script).lower() == 'true'
                opacity = float(_run_applescript(opacity_script))

                # Try to get blend mode and type (these might not always be available)
                try:
                    blend_script = f'tell application "Pixelmator Pro" to get blend mode of layer "{name}" of front document'
                    blend_mode = _run_applescript(blend_script)
                except RuntimeError:
                    blend_mode = "normal"

                # Determine layer type based on class
                try:
                    type_script = f'tell application "Pixelmator Pro" to get class of layer "{name}" of front document'
                    layer_class = _run_applescript(type_script)
                    layer_type = _parse_layer_type(layer_class)
                except RuntimeError:
                    layer_type = "unknown"

                layers.append({
                    "name": name,
                    "type": layer_type,
                    "visible": visible,
                    "opacity": opacity,
                    "blend_mode": blend_mode
                })

            except RuntimeError:
                # If we can't get properties for a layer, skip it
                continue

        return layers

    except RuntimeError as e:
        if "front document" in str(e):
            raise RuntimeError("No document is currently open in Pixelmator Pro") from e
        raise


def _parse_layer_type(layer_class: str) -> str:
    """
    Parse Pixelmator Pro layer class to simplified type.

    Args:
        layer_class: Raw layer class from AppleScript

    Returns:
        str: Simplified layer type
    """
    class_mappings = {
        "image layer": "image",
        "text layer": "text", 
        "shape layer": "shape",
        "group layer": "group",
        "color adjustments layer": "adjustment",
        "effects layer": "effects"
    }
    
    return class_mappings.get(layer_class.lower(), "unknown")


def crop_document(bounds: Tuple[int, int, int, int]) -> Dict[str, Any]:
    """
    Crop the current document to specified bounds.

    Args:
        bounds: Crop rectangle as (x, y, width, height)

    Returns:
        Dict[str, Any]: Updated document info after cropping

    Raises:
        ValueError: If bounds are invalid
        RuntimeError: If crop fails or no document is open
    """
    x, y, width, height = bounds

    if width <= 0 or height <= 0:
        raise ValueError(f"Width and height must be positive, got: {width}x{height}")
    if x < 0 or y < 0:
        raise ValueError(f"X and Y coordinates must be non-negative, got: ({x}, {y})")

    # Get current document dimensions to validate bounds
    doc_info = get_document_info()
    if x + width > doc_info["width"] or y + height > doc_info["height"]:
        raise ValueError(f"Crop bounds {bounds} exceed document dimensions {doc_info['width']}x{doc_info['height']}")

    script = f'tell application "Pixelmator Pro" to tell front document to crop bounds {{{x}, {y}, {x + width}, {y + height}}}'
    _run_applescript(script)

    # Return updated document info
    return get_document_info()


def resize_document(width: int, height: int, algorithm: str = 'LANCZOS') -> Dict[str, Any]:
    """
    Resize the current document to specified dimensions.

    Args:
        width: New width in pixels
        height: New height in pixels
        algorithm: Resize algorithm ('LANCZOS', 'BILINEAR', 'NEAREST')

    Returns:
        Dict[str, Any]: Updated document info after resizing

    Raises:
        ValueError: If dimensions are invalid
        RuntimeError: If resize fails or no document is open
    """
    if width <= 0 or height <= 0:
        raise ValueError(f"Width and height must be positive, got: {width}x{height}")

    valid_algorithms = {'LANCZOS', 'BILINEAR', 'NEAREST'}
    if algorithm not in valid_algorithms:
        raise ValueError(f"Invalid algorithm: {algorithm}. Must be one of {valid_algorithms}")

    # Pixelmator Pro uses different algorithm names
    algorithm_mapping = {
        'LANCZOS': 'Lanczos',
        'BILINEAR': 'bilinear',
        'NEAREST': 'nearest neighbor'
    }
    
    pixelmator_algorithm = algorithm_mapping[algorithm]
    script = f'tell application "Pixelmator Pro" to tell front document to resize to dimensions {{{width}, {height}}} algorithm "{pixelmator_algorithm}"'
    
    _run_applescript(script)

    # Return updated document info
    return get_document_info()


def export_document(output_path: str, format: str = 'PNG', quality: int = 100) -> Dict[str, Any]:
    """
    Export the current document to a file.

    Args:
        output_path: Path for the exported file
        format: Export format ('PNG', 'JPEG', 'TIFF', 'PSD', 'WEBP')
        quality: Export quality 1-100 (JPEG only)

    Returns:
        Dict[str, Any]: Export info with output_path, format, file_size, success

    Raises:
        ValueError: If format is unsupported or quality is invalid
        RuntimeError: If export fails or no document is open
    """
    valid_formats = {'PNG', 'JPEG', 'TIFF', 'PSD', 'WEBP'}
    if format not in valid_formats:
        raise ValueError(f"Invalid format: {format}. Must be one of {valid_formats}")

    if not (1 <= quality <= 100):
        raise ValueError(f"Quality must be between 1-100, got: {quality}")

    # Ensure output directory exists
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Build export script based on format
    if format == 'JPEG':
        script = f'tell application "Pixelmator Pro" to export front document to POSIX file "{output_path}" as JPEG with compression factor {quality / 100.0}'
    else:
        script = f'tell application "Pixelmator Pro" to export front document to POSIX file "{output_path}" as {format}'

    _run_applescript(script)

    # Check if file was created and get size
    if not os.path.exists(output_path):
        raise RuntimeError(f"Export failed - file was not created: {output_path}")

    file_size = os.path.getsize(output_path)

    return {
        "output_path": output_path,
        "format": format,
        "file_size": file_size,
        "success": True
    }


def close_document(save: bool = False) -> bool:
    """
    Close the current document.

    Args:
        save: Whether to save before closing

    Returns:
        bool: True if closed successfully

    Raises:
        RuntimeError: If no document is open or close fails
    """
    try:
        if save:
            script = 'tell application "Pixelmator Pro" to save front document'
            _run_applescript(script)

        script = 'tell application "Pixelmator Pro" to close front document'
        _run_applescript(script)
        return True

    except RuntimeError as e:
        if "front document" in str(e):
            raise RuntimeError("No document is currently open in Pixelmator Pro") from e
        raise


def create_layer(layer_type: str, name: Optional[str] = None, **kwargs) -> Dict[str, Any]:
    """
    Create a new layer in the current document.

    Args:
        layer_type: Type of layer ('text', 'shape', 'color')
        name: Layer name (auto-generated if None)
        **kwargs: Layer-specific properties

    Returns:
        Dict[str, Any]: Layer info dictionary

    Raises:
        ValueError: If layer_type is invalid
        RuntimeError: If creation fails or no document is open
    """
    valid_types = {'text', 'shape', 'color'}
    if layer_type not in valid_types:
        raise ValueError(f"Invalid layer_type: {layer_type}. Must be one of {valid_types}")

    if name is None:
        name = f"{layer_type}_layer"

    if layer_type == 'text':
        text = kwargs.get('text', 'Sample Text')
        font_size = kwargs.get('font_size', 48)
        script = f'tell application "Pixelmator Pro" to tell front document to make new text layer with properties {{name:"{name}", text:"{text}", font size:{font_size}}}'
    
    elif layer_type == 'color':
        color = kwargs.get('color', (1.0, 1.0, 1.0, 1.0))  # White by default
        r, g, b, a = color
        script = f'tell application "Pixelmator Pro" to tell front document to make new color layer with properties {{name:"{name}", color:{{{r}, {g}, {b}}}}}'
    
    elif layer_type == 'shape':
        shape_type = kwargs.get('shape_type', 'rectangle')
        script = f'tell application "Pixelmator Pro" to tell front document to make new {shape_type} shape layer with properties {{name:"{name}"}}'

    _run_applescript(script)

    # Return info about the created layer
    layers = get_layers()
    for layer in layers:
        if layer['name'] == name:
            return layer
    
    raise RuntimeError(f"Failed to create layer: {name}")


def duplicate_layer(layer_name: str) -> Dict[str, Any]:
    """
    Duplicate an existing layer.

    Args:
        layer_name: Name of the layer to duplicate

    Returns:
        Dict[str, Any]: New layer info dictionary

    Raises:
        ValueError: If layer doesn't exist
        RuntimeError: If duplication fails
    """
    # Verify layer exists
    layers = get_layers()
    if not any(layer['name'] == layer_name for layer in layers):
        raise ValueError(f"Layer '{layer_name}' not found")

    script = f'tell application "Pixelmator Pro" to duplicate layer "{layer_name}" of front document'
    _run_applescript(script)

    # Find the duplicated layer (usually has "copy" appended)
    new_layers = get_layers()
    for layer in new_layers:
        if layer['name'] not in [l['name'] for l in layers]:
            return layer

    raise RuntimeError(f"Failed to duplicate layer: {layer_name}")


def delete_layer(layer_name: str) -> bool:
    """
    Delete a layer from the current document.

    Args:
        layer_name: Name of the layer to delete

    Returns:
        bool: True if deleted successfully

    Raises:
        ValueError: If layer doesn't exist
        RuntimeError: If deletion fails
    """
    # Verify layer exists
    layers = get_layers()
    if not any(layer['name'] == layer_name for layer in layers):
        raise ValueError(f"Layer '{layer_name}' not found")

    script = f'tell application "Pixelmator Pro" to delete layer "{layer_name}" of front document'
    _run_applescript(script)

    # Verify layer was deleted
    updated_layers = get_layers()
    if any(layer['name'] == layer_name for layer in updated_layers):
        raise RuntimeError(f"Failed to delete layer: {layer_name}")

    return True


def export_current_view(output_path: str, format: str = 'PNG') -> Dict[str, Any]:
    """
    Export the current viewport view to a file.

    Args:
        output_path: Path for the exported file
        format: Export format ('PNG', 'JPEG', 'TIFF')

    Returns:
        Dict[str, Any]: Export info with output_path, format, file_size, success

    Raises:
        ValueError: If format is unsupported
        RuntimeError: If export fails or no document is open
    """
    valid_formats = {'PNG', 'JPEG', 'TIFF'}
    if format not in valid_formats:
        raise ValueError(f"Invalid format: {format}. Must be one of {valid_formats}")

    # Ensure output directory exists
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    script = f'tell application "Pixelmator Pro" to export current view to POSIX file "{output_path}" as {format}'
    _run_applescript(script)

    # Check if file was created and get size
    if not os.path.exists(output_path):
        raise RuntimeError(f"Export failed - file was not created: {output_path}")

    file_size = os.path.getsize(output_path)

    return {
        "output_path": output_path,
        "format": format,
        "file_size": file_size,
        "success": True
    }