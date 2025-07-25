"""
Blender workspace utilities.
"""

from typing import List


def get_current_workspace() -> str:
    """
    Get the name of the current Blender workspace.
    
    Returns:
        str: The name of the current workspace
        
    Raises:
        ImportError: If bpy module is not available
        AttributeError: If workspace context is not available
    """
    import bpy
    
    if not hasattr(bpy.context, 'workspace'):
        raise AttributeError("Workspace context not available")
    
    return bpy.context.workspace.name


def get_available_workspaces() -> List[str]:
    """
    Get a list of all available Blender workspaces.
    
    Returns:
        List[str]: List of workspace names
        
    Raises:
        ImportError: If bpy module is not available
        AttributeError: If workspaces data is not available
    """
    import bpy
    
    if not hasattr(bpy.data, 'workspaces'):
        raise AttributeError("Workspaces data not available")
    
    return [ws.name for ws in bpy.data.workspaces]