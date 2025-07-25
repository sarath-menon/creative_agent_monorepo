"""
Blender sequencer and timeline utilities.
"""

from typing import List, Dict, Any, Optional, Tuple
import os


def get_sequences(channel: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Get timeline sequences, optionally filtered by channel.

    Args:
        channel: Optional channel number to filter by. If None, returns all sequences.

    Returns:
        List[Dict[str, Any]]: List of sequence dictionaries containing:
            - name: str - Sequence name
            - type: str - Sequence type (IMAGE, MOVIE, SOUND, etc.)
            - channel: int - Channel number
            - frame_start: float - Start frame
            - frame_end: float - End frame
            - duration: int - Duration in frames
            - filepath: Optional[str] - Full file path if available
            - original_resolution: Optional[Tuple[int, int]] - Original video resolution if applicable
            - transform: Dict[str, Any] - Transform properties including scale, offset, rotation
            - is_resized: bool - Whether the sequence has been resized from original

    Raises:
        ImportError: If bpy module is not available
        AttributeError: If sequence editor is not available
    """
    import bpy

    scene = bpy.context.scene

    if not scene.sequence_editor:
        raise AttributeError("No sequence editor found - timeline is empty or not initialized")

    sequences = scene.sequence_editor.sequences_all
    result = []

    for seq in sequences:
        if channel is None or seq.channel == channel:
            transform_data, original_res, is_resized = _get_sequence_transform_info(seq)
            
            sequence_data = {
                "name": seq.name,
                "type": seq.type,
                "channel": seq.channel,
                "frame_start": seq.frame_start,
                "frame_end": seq.frame_final_end,
                "duration": seq.frame_final_duration,
                "filepath": _get_sequence_filepath(seq),
                "original_resolution": original_res,
                "transform": transform_data,
                "is_resized": is_resized
            }
            result.append(sequence_data)

    return result


def _get_sequence_filepath(seq) -> Optional[str]:
    """
    Extract the file path from a sequence based on its type.

    Args:
        seq: Blender sequence object

    Returns:
        Optional[str]: Full file path if available, None otherwise
    """
    if seq.type == 'IMAGE':
        if hasattr(seq, 'directory') and hasattr(seq, 'elements') and seq.elements:
            directory = seq.directory
            filename = seq.elements[0].filename
            return os.path.join(directory, filename)
    elif seq.type == 'MOVIE':
        if hasattr(seq, 'filepath'):
            return seq.filepath
    elif seq.type == 'SOUND':
        if hasattr(seq, 'sound') and hasattr(seq.sound, 'filepath'):
            return seq.sound.filepath
    elif hasattr(seq, 'filepath'):
        return seq.filepath

    return None


def _get_sequence_transform_info(seq) -> Tuple[Dict[str, Any], Optional[Tuple[int, int]], bool]:
    """
    Extract transform information and determine if sequence has been resized.

    Args:
        seq: Blender sequence object

    Returns:
        Tuple containing:
            - Dict[str, Any]: Transform data with scale, offset, rotation
            - Optional[Tuple[int, int]]: Original resolution (width, height) if available
            - bool: Whether the sequence has been resized
    """
    transform_data = {
        "scale_x": 1.0,
        "scale_y": 1.0,
        "offset_x": 0.0,
        "offset_y": 0.0,
        "rotation": 0.0
    }
    
    original_resolution = None
    is_resized = False
    
    # Get transform properties if available
    if hasattr(seq, 'transform'):
        transform = seq.transform
        transform_data.update({
            "scale_x": getattr(transform, 'scale_x', 1.0),
            "scale_y": getattr(transform, 'scale_y', 1.0),
            "offset_x": getattr(transform, 'offset_x', 0.0),
            "offset_y": getattr(transform, 'offset_y', 0.0),
            "rotation": getattr(transform, 'rotation', 0.0)
        })
        
        # Check if scaling is not 1.0 (indicating resize)
        if transform_data["scale_x"] != 1.0 or transform_data["scale_y"] != 1.0:
            is_resized = True
    
    # Get original resolution for video/image sequences
    if seq.type == 'MOVIE' and hasattr(seq, 'elements') and seq.elements:
        try:
            # Get original video dimensions
            element = seq.elements[0]
            if hasattr(element, 'orig_width') and hasattr(element, 'orig_height'):
                original_resolution = (element.orig_width, element.orig_height)
        except (AttributeError, IndexError):
            pass
    elif seq.type == 'IMAGE' and hasattr(seq, 'elements') and seq.elements:
        try:
            # Get original image dimensions
            element = seq.elements[0]
            if hasattr(element, 'orig_width') and hasattr(element, 'orig_height'):
                original_resolution = (element.orig_width, element.orig_height)
        except (AttributeError, IndexError):
            pass
    
    return transform_data, original_resolution, is_resized


def get_sequence_resize_info(sequence_name: str) -> Dict[str, Any]:
    """
    Get detailed resize information for a specific sequence.

    Args:
        sequence_name: Name of the sequence to check

    Returns:
        Dict[str, Any]: Dictionary containing:
            - name: str - Sequence name
            - type: str - Sequence type
            - is_resized: bool - Whether the sequence has been resized
            - original_resolution: Optional[Tuple[int, int]] - Original dimensions
            - current_scale: Tuple[float, float] - Current scale factors (x, y)
            - effective_resolution: Optional[Tuple[int, int]] - Calculated current resolution
            - resize_method: str - How the resize was applied ('SCALE' or 'FIT_METHOD')
            - fit_method: Optional[str] - Fit method if used during import

    Raises:
        ImportError: If bpy module is not available
        ValueError: If sequence is not found
        AttributeError: If sequence editor is not available
    """
    import bpy

    scene = bpy.context.scene

    if not scene.sequence_editor:
        raise AttributeError("No sequence editor found - timeline is empty or not initialized")

    sequences = scene.sequence_editor.sequences_all
    
    # Find the sequence by name
    target_seq = None
    for seq in sequences:
        if seq.name == sequence_name:
            target_seq = seq
            break
    
    if target_seq is None:
        raise ValueError(f"Sequence '{sequence_name}' not found")

    transform_data, original_resolution, is_resized = _get_sequence_transform_info(target_seq)
    
    # Calculate effective resolution if we have original dimensions
    effective_resolution = None
    if original_resolution:
        effective_resolution = (
            int(original_resolution[0] * transform_data["scale_x"]),
            int(original_resolution[1] * transform_data["scale_y"])
        )
    
    # Determine resize method
    resize_method = "SCALE" if is_resized else "NONE"
    fit_method = getattr(target_seq, 'fit_method', None) if hasattr(target_seq, 'fit_method') else None
    
    return {
        "name": target_seq.name,
        "type": target_seq.type,
        "is_resized": is_resized,
        "original_resolution": original_resolution,
        "current_scale": (transform_data["scale_x"], transform_data["scale_y"]),
        "effective_resolution": effective_resolution,
        "resize_method": resize_method,
        "fit_method": fit_method,
        "transform": transform_data
    }


def add_image_sequence(
    filepath: str,
    channel: int,
    frame_start: int,
    name: Optional[str] = None,
    fit_method: str = 'ORIGINAL',
    frame_end: Optional[int] = None,
    position: Optional[Tuple[float, float]] = None,
    scale: Optional[float] = None
) -> Dict[str, Any]:
    """
    Add an image element to the timeline at a specific channel and position.

    Args:
        filepath: Path to the image file
        channel: Channel number to place the sequence
        frame_start: Starting frame position
        name: Optional sequence name (auto-generated from filename if None)
        fit_method: How to fit the image ('ORIGINAL', 'FIT', 'FILL', 'STRETCH')
        frame_end: Optional ending frame position. Images can be extended to any duration.
        position: Optional (x, y) offset in pixels from center
        scale: Optional uniform scale factor (1.0 = original size)

    Returns:
        Dict[str, Any]: Dictionary with sequence information matching get_sequences() format

    Raises:
        ImportError: If bpy module is not available
        FileNotFoundError: If filepath does not exist
        ValueError: If file is not a valid image format or parameters are invalid
        AttributeError: If sequence creation fails
    """
    import bpy

    # Validate file exists
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    # Validate image file extension
    ext = os.path.splitext(filepath)[1].lower()
    image_extensions = {'.jpg', '.jpeg', '.png', '.tiff', '.tif', '.exr', '.hdr', '.bmp', '.tga'}
    if ext not in image_extensions:
        raise ValueError(f"Invalid image file extension: {ext}. Supported: {image_extensions}")

    scene = bpy.context.scene

    # Create sequence editor if it doesn't exist
    if not scene.sequence_editor:
        scene.sequence_editor_create()

    sequences = scene.sequence_editor.sequences

    # Generate name if not provided
    if name is None:
        name = os.path.splitext(os.path.basename(filepath))[0]

    # Create image sequence
    sequence = sequences.new_image(name=name, filepath=filepath, channel=channel, frame_start=frame_start, fit_method=fit_method)

    # Apply frame_end if specified (images can be extended to any duration)
    if frame_end is not None:
        requested_duration = frame_end - frame_start
        
        if requested_duration <= 0:
            raise ValueError(f"Frame end ({frame_end}) must be greater than frame start ({frame_start})")
        
        # Set the sequence end frame (extends image duration)
        sequence.frame_final_end = frame_end

    # Apply position and scale transforms if specified
    if position is not None or scale is not None:
        if hasattr(sequence, 'transform'):
            transform = sequence.transform
            if position is not None:
                transform.offset_x = position[0]
                transform.offset_y = position[1]
            if scale is not None:
                transform.scale_x = scale
                transform.scale_y = scale

    # Auto-fit sequencer view to show all sequences
    try:
        fit_sequencer_view()
    except:
        pass  # Silently ignore fit errors
    
    # Return sequence info in same format as get_sequences()
    return {
        "name": sequence.name,
        "type": sequence.type,
        "channel": sequence.channel,
        "frame_start": sequence.frame_start,
        "frame_end": sequence.frame_final_end,
        "duration": sequence.frame_final_duration,
        "filepath": _get_sequence_filepath(sequence)
    }


def add_video_sequence(
    filepath: str,
    channel: int,
    frame_start: int,
    name: Optional[str] = None,
    fit_method: str = 'ORIGINAL',
    frame_end: Optional[int] = None
) -> Dict[str, Any]:
    """
    Add a video element to the timeline at a specific channel and position.

    Args:
        filepath: Path to the video file
        channel: Channel number to place the sequence
        frame_start: Starting frame position
        name: Optional sequence name (auto-generated from filename if None)
        fit_method: How to fit the video ('ORIGINAL', 'FIT', 'FILL', 'STRETCH')
        frame_end: Optional ending frame position. Videos can only be trimmed, not extended.

    Returns:
        Dict[str, Any]: Dictionary with sequence information matching get_sequences() format

    Raises:
        ImportError: If bpy module is not available
        FileNotFoundError: If filepath does not exist
        ValueError: If file is not a valid video format or parameters are invalid
        AttributeError: If sequence creation fails
    """
    import bpy

    # Validate file exists
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    # Validate video file extension
    ext = os.path.splitext(filepath)[1].lower()
    video_extensions = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v', '.flv'}
    if ext not in video_extensions:
        raise ValueError(f"Invalid video file extension: {ext}. Supported: {video_extensions}")

    scene = bpy.context.scene

    # Create sequence editor if it doesn't exist
    if not scene.sequence_editor:
        scene.sequence_editor_create()

    sequences = scene.sequence_editor.sequences

    # Generate name if not provided
    if name is None:
        name = os.path.splitext(os.path.basename(filepath))[0]

    # Create video sequence
    sequence = sequences.new_movie(name=name, filepath=filepath, channel=channel, frame_start=frame_start, fit_method=fit_method)

    # Apply frame_end if specified (videos can only be trimmed, not extended)
    if frame_end is not None:
        original_duration = sequence.frame_final_duration
        requested_duration = frame_end - frame_start
        
        if requested_duration <= 0:
            raise ValueError(f"Frame end ({frame_end}) must be greater than frame start ({frame_start})")
        
        # Prevent extending beyond original duration
        if requested_duration > original_duration:
            raise ValueError(
                f"Cannot extend video beyond original duration. "
                f"Requested duration: {requested_duration} frames, "
                f"actual duration: {original_duration} frames"
            )
        
        # Set the sequence end frame (trims video)
        sequence.frame_final_end = frame_end

    # Auto-fit sequencer view to show all sequences
    try:
        fit_sequencer_view()
    except:
        pass  # Silently ignore fit errors
    
    # Return sequence info in same format as get_sequences()
    return {
        "name": sequence.name,
        "type": sequence.type,
        "channel": sequence.channel,
        "frame_start": sequence.frame_start,
        "frame_end": sequence.frame_final_end,
        "duration": sequence.frame_final_duration,
        "filepath": _get_sequence_filepath(sequence)
    }


def add_audio_sequence(
    filepath: str,
    channel: int,
    frame_start: int,
    name: Optional[str] = None,
    frame_end: Optional[int] = None
) -> Dict[str, Any]:
    """
    Add an audio element to the timeline at a specific channel and position.

    Args:
        filepath: Path to the audio file
        channel: Channel number to place the sequence
        frame_start: Starting frame position
        name: Optional sequence name (auto-generated from filename if None)
        frame_end: Optional ending frame position. Audio can only be trimmed, not extended.

    Returns:
        Dict[str, Any]: Dictionary with sequence information matching get_sequences() format

    Raises:
        ImportError: If bpy module is not available
        FileNotFoundError: If filepath does not exist
        ValueError: If file is not a valid audio format or parameters are invalid
        AttributeError: If sequence creation fails
    """
    import bpy

    # Validate file exists
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    # Validate audio file extension
    ext = os.path.splitext(filepath)[1].lower()
    audio_extensions = {'.wav', '.mp3', '.flac', '.ogg', '.aac', '.m4a', '.wma'}
    if ext not in audio_extensions:
        raise ValueError(f"Invalid audio file extension: {ext}. Supported: {audio_extensions}")

    scene = bpy.context.scene

    # Create sequence editor if it doesn't exist
    if not scene.sequence_editor:
        scene.sequence_editor_create()

    sequences = scene.sequence_editor.sequences

    # Generate name if not provided
    if name is None:
        name = os.path.splitext(os.path.basename(filepath))[0]

    # Create audio sequence (no fit_method for audio)
    sequence = sequences.new_sound(name=name, filepath=filepath, channel=channel, frame_start=frame_start)

    # Apply frame_end if specified (audio can only be trimmed, not extended)
    if frame_end is not None:
        original_duration = sequence.frame_final_duration
        requested_duration = frame_end - frame_start
        
        if requested_duration <= 0:
            raise ValueError(f"Frame end ({frame_end}) must be greater than frame start ({frame_start})")
        
        # Prevent extending beyond original duration
        if requested_duration > original_duration:
            raise ValueError(
                f"Cannot extend audio beyond original duration. "
                f"Requested duration: {requested_duration} frames, "
                f"actual duration: {original_duration} frames"
            )
        
        # Set the sequence end frame (trims audio)
        sequence.frame_final_end = frame_end

    # Auto-fit sequencer view to show all sequences
    try:
        fit_sequencer_view()
    except:
        pass  # Silently ignore fit errors
    
    # Return sequence info in same format as get_sequences()
    return {
        "name": sequence.name,
        "type": sequence.type,
        "channel": sequence.channel,
        "frame_start": sequence.frame_start,
        "frame_end": sequence.frame_final_end,
        "duration": sequence.frame_final_duration,
        "filepath": _get_sequence_filepath(sequence)
    }



def add_transition(
    sequence1_name: str,
    sequence2_name: str,
    transition_type: str = 'CROSS',
    duration: int = 10,
    channel: Optional[int] = None
) -> Dict[str, Any]:
    """
    Add a transition effect between two sequences on the timeline.

    Args:
        sequence1_name: Name of the first sequence
        sequence2_name: Name of the second sequence
        transition_type: Type of transition ('CROSS', 'WIPE', 'GAMMA_CROSS')
        duration: Duration of transition in frames (default: 10)
        channel: Channel for transition effect (auto-detected if None)

    Returns:
        Dict[str, Any]: Dictionary with transition information matching get_sequences() format

    Raises:
        ImportError: If bpy module is not available
        ValueError: If sequences don't exist or aren't compatible for transitions
        AttributeError: If sequence editor is not available
    """
    import bpy

    scene = bpy.context.scene

    if not scene.sequence_editor:
        raise AttributeError("No sequence editor found - timeline is empty or not initialized")

    sequences = scene.sequence_editor.sequences

    # Find the sequences by name
    seq1 = None
    seq2 = None

    for seq in sequences:
        if seq.name == sequence1_name:
            seq1 = seq
        elif seq.name == sequence2_name:
            seq2 = seq

    if seq1 is None:
        raise ValueError(f"Sequence '{sequence1_name}' not found")
    if seq2 is None:
        raise ValueError(f"Sequence '{sequence2_name}' not found")

    # Determine transition channel
    if channel is None:
        channel = max(seq1.channel, seq2.channel) + 1

    # Validate transition type
    valid_transitions = {'CROSS', 'WIPE', 'GAMMA_CROSS'}
    if transition_type not in valid_transitions:
        raise ValueError(f"Invalid transition type: {transition_type}. Must be one of {valid_transitions}")

    # Calculate overlap region for transition
    overlap_start = max(seq1.frame_start, seq2.frame_start)
    overlap_end = min(seq1.frame_final_end, seq2.frame_final_end)

    if overlap_start >= overlap_end:
        raise ValueError(f"Sequences '{sequence1_name}' and '{sequence2_name}' do not overlap")

    # Adjust transition duration if it exceeds overlap
    max_duration = overlap_end - overlap_start
    if duration > max_duration:
        duration = max_duration

    # Calculate transition frame start
    transition_start = overlap_end - duration

    # Create transition effect
    transition_name = f"transition_{sequence1_name}_{sequence2_name}"

    if transition_type == 'CROSS':
        transition = sequences.new_effect(
            name=transition_name,
            type='CROSS',
            channel=channel,
            frame_start=transition_start,
            frame_end=transition_start + duration,
            seq1=seq1,
            seq2=seq2
        )
    elif transition_type == 'WIPE':
        transition = sequences.new_effect(
            name=transition_name,
            type='WIPE',
            channel=channel,
            frame_start=transition_start,
            frame_end=transition_start + duration,
            seq1=seq1,
            seq2=seq2
        )
    elif transition_type == 'GAMMA_CROSS':
        transition = sequences.new_effect(
            name=transition_name,
            type='GAMMA_CROSS',
            channel=channel,
            frame_start=transition_start,
            frame_end=transition_start + duration,
            seq1=seq1,
            seq2=seq2
        )

    # Auto-fit sequencer view to show all sequences
    try:
        fit_sequencer_view()
    except:
        pass  # Silently ignore fit errors
    
    # Return transition info in same format as get_sequences()
    return {
        "name": transition.name,
        "type": transition.type,
        "channel": transition.channel,
        "frame_start": transition.frame_start,
        "frame_end": transition.frame_final_end,
        "duration": transition.frame_final_duration,
        "filepath": None  # Transitions don't have filepaths
    }


def add_text_sequence(
    text: str,
    channel: int,
    frame_start: int,
    duration: int,
    name: Optional[str] = None,
    font_size: int = 50,
    color: Tuple[float, float, float, float] = (1.0, 1.0, 1.0, 1.0),
    location: Tuple[int, int] = (0, 0),
    use_background: bool = False,
    background_color: Tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.8)
) -> Dict[str, Any]:
    """
    Add a text element to the timeline at a specific channel and position.

    Args:
        text: The text content to display
        channel: Channel number to place the text sequence
        frame_start: Starting frame position
        duration: Duration in frames for how long text appears
        name: Optional sequence name (auto-generated if None)
        font_size: Font size in pixels (default: 50)
        color: Text color as RGBA tuple (values 0.0-1.0, default: white)
        location: Text position as (X, Y) tuple in pixels (default: center)
        use_background: Whether to show background behind text (default: False)
        background_color: Background color as RGBA tuple (values 0.0-1.0, default: semi-transparent black)

    Returns:
        Dict[str, Any]: Dictionary with sequence information matching get_sequences() format

    Raises:
        ImportError: If bpy module is not available
        ValueError: If parameters are invalid
        AttributeError: If sequence creation fails
    """
    import bpy

    scene = bpy.context.scene

    # Create sequence editor if it doesn't exist
    if not scene.sequence_editor:
        scene.sequence_editor_create()

    sequences = scene.sequence_editor.sequences

    # Generate name if not provided
    if name is None:
        name = f"text_{len([s for s in sequences if s.type == 'TEXT']) + 1:03d}"

    # Validate parameters
    if duration <= 0:
        raise ValueError(f"Duration must be positive, got: {duration}")
    if font_size <= 0:
        raise ValueError(f"Font size must be positive, got: {font_size}")
    if len(color) != 4 or not all(0.0 <= c <= 1.0 for c in color):
        raise ValueError(f"Color must be RGBA tuple with values 0.0-1.0, got: {color}")
    if len(background_color) != 4 or not all(0.0 <= c <= 1.0 for c in background_color):
        raise ValueError(f"Background color must be RGBA tuple with values 0.0-1.0, got: {background_color}")
    if len(location) != 2:
        raise ValueError(f"Location must be (X, Y) tuple, got: {location}")

    # Create text sequence using effect
    text_sequence = sequences.new_effect(
        name=name,
        type='TEXT',
        channel=channel,
        frame_start=frame_start,
        frame_end=frame_start + duration
    )

    # Configure text properties
    text_sequence.text = text
    text_sequence.font_size = font_size
    text_sequence.color = color
    text_sequence.location = location
    text_sequence.use_background = use_background
    if use_background:
        text_sequence.background_color = background_color

    # Auto-fit sequencer view to show all sequences
    try:
        fit_sequencer_view()
    except:
        pass  # Silently ignore fit errors
    
    # Return sequence info in same format as get_sequences()
    return {
        "name": text_sequence.name,
        "type": text_sequence.type,
        "channel": text_sequence.channel,
        "frame_start": text_sequence.frame_start,
        "frame_end": text_sequence.frame_final_end,
        "duration": text_sequence.frame_final_duration,
        "filepath": None  # Text sequences don't have filepaths
    }


def add_color_sequence(
    color: Tuple[float, float, float, float],
    channel: int,
    frame_start: int,
    duration: int,
    name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Add a solid color element to the timeline at a specific channel and position.
    
    Args:
        color: Color as RGBA tuple (values 0.0-1.0)
        channel: Channel number to place the color sequence
        frame_start: Starting frame position
        duration: Duration in frames for how long color appears
        name: Optional sequence name (auto-generated if None)
        
    Returns:
        Dict[str, Any]: Dictionary with sequence information matching get_sequences() format
        
    Raises:
        ImportError: If bpy module is not available
        ValueError: If parameters are invalid
        AttributeError: If sequence creation fails
    """
    import bpy
    
    scene = bpy.context.scene
    
    # Create sequence editor if it doesn't exist
    if not scene.sequence_editor:
        scene.sequence_editor_create()
    
    sequences = scene.sequence_editor.sequences
    
    # Generate name if not provided
    if name is None:
        name = f"color_{len([s for s in sequences if s.type == 'COLOR']) + 1:03d}"
    
    # Validate parameters
    if duration <= 0:
        raise ValueError(f"Duration must be positive, got: {duration}")
    if len(color) != 4 or not all(0.0 <= c <= 1.0 for c in color):
        raise ValueError(f"Color must be RGBA tuple with values 0.0-1.0, got: {color}")
    
    # Create color sequence using effect
    color_sequence = sequences.new_effect(
        name=name,
        type='COLOR',
        channel=channel,
        frame_start=frame_start,
        frame_end=frame_start + duration
    )
    
    # Configure color properties
    color_sequence.color = color
    
    # Auto-fit sequencer view to show all sequences
    try:
        fit_sequencer_view()
    except:
        pass  # Silently ignore fit errors
    
    # Return sequence info in same format as get_sequences()
    return {
        "name": color_sequence.name,
        "type": color_sequence.type,
        "channel": color_sequence.channel,
        "frame_start": color_sequence.frame_start,
        "frame_end": color_sequence.frame_final_end,
        "duration": color_sequence.frame_final_duration,
        "filepath": None  # Color sequences don't have filepaths
    }


def delete_sequence(sequence_name: str) -> Dict[str, Any]:
    """
    Delete a sequence from the timeline by name.
    
    Args:
        sequence_name: Name of the sequence to delete
        
    Returns:
        Dict[str, Any]: Dictionary containing:
            - success: bool - Whether the operation succeeded
            - message: str - Success/error message
            - deleted_sequence: Optional[Dict[str, Any]] - Info about deleted sequence
            
    Raises:
        ImportError: If bpy module is not available
        ValueError: If sequence is not found
        AttributeError: If sequence editor is not available
    """
    import bpy
    
    scene = bpy.context.scene
    
    if not scene.sequence_editor:
        raise AttributeError("No sequence editor found - timeline is empty or not initialized")
    
    sequences = scene.sequence_editor.sequences
    
    # Find the sequence by name
    target_sequence = None
    for seq in sequences:
        if seq.name == sequence_name:
            target_sequence = seq
            break
    
    if target_sequence is None:
        raise ValueError(f"Sequence '{sequence_name}' not found")
    
    # Store sequence info before deletion
    deleted_sequence_info = {
        "name": target_sequence.name,
        "type": target_sequence.type,
        "channel": target_sequence.channel,
        "frame_start": target_sequence.frame_start,
        "frame_end": target_sequence.frame_final_end,
        "duration": target_sequence.frame_final_duration,
        "filepath": _get_sequence_filepath(target_sequence)
    }
    
    try:
        # Remove the sequence
        sequences.remove(target_sequence)
        
        # Auto-fit sequencer view to show remaining sequences
        try:
            fit_sequencer_view()
        except:
            pass  # Silently ignore fit errors
        
        return {
            "success": True,
            "message": f"Successfully deleted sequence '{sequence_name}'",
            "deleted_sequence": deleted_sequence_info
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to delete sequence '{sequence_name}': {str(e)}",
            "deleted_sequence": None
        }


def fit_sequencer_view() -> Dict[str, Any]:
    """
    Fit the sequencer view to show all sequences in the timeline.
    
    This function finds the sequence editor area and fits the view to display
    all sequences, similar to pressing "View All" in the sequencer interface.
    
    Returns:
        Dict[str, Any]: Dictionary containing:
            - success: bool - Whether the operation succeeded
            - message: str - Success/error message
            - area_found: bool - Whether sequence editor area was found
            
    Raises:
        ImportError: If bpy module is not available
        AttributeError: If sequence editor is not available
    """
    import bpy
    
    # Find the sequence editor area
    sequencer_area = None
    sequencer_region = None
    
    for area in bpy.context.screen.areas:
        if area.type == 'SEQUENCE_EDITOR':
            sequencer_area = area
            for region in area.regions:
                if region.type == 'WINDOW':
                    sequencer_region = region
                    break
            break
    
    if sequencer_area is None:
        return {
            "success": False,
            "message": "Sequence editor area not found. Make sure the Video Editing workspace is active or a sequence editor area is visible.",
            "area_found": False
        }
    
    if sequencer_region is None:
        return {
            "success": False,
            "message": "Sequence editor window region not found.",
            "area_found": True
        }
    
    try:
        # Create context override for the sequencer area
        # Use modern Blender 3.2+ context override syntax
        ctx_override = {'area': sequencer_area, 'region': sequencer_region}
        
        # Fit the sequencer view to show all sequences
        with bpy.context.temp_override(**ctx_override):
            bpy.ops.sequencer.view_all()
        
        return {
            "success": True,
            "message": "Successfully fitted sequencer view to show all sequences",
            "area_found": True
        }
        
    except Exception as e:
        # Fallback to older context override method
        try:
            ctx = bpy.context.copy()
            ctx['area'] = sequencer_area
            ctx['region'] = sequencer_region
            bpy.ops.sequencer.view_all(ctx)
            
            return {
                "success": True,
                "message": "Successfully fitted sequencer view to show all sequences (fallback method)",
                "area_found": True
            }
        except Exception as e2:
            return {
                "success": False,
                "message": f"Failed to fit sequencer view: {str(e)} (fallback also failed: {str(e2)})",
                "area_found": True
            }


def set_frame_range(start_frame: int, end_frame: int) -> Dict[str, Any]:
    """
    Set the timeline frame range (start and end frames).
    
    Args:
        start_frame: Starting frame number for the timeline
        end_frame: Ending frame number for the timeline
        
    Returns:
        Dict[str, Any]: Dictionary containing:
            - success: bool - Whether the operation succeeded
            - message: str - Success/error message
            - frame_start: int - Set start frame
            - frame_end: int - Set end frame
            
    Raises:
        ImportError: If bpy module is not available
        ValueError: If frame range is invalid
    """
    import bpy
    
    # Validate frame range
    if start_frame < 0:
        raise ValueError(f"Start frame must be non-negative, got: {start_frame}")
    if end_frame < start_frame:
        raise ValueError(f"End frame ({end_frame}) must be >= start frame ({start_frame})")
    
    scene = bpy.context.scene
    
    try:
        # Set the frame range
        scene.frame_start = start_frame
        scene.frame_end = end_frame
        
        return {
            "success": True,
            "message": f"Successfully set frame range to {start_frame}-{end_frame}",
            "frame_start": start_frame,
            "frame_end": end_frame
        }
        
    except Exception as e:
        raise ValueError(f"Failed to set frame range: {str(e)}")


def get_frame_range() -> Dict[str, Any]:
    """
    Get the current timeline frame range and playhead position.
    
    Returns:
        Dict[str, Any]: Dictionary containing:
            - frame_start: int - Current start frame
            - frame_end: int - Current end frame
            - frame_current: int - Current playhead position
            - total_frames: int - Total number of frames in range
            
    Raises:
        ImportError: If bpy module is not available
    """
    import bpy
    
    scene = bpy.context.scene
    
    frame_start = scene.frame_start
    frame_end = scene.frame_end
    frame_current = scene.frame_current
    total_frames = frame_end - frame_start + 1
    
    return {
        "frame_start": frame_start,
        "frame_end": frame_end,
        "frame_current": frame_current,
        "total_frames": total_frames
    }


def set_current_frame(frame: int) -> Dict[str, Any]:
    """
    Set the current playhead position on the timeline.
    
    Args:
        frame: Frame number to set as current position
        
    Returns:
        Dict[str, Any]: Dictionary containing:
            - success: bool - Whether the operation succeeded
            - message: str - Success/error message
            - frame_current: int - Set current frame
            - in_range: bool - Whether frame is within timeline range
            
    Raises:
        ImportError: If bpy module is not available
        ValueError: If frame number is invalid
    """
    import bpy
    
    # Validate frame number
    if frame < 0:
        raise ValueError(f"Frame must be non-negative, got: {frame}")
    
    scene = bpy.context.scene
    
    try:
        # Set the current frame
        scene.frame_current = frame
        
        # Check if frame is within timeline range
        in_range = scene.frame_start <= frame <= scene.frame_end
        
        return {
            "success": True,
            "message": f"Successfully set current frame to {frame}",
            "frame_current": frame,
            "in_range": in_range
        }
        
    except Exception as e:
        raise ValueError(f"Failed to set current frame: {str(e)}")


def get_current_frame() -> int:
    """
    Get the current playhead position on the timeline.
    
    Returns:
        int: Current frame number
        
    Raises:
        ImportError: If bpy module is not available
    """
    import bpy
    
    return bpy.context.scene.frame_current
