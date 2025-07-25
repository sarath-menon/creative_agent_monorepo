# Blender Video Sequence Editor (VSE) Features

Complete reference of video editing functionality available in Blender's VSE.

## Core Video Editing Operations
- **Strip Management**: Cut, splice, trim, extend video/audio strips
- **Multi-track Editing**: Up to 32 channels for layering content
- **Speed Control**: Time remapping and speed ramping
- **Keyframe Animation**: Animate strip properties over time

## Strip Types
- **Movie Strips**: Video files (MP4, MOV, AVI, etc.)
- **Image Strips**: Image sequences and single images
- **Audio Strips**: Sound files and audio tracks
- **Scene Strips**: Render output from other Blender scenes
- **Mask Strips**: Vector masks for compositing
- **Text Strips**: Title cards and text overlays
- **Color Strips**: Solid color backgrounds

## Effects and Transitions
- **Cross Dissolve**: Fade between clips
- **Wipe**: Directional transitions
- **Gamma Cross**: Gamma-corrected crossfade
- **Add/Subtract/Multiply**: Blend modes
- **Alpha Over/Under**: Transparency compositing
- **Color Mix**: Various color blending operations

## Color Correction & Grading
- **Color Balance**: Shadows, midtones, highlights adjustment
- **Brightness/Contrast**: Basic exposure controls
- **Hue/Saturation**: Color manipulation
- **Curves**: RGB/individual channel curves
- **Color Strips**: For color correction overlays

## Audio Features
- **Audio Mixing**: Multi-channel audio support
- **Waveform Visualization**: Visual audio representation
- **Audio Scrubbing**: Hear audio while seeking
- **Volume Control**: Per-strip audio levels
- **Audio Synchronization**: Sync audio to video

## Preview & Analysis Tools
- **Live Preview**: Real-time playback
- **HDR Preview Support**: High Dynamic Range content preview and monitoring
- **Luma Waveform**: Brightness analysis
- **Chroma Vectorscope**: Color saturation/hue display  
- **Histogram**: RGB distribution analysis
- **Scopes**: Professional monitoring tools

## Advanced Features
- **Adjustment Layers**: Apply effects to multiple strips
- **Proxies**: Lower resolution editing for performance
- **Caching**: Speed up preview playback
- **Complex Masking**: Shape-based compositing
- **Grease Pencil Integration**: Draw annotations on timeline and scene strips
- **3D Scene Integration**: Render 3D scenes directly into timeline
- **Sequence Data-blocks**: Advanced data structure for better scene management
- **Camera Control**: Edit and animate scene strip cameras directly from VSE
- **Story Tools**: Streamlined scene strip creation for storyboarding workflows

## Latest Enhancements
- **Enhanced Caching System**: Improved cache for faster playback and performance
- **Accelerated Conversions**: Faster video rotation and color space conversions
- **Interactive Preview Controls**: Mute/Unmute and Mirror work directly in Preview
- **Adjustable Strip Pivot**: Strip pivot points adjustable in Preview window
- **Enhanced Snapping**: Default snapping with "Snap to Frame Range" option
- **Improved Blade Tool**: Cursor feedback for precise cutting
- **Better Handle Selection**: Enhanced strip handle selection and manipulation
- **Enhanced Slip Operator**: Slip operator with clamp functionality
- **Improved Feedback**: Better reports on framerate/color space changes
- **Missing Media Indicators**: Visual warnings for broken links
- **Enhanced Text Strips**: Drop shadows, outlines, blur effects
- **Multi-threaded Processing**: Default multi-threaded shader compilation

## Professional Tools
- **Multi-format Support**: Wide range of video/audio formats
- **Modern Codec Support**: H.265/HEVC and ProRes codec rendering
- **Rendering Pipeline**: Export to various formats
- **Metadata Support**: Preserve file information
- **Batch Processing**: Render multiple sequences
- **GPU Acceleration**: Hardware-accelerated preview and rendering

## Image Editor
Blender's Image Editor provides comprehensive image editing capabilities that integrate seamlessly with the VSE workflow.

### Basic Image Operations
- **Crop Tool**: Precise image cropping with visual guides
- **Scale & Transform**: Resize, rotate, and flip images
- **Image Adjustment**: Real-time image manipulation
- **Multi-layer Support**: Edit images with multiple layers
- **Undo/Redo System**: Non-destructive editing workflow

### Color Adjustment Tools
- **Brightness/Contrast**: Basic exposure controls
- **Color Balance**: Shadows, midtones, highlights adjustment
- **Curves**: RGB and individual channel curve editing
- **Hue/Saturation**: Color manipulation tools
- **Gamma Correction**: Professional color grading
- **White Balance**: Temperature and tint adjustments

### Analysis & Monitoring Tools
- **Histogram Display**: RGB distribution analysis
- **Waveform Monitor**: Brightness level analysis
- **Vectorscope**: Color saturation and hue visualization
- **Focus Analysis**: Sharpness detection tools
- **Exposure Analysis**: Over/under exposure indicators
- **Color Space Indicators**: Current color space display

### Format Support
- **Standard Formats**: PNG, JPEG, TIFF, BMP, TGA
- **HDR Formats**: OpenEXR, HDR, Radiance HDR
- **Professional Formats**: DPX, Cineon (cinema industry)
- **Raw Image Support**: Various camera raw formats
- **Sequence Support**: Image sequences and animated formats
- **Alpha Channel**: Full transparency support

### UV Texture Editing
- **UV Coordinate Editing**: Modify texture coordinates
- **Texture Painting**: Paint directly on UV maps
- **Seam Visualization**: Show UV seam boundaries
- **Distortion Display**: UV distortion analysis
- **Multi-resolution Support**: Work with different detail levels

### Image Sequences
- **Frame Navigation**: Step through image sequences
- **Sequence Playback**: Animate image sequences
- **Frame Rate Control**: Adjust playback speed
- **Sequence Analysis**: Analyze sequence properties
- **Batch Operations**: Apply edits to entire sequences

### Color Space Management
- **Color Profile Support**: ICC profile management
- **Linear/sRGB Workflows**: Professional color pipelines
- **OCIO Integration**: OpenColorIO support
- **View Transforms**: Display-referred color management
- **Gamut Warnings**: Out-of-gamut color indicators
- **Color Temperature**: Professional color temperature tools

### Integration with VSE
- **Live Updates**: Changes reflect immediately in VSE timeline
- **Shared Assets**: Images used in both Image Editor and VSE
- **Proxy Generation**: Create proxy images for VSE performance
- **Metadata Preservation**: Maintain image metadata through workflow
- **Render Integration**: Export edited images directly to video
- **Timeline Synchronization**: Navigate between Image Editor and VSE

## Integration Benefits
The VSE is particularly powerful because it's integrated with Blender's 3D pipeline, allowing seamless workflow between 3D animation, compositing, and video editing. Key integration advantages include:

- **Unified Storyboarding Workflow**: Seamless combination of sketching, timing, and editing with Grease Pencil integration
- **3D Scene Management**: Direct control of 3D scenes, cameras, and animation from the VSE timeline
- **Real-time 3D Preview**: Live rendering of 3D scenes within the video editing environment
- **Cross-Platform Compatibility**: Aligned with VFX Reference Platform for studio pipeline integration
- **Editorial and Animation Fusion**: Story tools enable fluid transition from concept to final animation